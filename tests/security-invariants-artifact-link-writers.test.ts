import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ArtifactsModule, artifactsActions, createArtifactActionHandlers, createArtifactsSchema, ARTIFACTS_PROVIDER_ID, ARTIFACTS_PROVIDER_TITLE, ARTIFACT_ACTIONS } from "@molis-ai/molis-work-module-artifacts";
import { createContextLedger, createContextLedgerSchema } from "@molis-ai/molis-work-module-context-ledger";
import { artifactLinkKinds } from "@molis-ai/molis-work-app-local-host";
import { eventCursorOf, pinnedArtifact } from "./fixtures/artifacts.js";

// ac-artifacts A3 (slices/ac-artifacts.md §3.5), RAC-421 / S-82: a link kind belongs to the Plugin that declares it. An edge of that
// kind written by another module does not count as its link, and once the owner is not in effect the versions it linked stay readable.
const projectId = "link-writers", person: ActionCallContext = { actor_id: "web-user", audience: "user", project_id: projectId, permissions: ["artifacts:read"] };

function rig(t: test.TestContext, linkKinds: ReturnType<typeof artifactLinkKinds>) {
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
  const edge = (module: string, id: string) => ledger.commands.put(at, { key: `goal.input:${module}:${id}:a@1`, type: "goal.input", cause: "reason",
    source: { module, id, version: null, scope: at.scope }, target: { module: "artifacts", id: "a", version: 1, scope: at.scope } });
  const actions = new ActionService();
  actions.registerProvider({
    provider: { provider_id: ARTIFACTS_PROVIDER_ID, plugin_id: ARTIFACTS_PROVIDER_ID, title: ARTIFACTS_PROVIDER_TITLE, kind: "plugin", project_id: projectId },
    definitions: ARTIFACT_ACTIONS,
    handlers: createArtifactActionHandlers({ projectId, artifacts, ledger: ledger.query, linkKinds, goalTitle: id => `Goal ${id}`, importSources: () => ({}),
      importDocument: async () => { throw new Error("n/a"); }, openProjectReference: async () => { throw new Error("n/a"); } }),
  });
  return { artifacts, edge, links: () => actions.invoke(person, artifactsActions.links, { reference: { artifact_id: "a", version: 1 } }) };
}

test("RAC-421 S-82 an edge of a Goals link kind written by another module is not a Goal's link", async t => {
  const r = rig(t, artifactLinkKinds());
  r.edge("example", "X1");
  assert.deepEqual(await r.links(), { goals: [], other: 1 }, "counted as some other link, never listed as a Goal");
  r.edge("goals", "G1");
  assert.deepEqual(await r.links(), { goals: [{ goal_id: "G1", title: "Goal G1", role: "input" }], other: 1 }, "the owner's own edge is");
});

test("RAC-421 S-82 with the owner out of effect its kinds are gone, and the versions it linked stay readable", async t => {
  const r = rig(t, new Map());
  r.edge("goals", "G1");
  assert.deepEqual(await r.links(), { goals: [], other: 1 }, "no kind, so no Goal link and no failure");
  assert.equal(r.artifacts.query.getArtifactVersion(projectId, { artifact_id: "a", version: 1 })?.artifact_id, "a", "the linked version is still there to read");
});
