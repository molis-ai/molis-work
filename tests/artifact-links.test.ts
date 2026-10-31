import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ArtifactsModule, createArtifactsSchema, ARTIFACTS_PROVIDER_ID, ARTIFACTS_PROVIDER_TITLE, ARTIFACT_ACTIONS } from "@molis-ai/molis-work-module-artifacts";
import { createContextLedger, createContextLedgerSchema } from "@molis-ai/molis-work-module-context-ledger";
import { artifactsActions, createArtifactActionHandlers } from "@molis-ai/molis-work-module-artifacts";
import { artifactLinkKinds, artifactLinkSubjectActions, artifactLinkSubjectsPort, artifactProducerSources, captureHostLog, type ArtifactProducerSource, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { ActionError, ARTIFACT_LINK_SUBJECTS_BATCH, defineArtifactLinkSubjectsAction, isArtifactLinkSubjectsAction, isArtifactReferrersAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { artifactBrowserUiContribution } from "@molis-ai/molis-work-app-workbench";
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
    links: (caller: ActionCallContext = person) => actions.invoke(caller, artifactsActions.links, { reference: { artifact_id: "a", version: 1 } }),
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

test("RAC-2083: one Plugin's answer cannot name another Plugin's object, and opens only on its own surface", async t => {
  const r = linkedVersion(t, declarers(), async (pluginId, ids) => pluginId === "example.notes"
    ? new Map([["N1", { title: "Field notes", open: { surface: "goals", id: "G1" } }], ["G1", { title: "Hijacked", open: { surface: "notes", id: "G1" } }]])
    : goalNames(pluginId, ids));
  r.edge("goals", "goal.output", "G1");
  r.edge("notes", "note.cites", "N1");
  const plugins = (await r.links() as { plugins: Array<{ plugin_id: string; objects: unknown[] }> }).plugins;
  assert.deepEqual(plugins.find(group => group.plugin_id === GOALS)?.objects, [goalRow("G1", "output", false)]);
  assert.deepEqual(plugins.find(group => group.plugin_id === "example.notes")?.objects,
    [{ id: "N1", title: "Field notes", role: "output", proposal: false, open: { surface: "notes", id: "N1" } }], "an open on another Plugin's surface falls back to its own");
});

test("RAC-2087: a Plugin with more linking objects than one call takes is asked in batches, and every object is named", async t => {
  const asked: number[] = [];
  const r = linkedVersion(t, declarers(), async (_pluginId, ids) => {
    asked.push(ids.length);
    return new Map(ids.map(id => [id, { title: `Note ${id}`, open: { surface: "notes", id } }] as const));
  });
  const ids = Array.from({ length: ARTIFACT_LINK_SUBJECTS_BATCH + 1 }, (_, index) => `N${String(index).padStart(3, "0")}`);
  for (const id of ids) r.edge("notes", "note.cites", id);
  const objects = (await r.links() as { plugins: Array<{ objects: Array<{ id: string; title: string }> }> }).plugins[0]!.objects;
  assert.deepEqual(asked, [ARTIFACT_LINK_SUBJECTS_BATCH, 1]);
  assert.equal(objects.length, ids.length);
  assert.ok(objects.every(item => item.title === `Note ${item.id}`), "no batch falls back to ids");
});

test("RAC-2086: the link-subjects contract is recognised by its types, and the Host finds Goals' as the one declarer that has it", () => {
  const definition = defineArtifactLinkSubjectsAction("notes.artifacts.link_subjects", "笔记", ["notes:read"]);
  assert.equal(isArtifactLinkSubjectsAction(definition.action), true);
  assert.equal(isArtifactReferrersAction(definition.action), false);
  assert.deepEqual(definition.action.permissions, ["notes:read"]);
  assert.deepEqual(definition.action.input_schema.required, ["ids"]);
  assert.deepEqual(definition.action.audiences, ["user", "agent", "workflow", "mcp"], "it reaches every audience artifacts.links does, since it is asked as that caller");
  const found = artifactLinkSubjectActions(artifactProducerSources());
  assert.deepEqual([...found].map(([pluginId, action]) => [pluginId, action.capability_id, action.version]), [[GOALS, "goals.artifacts.link_subjects", 1]]);
  assert.deepEqual([...artifactLinkSubjectActions([notesSource])].map(([pluginId]) => pluginId), ["example.notes"]);
});

// RAC-2089: the Host's half of the naming. A port is given a client that records what it is asked, or fails the way a caller is refused.
const declarer = () => new Map([["example.notes", { capability_id: "notes.artifacts.link_subjects", version: 1 }]]);
const caller = { ...person, audience: "mcp" as const } as never;

test("RAC-2089 the Host asks the declaring plugin pinned as provider, about the asked ids only, and keeps only those", async () => {
  const calls: unknown[][] = [];
  const port = artifactLinkSubjectsPort({ invoke: async (...args: unknown[]) => {
    calls.push(args.slice(1));
    return { objects: [{ id: "N1", title: "Field notes", open: { surface: "notes", id: "N1" } }, { id: "N9", title: "Not asked", open: { surface: "notes", id: "N9" } }] };
  } } as never, declarer);
  const named = await port("example.notes", ["N1"], caller);
  assert.deepEqual(calls, [[{ capability_id: "notes.artifacts.link_subjects", version: 1, provider_id: "example.notes" }, { ids: ["N1"] }]],
    "pinned to the declaring plugin, so another installation that registered the same capability id is never asked");
  assert.deepEqual([...named], [["N1", { title: "Field notes", open: { surface: "notes", id: "N1" } }]]);
  assert.deepEqual([...await port("example.other", ["X1"], caller)], [], "a plugin without the action is not asked");
});

test("RAC-2089 a refusal (forbidden, not found, an MCP client not granted the action) is the caller's answer and is not logged; any other failure is, without its text", async () => {
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  try {
    const failing = (error: unknown) => artifactLinkSubjectsPort({ invoke: async () => { throw error; } } as never, declarer)("example.notes", ["N1"], caller);
    for (const refusal of [new ActionError("actions.forbidden", "not yours"), new ActionError("actions.subject_unavailable", "gone", { kind: "not_found" }),
      new ActionError("mcp.action_revoked", "this client was not granted it", { kind: "forbidden" })]) {
      assert.deepEqual([...await failing(refusal)], []);
    }
    assert.deepEqual(entries, [], "refusals write nothing");
    assert.deepEqual([...await failing(new Error("the notes store broke: secret body text"))], []);
  } finally { restore(); }
  assert.deepEqual(entries.map(entry => [entry.level, entry.area, entry.event, entry.error, entry.fields]),
    [["warn", "artifacts", "link_subjects_failed", { name: "Error" }, { plugin_id: "example.notes" }]]);
  assert.doesNotMatch(JSON.stringify(entries), /secret body text/u, "the failure's text is not written");
});

test("RAC-2493 a refusal is told by its kind, not by its code: the same code without a kind is a failure like any other", async () => {
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  try {
    const failing = (error: unknown) => artifactLinkSubjectsPort({ invoke: async () => { throw error; } } as never, declarer)("example.notes", ["N1"], caller);
    assert.deepEqual([...await failing(new ActionError("mcp.action_revoked", "not granted", { kind: "forbidden" }))], []);
    assert.deepEqual(entries, [], "a refusal writes nothing");
    assert.deepEqual([...await failing(new ActionError("mcp.action_revoked", "not granted"))], []);
  } finally { restore(); }
  assert.deepEqual(entries.map(entry => [entry.level, entry.area, entry.event, entry.error, entry.fields]),
    [["warn", "artifacts", "link_subjects_failed", { name: "ActionError", code: "mcp.action_revoked" }, { plugin_id: "example.notes" }]]);
});

// RAC-2705 (T-113 二审增量 ①): the audience that reads 「被谁引用」 is passed on, so a workflow caller is answered as the workflow
// caller. There is no independent test entry for a workflow caller after #1552, so this goes through the same port and action as the
// MCP case, in process, without inventing a Host entry.
const notesDeclarer = () => new Map([["example.notes", { capability_id: "notes.artifacts.link_subjects", version: 1 }]]);
const workflowCaller: ActionCallContext = { ...person, audience: "workflow" };
const notesRow = { id: "N1", title: "Note N1", role: "output", proposal: false, open: { surface: "notes", id: "N1" } };
const notesIdRow = { id: "N1", title: "N1", role: "output", proposal: false, open: { surface: "notes", id: "N1" } };

test("RAC-2705 a workflow caller reads 「被谁引用」 named by the declaring Plugin, asked as that caller; a refusal falls back to the ids", async t => {
  const asked: ActionCallContext[] = [];
  const client = { invoke: async (caller: ActionCallContext, _action: unknown, input: { ids: string[] }) => {
    asked.push(caller);
    return { objects: input.ids.map(id => ({ id, title: `Note ${id}`, open: { surface: "notes", id } })) };
  } };
  const r = linkedVersion(t, declarers(), artifactLinkSubjectsPort(client as never, notesDeclarer));
  r.edge("notes", "note.cites", "N1");
  assert.deepEqual(await r.links(workflowCaller), { plugins: [{ plugin_id: "example.notes", plugin_title: "Notes", objects: [notesRow] }], other: 0 });
  assert.deepEqual(asked.map(caller => [caller.audience, caller.actor_id, caller.project_id]), [["workflow", "web-user", projectId]],
    "the declaring Plugin is asked as the workflow caller, not as a person or an MCP client");

  // A refusal is the workflow caller's answer: the object keeps its id, and nothing is written.
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  try {
    const refusing = { invoke: async () => { throw new ActionError("actions.forbidden", "not for this caller"); } };
    const removed = linkedVersion(t, declarers(), artifactLinkSubjectsPort(refusing as never, notesDeclarer));
    removed.edge("notes", "note.cites", "N1");
    assert.deepEqual(await removed.links(workflowCaller), { plugins: [{ plugin_id: "example.notes", plugin_title: "Notes", objects: [notesIdRow] }], other: 0 });
  } finally { restore(); }
  assert.deepEqual(entries, [], "a refused read is an answer, not a failure to log");
});

// RAC-2706 (T-113 二审增量 ②): the Host's half when a declaring Plugin cannot name its objects. Answers are not failures; anything
// else is one line with the plugin, never the request's content (ids, titles) or the error's text. `logLinkSubjectsFailure` is not a
// public entry of the Host, so this goes through the exported port that calls it.
test("RAC-2706 a refused read is not logged; any other failure writes one line with the plugin and none of the content", async () => {
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  try {
    const failing = (error: unknown) => artifactLinkSubjectsPort({ invoke: async () => { throw error; } } as never, notesDeclarer)("example.notes", ["N1"], workflowCaller);
    for (const refusal of [new ActionError("actions.forbidden", "not yours"), new ActionError("actions.subject_unavailable", "gone", { kind: "not_found" })]) {
      assert.deepEqual([...await failing(refusal)], []);
    }
    assert.deepEqual(entries, [], "forbidden and not found are answers, not failures");
    assert.deepEqual([...await failing(new Error("the notes store broke: N1 Field notes"))], []);
  } finally { restore(); }
  assert.deepEqual(entries.map(entry => [entry.level, entry.area, entry.event, entry.error, entry.fields]),
    [["warn", "artifacts", "link_subjects_failed", { name: "Error" }, { plugin_id: "example.notes" }]]);
  assert.doesNotMatch(JSON.stringify(entries), /N1|Field notes|notes store/u, "no id, title or error text is written");
});
