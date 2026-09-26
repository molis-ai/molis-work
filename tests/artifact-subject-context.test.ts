import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { artifactSubjectId, parseArtifactSubjectId, type ArtifactVersionRecord, type RegisterArtifactVersionInput } from "../packages/contracts/src/modules/artifacts.js";
import { ActionError, resolveActionSubject, type ActionCallContext } from "../packages/contracts/src/platform/actions.js";
import { ActionService } from "../packages/kernel/src/action-service.js";
import { ArtifactsModule, createArtifactsSchema } from "../modules/artifacts/src/index.js";
import { createContextLedger, createContextLedgerSchema } from "../modules/context-ledger/src/index.js";
import { artifactsActions, createArtifactActionHandlers } from "../plugins/native/artifacts/src/actions.js";
import { artifactsManifest } from "../plugins/native/artifacts/src/manifest.js";
import { requireArtifactAnalysisRecord } from "../plugins/native/artifacts/src/browser.js";

const boardId = "legacy-board", projectId = "canonical-project";
const reference = { artifact_id: 'report/季度@2:["draft"]', version: 1 };
const caller: ActionCallContext = { actor_id: "owner", project_id: projectId, audience: "user", permissions: ["artifacts:read"] };
const subject = (value = reference) => ({ kind: "artifact", id: artifactSubjectId(value) });

function fixture(t: test.TestContext) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE boards (board_id TEXT PRIMARY KEY); INSERT INTO boards VALUES ('legacy-board'), ('foreign-board'); CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, board_id TEXT NOT NULL);");
  createArtifactsSchema(db);
  createContextLedgerSchema(db);
  const artifacts = new ArtifactsModule({ db, now: () => "2026-09-26T00:00:00.000Z",
    appendEvent: event => Number(db.prepare("INSERT INTO events (board_id) VALUES (?)").run(event.boardId).lastInsertRowid) });
  const ledger = createContextLedger(db, { authorize: access => access.actor_id === caller.actor_id && access.scope.kind === "personal" && access.scope.id === boardId });
  const publish = (override: Partial<RegisterArtifactVersionInput> = {}) => artifacts.commands.registerVersion({
    board_id: boardId, actor_id: caller.actor_id, ...reference, artifact_type_id: "io.example.unknown-result", schema_version: 7,
    producer: { plugin_id: "io.example.original", plugin_version: "1.0.0", binding_signature: "original-binding" },
    content: { kind: "inline", payload: { title: "第一版原文", content: "仍需核验的旧判断", goal_id: "not-a-relation", session_id: "not-a-session" } },
    metadata: { producer: { plugin_id: "forged-metadata" } }, ...override,
  }).artifact;
  const actions = new ActionService();
  let enabled = true, reads = 0;
  const get = artifacts.query.getArtifactVersion.bind(artifacts.query);
  artifacts.query.getArtifactVersion = (board, ref) => { reads++; return get(board, ref); };
  const unregister = actions.registerProvider({
    provider: { provider_id: artifactsManifest.plugin_id, plugin_id: artifactsManifest.plugin_id, title: artifactsManifest.name, kind: "plugin", project_id: projectId },
    definitions: artifactsManifest.actions!,
    availability: () => enabled ? { available: true } : { available: false, code: "actions.plugin_disabled", reason: "已停用" },
    handlers: createArtifactActionHandlers({ boardId, artifacts, ledger: ledger.query, importSources: () => ({}),
      importDocument: async () => { throw new Error("read-only fixture"); }, openProjectReference: async () => { throw new Error("must not fetch a file"); } }),
  });
  return { db, artifacts, ledger, actions, publish, unregister, reads: () => reads, disable: () => { enabled = false; } };
}

test("Artifact subject IDs retain exact versions and delimiter-containing IDs, rejecting latest and aliases", () => {
  assert.deepEqual(parseArtifactSubjectId(artifactSubjectId(reference)), reference);
  for (const value of [reference.artifact_id, '["id"]', '["id","latest"]', '["id",0]', '["id",-1]', '["id",1.5]',
    '["id",9007199254740992]', '["",1]', '[" ",1]', '["id","1"]', '["id",1,null]', '[ "id", 1 ]', '{"artifact_id":"id","version":1}']) {
    assert.equal(parseArtifactSubjectId(value), null, value);
  }
  assert.throws(() => artifactSubjectId({ artifact_id: "id", version: Number.MAX_SAFE_INTEGER + 1 }), TypeError);
});

test("resolveActionSubject discovers the original provider and reads an exact inline version with original provenance", async t => {
  const f = fixture(t), first = f.publish();
  f.publish({ version: 2, producer: { plugin_id: first.producer_plugin_id, plugin_version: "9.0.0", binding_signature: first.producer_binding_signature },
    content: { kind: "inline", payload: { title: "第二版", content: "不能替换第一版" } } });
  const before = f.artifacts.query.listArtifacts(boardId);
  assert.equal(f.reads(), 0);
  const directory = f.actions.discover(caller);
  assert.ok(directory.some(view => view.capability_id === "artifacts.subject.read"));
  assert.equal(f.reads(), 0, "discovery must not load private content");
  const { context, reader } = await resolveActionSubject(f.actions, caller, subject());
  assert.deepEqual(reader, { capability_id: "artifacts.subject.read", version: 1, provider_id: artifactsManifest.plugin_id });
  assert.deepEqual(context.subject, subject());
  assert.equal(context.title, "第一版原文");
  assert.equal(context.truncated, false);
  assert.deepEqual(context.goal_ids, []);
  assert.equal(context.session_id, null, "payload locators are not trusted relations");
  const body = JSON.parse(context.content);
  assert.equal(body.version, 1);
  assert.deepEqual(body.payload, first.payload);
  assert.deepEqual(body.producer, { plugin_id: "io.example.original", plugin_version: "1.0.0", binding_signature: "original-binding" });
  assert.deepEqual(body.metadata, first.metadata);
  assert.equal(body.created_at, first.created_at);
  const current = await resolveActionSubject(f.actions, caller, subject({ ...reference, version: 2 }));
  assert.notEqual(context.revision, current.context.revision);
  await assert.rejects(resolveActionSubject(f.actions, caller, subject({ ...reference, version: 3 })), { code: "actions.subject_unavailable" });
  assert.deepEqual(f.artifacts.query.listArtifacts(boardId), before, "context reads must not register or rewrite artifacts");
});

test("Artifact analysis rejects a foreign personal owner, board mismatch, withdrawn versions and file references", async t => {
  const f = fixture(t), first = f.publish();
  await assert.rejects(resolveActionSubject(f.actions, { ...caller, actor_id: "other-user" }, subject()), { code: "artifacts.forbidden" });
  assert.throws(() => requireArtifactAnalysisRecord(first, { board_id: projectId, actor_id: caller.actor_id, reference }), { code: "actions.subject_unavailable" });
  assert.throws(() => requireArtifactAnalysisRecord({ ...first, version: 2 }, { board_id: boardId, actor_id: caller.actor_id, reference }), { code: "actions.subject_unavailable" });
  const foreign = f.publish({ board_id: "foreign-board", artifact_id: "foreign-result" });
  await assert.rejects(resolveActionSubject(f.actions, caller, subject(foreign)), { code: "actions.subject_unavailable" });
  const archived = f.publish({ artifact_id: "archived" });
  f.artifacts.commands.archiveVersion({ ...archived, actor_id: caller.actor_id });
  const withdrawn = f.publish({ artifact_id: "withdrawn" });
  f.artifacts.commands.markUnavailable({ ...withdrawn, actor_id: caller.actor_id, reason: "原来源已撤回" });
  const file = f.publish({ artifact_id: "file", content: { kind: "reference", content_ref: "https://example.invalid/private", digest: "sha256:" + "a".repeat(64), size_bytes: 5 } });
  const empty = f.publish({ artifact_id: "empty", content: { kind: "inline", payload: null } });
  for (const unavailable of [archived, withdrawn, file, empty]) {
    await assert.rejects(resolveActionSubject(f.actions, caller, subject(unavailable)), { code: "actions.subject_unavailable" });
  }
  assert.equal((await resolveActionSubject(f.actions, caller, subject())).context.title, "第一版原文");
});

test("Artifact subject reads retain the Action gate for current permissions, project, exact grants, audience and lifecycle", async t => {
  const f = fixture(t);
  f.publish();
  const invoke = (context: ActionCallContext) => f.actions.invoke(context, { ...artifactsActions.subject, provider_id: artifactsManifest.plugin_id }, { subject_id: subject().id });
  await assert.rejects(invoke({ ...caller, permissions: [] }), { code: "actions.forbidden" });
  await assert.rejects(invoke({ ...caller, project_id: "other-project" }), { code: "actions.scope_mismatch" });
  await assert.rejects(invoke({ ...caller, allowed_actions: [{ ...artifactsActions.read, provider_id: artifactsManifest.plugin_id }] }), { code: "actions.forbidden" });
  await assert.rejects(invoke({ ...caller, audience: "plugin", permissions: ["artifact:read", "artifacts:read"] }), { code: "actions.forbidden" });
  assert.equal(f.reads(), 0, "the common gate must reject before loading an Artifact");
  const discovered = f.actions.discover(caller).find(view => view.capability_id === "artifacts.subject.read")!;
  await assert.rejects(f.actions.invoke({ ...caller, validate_authority: actual => {
    assert.deepEqual(actual, { capability_id: discovered.capability_id, version: discovered.version, provider_id: artifactsManifest.plugin_id });
    throw new ActionError("authority.revoked", "撤权");
  } }, { capability_id: discovered.capability_id, version: discovered.version, provider_id: artifactsManifest.plugin_id }, { subject_id: subject().id }), { code: "authority.revoked" });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(invoke({ ...caller, signal: controller.signal }), { name: "AbortError" });
  f.disable();
  await assert.rejects(invoke(caller), { code: "actions.plugin_disabled" });
  assert.equal(f.reads(), 0);
  f.unregister();
  await assert.rejects(resolveActionSubject(f.actions, caller, subject()), { code: "actions.subject_unavailable" });
});

test("Artifact subject uses only exact explicit Goal relations and marks bounded projection truncation", async t => {
  const f = fixture(t), first = f.publish();
  f.publish({ version: 2 });
  const scope = { kind: "personal" as const, id: boardId };
  const access = { actor_id: caller.actor_id, scope };
  const edge = (key: string, version: number, type = "goal.input") => f.ledger.commands.put(access, { key, type, cause: "explicit test relation",
    source: { module: "goals", id: key, version: null, scope }, target: { module: "artifacts", id: first.artifact_id, version, scope } });
  edge("related-goal", 1); edge("later-version-goal", 2); edge("unrelated-edge-type", 1, "context.reference");
  edge("removed-goal", 1); f.ledger.commands.remove(access, "removed-goal", "removed");
  for (const namespace of [boardId, projectId, "foreign-project"]) f.ledger.commands.put(access, { key: namespace, type: "goal.output", cause: "explicit namespaced relation",
    source: { module: "goals", id: namespace, version: null, scope, project_id: namespace },
    target: { module: "artifacts", id: first.artifact_id, version: first.version, scope, project_id: namespace } });
  const result = await resolveActionSubject(f.actions, caller, subject());
  assert.deepEqual(result.context.goal_ids, [projectId, boardId, "related-goal"]);
  f.ledger.commands.remove(access, "related-goal", "removed");
  assert.notEqual((await resolveActionSubject(f.actions, caller, subject())).context.revision, result.context.revision);
  const long = f.publish({ artifact_id: "long", content: { kind: "inline", payload: "x".repeat(40000) } });
  const context = (await resolveActionSubject(f.actions, caller, subject(long))).context;
  assert.equal(context.content.length, 32000);
  assert.equal(context.truncated, true);
  const stored: ArtifactVersionRecord = f.artifacts.query.getArtifactVersion(boardId, long)!;
  assert.equal((stored.payload as string).length, 40000);
});
