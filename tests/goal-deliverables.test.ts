import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEMO_BOARD_ID, GoalProjectApplication, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { GOAL_PLUGIN_OBJECT_SOURCE, goalPluginObjectRef } from "@molis-ai/molis-work-contracts/modules/goals";

const controlToken = "goal-deliverables-test-control-token-0123456789";

// specs/artifact-positioning A5: a Goal hands in exact versions from the 成果库 as `goal.output` links.
test("a Goal records, lists and removes deliverables from the 成果库, and its page shows them as 交付物", async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-goal-deliverables-"));
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
  const goalId = "V1";
  const register = (artifact_id: string, version: number, title: string) => coordinator.artifacts.commands.registerVersion({ board_id: DEMO_BOARD_ID, actor_id: "web-user",
    artifact_id, version, artifact_type_id: "io.molis.work.pages.document", schema_version: 1,
    producer: { plugin_id: "io.molis.work.pages", plugin_version: "1.0.0", binding_signature: "official-pages-binding" },
    content: { kind: "inline", payload: { title, body: { type: "doc", content: [] } } }, ...pinnedArtifact(title, { kind: "pages_document", id: artifact_id }, String(version)),
    ...(version > 1 ? { supersedes_version: version - 1 } : {}) });
  register("pages-plan", 1, "计划初稿");
  register("pages-plan", 2, "计划终稿");
  const headers = { "content-type": "application/json", origin, "x-molis-work-control-token": controlToken };
  const post = (body: unknown) => fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/deliverables`, { method: "POST", headers: { ...headers, "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify(body) });

  // The picker lists the latest available version of each 成果, named as its owner declares the type.
  const versions = await (await fetch(`${origin}/api/artifacts/versions`)).json() as { versions: Array<{ reference: { artifact_id: string; version: number }; title: string; type_title: string }> };
  const plan = versions.versions.find(item => item.reference.artifact_id === "pages-plan");
  assert.deepEqual(plan, { reference: { artifact_id: "pages-plan", version: 2 }, title: "计划终稿", type_title: "文档", created_at: (plan as { created_at: string }).created_at });

  const added = await post({ reference: { artifact_id: "pages-plan", version: 2 }, delivered: true });
  assert.equal(added.status, 200, await added.clone().text());
  assert.equal((await added.json() as { replayed: boolean }).replayed, false);
  assert.equal((await (await post({ reference: { artifact_id: "pages-plan", version: 2 }, delivered: true })).json() as { replayed: boolean }).replayed, true, "recording it again returns the same deliverable");
  const listed = await (await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/deliverables`)).json() as { deliverables: Array<{ reference: { version: number }; title: string }> };
  assert.deepEqual(listed.deliverables.map(item => [item.reference.version, item.title]), [[2, "计划终稿"]]);
  const page = await (await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/document`)).text();
  assert.match(page, /交付物与输入/);
  assert.match(page, /v2 · 交付物/);

  // An archived version cannot be handed in; removing keeps the 成果 and leaves no active deliverable.
  coordinator.artifacts.commands.archiveVersion({ board_id: DEMO_BOARD_ID, actor_id: "web-user", artifact_id: "pages-plan", version: 1 });
  assert.equal((await post({ reference: { artifact_id: "pages-plan", version: 1 }, delivered: true })).status, 400);
  assert.equal((await post({ reference: { artifact_id: "missing", version: 1 }, delivered: true })).status, 400);
  assert.equal((await (await post({ reference: { artifact_id: "pages-plan", version: 2 }, delivered: false })).json() as { removed: boolean }).removed, true);
  assert.deepEqual((await (await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/deliverables`)).json() as { deliverables: unknown[] }).deliverables, []);
  assert.ok(coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, { artifact_id: "pages-plan", version: 2 }), "the 成果 itself is untouched");
});

// A5b: a Goal's own material is pinned on the spot by its owner, and the new version is handed in.
test("a Goal pins a bound document on the spot through Pages and hands in the new version", async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-goal-pin-"));
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
  const created = await fetch(`${origin}/api/pages`, { method: "POST", headers: headers(), body: JSON.stringify({ title: "交付方案", markdown: "第一稿" }) });
  assert.equal(created.status, 200, await created.clone().text());
  const document = (await created.json() as { document: { id: string; version: number } }).document;
  const subject = { kind: "pages_document", id: document.id };
  coordinator.goalInputs.register({ binding_id: "bind-plan", board_id: DEMO_BOARD_ID, goal_id: "V1", input_name: "交付方案",
    source_type: GOAL_PLUGIN_OBJECT_SOURCE, source_ref: goalPluginObjectRef(subject), snapshot_digest: null, state: "confirmed",
    reason: "fixture", created_by: "web-user", created_at: new Date().toISOString() });
  const deliverables = `${origin}/api/goals/V1/deliverables`;

  // The closure lists the Goal's bound document as something Pages can pin.
  const before = await (await fetch(deliverables)).json() as { candidates: Array<{ subject: typeof subject; title: string }>; deliverables: unknown[] };
  assert.deepEqual(before.candidates, [{ subject, title: "交付方案" }]);
  assert.deepEqual(before.deliverables, []);

  const pinned = await fetch(deliverables, { method: "POST", headers: headers(), body: JSON.stringify({ subject, delivered: true }) });
  assert.equal(pinned.status, 200, await pinned.clone().text());
  const deliverable = (await pinned.json() as { deliverable: { reference: { artifact_id: string; version: number }; title: string } }).deliverable;
  assert.deepEqual(deliverable.reference, { artifact_id: `pages-${document.id}`, version: 1 });
  assert.equal(deliverable.title, "交付方案");
  const version = coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, deliverable.reference)!;
  assert.deepEqual(version.origin, { kind: "pinned", subject, revision: String(document.version) }, "the version records the document and the revision it pins");
  const after = await (await fetch(deliverables)).json() as { deliverables: Array<{ reference: { version: number } }> };
  assert.deepEqual(after.deliverables.map(item => item.reference.version), [1]);
  const page = await (await fetch(`${origin}/api/goals/V1/document`)).text();
  assert.match(page, /v1 · 交付物</);

  // Only an owner that declares a pin action can pin; nothing else is written.
  const unknown = await fetch(deliverables, { method: "POST", headers: headers(), body: JSON.stringify({ subject: { kind: "note", id: "n-1" }, delivered: true }) });
  assert.equal(unknown.status, 400);
  assert.equal(coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID).filter(item => item.artifact_id === `pages-${document.id}`).length, 1);
});
