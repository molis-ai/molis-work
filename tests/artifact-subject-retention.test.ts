import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { artifactSubjectId, type ArtifactVersionRecord, type RegisterArtifactVersionInput } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { searchRevisionOf, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ArtifactsModule, createArtifactsSchema, artifactsActions, createArtifactActionHandlers, ARTIFACT_ACTIONS,
  ARTIFACTS_PROVIDER_ID, DOCUMENT_ARTIFACT_TYPE } from "@molis-ai/molis-work-module-artifacts";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { PROJECT_ROOT_SCHEMA_SQL, writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { eventCursorOf, pinnedArtifact } from "./fixtures/artifacts.js";

const projectId = "artifact-retention-project";
const caller: ActionCallContext = { actor_id: "owner", project_id: projectId, audience: "user", permissions: ["artifacts:read"] };

function fixture(t: test.TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "artifact-retention-"));
  const statements: string[] = [];
  const db = new Database(join(directory, "artifacts.db"), { verbose: statement => { statements.push(statement); } });
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  db.pragma("foreign_keys = ON");
  db.exec(PROJECT_ROOT_SCHEMA_SQL);
  for (const project of [projectId, "foreign-project"]) writeProjectRoot(db, project, "2026-10-27T00:00:00.000Z");
  db.exec("CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL)");
  createArtifactsSchema(db);
  const artifacts = new ArtifactsModule({ db, now: () => "2026-10-27T00:00:00.000Z", eventCursor: eventCursorOf(db),
    appendEvent: event => Number(db.prepare("INSERT INTO events (project_id) VALUES (?)").run(event.projectId).lastInsertRowid) });
  const ledger = createContextLedger(db, { authorize: access => access.actor_id === caller.actor_id && access.scope.kind === "personal" && access.scope.id === projectId });
  const linkKinds = new Map([["goal.input", { module: "goals", role: "input" as const, proposal: false }],
    ["goal.output", { module: "goals", role: "output" as const, proposal: false }],
    ["goal.proposal", { module: "goals", role: "output" as const, proposal: true }]]);
  const actions = new ActionService();
  actions.registerProvider({ provider: { provider_id: ARTIFACTS_PROVIDER_ID, title: "Artifacts", kind: "system", project_id: projectId },
    definitions: ARTIFACT_ACTIONS, handlers: createArtifactActionHandlers({ projectId, artifacts, ledger: ledger.query, linkKinds,
      importSources: () => ({}), importDocument: async () => { throw new Error("retention must not import"); },
      previewText: async () => { throw new Error("retention must not preview a body"); },
      openProjectReference: async () => { throw new Error("retention must not read a file"); } }) });
  const publish = (overrides: Partial<RegisterArtifactVersionInput> = {}) => artifacts.commands.registerVersion({
    project_id: projectId, actor_id: caller.actor_id, artifact_id: "summary", version: 1,
    artifact_type_id: "io.example.report", schema_version: 1,
    producer: { plugin_id: "io.example.producer", plugin_version: "1.0.0", binding_signature: "binding" },
    content: { kind: "inline", payload: { title: "季度报告", body: "保留准确摘要", private_id: "not-a-summary" } },
    ...pinnedArtifact("季度报告"), ...overrides,
  }).artifact;
  const retention = (record: Pick<ArtifactVersionRecord, "artifact_id" | "version">, context = caller) =>
    actions.invoke(context, artifactsActions.retention, { subject_id: artifactSubjectId(record) });
  return { db, artifacts, ledger, actions, publish, retention, statements };
}

test("Artifact retention reports the exact summary revision, including reference and null payload versions", async t => {
  const f = fixture(t), first = f.publish();
  const entries = await f.actions.invoke(caller, artifactsActions.searchEntries, { cursor: null, limit: 50 });
  assert.equal(entries.entries[0]!.summary, "保留准确摘要");
  assert.deepEqual(await f.retention(first), { subject: { kind: "artifact", id: artifactSubjectId(first) }, state: "active",
    current_revision: searchRevisionOf([`1:${first.content_digest}`, "保留准确摘要"]), retained: null });
  assert.equal(entries.entries[0]!.revision, searchRevisionOf([`1:${first.content_digest}`, "保留准确摘要"]));
  f.publish({ version: 2, content: { kind: "inline", payload: { body: "较新版本不能替换原版" } } });
  const old = await f.retention(first);
  assert.equal(old.state === "active" && old.current_revision, entries.entries[0]!.revision);
  for (const artifactType of ["io.example.report", DOCUMENT_ARTIFACT_TYPE])
    for (const content of [{ kind: "inline" as const, payload: null },
      { kind: "reference" as const, content_ref: "https://example.invalid/file", digest: "sha256:" + "a".repeat(64), size_bytes: 20 }]) {
      const artifact = f.publish({ artifact_id: `${artifactType}.${content.kind}`, artifact_type_id: artifactType, content });
      assert.equal(f.artifacts.query.getArtifactVersionMetadata(projectId, artifact)?.has_payload, false,
        "the real owner distinguishes JSON null from a non-null JSON payload");
      assert.deepEqual(await f.retention(artifact), { subject: { kind: "artifact", id: artifactSubjectId(artifact) }, state: "active",
        current_revision: searchRevisionOf([`1:${artifact.content_digest}`, ""]), retained: null });
    }
});

test("PDF retention matches context revision and caller-scoped Goal relations without reading its payload", async t => {
  const f = fixture(t), pdf = f.publish({ artifact_id: "pdf", artifact_type_id: DOCUMENT_ARTIFACT_TYPE,
    origin: { kind: "imported", file_name: "计划.pdf" }, media_type: "application/pdf",
    content: { kind: "inline", payload: { content: "PDF 正文".repeat(10_000), original_file: { filename: "计划.pdf", mime: "application/pdf", data_base64: "not-read" } } } });
  const scope = { kind: "personal" as const, id: projectId }, access = { actor_id: caller.actor_id, scope };
  const relate = (key: string, goalId: string, options: { version?: number; type?: string; sourceProject?: string; targetProject?: string } = {}) =>
    f.ledger.commands.put(access, { key, type: options.type ?? "goal.input", cause: "explicit relation",
      source: { module: "goals", id: goalId, version: null, scope, ...(options.sourceProject ? { project_id: options.sourceProject } : {}) },
      target: { module: "artifacts", id: pdf.artifact_id, version: options.version ?? pdf.version, scope, ...(options.targetProject ? { project_id: options.targetProject } : {}) } });
  relate("z", "goal-z"); relate("a", "goal-a"); relate("duplicate", "goal-a");
  relate("wrong-version", "wrong-version", { version: 2 }); relate("proposal", "proposal", { type: "goal.proposal" });
  relate("foreign-source", "foreign-source", { sourceProject: "foreign-project" });
  relate("foreign-target", "foreign-target", { targetProject: "foreign-project" });
  relate("removed", "removed"); f.ledger.commands.remove(access, "removed", "removed");
  const context = await f.actions.invoke(caller, artifactsActions.subject, { subject_id: artifactSubjectId(pdf) });
  assert.deepEqual(context.goal_ids, ["goal-a", "goal-z"]);
  const expected = JSON.stringify([1, pdf.content_digest, ["goal-a", "goal-z"]]);
  assert.equal(context.revision, expected);
  assert.equal(f.artifacts.query.getArtifactVersionMetadata(projectId, pdf)?.has_payload, true);
  const fullRead = f.artifacts.query.getArtifactVersion;
  f.artifacts.query.getArtifactVersion = () => { throw new Error("retention must not load the PDF payload"); };
  f.statements.length = 0;
  try {
    assert.deepEqual(await f.retention(pdf), { subject: { kind: "artifact", id: artifactSubjectId(pdf) }, state: "active", current_revision: expected, retained: null });
    const versionReads = f.statements.filter(statement => statement.includes("library_artifact_versions"));
    assert.ok(versionReads.length > 0, "the metadata comes from the actual SQLite owner");
    assert.equal(versionReads.some(statement => /(?:SELECT|,)\s*(?:version\.)?payload_json\s*(?:,|FROM)|version\.\*|SELECT\s+\*/iu.test(statement)), false,
      "executed queries may derive has_payload in SQLite but must not select a body value");
  } finally { f.artifacts.query.getArtifactVersion = fullRead; }
  f.ledger.commands.remove(access, "z", "relation removed");
  const changed = await f.retention(pdf);
  assert.equal(changed.state === "active" && changed.current_revision, JSON.stringify([1, pdf.content_digest, ["goal-a"]]));
  await assert.rejects(f.retention(pdf, { ...caller, actor_id: "foreign-actor" }), { code: "context_ledger.access_denied" });
  f.artifacts.commands.archiveVersion({ project_id: projectId, artifact_id: pdf.artifact_id, version: pdf.version, actor_id: caller.actor_id });
  assert.deepEqual(await f.retention(pdf), { subject: { kind: "artifact", id: artifactSubjectId(pdf) }, state: "temporarily_archived",
    retained: { content_revision: null, restoration_operation_id: null } });
});

test("Artifact retention distinguishes archived, unavailable and missing exact versions without inventing restoration", async t => {
  const f = fixture(t), artifact = f.publish();
  const active = await f.retention(artifact);
  assert.equal(active.state, "active");
  f.artifacts.commands.archiveVersion({ project_id: projectId, artifact_id: artifact.artifact_id, version: artifact.version, actor_id: caller.actor_id });
  assert.deepEqual(await f.retention(artifact), { subject: { kind: "artifact", id: artifactSubjectId(artifact) }, state: "temporarily_archived",
    retained: { content_revision: null, restoration_operation_id: null } });
  f.artifacts.commands.markUnavailable({ project_id: projectId, artifact_id: artifact.artifact_id, version: artifact.version, actor_id: caller.actor_id, reason: "archived source withdrawn" });
  await assert.rejects(f.retention(artifact), { code: "actions.subject_unavailable" });
  const unavailable = f.publish({ artifact_id: "unavailable" });
  f.artifacts.commands.markUnavailable({ project_id: projectId, artifact_id: unavailable.artifact_id, version: unavailable.version, actor_id: caller.actor_id, reason: "source withdrawn" });
  await assert.rejects(f.retention(unavailable), { code: "actions.subject_unavailable" });
  for (const reference of [{ artifact_id: "missing", version: 1 }, { artifact_id: artifact.artifact_id, version: 9 }])
    assert.deepEqual(await f.retention(reference), { subject: { kind: "artifact", id: artifactSubjectId(reference) }, state: "deleted", retained: null });
  const foreign = f.publish({ project_id: "foreign-project", artifact_id: "foreign" });
  assert.equal((await f.retention(foreign)).state, "deleted");
});

test("Artifact retention preserves the read permission, project and non-plugin audience gates before any owner read", async t => {
  const f = fixture(t), artifact = f.publish();
  assert.equal(artifactsActions.retention.version, 3);
  assert.deepEqual(artifactsActions.retention.action.permissions, ["artifacts:read"]);
  assert.deepEqual(artifactsActions.retention.action.audiences, ["user", "agent", "workflow", "mcp"]);
  f.statements.length = 0;
  await assert.rejects(f.retention(artifact, { ...caller, permissions: [] }), { code: "actions.forbidden" });
  await assert.rejects(f.retention(artifact, { ...caller, project_id: "foreign-project" }), { code: "actions.scope_mismatch" });
  await assert.rejects(f.retention(artifact, { ...caller, audience: "plugin" }), { code: "actions.forbidden" });
  await assert.rejects(f.retention(artifact, { ...caller, allowed_actions: [artifactsActions.subject] }), { code: "actions.forbidden" });
  await assert.rejects(f.actions.invoke(caller, artifactsActions.retention, { subject_id: artifact.artifact_id }), { code: "actions.input_invalid" });
  assert.deepEqual(f.statements, [], "the common gates refuse before querying the SQLite owner");
  for (const audience of ["user", "agent", "workflow", "mcp"] as const)
    assert.equal((await f.retention(artifact, { ...caller, audience })).state, "active");
});
