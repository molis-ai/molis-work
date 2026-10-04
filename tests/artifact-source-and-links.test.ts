import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEMO_BOARD_ID, GoalProjectApplication, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const controlToken = "artifact-source-links-control-token-0123456789";

// specs/artifact-positioning A4b: a pinned version says whether its work object changed since, and who refers to it.
test("a pinned document shows when the original changed or was deleted, and which Goals and documents use it", async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-artifact-source-"));
  const databasePath = join(directory, "fixture.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  const coordinator = new GoalProjectApplication(store);
  const server = createMolisWorkWebServer({ databasePath, boardId: DEMO_BOARD_ID, homeDirectory: directory, controlToken });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); await rm(directory, { recursive: true, force: true }); });
  await (await fetch(origin + "/health")).text();
  const headers = () => ({ "content-type": "application/json", origin, "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() });
  const post = async (path: string, body: unknown) => {
    const response = await fetch(origin + path, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
    return await response.json() as Record<string, any>;
  };
  const detail = async (artifactId: string, version: number) => await (await fetch(`${origin}/artifacts/${encodeURIComponent(artifactId)}/versions/${version}`,
    { headers: { "x-molis-work-fragment": "artifact-workbench" } })).text();

  const created = (await post("/api/pages", { title: "季度计划", markdown: "第一稿" })).document as { id: string; version: number };
  const pinned = (await post("/api/pages/" + created.id + "/promote", { expected_version: created.version })).artifact as { artifact_id: string; version: number };
  const fresh = await detail(pinned.artifact_id, pinned.version);
  assert.doesNotMatch(fresh, /原文已改|原对象已经删除/);
  assert.match(fresh, /在 Pages 打开原对象/);
  assert.ok(fresh.includes("openPlugin=pages") && fresh.includes(`openItem=${created.id}`), "the way back opens the pinned document in Pages");
  // No Goal uses it yet.
  assert.match(fresh, /被谁引用[\s\S]*还没有目标引用这一版/);

  // Starring changes the document's revision but not its content: still the same.
  let current = (await (await fetch(`${origin}/api/pages/${created.id}`)).json() as { document: { version: number } }).document;
  await post("/api/pages/" + created.id, { starred: true, expected_version: current.version });
  assert.doesNotMatch(await detail(pinned.artifact_id, pinned.version), /原文已改/);

  // Editing the content is a change; the pinned version itself stays as it was.
  current = (await (await fetch(`${origin}/api/pages/${created.id}`)).json() as { document: { version: number } }).document;
  await post("/api/pages/" + created.id, { markdown: "第二稿", expected_version: current.version });
  const changed = await detail(pinned.artifact_id, pinned.version);
  assert.match(changed, /原文已改，这里仍是第 1 版/);
  assert.match(changed, /第一稿/);

  // Goals that take it as input or hand it in are listed under 「被谁引用」, each opening the Goal.
  await post("/api/goals/V1/deliverables", { reference: pinned, delivered: true });
  const scope = { kind: "personal" as const, id: DEMO_BOARD_ID };
  createContextLedger(store.db, { authorize: () => true }).commands.put({ actor_id: "fixture", scope }, { key: "input-fixture", type: "goal.input", cause: "fixture",
    source: { module: "goals", id: "PLATFORM", version: null, scope }, target: { module: "artifacts", id: pinned.artifact_id, version: pinned.version, scope } });
  const linked = await detail(pinned.artifact_id, pinned.version);
  const v1 = coordinator.goalQueries.getGoal(DEMO_BOARD_ID, "V1")!.title, platform = coordinator.goalQueries.getGoal(DEMO_BOARD_ID, "PLATFORM")!.title;
  const html = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  assert.ok(linked.includes(`href="/goals/V1">${html(v1)}</a><span>交付物</span>`), "the Goal that hands it in");
  assert.ok(linked.includes(`href="/goals/PLATFORM">${html(platform)}</a><span>输入</span>`), "the Goal that takes it as input");

  // A document whose text links to this version is listed too (五.1), and opens in Pages; links to another version are not.
  const path = `/artifacts/${encodeURIComponent(pinned.artifact_id)}/versions/${pinned.version}`;
  const citing = (await post("/api/pages", { title: "周报", markdown: `本周交了[季度计划](${origin}${path})。` })).document as { id: string };
  await post("/api/pages", { title: "别的版本", markdown: `见[第 9 版](${path.replace(/\/\d+$/, "/9")})。` });
  const cited = await detail(pinned.artifact_id, pinned.version);
  assert.ok(cited.includes(`data-workbench-item-plugin="pages" data-workbench-item-id="${citing.id}" data-workbench-item-title="周报">周报</a><span>Pages · 链接了这一版</span>`),
    "the document that links to this version, opening in Pages");
  assert.doesNotMatch(cited, /别的版本/);

  // Deleting the document leaves the version, says so, and no longer offers to open the original.
  await post("/api/pages/" + created.id + "/delete", {});
  const missing = await detail(pinned.artifact_id, pinned.version);
  assert.match(missing, /原对象已经删除，这里仍保留第 1 版/);
  assert.doesNotMatch(missing, /在 Pages 打开原对象/);
  assert.match(missing, /第一稿/);
});
