import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { maintainFeedProducer } from "./fixtures/feed-artifact-producer-maintenance.mjs";

function fixture(t: test.TestContext) {
  const home = mkdtempSync(join(tmpdir(), "feed-producer-maintenance-")), file = join(home, "project.db");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const store = new LocalProjectDatabase(file); writeProjectRoot(store.db, "project", "then");
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) });
  const input = (id: string, version: number, old = true) => ({ project_id: "project", actor_id: "owner", artifact_id: id, version,
    artifact_type_id: "io.example.capture", schema_version: 1, producer: { plugin_id: id === "older" && old ? "io.molis.work.native.feed" : "io.molis.work.feed",
      plugin_version: old ? "0.0.0" : "0.3.0", binding_signature: old ? "native:feed" : "official-feed-binding" }, ...pinnedArtifact("capture"), content: { kind: "inline" as const, payload: { text: "kept" } } });
  for (const id of ["older", "renamed"]) artifacts.commands.registerVersion(input(id, 1));
  const before = artifacts.query.getArtifactVersion("project", { artifact_id: "older", version: 1 });
  store.close(); return { file, before, input };
}
test("RAC-2325 Feed maintenance keeps every payload and history row; the current producer can append the next version", t => {
  const f = fixture(t), bytes = readFileSync(f.file);
  assert.deepEqual(maintainFeedProducer(f.file), { lines: 2, versions: 2, blocked: 0, changed: false });
  assert.deepEqual(readFileSync(f.file), bytes);
  assert.equal(maintainFeedProducer(f.file, true).changed, true);
  assert.equal(maintainFeedProducer(f.file, true).changed, false);
  const store = new LocalProjectDatabase(f.file), artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) });
  try {
    const actual = artifacts.query.getArtifactVersion("project", { artifact_id: "older", version: 1 });
    assert.deepEqual(actual, { ...f.before, producer_plugin_id: "io.molis.work.feed", producer_plugin_version: "0.3.0", producer_binding_signature: "official-feed-binding" });
    assert.equal(artifacts.commands.registerVersion(f.input("older", 2, false)).artifact.version, 2);
    assert.equal(artifacts.query.listArtifactVersions("project", "older").length, 2);
  } finally { store.close(); }
});
test("RAC-2325 mixed producer versions and a failure after identity rewrite roll the entire library back", t => {
  const f = fixture(t), db = new DatabaseSync(f.file);
  db.prepare("UPDATE library_artifact_versions SET producer_plugin_version='unexpected' WHERE artifact_id='older'").run(); db.close();
  const wrong = readFileSync(f.file); assert.throws(() => maintainFeedProducer(f.file, true), /mixed version line/u); assert.deepEqual(readFileSync(f.file), wrong);
  const reset = new DatabaseSync(f.file); reset.prepare("UPDATE library_artifact_versions SET producer_plugin_version='0.0.0'").run(); reset.close();
  const bytes = readFileSync(f.file), prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function(sql) { if (String(sql).startsWith("UPDATE library_artifact_versions")) throw new Error("injected version rewrite failure"); return prepare.call(this, sql); };
  try { assert.throws(() => maintainFeedProducer(f.file, true), /injected version rewrite failure/u); }
  finally { DatabaseSync.prototype.prepare = prepare; }
  assert.deepEqual(readFileSync(f.file), bytes);
});

test("RAC-2325 a wrong project version or complete structure refuses the producer rewrite without changing a byte", t => {
  for (const change of ["PRAGMA user_version=10", "ALTER TABLE project_browsing_settings ADD COLUMN unexpected TEXT",
    "CREATE VIEW unexpected AS SELECT artifact_id FROM library_artifacts"]) {
    const f = fixture(t), db = new DatabaseSync(f.file); db.exec(change); db.close();
    const bytes = readFileSync(f.file); assert.throws(() => maintainFeedProducer(f.file, true)); assert.deepEqual(readFileSync(f.file), bytes);
  }
});
