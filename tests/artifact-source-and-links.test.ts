import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { LocalProjectDatabase, seedDemoGoals } from "@molis-ai/molis-work-app-local-host";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { openTestHome } from "./fixtures/test-home.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

const controlToken = "artifact-source-links-control-token-0123456789";

// specs/artifact-positioning A4b: a pinned version says whether its work object changed since, and who refers to it.
test("a pinned document shows when the original changed or was deleted, and which Goals and documents use it", async t => {
  const served = await openTestHome(t);
  const project = await withCatalog({ homeDirectory: served.home }, catalog => catalog.createProject({ display_name: "artifact-source", actor_id: "test" }));
  const DEMO_PROJECT_ID = project.project_id;
  await seedDemoGoals(project.database_path, DEMO_PROJECT_ID);
  const store = new LocalProjectDatabase(project.database_path);
  const coordinator = new GoalProjectApplication(store);
  const origin = served.origin;
  const controlToken = served.controlToken;
  // Every request this test makes belongs to the project: its pages and its Runtime plugin routes are served under the project prefix.
  const projectOrigin = `${origin}/projects/${encodeURIComponent(DEMO_PROJECT_ID)}`;
  const fetchProject = (path: string, init?: RequestInit) => globalThis.fetch(path.startsWith(origin) ? projectOrigin + path.slice(origin.length) : path, init);
  t.after(async () => { store.close(); });
  await (await fetchProject(origin + "/health")).text();
  const headers = () => ({ "content-type": "application/json", origin, "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() });
  const post = async (path: string, body: unknown) => {
    const response = await fetchProject(origin + path, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
    return await response.json() as Record<string, any>;
  };
  const detail = async (artifactId: string, version: number) => await (await fetchProject(`${origin}/artifacts/${encodeURIComponent(artifactId)}/versions/${version}`,
    { headers: { "x-molis-work-fragment": "artifact-workbench" } })).text();

  const created = (await post("/api/plugins/io.molis.work.pages/pages", { title: "季度计划", markdown: "第一稿" })).document as { id: string; version: number };
  const pinned = (await post("/api/plugins/io.molis.work.pages/pages/" + created.id + "/promote", { expected_version: created.version })).artifact as { artifact_id: string; version: number };
  const fresh = await detail(pinned.artifact_id, pinned.version);
  assert.doesNotMatch(fresh, /原文已改|原对象已经删除/);
  assert.match(fresh, /在 Pages 打开原对象/);
  assert.ok(fresh.includes("openPlugin=pages") && fresh.includes(`openItem=${created.id}`), "the way back opens the pinned document in Pages");
  // No Goal uses it yet.
  assert.match(fresh, /被谁引用[\s\S]*还没有引用这一版的对象/);

  // Starring changes the document's revision but not its content: still the same.
  let current = (await (await fetchProject(`${origin}/api/plugins/io.molis.work.pages/pages/${created.id}`)).json() as { document: { version: number } }).document;
  await post("/api/plugins/io.molis.work.pages/pages/" + created.id, { starred: true, expected_version: current.version });
  assert.doesNotMatch(await detail(pinned.artifact_id, pinned.version), /原文已改/);

  // Editing the content is a change; the pinned version itself stays as it was.
  current = (await (await fetchProject(`${origin}/api/plugins/io.molis.work.pages/pages/${created.id}`)).json() as { document: { version: number } }).document;
  await post("/api/plugins/io.molis.work.pages/pages/" + created.id, { markdown: "第二稿", expected_version: current.version });
  const changed = await detail(pinned.artifact_id, pinned.version);
  assert.match(changed, /原文已改，这里仍是第 1 版/);
  assert.match(changed, /第一稿/);

  // Goals that take it as input or hand it in are listed under 「被谁引用」 in Goals' group, named by Goals' own link-subjects
  // action asked as the caller (RAC-2084), each opening the Goal as a workbench item (RAC-2085).
  await post("/api/plugins/io.molis.work.goals/goals/V1/deliverables", { reference: pinned, delivered: true });
  const scope = { kind: "personal" as const, id: DEMO_PROJECT_ID };
  createContextLedger(store.db, { authorize: () => true }).commands.put({ actor_id: "fixture", scope }, { key: "input-fixture", type: "goal.input", cause: "fixture",
    source: { module: "goals", id: "PLATFORM", version: null, scope }, target: { module: "artifacts", id: pinned.artifact_id, version: pinned.version, scope } });
  const linked = await detail(pinned.artifact_id, pinned.version);
  const v1 = coordinator.goalQueries.getGoal(DEMO_PROJECT_ID, "V1")!.title, platform = coordinator.goalQueries.getGoal(DEMO_PROJECT_ID, "PLATFORM")!.title;
  const html = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const goalLink = (id: string, title: string) => `<a href="#" data-workbench-item-plugin="goals" data-workbench-item-id="${id}" data-workbench-item-title="${html(title)}">${html(title)}</a>`;
  assert.ok(linked.includes(`<h3 class="artifact-links-heading">Goals</h3><ul data-artifact-linked-plugin="io.molis.work.goals">`), "listed under Goals");
  assert.ok(linked.includes(`${goalLink("V1", v1)}<span>交付物</span>`), "the Goal that hands it in");
  assert.ok(linked.includes(`${goalLink("PLATFORM", platform)}<span>输入</span>`), "the Goal that takes it as input");
  assert.ok(!linked.includes(`/projects/${DEMO_PROJECT_ID}/goals/`), "no row is a Goals address");

  // A document whose text links to this version is listed too (五.1), and opens in Pages; links to another version are not.
  const path = `/artifacts/${encodeURIComponent(pinned.artifact_id)}/versions/${pinned.version}`;
  const citing = (await post("/api/plugins/io.molis.work.pages/pages", { title: "周报", markdown: `本周交了[季度计划](${origin}${path})。` })).document as { id: string };
  await post("/api/plugins/io.molis.work.pages/pages", { title: "别的版本", markdown: `见[第 9 版](${path.replace(/\/\d+$/, "/9")})。` });
  const cited = await detail(pinned.artifact_id, pinned.version);
  assert.ok(cited.includes(`data-workbench-item-plugin="pages" data-workbench-item-id="${citing.id}" data-workbench-item-title="周报">周报</a><span>Pages · 链接了这一版</span>`),
    "the document that links to this version, opening in Pages");
  assert.doesNotMatch(cited, /别的版本/);

  // Deleting the document leaves the version, says so, and no longer offers to open the original.
  await post("/api/plugins/io.molis.work.pages/pages/" + created.id + "/delete", {});
  const missing = await detail(pinned.artifact_id, pinned.version);
  assert.match(missing, /原对象已经删除，这里仍保留第 1 版/);
  assert.doesNotMatch(missing, /在 Pages 打开原对象/);
  assert.match(missing, /第一稿/);
});

test("a pinned document that moved to another place says so, instead of saying it was deleted", async t => {
  const served = await openTestHome(t);
  const project = await withCatalog({ homeDirectory: served.home }, catalog => catalog.createProject({ display_name: "artifact-moved", actor_id: "test" }));
  const DEMO_PROJECT_ID = project.project_id;
  await seedDemoGoals(project.database_path, DEMO_PROJECT_ID);
  const origin = served.origin;
  const controlToken = served.controlToken;
  // Every request this test makes belongs to the project: its pages and its Runtime plugin routes are served under the project prefix.
  const projectOrigin = `${origin}/projects/${encodeURIComponent(DEMO_PROJECT_ID)}`;
  const fetchProject = (path: string, init?: RequestInit) => globalThis.fetch(path.startsWith(origin) ? projectOrigin + path.slice(origin.length) : path, init);
  await (await fetchProject(origin + "/health")).text();
  const post = async (path: string, body: unknown) => {
    const response = await fetchProject(origin + path, { method: "POST", headers: { "content-type": "application/json", origin, "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify(body) });
    assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
    return await response.json() as Record<string, any>;
  };
  const detail = async (artifactId: string, version: number) => await (await fetchProject(`${origin}/artifacts/${encodeURIComponent(artifactId)}/versions/${version}`,
    { headers: { "x-molis-work-fragment": "artifact-workbench" } })).text();

  const created = (await post("/api/plugins/io.molis.work.pages/pages", { title: "季度计划", markdown: "第一稿" })).document as { id: string; version: number };
  const pinned = (await post("/api/plugins/io.molis.work.pages/pages/" + created.id + "/promote", { expected_version: created.version })).artifact as { artifact_id: string; version: number };
  const store = openPagesStore(served.home);
  try { store.relocate(created.id, DEMO_PROJECT_ID, "personal"); } finally { store.close(); }
  const moved = await detail(pinned.artifact_id, pinned.version);
  assert.match(moved, /原对象已移到别处，这里仍保留第 1 版/);
  assert.doesNotMatch(moved, /原对象已经删除/, "a move is not a deletion");
  assert.doesNotMatch(moved, /在 Pages 打开原对象/, "it is not in this project to open");
  assert.match(moved, /第一稿/);
});
