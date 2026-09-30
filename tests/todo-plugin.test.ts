import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PERSONAL_PLUGIN_IDS, PROJECT_SCOPED_PLUGIN_IDS, pluginMarketCards, railEntries } from "@molis-ai/molis-work-app-workbench";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { PERSONAL_HOME_SQLITE_STORES } from "@molis-ai/molis-work-storage";
import {
  TODO_ACTION_PERMISSIONS,
  TODO_CLIENT_FACTORY_SCRIPT,
  TODO_EN,
  TODO_PROJECT_PLUGIN_ID,
  TodoPluginRouteTable,
  createTodoRouteHandlers,
  todoManifest,
  todoRouteErrorResponse,
} from "@molis-ai/molis-work-plugin-todo";
import { inspectMethodDeclarations } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { rewriteNativePluginApiPath } from "../apps/local-host/src/native-plugin-api.js";
import { renderMolisWorkWeb, renderMolisWorkWorkbenchClientScript, type MolisWorkWebView } from "./workbench-renderer-fixture.js";

const PROJECT = "project-todo";

function view(): MolisWorkWebView {
  const board = { board_id: "board-todo", title: "待办", active_goal_id: null, created_at: "2026-09-28T00:00:00.000Z", updated_at: "2026-09-28T00:00:00.000Z" };
  return {
    snapshot: { board, cursor: 0, goals: [], relations: [], impacts: [], risks: [], claims: [], runs: [], evidence: [], review_obligations: [], reviews: [], candidates: [],
      contract_proposals: [], rewires: [], clarification_sessions: [], clarification_turns: [], goal_tree_proposals: [], planning_method_packs: [] },
    project: { project_id: PROJECT, display_name: "待办" },
    projects: [{ project_id: PROJECT, display_name: "待办" }],
    route_prefix: `/projects/${PROJECT}`,
    demo: false, active_goal_id: null, goals: [], archived_goals: [], trashed_goals: [], counts: {}, coverage: [], input_bindings: [], policy_bindings: [], events: [],
    feed: { sources: [], feed_items: [], inbox_entries: [], runs: [], contract_migrations: [], out_rules: [] },
  } as unknown as MolisWorkWebView;
}

async function withHost<T>(run: (home: string, host: MolisWorkLocalHost) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "todo-plugin-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try { return await run(home, host); }
  finally { await host.close(); await rm(home, { recursive: true, force: true }); }
}

test("Todo is a personal plugin on the rail after Sessions, listed in the market, with a purgeable Home store", () => {
  assert.equal(PERSONAL_PLUGIN_IDS.includes(TODO_PROJECT_PLUGIN_ID), true);
  assert.equal(PROJECT_SCOPED_PLUGIN_IDS.includes(TODO_PROJECT_PLUGIN_ID), false);
  assert.deepEqual(railEntries(["goals", "sessions", "todo", "inbox"]).map(entry => [entry.id, entry.label, entry.glyph]),
    [["goals", "Goals", "target"], ["sessions", "Sessions", "terminal"], ["todo", "待办", "list"], ["inbox", "Inbox", "inbox"]]);
  const card = pluginMarketCards().find(entry => entry.id === "todo");
  assert.equal(card?.personal, true);
  assert.ok((PERSONAL_HOME_SQLITE_STORES as readonly string[]).includes("todo"), "卸载 --purge 要能删掉待办库");
  assert.equal(rewriteNativePluginApiPath("/api/plugins/todo/batch"), "/api/todo/batch");
});

test("the workbench mounts the Todo stage, and the client script still parses with the quick-entry reader embedded", () => {
  const html = renderMolisWorkWeb(view());
  assert.match(html, /data-todo="workbench"/);
  assert.match(html, /data-todo-quick-input/);
  assert.match(html, /data-todo-confirm/);
  const script = renderMolisWorkWorkbenchClientScript();
  assert.doesNotThrow(() => new Function(script));
  assert.doesNotThrow(() => new Function("return " + TODO_CLIENT_FACTORY_SCRIPT));
  assert.match(script, /data-todo=workbench/);
  assert.match(TODO_CLIENT_FACTORY_SCRIPT, /const parseQuick = \(function parseTodoQuickText/);
  assert.doesNotMatch(TODO_CLIENT_FACTORY_SCRIPT, /window\.confirm|window\.alert|window\.prompt/);
  assert.match(TODO_CLIENT_FACTORY_SCRIPT, /data-assistant-context/);
  assert.match(TODO_CLIENT_FACTORY_SCRIPT, /molis:assistant-effect/);
  assert.match(TODO_CLIENT_FACTORY_SCRIPT, /isComposing/, "输入法确认候选词时按回车不提交");
});

test("every Chinese string the Todo page shows has an English entry", () => {
  const sources = ["ui.ts", "client.ts"].map(file => readFileSync(join("plugins/native/todo/src", file), "utf8")).join("\n");
  const keys = new Set<string>();
  for (const match of sources.matchAll(/(?:\bL|p\.text)\("((?:[^"\\]|\\.)*)"/gu)) if (/[一-鿿]/u.test(match[1]!)) keys.add(match[1]!);
  for (const match of sources.matchAll(/\["[a-z_]+", "([^"]+)"\]/gu)) if (/[\u4e00-\u9fff]/u.test(match[1]!)) keys.add(match[1]!);
  const missing = [...keys].filter(key => !(key in TODO_EN));
  assert.deepEqual(missing, []);
});

test("HTTP routes map to the same actions; fixed paths are not read as ids; a project caller sees its project's todos", async () => {
  await withHost(async (home, host) => {
    const personal = new TodoPluginRouteTable(createTodoRouteHandlers({ actions: bindActionClient(host.homeActionClient(),
      () => ({ actor_id: "web-user", project_id: null, audience: "user", permissions: TODO_ACTION_PERMISSIONS })) }));
    const reference = molisWorkHostProjectReference({ projectId: PROJECT, boardId: PROJECT, databasePath: join(home, "project.sqlite") });
    const inProject = new TodoPluginRouteTable(createTodoRouteHandlers({ actions: bindActionClient(host.actionClient(reference),
      () => ({ actor_id: "web-user", project_id: PROJECT, audience: "user", permissions: TODO_ACTION_PERMISSIONS })) }));
    const call = async (table: TodoPluginRouteTable, method: "GET" | "POST", pathname: string, body: Record<string, unknown> = {}, query = new URLSearchParams()) => {
      try { return (await table.handle({ method, pathname, query, body }))!; }
      catch (error) { return todoRouteErrorResponse(error); }
    };
    const mine = (await call(personal, "POST", "/api/todo", { title: "个人的事", planned_date: "2026-09-28" })).body as { item: { id: string; placement: string } };
    assert.equal(mine.item.placement, "personal");
    const ours = (await call(inProject, "POST", "/api/todo", { title: "项目的事", placement: "project", project_id: "forged" })).body as { item: { id: string; project_id: string } };
    assert.equal(ours.item.project_id, PROJECT, "项目来自 Host 绑定，不来自请求");
    const listAll = (await call(inProject, "GET", "/api/todo", {}, new URLSearchParams({ view: "all" }))).body as { items: { title: string }[] };
    assert.deepEqual(listAll.items.map(item => item.title).sort(), ["个人的事", "项目的事"]);
    const listHome = (await call(personal, "GET", "/api/todo", {}, new URLSearchParams({ view: "all" }))).body as { items: { title: string }[] };
    assert.deepEqual(listHome.items.map(item => item.title), ["个人的事"]);

    const batch = await call(inProject, "POST", "/api/todo/batch", { ids: [mine.item.id, ours.item.id], change: { status: "done" } });
    assert.equal(batch.status, 200);
    const undone = await call(inProject, "POST", "/api/todo/revert", { batch_id: (batch.body as { batch_id: string }).batch_id });
    assert.equal(undone.status, 200);
    assert.equal(((await call(personal, "GET", `/api/todo/${mine.item.id}`)).body as { item: { status: string } }).item.status, "open");

    // The person may reach every project's todos on their own page; only the listing is scoped unless they ask for all.
    const everything = (await call(personal, "GET", "/api/todo", {}, new URLSearchParams({ view: "all", all: "1" }))).body as { items: { title: string }[] };
    assert.deepEqual(everything.items.map(item => item.title).sort(), ["个人的事", "项目的事"]);
    const stale = await call(personal, "POST", `/api/todo/${mine.item.id}`, { title: "旧版本", expected_revision: 1 });
    assert.equal(stale.status, 409);
    assert.equal((stale.body as { code: string }).code, "todo.conflict");
    const invalid = await call(personal, "POST", "/api/todo", { title: "" });
    assert.equal(invalid.status, 400);
    const gone = await call(personal, "POST", `/api/todo/${mine.item.id}/delete`, {});
    assert.equal(gone.status, 200);
  });
});

test("待办整理师 and both organizing methods are registered with the Host, so they show in “Prompt 与 Character” and can be edited", async () => {
  const { builtinRegistrations } = await import("../apps/local-host/src/agent-definitions/builtin-agents.js");
  const todo = (builtinRegistrations() as Array<{ owner_id?: string; roles?: Array<{ name: string; workspace?: string; execution?: string }>; prompts?: Array<{ prompt_id: string }>;
    methods?: Array<{ skill_id: string; version: number; tools: string[]; body: string }> }>)
    .filter(entry => entry.owner_id === "io.molis.work.todo");
  assert.equal(todo.length, 1);
  assert.deepEqual(todo[0]!.roles!.map(role => [role.name, role.workspace, role.execution]), [["待办整理师", "business", "operate"]]);
  assert.deepEqual(todo[0]!.prompts!.map(prompt => prompt.prompt_id).sort(), ["todo-organizer", "todo.organize.basic", "todo.organize.organizer"]);
  // “整理待办” is offered to other Agents (the Assistant, 待办整理师 as a Character) with business tools only.
  assert.deepEqual(todo[0]!.methods!.map(method => [method.skill_id, method.version, method.tools]), [
    ["todo-organize", 1, ["find-capabilities", "read-capability", "change-capability", "ask-user"]],
    ["todo-advance", 1, ["find-capabilities", "read-capability", "change-capability", "ask-user"]],
  ]);
  assert.match(todo[0]!.methods![1]!.body, /状态不擅改/u);
  assert.match(todo[0]!.methods![0]!.body, /todo\.organize\.extract/u);
  assert.deepEqual(inspectMethodDeclarations(todoManifest.methods), []);
});
