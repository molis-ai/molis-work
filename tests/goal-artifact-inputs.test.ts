import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { DEMO_BOARD_ID, GoalProjectApplication, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createGoalsDeliverableActionHandlers, goalsArtifactInputActions, goalsDeliverableActions, type GoalDeliverable } from "@molis-ai/molis-work-plugin-goals";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";

const controlToken = "goal-artifact-inputs-control-token-0123456789";

// specs/artifact-positioning A4b: a version in the 成果库 can be taken as a Goal's input, from the version's own detail.
test("a 成果 version becomes a Goal's input from its detail, shows on the Goal and under 「被谁引用」, and can be removed", async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-goal-inputs-"));
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
  for (const version of [1, 2]) coordinator.artifacts.commands.registerVersion({ board_id: DEMO_BOARD_ID, actor_id: "web-user", artifact_id: "pages-brief", version,
    artifact_type_id: "io.molis.work.pages.document", schema_version: 1,
    producer: { plugin_id: "io.molis.work.pages", plugin_version: "1.0.0", binding_signature: "official-pages-binding" },
    content: { kind: "inline", payload: { title: "需求说明", body: { type: "doc", content: [] } } }, ...pinnedArtifact("需求说明", { kind: "pages_document", id: "brief" }, String(version)),
    ...(version > 1 ? { supersedes_version: 1 } : {}) });
  const post = (body: unknown) => fetch(`${origin}/api/goals/V1/artifact-inputs`, { method: "POST",
    headers: { "content-type": "application/json", origin, "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify(body) });
  const detail = async (version: number) => await (await fetch(`${origin}/artifacts/pages-brief/versions/${version}`, { headers: { "x-molis-work-fragment": "artifact-workbench" } })).text();

  // The picker lists the project's Goals; the detail offers the control for a usable version.
  const goals = (await (await fetch(`${origin}/api/goals/directory`)).json() as { goals: Array<{ goal_id: string; title: string }> }).goals;
  const v1 = goals.find(goal => goal.goal_id === "V1");
  assert.ok(v1?.title, JSON.stringify(goals));
  assert.match(await detail(2), /data-artifact-goal-input-form[^>]*data-artifact-reference="\{&quot;artifact_id&quot;:&quot;pages-brief&quot;,&quot;version&quot;:2\}"/);

  const added = await post({ reference: { artifact_id: "pages-brief", version: 2 }, used: true });
  assert.equal(added.status, 200, await added.clone().text());
  const recorded = await added.json() as { input: GoalDeliverable; replayed: boolean };
  assert.deepEqual([recorded.input.reference, recorded.input.proposed, recorded.replayed], [{ artifact_id: "pages-brief", version: 2 }, false, false]);
  assert.equal((await (await post({ reference: { artifact_id: "pages-brief", version: 2 }, used: true })).json() as { replayed: boolean }).replayed, true);
  assert.match(await (await fetch(`${origin}/api/goals/V1/document`)).text(), /data-goal-input-fixed>[\s\S]*?<strong>[^<]+<\/strong><\/a><span class="goal-input-mode" data-goal-input-mode="fixed">固定的第 2 版<\/span>/);
  assert.match(await detail(2), /href="\/goals\/V1">[^<]+<\/a><span>输入<\/span>/);

  // An archived version is neither offered nor accepted; removing keeps the version itself.
  coordinator.artifacts.commands.archiveVersion({ board_id: DEMO_BOARD_ID, actor_id: "web-user", artifact_id: "pages-brief", version: 1 });
  assert.doesNotMatch(await detail(1), /data-artifact-goal-input-form/);
  const archived = await post({ reference: { artifact_id: "pages-brief", version: 1 }, used: true });
  assert.equal(archived.status, 400);
  assert.equal((await archived.json() as { code: string }).code, "goals.artifact_input_unavailable");
  assert.equal((await (await post({ reference: { artifact_id: "pages-brief", version: 2 }, used: false })).json() as { removed: boolean }).removed, true);
  assert.deepEqual((await (await fetch(`${origin}/api/goals/V1/artifact-inputs`)).json() as { inputs: unknown[] }).inputs, []);
  assert.ok(coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, { artifact_id: "pages-brief", version: 2 }));
});

// One entry for a Goal's inputs (artifact-positioning 五.1): an object taken as 「固定这一版」 is pinned by its owner first.
test("a document taken as a Goal's input 「固定这一版」 is pinned by Pages and listed with the Goal's other inputs", async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-goal-inputs-pin-"));
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
  const headers = () => ({ "content-type": "application/json", origin, "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() });
  const created = await (await fetch(`${origin}/api/pages`, { method: "POST", headers: headers(), body: JSON.stringify({ title: "访谈纪要", markdown: "用户最在意交付时间" }) })).json() as { document: { id: string } };

  const pinned = await fetch(`${origin}/api/goals/V1/artifact-inputs`, { method: "POST", headers: headers(),
    body: JSON.stringify({ subject: { kind: "pages_document", id: created.document.id }, used: true }) });
  assert.equal(pinned.status, 200, await pinned.clone().text());
  const input = (await pinned.json() as { input: GoalDeliverable }).input;
  assert.deepEqual([input.title, input.reference.version, input.proposed], ["访谈纪要", 1, false]);
  // Pages fixed the document's content as a version in the 成果库; the Goal counts that version, not the live document.
  const version = coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, input.reference);
  assert.equal(version?.origin.kind === "pinned" ? version.origin.subject.id : null, created.document.id);
  const page = await (await fetch(`${origin}/api/goals/V1/document`)).text();
  assert.match(page, /data-goal-inputs[\s\S]*<strong>访谈纪要<\/strong><\/a><span class="goal-input-mode" data-goal-input-mode="fixed">固定的第 1 版<\/span>/);
  assert.match(page, /data-goal-input-add/);
  assert.match(page, /data-goal-materials-entry><span>输入<\/span><span>1 份<\/span>/);
});

test("inputs from anyone but the person are proposals, kept apart from deliverables", async () => {
  const db = new Database(":memory:");
  const ledger = createContextLedger(db, { authorize: () => true });
  const actions = new ActionService();
  actions.registerProvider({ provider: { provider_id: "goals", title: "Goals", kind: "plugin", project_id: "project" },
    definitions: [...Object.values(goalsDeliverableActions), ...Object.values(goalsArtifactInputActions)],
    handlers: createGoalsDeliverableActionHandlers({ boardId: "board", goalExists: id => id === "G1", ledger,
      readArtifact: () => ({ title: "资料", artifact_type_id: "doc", availability: "available", lifecycle_state: "active" }),
      pin: async () => { throw new Error("not used"); }, pinnableKinds: async () => [], boundObjects: () => [] }) });
  const caller = (audience: ActionCallContext["audience"]): ActionCallContext => ({ actor_id: audience === "user" ? "web-user" : "assistant", audience, project_id: "project", permissions: ["goals:read", "goals:write"] });
  const reference = { artifact_id: "doc", version: 1 };
  const proposed = await actions.invoke(caller("agent"), goalsArtifactInputActions.add, { goal_id: "G1", reference, reason: "背景资料" }) as { input: GoalDeliverable };
  assert.deepEqual([proposed.input.proposed, proposed.input.reason], [true, "背景资料"]);
  await actions.invoke(caller("user"), goalsArtifactInputActions.add, { goal_id: "G1", reference });
  const listed = (await actions.invoke(caller("user"), goalsArtifactInputActions.list, { goal_id: "G1" }) as { inputs: GoalDeliverable[] }).inputs;
  assert.deepEqual(listed.map(item => item.proposed), [false], "confirming retires the proposal");
  await assert.rejects(actions.invoke(caller("agent"), goalsArtifactInputActions.remove, { goal_id: "G1", reference }), { code: "goals.artifact_input_confirmed" });
  // An input is not a deliverable.
  assert.deepEqual((await actions.invoke(caller("user"), goalsDeliverableActions.list, { goal_id: "G1" }) as { deliverables: unknown[] }).deliverables, []);
  db.close();
});
