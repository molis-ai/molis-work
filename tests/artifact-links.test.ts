import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ArtifactsModule, createArtifactsSchema } from "@molis-ai/molis-work-module-artifacts";
import { createContextLedger, createContextLedgerSchema } from "@molis-ai/molis-work-module-context-ledger";
import { artifactsActions, artifactsManifest, artifactBrowserUiContribution, createArtifactActionHandlers } from "@molis-ai/molis-work-plugin-artifacts";
import { pinnedArtifact } from "./fixtures/artifacts.js";

// 「被谁引用」 (specs/artifact-positioning A4b): the Goals that use a version, by how. An Agent's proposal to use a version
// as a Goal's input is a Goal edge like any other; it is listed with its Goal, not counted as an anonymous other link.
const projectId = "links-project";
const person: ActionCallContext = { actor_id: "web-user", audience: "user", project_id: projectId, permissions: ["artifacts:read"] };

test("a Goal's proposed input, deliverable and confirmed ones are each listed with their Goal, and nothing else is counted as other", async t => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE boards (project_id TEXT PRIMARY KEY); INSERT INTO boards VALUES ('${projectId}'); CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL);`);
  createArtifactsSchema(db);
  createContextLedgerSchema(db);
  const artifacts = new ArtifactsModule({ db, appendEvent: event => Number(db.prepare("INSERT INTO events (project_id) VALUES (?)").run(event.projectId).lastInsertRowid) });
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
    provider: { provider_id: artifactsManifest.plugin_id, plugin_id: artifactsManifest.plugin_id, title: artifactsManifest.name, kind: "plugin", project_id: projectId },
    definitions: artifactsManifest.actions!,
    handlers: createArtifactActionHandlers({ projectId, artifacts, ledger: ledger.query, goalTitle: id => `Goal ${id}`, importSources: () => ({}),
      importDocument: async () => { throw new Error("n/a"); }, openProjectReference: async () => { throw new Error("n/a"); } }),
  });
  const links = (artifactId: string) => actions.invoke(person, artifactsActions.links, { reference: { artifact_id: artifactId, version: 1 } });

  assert.deepEqual(await links("input-proposed"), { goals: [{ goal_id: "G1", title: "Goal G1", role: "proposed_input" }], other: 0 });
  assert.deepEqual(await links("output-proposed"), { goals: [{ goal_id: "G2", title: "Goal G2", role: "proposed" }], other: 0 });
  assert.deepEqual(await links("input-confirmed"), { goals: [{ goal_id: "G3", title: "Goal G3", role: "input" }], other: 0 });
  assert.deepEqual(await links("output-confirmed"), { goals: [{ goal_id: "G4", title: "Goal G4", role: "deliverable" }], other: 0 });

  // The detail page names it.
  const selected = artifacts.query.getArtifactVersion(projectId, { artifact_id: "input-proposed", version: 1 })!;
  const html = artifactBrowserUiContribution.render({ surface: "detail", model: { view: { versions: [selected], selected, requested: null, compatibility: null }, routePrefix: "",
    links: await links("input-proposed"), primitives: { escape: (value: string) => value, text: (value: string) => value, formatDate: (value: string) => value } } } as never);
  assert.match(String(html), /Goal G1<\/a><span>提议的输入<\/span>/);
});
