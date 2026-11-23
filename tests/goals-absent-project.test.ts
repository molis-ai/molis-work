import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, resolveWebControlToken } from "@molis-ai/molis-work-app-local-host";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { inboxActions, inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { acceptanceActions, type AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";
import { takeBackGoals } from "./fixtures/goals-agreement.js";

// ac-trust T3b (RAC-400, specs/archive/repository-anti-corruption/slices/ac-trust-install.md §3.4.1): the person takes back the agreement that keeps Goals
// in every project, and a project made after that has no Goals. Its pages draw and answer with the plugin list, home and links as for any other plugin that is not on (Goals' stage and dialogs stay
// in the page's hidden pool, which the one workbench program binds), and nothing says "internal error" or opens a Goal view; a project that still has Goals is drawn as before.

async function withoutGoals(t: Parameters<typeof test>[1] extends (t: infer T, ...rest: never[]) => unknown ? T : never) {
  const home = await mkdtemp(join(tmpdir(), "goals-absent-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  takeBackGoals(home);
  const project = await catalog.createProject({ display_name: "没有 Goals", actor_id: "test" });
  assert.equal(catalog.listProjectPlugins(project.project_id).includes("goals"), false, "the project has no Goals");
  // The server builds its own Host, with the catalog policy for which plugins a project's actions may reach, as the app's does.
  catalog.close();
  const controlToken = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address === "object");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done()));
    await rm(home, { recursive: true, force: true });
  });
  return { home, project, controlToken, origin: `http://127.0.0.1:${address.port}`, prefix: `http://127.0.0.1:${address.port}/projects/${project.project_id}` };
}

test("RAC-400 PEQ-01 a project without Goals draws its page, its settings (the guidance among them) and its board, and does not offer Goals", { timeout: 240_000 }, async t => {
  const env = await withoutGoals(t);
  for (const path of ["", "/settings", "/settings/plugins", "/settings/guidance", "/api/board"]) {
    const response = await fetch(env.prefix + path);
    const text = await response.text();
    assert.equal(response.status, 200, `${path || "/"}: ${text.slice(0, 300)}`);
    assert.doesNotMatch(text, /internal error|内部错误/i, path || "/");
  }
  const page = await fetch(env.prefix).then(response => response.text());
  assert.match(page, /data-desktop-surface="home"/, "the page opens on the project's home");
  // The plugin list carries the Host's marks: with the agreement taken back, Goals is one to add again (a tile "not added"), never one the
  // project has, and there is no link into it.
  assert.match(page, /class="plugin-rail-tile is-available" data-plugin-tile="goals"/, "Goals is one to add, not one the project has");
  assert.doesNotMatch(page, /class="plugin-rail-tile(?: is-kept)?" data-plugin-tile="goals"|data-plugin-id="goals"/, "the project's plugin list does not hold Goals");
  // PEQ-01: the project's guidance is the platform's (contract-design §9), so a project without Goals still lists and draws it.
  const settings = await fetch(`${env.prefix}/settings/guidance`).then(response => response.text());
  assert.match(settings, /class="guidance-document"/, "PEQ-01: the guidance page is drawn without Goals");
  assert.match(settings, /<a href="[^"]*\/settings\/guidance"/, "PEQ-01: the settings list names the guidance without Goals");
  // A link to a Goal that is not there is answered as not found, never as a failure.
  const linked = await fetch(`${env.prefix}/goals/goal-x`);
  assert.ok(linked.status < 500, `a Goal link in a project without Goals: ${linked.status}`);
});

test("RAC-400 the management entry refuses an unregistered Goals tool as missing and creates no Goals facts", { timeout: 240_000 }, async t => {
  const env = await withoutGoals(t);
  const goalFacts = () => {
    const db = new DatabaseSync(env.project.database_path, { readOnly: true });
    try {
      const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
      return Object.fromEntries(["boards", "goals"].map(table => [table, tables.has(table) ? db.prepare(`SELECT * FROM ${table}`).all() : null]));
    } finally { db.close(); }
  };
  const before = goalFacts();
  assert.equal(before.boards?.length ?? 0, 0);
  assert.equal(before.goals?.length ?? 0, 0);
  const post = async (capability: { capability_id: string; version: number }, input: unknown) => {
    const response = await fetch(env.origin + "/api/internal/management-action", { method: "POST", headers: { origin: env.origin, "content-type": "application/json",
      "x-molis-work-control-token": env.controlToken, "x-molis-work-idempotency-key": randomUUID() },
    body: JSON.stringify({ home_id: createHash("sha256").update(resolve(env.home)).digest("hex"), database_path: env.project.database_path,
      project_id: env.project.project_id, call_id: randomUUID(), capability, input }) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  const refused = await post({ capability_id: "goals.board.initialize", version: 1 }, { idempotency_key: randomUUID() });
  assert.equal(refused.body.code, "actions.missing", JSON.stringify(refused.body));
  assert.ok(refused.status >= 400 && refused.status < 500, `a refusal the caller can read, not a failure: ${refused.status}`);
  assert.deepEqual(goalFacts(), before, "the refused initialize created no Goal table, board or Goal fact");
});

test("PEQ-01 PEQ-02 PEQ-07 PEQ-12 a new project does not enable Goals, opens on Home without goals.css, and removing then re-adding Goals keeps its data", { timeout: 240_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "peq-goals-lifecycle-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "默认项目无 Goals", actor_id: "test" });
  // PEQ-12: a brand-new project has no Goals without any prior consent revocation.
  assert.equal(catalog.listProjectPlugins(project.project_id).includes("goals"), false, "PEQ-12: new project does not enable Goals");
  catalog.close();
  const controlToken = resolveWebControlToken({ homeDirectory: home });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address === "object");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done()));
    await host.close();
    await rm(home, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${address.port}`;
  const prefix = `${origin}/projects/${project.project_id}`;
  const writeHeaders = () => ({ origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() });
  const revision = async () => {
    const data = await fetch(`${origin}/api/settings/project-plugins`).then(r => r.json()) as { projects: Array<{ project_id: string; revision: string }> };
    return data.projects.find(item => item.project_id === project.project_id)!.revision;
  };
  const changePlugin = async (method: "POST" | "DELETE", pluginId: string) => fetch(`${origin}/api/settings/projects/${project.project_id}/plugins`, {
    method,
    headers: writeHeaders(),
    body: JSON.stringify({ plugin_id: pluginId, expected_revision: await revision() }),
  });
  const initialHtml = await fetch(prefix + "/").then(r => r.text());
  assert.match(initialHtml, /data-desktop-surface="home"/, "PEQ-07: new project lands on Project Home");
  assert.doesNotMatch(initialHtml, /data-plugin-shell-style="goals"|molis-work-plugins\/goals\.css/, "PEQ-08: goals.css is not linked when Goals is absent");
  assert.doesNotMatch(initialHtml, /id="molis-work-data"/, "PEQ-01: no Goals bootstrap when Goals is absent");

  // Save platform project guidance before adding Goals (PEQ-01).
  const guidanceText = "这是一个移除 Goals 后依然正常运作的平台项目";
  const guidanceWrite = await fetch(`${prefix}/api/project-guidance`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify({ kind: "context", content: guidanceText, reason: "PEQ-01 核对项目指导独立于 Goals", user_confirmed: true }),
  });
  assert.equal(guidanceWrite.status, 200, "PEQ-01: platform project guidance write succeeds without Goals");

  // Add co-installed project plugins alongside Goals (PEQ-01: Pages, Coding, Feed, Inbox).
  for (const pluginId of ["pages", "coding", "feed", "inbox", "goals"]) {
    const added = await changePlugin("POST", pluginId);
    assert.equal(added.status, 200, `enable ${pluginId}: ${await added.text()}`);
  }

  // Create 2 Goals, a depends_on relation, a work note event, and a platform acceptance requirement + person acceptance (PEQ-02).
  for (const goal of [{ goal_id: "PEQ-KEEP-1", title: "移除后保留的目标" }, { goal_id: "PEQ-KEEP-2", title: "被依赖的目标" }]) {
    const created = await fetch(`${prefix}/api/plugins/io.molis.work.goals/goals`, {
      method: "POST",
      headers: writeHeaders(),
      body: JSON.stringify(goal),
    });
    assert.equal(created.status, 201, `Goals create ${goal.goal_id} succeeds once added`);
  }
  const relRes = await fetch(`${prefix}/api/plugins/io.molis.work.goals/goals/PEQ-KEEP-1/relations`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify({ direction: "outgoing", type: "depends_on", target_goal_id: "PEQ-KEEP-2", reason: "PEQ-02 验证关系在移除重装后保留" }),
  });
  assert.equal(relRes.status, 200, `Goals relation add succeeds: ${await relRes.text()}`);
  const noteText = "PEQ-02 移除 Goals 前记录的工作事件笔记";
  const noteRes = await fetch(`${prefix}/api/plugins/io.molis.work.goals/goals/PEQ-KEEP-1/event-note`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify({ note: noteText }),
  });
  assert.equal(noteRes.status, 200, `Goals event-note succeeds: ${await noteRes.text()}`);

  const acceptanceSubject = { provider_id: "io.molis.work.goals", subject: { kind: "goal", id: "PEQ-KEEP-1" } };
  const reqSetRes = await fetch(`${prefix}/api/acceptance/requirements`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify({
      subject: acceptanceSubject,
      requirements: [{ id: "req-keep-1", statement: "PEQ-02 验证验收要求与认可记录保留", requires_person: true }],
    }),
  });
  assert.equal(reqSetRes.status, 200, `Platform acceptance requirements set: ${await reqSetRes.text()}`);
  const projectRef = { project_id: project.project_id, storage_key: project.database_path };
  const personCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" as const, project_id: project.project_id, audience: "user" as const, permissions: ["acceptance:report", "acceptance:read", "goals:read"] };
  await host.actionClient(projectRef).invoke(personCaller, acceptanceActions.deliver, { subject: acceptanceSubject, version: "v1", summary: "初次交付" });
  const decideRes = await fetch(`${prefix}/api/acceptance/decide`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify({ subject: acceptanceSubject, version: "v1", accepts: [{ id: "req-keep-1", version: 1 }], returns: [] }),
  });
  const decideBody = await decideRes.text();
  assert.equal(decideRes.status, 200, `Platform acceptance decide: ${decideBody}`);
  const decidedView = JSON.parse(decideBody) as AcceptanceView;
  assert.equal(decidedView.requirements[0]?.person, "accepted", "PEQ-02: requirement accepted before removing Goals");

  const withGoalsHtml = await fetch(prefix + "/").then(r => r.text());
  assert.match(withGoalsHtml, /href="\/assets\/molis-work-plugins\/goals\.css" data-plugin-shell-style="goals"/, "PEQ-08: goals.css linked when Goals is enabled");
  assert.match(withGoalsHtml, /移除后保留的目标/);

  // Remove Goals: succeeds (PEQ-01/PEQ-12), removes goals.css and bootstrap, refuses Goals routes, keeps DB rows (PEQ-02).
  assert.equal((await changePlugin("DELETE", "goals")).status, 200, "PEQ-01: Goals can be removed from a project");
  const removedHtml = await fetch(prefix + "/").then(r => r.text());
  assert.doesNotMatch(removedHtml, /data-plugin-shell-style="goals"|id="molis-work-data"/, "PEQ-08: goals.css and bootstrap leave when Goals is removed");
  assert.equal((await fetch(`${prefix}/api/plugins/io.molis.work.goals/goals/directory`)).status, 403, "PEQ-01: Goals routes refused after removal");

  // PEQ-01: Project arrival brief, platform guidance, co-installed plugins (Pages/Coding/Feed/Inbox), and MCP context_resolve all work after removing Goals.
  const briefRes = await fetch(`${origin}/api/projects/${project.project_id}/brief`);
  assert.equal(briefRes.status, 200, "PEQ-01: project arrival brief works after removing Goals");
  assert.match(await briefRes.text(), new RegExp(guidanceText), "PEQ-01: project brief carries platform guidance without Goals");
  const guidanceRead = await fetch(`${prefix}/api/project-guidance`);
  assert.equal(guidanceRead.status, 200);
  const guidanceJson = await guidanceRead.json() as { entries: Array<{ content: string; active: boolean }> };
  assert.ok(guidanceJson.entries.some(entry => entry.active && entry.content === guidanceText), "PEQ-01: platform project guidance survives Goals removal");
  for (const [label, path] of [
    ["Pages", "/api/plugins/io.molis.work.pages/pages"],
    ["Coding", "/api/plugins/io.molis.work.coding/state"],
    ["Feed", "/api/plugins/io.molis.work.feed/snapshot"],
    ["Inbox", "/api/plugins/io.molis.work.inbox/entries"],
  ] as const) {
    const res = await fetch(prefix + path);
    const bodyText = await res.text();
    assert.equal(res.status, 200, `PEQ-01: ${label} route (${path}) still works after removing Goals: ${bodyText.slice(0, 200)}`);
  }
  const runtimeContext = { runtime_id: "codex", stable_work_context_id: "peq01-no-goals-ctx", host_declares_stable: true };
  await host.ensureWebCatalog(home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: home }, c => {
    c.bindRuntimeContext({ context: runtimeContext, project_id: project.project_id, actor_id: LOCAL_PERSON_ACTOR_ID, user_confirmed: true });
  });
  const mcpServer = new MolisWorkServer("runtime", { databasePath: project.database_path, projectId: project.project_id, webBaseUrl: origin },
    { homeDirectory: home, runtimeContext }, host);
  t.after(() => mcpServer.close());
  const resolved = JSON.parse(await mcpServer.callTool("molis_work_v1_context_resolve", {})) as { status: string; project?: { project_id: string } };
  assert.equal(resolved.status, "bound", "PEQ-01: MCP context_resolve succeeds on project after removing Goals");
  assert.equal(resolved.project?.project_id, project.project_id);

  // Re-add Goals: Goals, relation, work event history, and platform acceptance + decision are all intact (PEQ-02).
  assert.equal((await changePlugin("POST", "goals")).status, 200, "PEQ-02: Goals can be re-added");
  const restoredDir = await fetch(`${prefix}/api/plugins/io.molis.work.goals/goals/directory`);
  assert.equal(restoredDir.status, 200);
  const restoredJson = await restoredDir.json() as { goals: Array<{ goal_id: string; title: string }> };
  assert.ok(restoredJson.goals.some(g => g.goal_id === "PEQ-KEEP-1" && g.title === "移除后保留的目标"), "PEQ-02: primary Goal preserved across remove and re-add");
  assert.ok(restoredJson.goals.some(g => g.goal_id === "PEQ-KEEP-2" && g.title === "被依赖的目标"), "PEQ-02: second Goal preserved across remove and re-add");

  const boardJson = await fetch(`${prefix}/api/board`).then(r => r.json()) as {
    stage_data?: { goals?: { collection?: { snapshot?: { relations?: Array<{ from_goal_id: string; to_goal_id: string; type: string; state: string }> } } } };
  };
  const relations = boardJson.stage_data?.goals?.collection?.snapshot?.relations ?? [];
  assert.ok(relations.some(rel => rel.from_goal_id === "PEQ-KEEP-1" && rel.to_goal_id === "PEQ-KEEP-2" && rel.type === "depends_on" && rel.state === "active"),
    `PEQ-02: Goal relation preserved across remove and re-add (got ${JSON.stringify(relations)})`);

  const timelineRes = await fetch(`${prefix}/api/plugins/io.molis.work.goals/goals/PEQ-KEEP-1/event-timeline`);
  assert.equal(timelineRes.status, 200);
  assert.match(await timelineRes.text(), new RegExp(noteText), "PEQ-02: Goal event note history preserved across remove and re-add");

  const accReadRes = await fetch(`${prefix}/api/acceptance/read`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify({ subjects: [acceptanceSubject] }),
  });
  assert.equal(accReadRes.status, 200);
  const accRead = await accReadRes.json() as { views: AcceptanceView[] };
  assert.equal(accRead.views[0]?.requirements[0]?.id, "req-keep-1", "PEQ-02: platform acceptance requirement preserved");
  assert.equal(accRead.views[0]?.requirements[0]?.person, "accepted", "PEQ-02: platform acceptance decision preserved");
  assert.equal(accRead.views[0]?.requirements[0]?.satisfied, true, "PEQ-02: platform acceptance remains satisfied");

  const restoredHtml = await fetch(prefix + "/").then(r => r.text());
  assert.match(restoredHtml, /PEQ-KEEP-1/, "PEQ-02: Goal id restored after re-adding Goals");
  assert.match(restoredHtml, /移除后保留的目标/, "PEQ-02: Goal title restored after re-adding Goals");
});

test("PEQ-01 sibling built-in plugins keep Goals permissions optional and Inbox consumes no hardcoded goals.contract.read", () => {
  for (const manifest of [pagesManifest, codingManifest, feedManifest, inboxManifest]) {
    const requiredGoals = manifest.permissions.filter(entry => entry.required && entry.permission.startsWith("goals:"));
    assert.deepEqual(requiredGoals, [], `${manifest.plugin_id} must not require goals:* permissions`);
  }
  assert.equal(inboxManifest.capabilities.consumes.includes("goals.contract.read"), false, "Inbox consumes no hardcoded goals.contract.read");
  assert.equal(inboxActions.stage.action.permissions.includes("goals:read"), false, "inbox.stage.read does not require goals:read");
});
