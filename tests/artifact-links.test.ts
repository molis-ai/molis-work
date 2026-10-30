import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ArtifactsModule, createArtifactsSchema, ARTIFACTS_PROVIDER_ID, ARTIFACTS_PROVIDER_TITLE, ARTIFACT_ACTIONS } from "@molis-ai/molis-work-module-artifacts";
import { createContextLedger, createContextLedgerSchema } from "@molis-ai/molis-work-module-context-ledger";
import { artifactsActions, createArtifactActionHandlers } from "@molis-ai/molis-work-module-artifacts";
import { artifactLinkKinds, artifactLinkSubjectActions, artifactProducerSources, type ArtifactProducerSource } from "@molis-ai/molis-work-app-local-host";
import { defineArtifactLinkSubjectsAction, isArtifactLinkSubjectsAction, isArtifactReferrersAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { artifactBrowserUiContribution } from "@molis-ai/molis-work-plugin-artifacts";
import { eventCursorOf, pinnedArtifact } from "./fixtures/artifacts.js";

// 「被谁引用」 (specs/artifact-positioning A4b): the objects that use a version, by how. An Agent's proposal to use a version
// as a Goal's input is a Goal edge like any other; it is listed with its Goal, not counted as an anonymous other link. Since
// BL-646 (T-113) they are listed under the Plugin that declares the link kind, named by that Plugin, never all as Goals.
const projectId = "links-project";
const person: ActionCallContext = { actor_id: "web-user", audience: "user", project_id: projectId, permissions: ["artifacts:read", "goals:read"] };
const GOALS = goalsManifest.plugin_id;
const goalNames = async (pluginId: string, ids: readonly string[]) =>
  new Map(pluginId === GOALS ? ids.map(id => [id, { title: `Goal ${id}`, open: { surface: "goals", id } }] as const) : []);
const goalRow = (id: string, role: "input" | "output", proposal: boolean) => ({ id, title: `Goal ${id}`, role, proposal, open: { surface: "goals", id } });

test("RAC-2080: a Goal's proposed input, deliverable and confirmed ones are each listed under Goals with their Goal, and nothing else is counted as other", async t => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE project_root (project_id TEXT PRIMARY KEY); INSERT INTO project_root VALUES ('${projectId}'); CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL);`);
  createArtifactsSchema(db);
  createContextLedgerSchema(db);
  const artifacts = new ArtifactsModule({ db, appendEvent: event => Number(db.prepare("INSERT INTO events (project_id) VALUES (?)").run(event.projectId).lastInsertRowid), eventCursor: eventCursorOf(db) });
  const ledger = createContextLedger(db, { authorize: () => true });
  const at = { actor_id: "web-user", scope: { kind: "personal" as const, id: projectId } };
  const register = (artifactId: string) => artifacts.commands.registerVersion({ project_id: projectId, actor_id: "web-user", artifact_id: artifactId, version: 1,
    artifact_type_id: "io.example.report", schema_version: 1, producer: { plugin_id: "io.example", plugin_version: "1", binding_signature: "s" },
    content: { kind: "inline", payload: { title: artifactId } }, ...pinnedArtifact(artifactId) });
  const edge = (goal: string, type: string, artifactId: string) => ledger.commands.put(at, { key: `${type}:${goal}:${artifactId}@1`, type, cause: "an Agent's reason",
    source: { module: "goals", id: goal, version: null, scope: at.scope }, target: { module: "artifacts", id: artifactId, version: 1, scope: at.scope } });
  for (const id of ["input-proposed", "output-proposed", "input-confirmed", "output-confirmed"]) register(id);
  edge("G1", "goal.input.proposal", "input-proposed");
  edge("G2", "goal.output.proposal", "output-proposed");
  edge("G3", "goal.input", "input-confirmed");
  edge("G4", "goal.output", "output-confirmed");

  const actions = new ActionService();
  actions.registerProvider({
    provider: { provider_id: ARTIFACTS_PROVIDER_ID, plugin_id: ARTIFACTS_PROVIDER_ID, title: ARTIFACTS_PROVIDER_TITLE, kind: "plugin", project_id: projectId },
    definitions: ARTIFACT_ACTIONS,
    handlers: createArtifactActionHandlers({ projectId, artifacts, ledger: ledger.query, linkKinds: artifactLinkKinds(), linkSubjects: goalNames, importSources: () => ({}),
      importDocument: async () => { throw new Error("n/a"); }, openProjectReference: async () => { throw new Error("n/a"); } }),
  });
  const links = (artifactId: string) => actions.invoke(person, artifactsActions.links, { reference: { artifact_id: artifactId, version: 1 } });

  const goals = (row: ReturnType<typeof goalRow>) => ({ plugins: [{ plugin_id: GOALS, plugin_title: "Goals", objects: [row] }], other: 0 });
  assert.deepEqual(await links("input-proposed"), goals(goalRow("G1", "input", true)));
  assert.deepEqual(await links("output-proposed"), goals(goalRow("G2", "output", true)));
  assert.deepEqual(await links("input-confirmed"), goals(goalRow("G3", "input", false)));
  assert.deepEqual(await links("output-confirmed"), goals(goalRow("G4", "output", false)));

  // The detail page names it.
  const selected = artifacts.query.getArtifactVersion(projectId, { artifact_id: "input-proposed", version: 1 })!;
  const html = artifactBrowserUiContribution.render({ surface: "detail", model: { view: { versions: [selected], selected, requested: null, compatibility: null }, routePrefix: "",
    links: await links("input-proposed"), primitives: { escape: (value: string) => value, text: (value: string) => value, formatDate: (value: string) => value } } } as never);
  assert.match(String(html), /<h3 class="artifact-links-heading">Goals<\/h3><ul data-artifact-linked-plugin="io\.molis\.work\.goals"><li><a href="#" data-workbench-item-plugin="goals" data-workbench-item-id="G1" data-workbench-item-title="Goal G1">Goal G1<\/a><span>提议的输入<\/span>/u);
  assert.doesNotMatch(String(html), /\/goals\//u, "RAC-2085: a row opens as a workbench item, never by a Goals address");
});

test("RAC-420: with no Plugin declaring link kinds (Goals absent) the links and the Goal embeds are empty, not an error", async t => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE project_root (project_id TEXT PRIMARY KEY); INSERT INTO project_root VALUES ('${projectId}'); CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL);`);
  createArtifactsSchema(db);
  createContextLedgerSchema(db);
  const artifacts = new ArtifactsModule({ db, appendEvent: event => Number(db.prepare("INSERT INTO events (project_id) VALUES (?)").run(event.projectId).lastInsertRowid), eventCursor: eventCursorOf(db) });
  const ledger = createContextLedger(db, { authorize: () => true });
  const at = { actor_id: "web-user", scope: { kind: "personal" as const, id: projectId } };
  artifacts.commands.registerVersion({ project_id: projectId, actor_id: "web-user", artifact_id: "a", version: 1, artifact_type_id: "io.example.report", schema_version: 1,
    producer: { plugin_id: "io.example", plugin_version: "1", binding_signature: "s" }, content: { kind: "inline", payload: { title: "a" } }, ...pinnedArtifact("a") });
  ledger.commands.put(at, { key: "goal.input:G1:a@1", type: "goal.input", cause: "reason", source: { module: "goals", id: "G1", version: null, scope: at.scope },
    target: { module: "artifacts", id: "a", version: 1, scope: at.scope } });
  const actions = new ActionService();
  actions.registerProvider({
    provider: { provider_id: ARTIFACTS_PROVIDER_ID, plugin_id: ARTIFACTS_PROVIDER_ID, title: ARTIFACTS_PROVIDER_TITLE, kind: "plugin", project_id: projectId },
    definitions: ARTIFACT_ACTIONS,
    handlers: createArtifactActionHandlers({ projectId, artifacts, ledger: ledger.query, linkKinds: artifactLinkKinds([]), importSources: () => ({}),
      importDocument: async () => { throw new Error("n/a"); }, openProjectReference: async () => { throw new Error("n/a"); } }),
  });
  assert.deepEqual(await actions.invoke(person, artifactsActions.links, { reference: { artifact_id: "a", version: 1 } }), { plugins: [], other: 1 });
  assert.deepEqual(await actions.invoke(person, artifactsActions.goalEmbeds, { goal_id: "G1" }), { embeds: [] });
});

/** One version with edges from any module, read through `artifacts.links` with the given declarers and naming port. */
function linkedVersion(t: { after(fn: () => void): void }, sources: readonly ArtifactProducerSource[], linkSubjects?: Parameters<typeof createArtifactActionHandlers>[0]["linkSubjects"]) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE project_root (project_id TEXT PRIMARY KEY); INSERT INTO project_root VALUES ('${projectId}'); CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL);`);
  createArtifactsSchema(db);
  createContextLedgerSchema(db);
  const artifacts = new ArtifactsModule({ db, appendEvent: event => Number(db.prepare("INSERT INTO events (project_id) VALUES (?)").run(event.projectId).lastInsertRowid), eventCursor: eventCursorOf(db) });
  const ledger = createContextLedger(db, { authorize: () => true });
  const at = { actor_id: "web-user", scope: { kind: "personal" as const, id: projectId } };
  artifacts.commands.registerVersion({ project_id: projectId, actor_id: "web-user", artifact_id: "a", version: 1, artifact_type_id: "io.example.report", schema_version: 1,
    producer: { plugin_id: "io.example", plugin_version: "1", binding_signature: "s" }, content: { kind: "inline", payload: { title: "a" } }, ...pinnedArtifact("a") });
  const actions = new ActionService();
  actions.registerProvider({
    provider: { provider_id: ARTIFACTS_PROVIDER_ID, plugin_id: ARTIFACTS_PROVIDER_ID, title: ARTIFACTS_PROVIDER_TITLE, kind: "plugin", project_id: projectId },
    definitions: ARTIFACT_ACTIONS,
    handlers: createArtifactActionHandlers({ projectId, artifacts, ledger: ledger.query, linkKinds: artifactLinkKinds(sources), ...(linkSubjects ? { linkSubjects } : {}), importSources: () => ({}),
      importDocument: async () => { throw new Error("n/a"); }, openProjectReference: async () => { throw new Error("n/a"); } }),
  });
  return {
    edge: (module: string, type: string, id: string) => ledger.commands.put(at, { key: `${type}:${id}:a@1`, type, cause: "reason",
      source: { module, id, version: null, scope: at.scope }, target: { module: "artifacts", id: "a", version: 1, scope: at.scope } }),
    links: () => actions.invoke(person, artifactsActions.links, { reference: { artifact_id: "a", version: 1 } }),
  };
}
const notesSource: ArtifactProducerSource = { plugin_id: "example.notes", name: "Notes", surface: "notes",
  artifacts: { produces: [], consumes: [], links: [{ kind: "note.cites", role: "output" }] },
  actions: [defineArtifactLinkSubjectsAction("notes.artifacts.link_subjects", "笔记", ["notes:read"])] } as ArtifactProducerSource;
const declarers = () => [...artifactProducerSources().filter(source => source.plugin_id === GOALS), notesSource];

test("RAC-2081: a second Plugin's linking object is listed under that Plugin with the name it gives, never as a Goal or by Goals' naming", async t => {
  const asked: Array<[string, string[]]> = [];
  const r = linkedVersion(t, declarers(), async (pluginId, ids) => {
    asked.push([pluginId, [...ids]]);
    return pluginId === "example.notes" ? new Map([["N1", { title: "Field notes", open: { surface: "notes", id: "N1" } }]]) : goalNames(pluginId, ids);
  });
  r.edge("goals", "goal.input", "G1");
  r.edge("notes", "note.cites", "N1");
  assert.deepEqual(await r.links(), { plugins: [
    { plugin_id: GOALS, plugin_title: "Goals", objects: [goalRow("G1", "input", false)] },
    { plugin_id: "example.notes", plugin_title: "Notes", objects: [{ id: "N1", title: "Field notes", role: "output", proposal: false, open: { surface: "notes", id: "N1" } }] },
  ], other: 0 });
  assert.deepEqual(asked.sort(), [["example.notes", ["N1"]], [GOALS, ["G1"]]], "each Plugin is asked once, about its own objects only");
});

test("RAC-2082: an object its Plugin does not name (no port, a failure, an id left out) shows its id and opens on its edges' surface", async t => {
  const fallback = { id: "N1", title: "N1", role: "output", proposal: false, open: { surface: "notes", id: "N1" } };
  for (const port of [undefined, async () => { throw new Error("not for this caller"); }, async () => new Map()]) {
    const r = linkedVersion(t, declarers(), port);
    r.edge("notes", "note.cites", "N1");
    assert.deepEqual(await r.links(), { plugins: [{ plugin_id: "example.notes", plugin_title: "Notes", objects: [fallback] }], other: 0 });
  }
});

test("RAC-2083: one Plugin's answer cannot name another Plugin's object", async t => {
  const r = linkedVersion(t, declarers(), async (pluginId, ids) => pluginId === "example.notes"
    ? new Map([["N1", { title: "Field notes", open: { surface: "notes", id: "N1" } }], ["G1", { title: "Hijacked", open: { surface: "notes", id: "G1" } }]])
    : goalNames(pluginId, ids));
  r.edge("goals", "goal.output", "G1");
  r.edge("notes", "note.cites", "N1");
  const plugins = (await r.links() as { plugins: Array<{ plugin_id: string; objects: unknown[] }> }).plugins;
  assert.deepEqual(plugins.find(group => group.plugin_id === GOALS)?.objects, [goalRow("G1", "output", false)]);
});

test("RAC-2086: the link-subjects contract is recognised by its types, and the Host finds Goals' as the one declarer that has it", () => {
  const definition = defineArtifactLinkSubjectsAction("notes.artifacts.link_subjects", "笔记", ["notes:read"]);
  assert.equal(isArtifactLinkSubjectsAction(definition.action), true);
  assert.equal(isArtifactReferrersAction(definition.action), false);
  assert.deepEqual(definition.action.permissions, ["notes:read"]);
  assert.deepEqual(definition.action.input_schema.required, ["ids"]);
  const found = artifactLinkSubjectActions(artifactProducerSources());
  assert.deepEqual([...found].map(([pluginId, action]) => [pluginId, action.capability_id, action.version]), [[GOALS, "goals.artifacts.link_subjects", 1]]);
  assert.deepEqual([...artifactLinkSubjectActions([notesSource])].map(([pluginId]) => pluginId), ["example.notes"]);
});
