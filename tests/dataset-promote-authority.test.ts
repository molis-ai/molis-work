import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginDatabase, PluginStartContext, PluginDatabaseTransaction } from "@molis-ai/molis-work-contracts/platform/plugin";
import { applySqliteBaseline, homeSqlitePath, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { createDatasetPlugin, openDatasetStore, DATASET_DATABASE } from "@molis-ai/molis-work-plugin-dataset";

type Stage = "before-begin" | "after-begin" | "after-publish-check" | "after-artifact";
type Failure = "revoke" | "cancel";

/** A real Dataset plugin on real SQLite, with the Runtime's database and 成果 services standing in so each stage can fail. */
async function promoteWith(stage: Stage | "none", failure: Failure) {
  const home = await mkdtemp(join(tmpdir(), `dataset-authority-${stage}-`));
  const db = openHomeSqliteDatabase(home, "dataset");
  applySqliteBaseline(db, homeSqlitePath(home, "dataset"), DATASET_DATABASE);
  const seed = openDatasetStore(home), table = seed.create({ project_id: "a", title: "Authority" });
  seed.close();
  let revoked = false, phase = 0, published = 0, beginCommitted = false, armed = false;
  const controller = new AbortController();
  const fail = () => { if (failure === "cancel") controller.abort(); else revoked = true; };
  const database: PluginDatabase = {
    get: (sql, parameters = []) => db.prepare(sql).get(...parameters) as never,
    all: (sql, parameters = []) => db.prepare(sql).all(...parameters) as never,
    transaction: async <T>(beforeEffect: () => Promise<void>, write: (transaction: PluginDatabaseTransaction) => T): Promise<T> => {
      await beforeEffect();
      phase += 1;
      if (phase === 1 && stage === "before-begin") fail();
      const result = write({ get: database.get, all: database.all, run: (sql, parameters = []) => db.prepare(sql).run(...parameters) });
      if (phase === 1) beginCommitted = true;
      if (phase === 1 && stage === "after-begin") fail();
      return result;
    },
  };
  const artifacts: PluginArtifactClient = {
    publish: input => { published += 1; if (stage === "after-artifact") fail();
      return { artifact: { artifact_id: input.artifact_id!, version: input.version } } as never; },
    read: () => null, head: () => null, readOwn: () => null,
  };
  const context: PluginStartContext = { install_id: "dataset-test", plugin_id: "io.molis.work.dataset", version: "0.0.0", deployment: "local",
    grants: [], project_id: "a", services: { database, artifacts }, requireGrant: () => {} };
  const handler = (await createDatasetPlugin().start(context)).actions!.find(action => action.capability_id === "dataset.promote")!;
  const refuse = () => { controller.signal.throwIfAborted(); if (revoked) throw Object.assign(new Error("revoked"), { code: "actions.forbidden" }); };
  const caller: ActionExecutionContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: ["dataset:read", "dataset:write", "artifact:write", "artifact:read"],
    signal: controller.signal,
    beforeEffect: async () => refuse(),
    assert_authority_current: () => {
      refuse();
      // The nested async check succeeds, then the caller is revoked before the promotion resumes to publish.
      if (stage === "after-publish-check" && beginCommitted && !armed) { armed = true; queueMicrotask(fail); }
    } };
  const outcome = await handler.handle(caller, { id: table.id }).then(() => null, (error: unknown) => error as { code?: string; name?: string });
  const after = openDatasetStore(home);
  try { return { outcome, row: after.get(table.id, "a"), published, armed }; }
  finally { after.close(); db.close(); await rm(home, { recursive: true, force: true }); }
}

/** W5-01-DATASET-06: every publication side effect rechecks the original caller after its own wait. */
test("W5-01-DATASET-06: cancel or revoke at each publication stage keeps only already-committed stages", async () => {
  for (const stage of ["before-begin", "after-begin", "after-publish-check", "after-artifact"] as const) for (const failure of ["revoke", "cancel"] as const) {
    const { outcome, row, published, armed } = await promoteWith(stage, failure);
    const label = `${stage} / ${failure}`;
    assert.ok(outcome, `${label}: the promotion is refused`);
    if (failure === "revoke") assert.equal(outcome.code, "actions.forbidden", label); else assert.equal(outcome.name, "AbortError", label);
    if (stage === "before-begin") { assert.equal(row.publication_pending, undefined, label); assert.equal(published, 0, label); }
    if (stage === "after-begin") { assert.equal(row.publication_pending?.version, 1, label); assert.equal(published, 0, label); assert.equal(row.artifact_version, 0, label); }
    if (stage === "after-publish-check") { assert.equal(armed, true, label); assert.equal(row.publication_pending?.version, 1, label); assert.equal(published, 0, label); assert.equal(row.artifact_version, 0, label); }
    if (stage === "after-artifact") { assert.equal(row.publication_pending?.version, 1, label); assert.equal(published, 1, label); assert.equal(row.artifact_version, 0, label); }
  }
  const control = await promoteWith("none", "revoke");
  assert.equal(control.outcome, null, "with nothing failing, the promotion goes through");
  assert.equal(control.row.publication_pending, undefined); assert.equal(control.row.artifact_version, 1); assert.equal(control.published, 1);
});
