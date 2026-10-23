import { scanTree, workingTreeSnapshot, isProductSource } from "../scripts/gates/translations.mjs";
import { pluginDocuments } from "./fixtures/plugin-documents.js";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { PERSONAL_PLUGIN_IDS, PROJECT_SCOPED_PLUGIN_IDS, pluginMarketCards, pluginWorkbenchClientAsset, railEntries } from "@molis-ai/molis-work-app-workbench";
import {
  TODO_ACTION_PERMISSIONS,
  TODO_CLIENT_FACTORY_SCRIPT,
  TODO_MESSAGES,
  TODO_EN,
  TODO_PROJECT_PLUGIN_ID,
  todoManifest,
  todoOrganizeActions,
} from "@molis-ai/molis-work-plugin-todo";
import { L, runWithLocale, homeStores, type HostCompleteText } from "@molis-ai/molis-work-app-local-host";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { renderMolisWorkWorkbenchClientScript } from "./workbench-renderer-fixture.js";
import { manifestProblems } from "./fixtures/declaration-manifest.js";

test("Todo is a personal plugin on the rail after Sessions, listed in the market, with a purgeable Home store", () => {
  assert.equal(PERSONAL_PLUGIN_IDS.includes(TODO_PROJECT_PLUGIN_ID), true);
  assert.equal(PROJECT_SCOPED_PLUGIN_IDS.includes(TODO_PROJECT_PLUGIN_ID), false);
  assert.deepEqual(railEntries(["goals", "sessions", "todo", "inbox"]).map(entry => [entry.id, entry.label, entry.glyph]),
    [["goals", "Goals", "target"], ["sessions", "Sessions", "terminal"], ["todo", "待办", "list"], ["inbox", "Inbox", "inbox"]]);
  const card = pluginMarketCards().find(entry => entry.id === "todo");
  assert.equal(card?.personal, true);
  assert.equal(homeStores().get("todo")?.owner, todoManifest.plugin_id, "卸载 --purge 要能删掉待办库");
});

test("RAC-131 a project's page mounts the Todo stage once, from the Home runtime, and the client bundle still parses with the quick-entry reader in it", { timeout: 60_000 }, async t => {
  const { request, project } = await serveHomeRuntime(t);
  const here = await project("待办页面");
  const page = await request(`/projects/${encodeURIComponent(here.project_id)}/`);
  assert.equal(page.status, 200);
  const html = pluginDocuments(await page.text()).join("\n");
  assert.equal(html.match(/data-todo="workbench"/g)?.length, 1, "the Home runtime draws Todo's stage, and nothing else draws it again");
  assert.match(html, /data-todo-quick-input/);
  assert.match(html, /data-todo-confirm/);
  const script = renderMolisWorkWorkbenchClientScript();
  assert.doesNotThrow(() => new Function(script));
  assert.doesNotThrow(() => new Function("return " + TODO_CLIENT_FACTORY_SCRIPT));
  // The page's script only knows Todo is there; Todo's own client loads when its surface opens (#150).
  assert.match(script, /\["todo","io\.molis\.work\.todo"/);
  const client = pluginWorkbenchClientAsset("todo");
  assert.ok(client, "Todo's client is served on its own");
  assert.doesNotThrow(() => new Function(client));
  assert.match(client, /data-todo=workbench/);
  assert.match(TODO_CLIENT_FACTORY_SCRIPT, /大后天/, "the quick-entry reader is in the bundle");
  assert.doesNotMatch(TODO_CLIENT_FACTORY_SCRIPT, /window\.confirm|window\.alert|window\.prompt/);
  assert.match(TODO_CLIENT_FACTORY_SCRIPT, /data-assistant-context/);
  assert.match(TODO_CLIENT_FACTORY_SCRIPT, /molis:assistant-effect/);
  assert.match(TODO_CLIENT_FACTORY_SCRIPT, /isComposing/, "输入法确认候选词时按回车不提交");
});

test("RAC-130 every word the Todo page says has a stable key with both languages, and none is a Chinese key", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const calls = scan.calls.filter(call => call.file === "plugins/native/todo/src/ui.ts" || call.file.startsWith("plugins/native/todo/src/browser/"));
  assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], "the gate sees no Chinese translator keys, including aliases and embedded programs");
  const used = new Set<string>(calls.map(call => call.key));
  const missing = [...used].filter(key => !(key in TODO_MESSAGES));
  assert.deepEqual(missing, []);
  for (const [key, text] of Object.entries(TODO_MESSAGES)) {
    assert.ok(text.zh && text.en, `${key} has Chinese and English`);
    const names = (value: string) => [...new Set([...value.matchAll(/\{([a-z]+)[|}]/gu)].map(match => match[1]))].sort();
    assert.deepEqual(names(text.zh), names(text.en), `${key} uses the same placeholders in both languages`);
  }
  assert.ok(used.size > 200, "the page's keys were found");
  const dynamicOwners = new Set(["actions.ts", "organize-actions.ts", "home-events.ts", "search.ts", "project-data.ts"].map(file => "plugins/native/todo/src/" + file));
  for (const key of Object.keys(TODO_EN)) {
    assert.ok(scan.calls.some(call => call.key === key && call.file.startsWith("plugins/native/todo/"))
      || scan.files.some(file => dynamicOwners.has(file.file) && file.mentions.has(key)), `${key} must have a Todo translator or an existing dynamic declaration owner`);
  }
  const removed = ["取消选择", "周日", "周一", "周二", "周三", "周四", "周五", "周六", "昨天", "：", "查看", "明天", "提醒", "在等", "你", "稍后", "、", "，", "；"];
  assert.deepEqual(removed.filter(key => key in TODO_EN), [], "foreign and unused keys cannot return to Todo's dynamic dictionary");
  assert.deepEqual([...scan.missing.keys()], [], "moving shared words cannot leave another owner's live call untranslated");
});

test("RAC-134 stable Todo words keep the formerly displayed English after the global dictionary overrides", () => {
  // Migration reference: the served EN on f8d1e5ba, including its final Object.assign(...GAP_EN).
  // These differed from TODO_EN's own values; copying that dictionary alone changed what people saw.
  const displayed = {
    "todo.status.open": "To process",
    "todo.status.doing": "Active",
    "todo.status.done": "Completed",
    "todo.field.status": "State",
    "todo.field.notes": "Description",
    "todo.action.complete": "Completed",
    "todo.review.kind-suggestion": "Recommendation",
    "todo.review.collapse": "Collapse all",
    "todo.save.unsaved": "Unsaved",
    "todo.history.created": "Create",
    "todo.view.unscheduled": "Not scheduled",
    "todo.view.review": "Waiting for your decision",
    "todo.detail.more-actions": "More",
    "todo.link.relation": "Relationships"
  };
  runWithLocale("en", () => {
    for (const [key, expected] of Object.entries(displayed)) assert.equal(L(key), expected, key);
  });
});

test("RAC-132 the Todo page asks the Host only through the shared request helper, and its browser code is typed", () => {
  for (const file of readdirSync("plugins/native/todo/src/browser")) {
    const source = readFileSync(join("plugins/native/todo/src/browser", file), "utf8");
    assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
  }
  assert.match(readFileSync("plugins/native/todo/src/browser/request.ts", "utf8"), /molisWorkRequest/);
  assert.match(readFileSync("plugins/native/todo/package.json", "utf8"), /tsc -p tsconfig\.browser\.json/, "the build type-checks the browser code");
});

test("HTTP routes map to the same actions; fixed paths are not read as ids; a project's page sees its project's todos", { timeout: 60_000 }, async t => {
  const { request, project } = await serveHomeRuntime(t);
  const here = await project("待办项目");
  const base = `/api/plugins/${todoManifest.plugin_id}`;
  const call = async (where: "personal" | "project", method: "GET" | "POST", path: string, body?: Record<string, unknown>) => {
    const response = await request((where === "project" ? `/projects/${encodeURIComponent(here.project_id)}` : "") + base + path, { method, body: method === "POST" ? body ?? {} : undefined });
    return { status: response.status, body: await response.json() as unknown };
  };
  const mine = (await call("personal", "POST", "/items", { title: "个人的事", planned_date: "2026-09-28" })).body as { item: { id: string; placement: string } };
  assert.equal(mine.item.placement, "personal");
  const ours = (await call("project", "POST", "/items", { title: "项目的事", placement: "project", project_id: "forged" })).body as { item: { id: string; project_id: string } };
  assert.equal(ours.item.project_id, here.project_id, "项目来自页面路径，不来自请求");
  const listAll = (await call("project", "GET", "/items?view=all")).body as { items: { title: string }[] };
  assert.deepEqual(listAll.items.map(item => item.title).sort(), ["个人的事", "项目的事"]);
  const listHome = (await call("personal", "GET", "/items?view=all")).body as { items: { title: string }[] };
  assert.deepEqual(listHome.items.map(item => item.title), ["个人的事"]);

  const batch = await call("project", "POST", "/batch", { ids: [mine.item.id, ours.item.id], change: { status: "done" } });
  assert.equal(batch.status, 200, JSON.stringify(batch.body));
  const undone = await call("project", "POST", "/revert", { batch_id: (batch.body as { batch_id: string }).batch_id });
  assert.equal(undone.status, 200, JSON.stringify(undone.body));
  assert.equal(((await call("personal", "GET", `/items/${mine.item.id}`)).body as { item: { status: string } }).item.status, "open");

  // The person may reach every project's todos on their own page; only the listing is scoped unless they ask for all.
  const everything = (await call("personal", "GET", "/items?view=all&all=1")).body as { items: { title: string }[] };
  assert.deepEqual(everything.items.map(item => item.title).sort(), ["个人的事", "项目的事"]);
  const stale = await call("personal", "POST", `/items/${mine.item.id}`, { title: "旧版本", expected_revision: 1 });
  assert.equal(stale.status, 409);
  assert.equal((stale.body as { code: string }).code, "todo.conflict");
  const invalid = await call("personal", "POST", "/items", { title: "" });
  assert.equal(invalid.status, 400);
  const gone = await call("personal", "POST", `/items/${mine.item.id}/delete`, {});
  assert.equal(gone.status, 200, JSON.stringify(gone.body));
});

test("待办整理师 and both organizing methods are registered with the Host, so they show in “Prompt 与 Character” and can be edited", async () => {
  const { builtinRegistrations } = await import("../apps/local-host/dist/agent-definitions/builtin-agents.js");
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
  assert.equal(manifestProblems(todoManifest), "");
});

// Organizing waits for the model (a concurrent action); the result is written only if the call is still current when it comes back.
const MAIL = { title: "张总：新版方案", received_at: "2026-09-28T09:00:00+08:00", text: "小王你好，请周五前发新版方案。" };
const ANSWER = JSON.stringify({ candidates: [{ ref: "c1", kind: "request", title: "发送新版方案", why: "张总要求周五前收到", owner: { who: "你", stated: true },
  due: { date: null, time: null, phrase: null }, evidence: [{ material: 1, excerpt: "请周五前发新版方案" }], uncertain: [], depends_on: [] }], reference_only: [] });
for (const invalidation of ["none", "cancel", "disable"] as const) {
  test(`Todo organizing waits for the model; ${invalidation === "none" ? "a current call saves its result" : `a call ${invalidation === "cancel" ? "cancelled" : "whose plugin is disabled"} while it waits writes nothing`}`, { timeout: 60_000 }, async t => {
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    const completeText: HostCompleteText = async () => { entered.resolve(); await release.promise; return ANSWER; };
    const { host, request } = await serveHomeRuntime(t, { completeText });
    const base = `/api/plugins/${todoManifest.plugin_id}`, abort = new AbortController();
    const outcome = host.homeActionClient().invoke({ ...person([...TODO_ACTION_PERMISSIONS]), signal: abort.signal }, todoOrganizeActions.extract, { materials: [MAIL] })
      .then(() => "ok", (error: { code?: string }) => error.code ?? "failed");
    await entered.promise;
    if (invalidation === "cancel") abort.abort();
    if (invalidation === "disable") assert.equal((await request(`${base}/disable`, { method: "POST", body: {} })).status, 200);
    release.resolve();
    const settled = await outcome;
    if (invalidation === "disable") assert.equal((await request(`${base}/enable`, { method: "POST", body: {} })).status, 200);
    const batches = (await (await request(`${base}/organize?status=all`)).json() as { batches: unknown[] }).batches;
    if (invalidation === "none") { assert.equal(settled, "ok"); assert.equal(batches.length, 1, "the model's answer is a valid result"); }
    else { assert.notEqual(settled, "ok", invalidation); assert.deepEqual(batches, [], `${invalidation}: no result is saved`); }
  });
}
