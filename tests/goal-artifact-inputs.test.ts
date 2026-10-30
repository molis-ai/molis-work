import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { LocalProjectDatabase, seedDemoGoals, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { createGoalsDeliverableActionHandlers, goalsArtifactInputActions, goalsDeliverableActions, type GoalDeliverable } from "@molis-ai/molis-work-plugin-goals";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { openTestHome } from "./fixtures/test-home.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

const controlToken = "goal-artifact-inputs-control-token-0123456789";

// specs/artifact-positioning A4b: a version in the 成果库 can be taken as a Goal's input, from the version's own detail.
test("a 成果 version becomes a Goal's input from its detail, shows on the Goal and under 「被谁引用」, and can be removed", async t => {
  const served = await openTestHome(t);
  const project = await withCatalog({ homeDirectory: served.home }, catalog => catalog.createProject({ display_name: 'molis-work-goal-inputs-', actor_id: "test" }));
  const DEMO_PROJECT_ID = project.project_id;
  const databasePath = project.database_path;
  await seedDemoGoals(databasePath, DEMO_PROJECT_ID);
  const store = new LocalProjectDatabase(databasePath);
  const library = openProjectVersionStores(store);
  const origin = served.origin;
  const controlToken = served.controlToken;
  // Every request this test makes belongs to the project: its pages and its Runtime plugin routes are served under the project prefix.
  const projectOrigin = `${origin}/projects/${encodeURIComponent(DEMO_PROJECT_ID)}`;
  const fetchProject = (path: string, init?: RequestInit) => globalThis.fetch(path.startsWith(origin) ? projectOrigin + path.slice(origin.length) : path, init);
  t.after(async () => { store.close(); });  await (await fetchProject(origin + "/health")).text();
  for (const version of [1, 2]) library.artifacts.commands.registerVersion({ project_id: DEMO_PROJECT_ID, actor_id: "web-user", artifact_id: "pages-brief", version,
    artifact_type_id: "io.molis.work.pages.document", schema_version: 1,
    producer: { plugin_id: "io.molis.work.pages", plugin_version: "1.0.0", binding_signature: "official-pages-binding" },
    content: { kind: "inline", payload: { title: "需求说明", body: { type: "doc", content: [] } } }, ...pinnedArtifact("需求说明", { kind: "pages_document", id: "brief" }, String(version)),
    ...(version > 1 ? { supersedes_version: 1 } : {}) });
  const post = (body: unknown) => fetchProject(`${origin}/api/plugins/io.molis.work.goals/goals/V1/artifact-inputs`, { method: "POST",
    headers: { "content-type": "application/json", origin, "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify(body) });
  const detail = async (version: number) => await (await fetchProject(`${origin}/artifacts/pages-brief/versions/${version}`, { headers: { "x-molis-work-fragment": "artifact-workbench" } })).text();

  // The picker lists the project's Goals; the detail offers the control for a usable version.
  const goals = (await (await fetchProject(`${origin}/api/plugins/io.molis.work.goals/goals/directory`)).json() as { goals: Array<{ goal_id: string; title: string }> }).goals;
  const v1 = goals.find(goal => goal.goal_id === "V1");
  assert.ok(v1?.title, JSON.stringify(goals));
  assert.match(await detail(2), /data-artifact-goal-input-form[^>]*data-artifact-reference="\{&quot;artifact_id&quot;:&quot;pages-brief&quot;,&quot;version&quot;:2\}"/);

  const added = await post({ reference: { artifact_id: "pages-brief", version: 2 }, used: true });
  assert.equal(added.status, 200, await added.clone().text());
  const recorded = await added.json() as { input: GoalDeliverable; replayed: boolean };
  assert.deepEqual([recorded.input.reference, recorded.input.proposed, recorded.replayed], [{ artifact_id: "pages-brief", version: 2 }, false, false]);
  assert.equal((await (await post({ reference: { artifact_id: "pages-brief", version: 2 }, used: true })).json() as { replayed: boolean }).replayed, true);
  assert.match(await (await fetchProject(`${origin}/api/goals/V1/document`)).text(), /data-goal-input-fixed>[\s\S]*?<strong>[^<]+<\/strong><\/a><span class="goal-input-mode" data-goal-input-mode="fixed">固定的第 2 版<\/span>/);
  // Listed under Goals and opened as a workbench item (BL-646, RAC-2085).
  assert.match(await detail(2), /data-artifact-linked-plugin="io\.molis\.work\.goals"><li><a href="#" data-workbench-item-plugin="goals" data-workbench-item-id="V1" data-workbench-item-title="[^"]+">[^<]+<\/a><span>输入<\/span>/u);

  // An archived version is neither offered nor accepted; removing keeps the version itself.
  library.artifacts.commands.archiveVersion({ project_id: DEMO_PROJECT_ID, actor_id: "web-user", artifact_id: "pages-brief", version: 1 });
  assert.doesNotMatch(await detail(1), /data-artifact-goal-input-form/);
  const archived = await post({ reference: { artifact_id: "pages-brief", version: 1 }, used: true });
  assert.equal(archived.status, 400);
  assert.equal((await archived.json() as { code: string }).code, "goals.artifact_input_unavailable");
  assert.equal((await (await post({ reference: { artifact_id: "pages-brief", version: 2 }, used: false })).json() as { removed: boolean }).removed, true);
  assert.deepEqual((await (await fetchProject(`${origin}/api/plugins/io.molis.work.goals/goals/V1/artifact-inputs`)).json() as { inputs: unknown[] }).inputs, []);
  assert.ok(library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, { artifact_id: "pages-brief", version: 2 }));
});

// One entry for a Goal's inputs (artifact-positioning 五.1): an object taken as 「固定这一版」 is pinned by its owner first.
test("a document taken as a Goal's input 「固定这一版」 is pinned by Pages and listed with the Goal's other inputs", async t => {
  const served = await openTestHome(t);
  const project = await withCatalog({ homeDirectory: served.home }, catalog => catalog.createProject({ display_name: 'molis-work-goal-inputs-pin-', actor_id: "test" }));
  const DEMO_PROJECT_ID = project.project_id;
  const databasePath = project.database_path;
  await seedDemoGoals(databasePath, DEMO_PROJECT_ID);
  const store = new LocalProjectDatabase(databasePath);
  const library = openProjectVersionStores(store);
  const origin = served.origin;
  const controlToken = served.controlToken;
  // Every request this test makes belongs to the project: its pages and its Runtime plugin routes are served under the project prefix.
  const projectOrigin = `${origin}/projects/${encodeURIComponent(DEMO_PROJECT_ID)}`;
  const fetchProject = (path: string, init?: RequestInit) => globalThis.fetch(path.startsWith(origin) ? projectOrigin + path.slice(origin.length) : path, init);
  t.after(async () => { store.close(); });  const headers = () => ({ "content-type": "application/json", origin, "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() });
  const created = await (await fetchProject(`${origin}/api/plugins/io.molis.work.pages/pages`, { method: "POST", headers: headers(), body: JSON.stringify({ title: "访谈纪要", markdown: "用户最在意交付时间" }) })).json() as { document: { id: string } };

  const pinned = await fetchProject(`${origin}/api/plugins/io.molis.work.goals/goals/V1/artifact-inputs`, { method: "POST", headers: headers(),
    body: JSON.stringify({ subject: { kind: "pages_document", id: created.document.id }, used: true }) });
  assert.equal(pinned.status, 200, await pinned.clone().text());
  const input = (await pinned.json() as { input: GoalDeliverable }).input;
  assert.deepEqual([input.title, input.reference.version, input.proposed], ["访谈纪要", 1, false]);
  // Pages fixed the document's content as a version in the 成果库; the Goal counts that version, not the live document.
  const version = library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, input.reference);
  assert.equal(version?.origin.kind === "pinned" ? version.origin.subject.id : null, created.document.id);
  const page = await (await fetchProject(`${origin}/api/goals/V1/document`)).text();
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
    handlers: createGoalsDeliverableActionHandlers({ projectId: "board", goalExists: id => id === "G1", ledger,
      readArtifact: () => ({ title: "资料", artifact_type_id: "doc", availability: "available", lifecycle_state: "active" }),
      read: body => body(), write: (_caller, body) => Promise.resolve(body()),
      pin: async () => { throw new Error("not used"); }, pinnableKinds: async () => [], boundObjects: () => [] }) });
  const caller = (audience: ActionCallContext["audience"]): ActionCallContext => ({ actor_id: audience === "user" ? "web-user" : "assistant", audience, project_id: "project", permissions: ["goals:read", "goals:write", "context-ledger:write", "artifacts:read"] });
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

// An input an Agent or an MCP client only proposed (specs/repository-anti-corruption §1, 2026-10-10) is shown for what it is, and the
// person decides it from the Goal's own input list.
test("a proposed Feed input shows on the Goal as pending with 认可 and 移除; the person's accept makes it confirmed, and removing takes it off", async t => {
  const served = await openTestHome(t);
  const project = await withCatalog({ homeDirectory: served.home }, catalog => catalog.createProject({ display_name: "goal-inputs-accept", actor_id: "test" }));
  const DEMO_PROJECT_ID = project.project_id;
  const databasePath = project.database_path;
  await seedDemoGoals(databasePath, DEMO_PROJECT_ID);
  const store = new LocalProjectDatabase(databasePath);
  const coordinator = new GoalProjectApplication(store);
  const origin = served.origin;
  const controlToken = served.controlToken;
  // Every request this test makes belongs to the project: its pages and its Runtime plugin routes are served under the project prefix.
  const projectOrigin = `${origin}/projects/${encodeURIComponent(DEMO_PROJECT_ID)}`;
  const fetchProject = (path: string, init?: RequestInit) => globalThis.fetch(path.startsWith(origin) ? projectOrigin + path.slice(origin.length) : path, init);
  t.after(async () => { store.close(); });
  const receipt = (id: string, source: string, state: "proposed" | "confirmed") => ({ binding_id: id, project_id: DEMO_PROJECT_ID, goal_id: "V1", input_name: `来源 ${source}`,
    source_type: "feed_item", source_ref: `feed-item:${source}`, snapshot_digest: `sha256:${"c".repeat(64)}`, state, reason: "从 Feed Item 创建 Goal 时提议该输入",
    created_by: "runtime:promoter:session", created_at: "2026-10-10T00:00:00.000Z" });
  coordinator.goalInputs.register(receipt("binding-feed-a", "item-a", "proposed"));
  coordinator.goalInputs.register(receipt("binding-feed-b", "item-b", "proposed"));
  coordinator.goalInputs.register(receipt("binding-feed-c", "item-c", "confirmed"));
  const headers = () => ({ "content-type": "application/json", origin, "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() });
  const post = (body: unknown) => fetchProject(`${origin}/api/plugins/io.molis.work.goals/goals/V1/inputs`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const page = async (locale?: "en") => (await fetchProject(`${origin}/api/goals/V1/document`, locale ? { headers: { cookie: `molis_work_locale=${locale}` } } : undefined)).text();
  const rowOf = (html: string, binding: string) => html.match(new RegExp(`<article[^>]*data-goal-input-binding="${binding}"[\\s\\S]*?</article>`))?.[0] ?? "";

  // Pending ones say so, in words, and carry the two controls; a confirmed one says so and carries none. The raw state is never printed.
  const before = await page();
  assert.match(rowOf(before, "binding-feed-a"), /data-goal-input-state[^>]*>待确认</);
  for (const control of ["data-goal-input-accept", "data-goal-input-release"]) assert.match(rowOf(before, "binding-feed-a"), new RegExp(control), control);
  assert.match(rowOf(before, "binding-feed-a"), />认可这条输入<\/button>/);
  assert.match(rowOf(before, "binding-feed-a"), />移除<\/button>/);
  assert.match(rowOf(before, "binding-feed-c"), /data-goal-input-state[^>]*>已确认</);
  assert.doesNotMatch(rowOf(before, "binding-feed-c"), /data-goal-input-accept|data-goal-input-release/);
  assert.doesNotMatch(before, /(?:proposed|confirmed) · /);
  const english = await page("en");
  assert.match(rowOf(english, "binding-feed-a"), /data-goal-input-state[^>]*>Pending confirmation</);
  assert.match(rowOf(english, "binding-feed-a"), />Accept this input<\/button>/);
  assert.match(rowOf(english, "binding-feed-a"), />Remove<\/button>/);
  assert.match(rowOf(english, "binding-feed-c"), /data-goal-input-state[^>]*>Confirmed</);

  // Accept: the same receipt becomes confirmed, and the list shows it so.
  const accepted = await post({ binding_id: "binding-feed-a", action: "accept" });
  assert.equal(accepted.status, 200, await accepted.clone().text());
  const result = await accepted.json() as { binding: { binding_id: string; state: string }; replayed: boolean };
  assert.deepEqual([result.binding.binding_id, result.binding.state, result.replayed], ["binding-feed-a", "confirmed", false]);
  assert.deepEqual(coordinator.goalInputs.list(DEMO_PROJECT_ID).filter(item => item.source_type === "feed_item").map(item => [item.binding_id, item.state]),
    [["binding-feed-a", "confirmed"], ["binding-feed-b", "proposed"], ["binding-feed-c", "confirmed"]]);
  const after = await page();
  assert.match(rowOf(after, "binding-feed-a"), /data-goal-input-state[^>]*>已确认</);
  assert.doesNotMatch(rowOf(after, "binding-feed-a"), /data-goal-input-accept|data-goal-input-release/);

  // Remove: the proposal is off the Goal, kept only as history.
  const removed = await post({ binding_id: "binding-feed-b", action: "remove" });
  assert.equal(removed.status, 200, await removed.clone().text());
  assert.deepEqual(await removed.json(), { released: true });
  assert.equal(rowOf(await page(), "binding-feed-b"), "");
  assert.equal(coordinator.goalInputs.list(DEMO_PROJECT_ID).find(item => item.binding_id === "binding-feed-b")?.state, "inactive");

  // What cannot be done says why and changes nothing.
  for (const [body, code] of [[{ binding_id: "binding-feed-b", action: "accept" }, "goals.input_released"], [{ binding_id: "missing", action: "accept" }, "goals.not_found"],
    [{ binding_id: "binding-feed-a", action: "other" }, undefined], [{ action: "accept" }, undefined]] as const) {
    const refused = await post(body);
    assert.equal(refused.status, 400, JSON.stringify(body));
    if (code) assert.equal((await refused.json() as { code: string }).code, code);
  }
});
