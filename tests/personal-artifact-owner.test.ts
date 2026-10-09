import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import {
  ArtifactsModule, createArtifactsSchema, createProcessItemsSchema, ProcessItemsModule, type ArtifactsSqliteDatabase,
} from "@molis-ai/molis-work-module-artifacts";
import type { RegisterArtifactVersionInput } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createContextLedger, createContextLedgerSchema } from "@molis-ai/molis-work-module-context-ledger";
import { artifactSubjectId } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { artifactsActions, artifactsManifest, createArtifactActionHandlers, importArtifactDocument } from "@molis-ai/molis-work-plugin-artifacts";
import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { pinnedArtifact } from "./fixtures/artifacts.js";

// Who a personal 成果 belongs to (specs/artifact-positioning, 2026-10-07): in a Home it is the person, whoever produced it.
// The producing workflow, Agent or MCP client is provenance in `created_by`.
const person = LOCAL_PERSON_ACTOR_ID;
const producer = { plugin_id: "io.example.writer", plugin_version: "1.0.0", binding_signature: "writer-binding" };

function harness() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE boards (project_id TEXT PRIMARY KEY); INSERT INTO boards VALUES ('p'); CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL);");
  createArtifactsSchema(db as unknown as ArtifactsSqliteDatabase);
  createProcessItemsSchema(db as unknown as ArtifactsSqliteDatabase);
  const append = (event: { projectId: string }) => Number(db.prepare("INSERT INTO events (project_id) VALUES (?)").run(event.projectId).lastInsertRowid);
  const open = (homeOwner?: string) => new ArtifactsModule({ db: db as unknown as ArtifactsSqliteDatabase, appendEvent: append, ...(homeOwner ? { homeOwner } : {}) });
  const registration = (actor: string, version: number, extra: Partial<RegisterArtifactVersionInput> = {}): RegisterArtifactVersionInput => ({
    project_id: "p", actor_id: actor, artifact_id: "report", version, artifact_type_id: "io.example.report", schema_version: 1, producer,
    content: { kind: "inline", payload: { text: `version ${version} by ${actor}` } }, ...pinnedArtifact("Report"), ...extra });
  const stored = () => db.prepare("SELECT owner_actor_id FROM library_artifacts WHERE artifact_id = 'report'").all() as Array<{ owner_actor_id: string }>;
  return { db, open, registration, stored };
}
const codeOf = (action: () => unknown) => { try { action(); } catch (error) { return (error as { code?: string }).code; } return undefined; };

test("in a Home every personal 成果 belongs to the person whoever produced it, and the producer stays in created_by", () => {
  const h = harness(), artifacts = h.open(person);
  const first = artifacts.commands.registerVersion(h.registration("workflow-events", 1));
  assert.deepEqual([first.artifact.owner_actor_id, first.artifact.created_by], [person, "workflow-events"]);
  // The person continues the line a workflow started; so does an MCP client; none is locked out of it.
  const second = artifacts.commands.registerVersion(h.registration(person, 2));
  const third = artifacts.commands.registerVersion(h.registration("claude-code", 3));
  assert.deepEqual([second.artifact.created_by, third.artifact.created_by], [person, "claude-code"]);
  const versions = artifacts.query.listArtifactVersions("p", "report");
  assert.deepEqual(versions.map(version => version.owner_actor_id), [person, person, person]);
  assert.deepEqual(h.stored(), [{ owner_actor_id: person }], "one identity, written once, owned by the person");
  // Registering the same version again is still an idempotent replay for its producer.
  assert.equal(artifacts.commands.registerVersion(h.registration("claude-code", 3)).replayed, true);
});

test("a 成果 may name its owner apart from its producer, but in a Home only the person", () => {
  const h = harness(), home = h.open(person);
  const named = home.commands.registerVersion(h.registration("workflow-events", 1, { owner_actor_id: person }));
  assert.deepEqual([named.artifact.owner_actor_id, named.artifact.created_by], [person, "workflow-events"]);
  assert.equal(codeOf(() => home.commands.registerVersion(h.registration("workflow-events", 2, { owner_actor_id: "workflow-events" }))), "artifact.owner_invalid");
  assert.equal(codeOf(() => home.commands.registerVersion(h.registration(person, 2, { owner_actor_id: " " }))), "artifact.input_invalid");
  assert.equal(home.query.listArtifactVersions("p", "report").length, 1, "a refused registration writes nothing");

  // Without a Home owner the named owner is honoured, and another one cannot add versions to the line.
  const plain = harness(), artifacts = plain.open();
  const first = artifacts.commands.registerVersion(plain.registration("agent", 1, { owner_actor_id: "the-owner" }));
  assert.deepEqual([first.artifact.owner_actor_id, first.artifact.created_by], ["the-owner", "agent"]);
  assert.equal(artifacts.commands.registerVersion(plain.registration("workflow", 2, { owner_actor_id: "the-owner" })).artifact.version, 2);
  assert.equal(codeOf(() => artifacts.commands.registerVersion(plain.registration("the-owner", 3, { owner_actor_id: "someone-else" }))), "artifact.not_owner");
  assert.equal(codeOf(() => artifacts.commands.registerVersion(plain.registration("agent", 3))), "artifact.not_owner", "the producer alone is not the owner");
});

test("an identity written before the Home named its owner is read as the person's: writable by them, nothing rewritten", () => {
  const h = harness();
  // Written the old way: the owner is whoever registered it.
  h.open().commands.registerVersion(h.registration("workflow-events", 1));
  assert.deepEqual(h.stored(), [{ owner_actor_id: "workflow-events" }]);

  const artifacts = h.open(person);
  assert.equal(artifacts.query.getArtifactVersion("p", { artifact_id: "report", version: 1 })!.owner_actor_id, person);
  assert.equal(artifacts.query.latestArtifactVersion("p", "report")!.created_by, "workflow-events");
  assert.deepEqual(artifacts.query.listArtifacts("p").map(version => version.owner_actor_id), [person]);

  const next = artifacts.commands.registerVersion(h.registration(person, 2, { owner_actor_id: person }));
  assert.deepEqual([next.artifact.owner_actor_id, next.artifact.created_by, next.artifact.supersedes_version], [person, person, null]);
  // The person also manages its state; the stored identity is untouched (no migration).
  assert.equal(artifacts.commands.archiveVersion({ project_id: "p", artifact_id: "report", version: 1, actor_id: person }).artifact.lifecycle_state, "archived");
  assert.deepEqual(h.stored(), [{ owner_actor_id: "workflow-events" }]);
  // Without a Home owner the same rows still read as the producer's own.
  assert.equal(h.open().query.getArtifactVersion("p", { artifact_id: "report", version: 1 })!.owner_actor_id, "workflow-events");
});

test("the team-shared rule is unchanged: a shared 成果 stays with the actor that shared it, and process items stay with their producer", () => {
  const h = harness(), artifacts = h.open(person);
  const shared = artifacts.commands.registerVersion(h.registration("agent", 1, { artifact_id: "shared", scope: "team_project", team_share_authorized: true }));
  assert.deepEqual([shared.artifact.scope, shared.artifact.owner_actor_id, shared.artifact.created_by], ["team_project", "agent", "agent"]);
  assert.equal(codeOf(() => artifacts.commands.registerVersion(h.registration("workflow", 2, { artifact_id: "shared", scope: "team_project", team_share_authorized: true }))), "artifact.not_owner");

  const items = new ProcessItemsModule({ db: h.db as unknown as ArtifactsSqliteDatabase, appendEvent: event => Number(h.db.prepare("INSERT INTO events (project_id) VALUES (?)").run(event.projectId).lastInsertRowid) });
  const { origin: _origin, title: _title, media_type: _mediaType, ...item } = h.registration("shelf", 1, { artifact_id: "item", artifact_type_id: "io.example.item" });
  assert.equal(items.commands.registerVersion(item).artifact.owner_actor_id, "shelf", "an exchange item belongs to the plugin that produced it");
  assert.equal(codeOf(() => items.commands.registerVersion({ ...item, actor_id: person, version: 2 })), "artifact.not_owner");
});

// Re-importing a document: the same source is one line of snapshots, so the person's re-import goes on after a workflow's.
const importPorts = (artifacts: ArtifactsModule | GoalProjectApplication["artifacts"], actorId: string, content: () => string) => ({
  projectId: "p", actorId, ownerActorId: person, routePrefix: "/projects/p", artifacts: artifacts as ArtifactsModule,
  readHtml: () => ({ title: "", content: "" }),
  readExternal: async () => ({ source: "notion" as const, source_id: "notion-page-1", source_url: "https://notion.so/x", title: "Roadmap", content: content(), format: "markdown" as const, warnings: [], connection_id: "c1" }) });

test("a document a workflow imported can be re-imported by the person after the source changed, and the other way round", async () => {
  const h = harness(), artifacts = h.open(person);
  let content = "first draft";
  const input = { source: "notion", url: "https://notion.so/x" };
  const first = await importArtifactDocument(input, importPorts(artifacts, "workflow-events", () => content));
  assert.equal(first.version, 1);
  content = "second draft (source edited)";
  const second = await importArtifactDocument(input, importPorts(artifacts, person, () => content));
  assert.deepEqual([second.artifact_id, second.version, second.reused], [first.artifact_id, 2, false]);
  content = "third draft";
  const third = await importArtifactDocument(input, importPorts(artifacts, "claude-code", () => content));
  assert.equal(third.version, 3);
  const versions = artifacts.query.listArtifactVersions("p", first.artifact_id);
  assert.deepEqual(versions.map(version => [version.owner_actor_id, version.created_by]), [[person, "workflow-events"], [person, person], [person, "claude-code"]]);
  assert.deepEqual(h.db.prepare("SELECT owner_actor_id FROM library_artifacts WHERE artifact_id = ?").all(first.artifact_id), [{ owner_actor_id: person }]);
});

test("a document imported before the Home named its owner is re-imported by the person", async () => {
  const h = harness();
  let content = "first draft";
  const input = { source: "notion", url: "https://notion.so/x" };
  // The import of the old release: its owner is the workflow that ran it.
  const old = await importArtifactDocument(input, { ...importPorts(h.open(), "workflow-events", () => content), ownerActorId: "workflow-events" });
  assert.deepEqual(h.db.prepare("SELECT owner_actor_id FROM library_artifacts WHERE artifact_id = ?").all(old.artifact_id), [{ owner_actor_id: "workflow-events" }]);
  content = "second draft (source edited)";
  const again = await importArtifactDocument(input, importPorts(h.open(person), person, () => content));
  assert.deepEqual([again.artifact_id, again.version, again.reused], [old.artifact_id, 2, false]);
});

test("a real Home's coordinator reads the person as the owner of every personal 成果", async () => {
  const storage = new LocalProjectDatabase(":memory:"), project = new GoalProjectApplication(storage);
  project.initializeBoard({ project_id: "p", title: "p", actor_id: person, idempotency_key: "p" });
  try {
    const registration = (actor: string, version: number): RegisterArtifactVersionInput => ({ project_id: "p", actor_id: actor, artifact_id: "report", version,
      artifact_type_id: "io.example.report", schema_version: 1, producer, content: { kind: "inline", payload: { version } }, ...pinnedArtifact("Report") });
    project.artifacts.commands.registerVersion(registration("workflow-events", 1));
    project.artifacts.commands.registerVersion(registration("claude-code", 2));
    project.artifacts.commands.registerVersion(registration(person, 3));
    assert.deepEqual(project.artifacts.query.listArtifactVersions("p", "report").map(version => [version.owner_actor_id, version.created_by]),
      [[person, "workflow-events"], [person, "claude-code"], [person, person]]);
  } finally { storage.close(); }
});

test("subject.read, read and export answer the same for every actor of the Home: the person's versions and the workflow's are both readable", async () => {
  const h = harness();
  createContextLedgerSchema(h.db as unknown as Parameters<typeof createContextLedgerSchema>[0]);
  const artifacts = h.open(person);
  const note = (actor: string, id: string, text: string) => artifacts.commands.registerVersion({ ...h.registration(actor, 1, { artifact_id: id, artifact_type_id: "io.molis.work.document", title: id }),
    content: { kind: "inline", payload: { content: text, format: "markdown" } }, origin: { kind: "imported", file_name: `${id}.md` } });
  note(person, "person-notes", "the person's private notes");
  note("workflow-events", "workflow-import", "imported by a workflow");
  const ledger = createContextLedger(h.db as unknown as Parameters<typeof createContextLedger>[0], { authorize: access => access.scope.kind === "personal" && access.scope.id === "p" });
  const actions = new ActionService();
  actions.registerProvider({ provider: { provider_id: artifactsManifest.plugin_id, plugin_id: artifactsManifest.plugin_id, title: "成果", kind: "plugin", project_id: "p" },
    definitions: artifactsManifest.actions!,
    handlers: createArtifactActionHandlers({ projectId: "p", artifacts, ledger: ledger.query, importSources: () => ({}),
      importDocument: async () => { throw new Error("read-only fixture"); }, openProjectReference: async () => { throw new Error("must not fetch a file") } }) });
  const caller = (actor_id: string, audience: "user" | "mcp" | "workflow") => ({ actor_id, audience, project_id: "p", permissions: ["artifacts:read"] });
  for (const who of [caller("claude-code", "mcp"), caller("workflow-events", "workflow"), caller(person, "user")]) {
    for (const id of ["person-notes", "workflow-import"]) {
      const reference = { artifact_id: id, version: 1 };
      const subject = await actions.invoke(who, artifactsActions.subject, { subject_id: artifactSubjectId(reference) }) as { title: string };
      assert.equal(subject.title, id, `${who.actor_id} reads ${id} by subject`);
      const read = await actions.invoke(who, artifactsActions.read, { reference }) as { selected: { owner_actor_id: string } };
      assert.equal(read.selected.owner_actor_id, person, `${who.actor_id} reads ${id}`);
      assert.ok(await actions.invoke(who, artifactsActions.export, { reference }), `${who.actor_id} exports ${id}`);
    }
  }
});
