import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { ActionService } from "@molis-ai/molis-work-kernel";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ArtifactsModule, createArtifactsSchema, ARTIFACTS_PROVIDER_ID, ARTIFACTS_PROVIDER_TITLE, ARTIFACT_ACTIONS } from "@molis-ai/molis-work-module-artifacts";
import { createContextLedger, createContextLedgerSchema } from "@molis-ai/molis-work-module-context-ledger";
import { createArtifactActionHandlers } from "@molis-ai/molis-work-module-artifacts";
import { PROJECT_ROOT_SCHEMA_SQL, listProjectRoots, writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { SearchService } from "@molis-ai/molis-work-service-search";
import { openTextSearchIndex } from "@molis-ai/molis-work-storage";
import { eventCursorOf, pinnedArtifact } from "./fixtures/artifacts.js";

// A version the owner lists in search but cannot hand over as text (it is kept only as a file reference): the artifacts
// subject reader refuses it with `actions.subject_unavailable`, the same code it uses for a version that is gone.
const projectId = "artifact-search-project";
const person: ActionCallContext = { actor_id: "web-user", project_id: projectId, audience: "user", permissions: ["artifacts:read", "search:read"] };

async function fixture(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), "search-artifact-open-"));
  const db = new Database(join(home, "owner.db"));
  db.pragma("foreign_keys = ON");
  db.exec(PROJECT_ROOT_SCHEMA_SQL);
  writeProjectRoot(db, projectId, "2026-10-07T00:00:00.000Z");
  const [root] = listProjectRoots(db);
  assert.equal(root?.project_id, projectId);
  db.exec("CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL);");
  createArtifactsSchema(db);
  createContextLedgerSchema(db);
  const artifacts = new ArtifactsModule({ db, now: () => "2026-10-07T00:00:00.000Z",
    appendEvent: event => Number(db.prepare("INSERT INTO events (project_id) VALUES (?)").run(event.projectId).lastInsertRowid), eventCursor: eventCursorOf(db) });
  const ledger = createContextLedger(db, { authorize: () => true });
  const actions = new ActionService();
  actions.registerProvider({
    provider: { provider_id: ARTIFACTS_PROVIDER_ID, title: ARTIFACTS_PROVIDER_TITLE, kind: "system", project_id: projectId, project_data_instance_id: root!.data_instance_id },
    sourceRevision: () => JSON.stringify([listProjectRoots(db)[0]!.data_instance_id, eventCursorOf(db)(projectId)]),
    definitions: ARTIFACT_ACTIONS,
    handlers: createArtifactActionHandlers({ projectId, artifacts, ledger: ledger.query, importSources: () => ({}),
      importDocument: async () => { throw new Error("read-only fixture"); }, openProjectReference: async () => { throw new Error("must not fetch a file"); } }),
  });
  let now = 1_000_000;
  const index = openTextSearchIndex({ homeDirectory: home });
  const search = new SearchService({ index, clock: () => now, freshMs: 3_000, budgetMs: 5_000, refreshDelayMs: 5, indexer: async () => ({ client: actions, caller: person }) });
  t.after(async () => { await search.close(); index.close(); db.close(); await rm(home, { recursive: true, force: true }); });
  const publish = (artifactId: string, title: string, content: Parameters<typeof artifacts.commands.registerVersion>[0]["content"]) => artifacts.commands.registerVersion({
    project_id: projectId, actor_id: person.actor_id, artifact_id: artifactId, version: 1, artifact_type_id: "io.example.report", schema_version: 1,
    producer: { plugin_id: "io.example.producer", plugin_version: "1.0.0", binding_signature: "binding" }, content, ...pinnedArtifact(title),
  }).artifact;
  return { actions, search, artifacts, publish, tick: (ms: number) => { now += ms; } };
}

test("search.open on an Artifact version kept only as a file reference is unavailable, not deleted, and the version stays searchable", async t => {
  const f = await fixture(t);
  f.publish("budget-text", "季度预算 正文", { kind: "inline", payload: { title: "季度预算 正文", content: "成本控制在六十万以内" } });
  const file = f.publish("budget-file", "季度预算 文件", { kind: "reference", content_ref: "https://example.invalid/private", digest: `sha256:${"a".repeat(64)}`, size_bytes: 5 });
  const caller = { client: f.actions, caller: person };
  const first = await f.search.query(caller, { query: "季度预算" });
  assert.equal(first.hits.length, 2, "both versions are listed by the owner");
  const hit = first.hits.find(candidate => candidate.title === "季度预算 文件")!;
  const opened = await f.search.open(caller, { hit_id: hit.hit_id });
  assert.equal(opened.state, "unavailable", "the owner still lists it; its reader only cannot give text");
  const text = await f.search.open(caller, { hit_id: first.hits.find(candidate => candidate.title === "季度预算 正文")!.hit_id });
  assert.equal(text.state, "ok");
  f.tick(60_000);
  const later = await f.search.query(caller, { query: "季度预算" });
  assert.equal(later.hits.length, 2, "an unreadable version is not evicted from the shared index");
  assert.equal(later.status, "complete");
  // Hidden-retention: temporary archive hides the hit without claiming the fixed version was deleted.
  f.artifacts.commands.archiveVersion({ project_id: projectId, artifact_id: file.artifact_id, version: file.version, actor_id: person.actor_id });
  const archived = await f.search.open(caller, { hit_id: hit.hit_id });
  assert.equal(archived.state, "unavailable");
  assert.deepEqual(Object.keys(archived).sort(), ["hit_id", "reason", "state"], "archived search results expose no body or content reference");
  assert.doesNotMatch(JSON.stringify(archived), /成本控制|example.invalid/);
  const retained = f.artifacts.query.getArtifactVersion(projectId, file);
  assert.ok(retained, "the owner keeps the original exact version; archive is not deletion");
  assert.equal(retained.lifecycle_state, "archived");
  assert.equal(retained.version, file.version);
  assert.equal(retained.content_digest, file.content_digest);
  assert.equal(retained.content_ref, file.content_ref);
  assert.deepEqual(retained.payload, file.payload);
  assert.equal(retained.content_kind, file.content_kind);
  assert.deepEqual((await f.search.query(caller, { query: "季度预算" })).hits.map(candidate => candidate.title), ["季度预算 正文"]);
});
