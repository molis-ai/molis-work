import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginDatabase, PluginStartContext, PluginDatabaseTransaction } from "@molis-ai/molis-work-contracts/platform/plugin";
import { applySqliteBaseline, homeSqlitePath, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { createFormPlugin, openFormStore, FORM_DATABASE } from "@molis-ai/molis-work-plugin-form";

type Stage = "before-begin" | "after-begin" | "after-publish-check" | "after-artifact" | "before-complete";
type Failure = "revoke" | "cancel" | "replace";
const STAGES: readonly Stage[] = ["before-begin", "after-begin", "after-publish-check", "after-artifact", "before-complete"];
const FAILURES: readonly Failure[] = ["revoke", "cancel", "replace"];

/** A real Forms plugin on real SQLite, with the Runtime's database and 成果 services standing in so each stage can fail. */
async function promoteWith(stage: Stage | "none", failure: Failure) {
  const home = await mkdtemp(join(tmpdir(), `form-authority-${stage}-`));
  const db = openHomeSqliteDatabase(home, "form");
  applySqliteBaseline(db, homeSqlitePath(home, "form"), FORM_DATABASE);
  const seed = openFormStore(home), form = seed.create({ project_id: "a", title: "Authority" });
  seed.close();
  let revoked = false, replaced = false, phase = 0, published = 0, beginCommitted = false, armed = false;
  const controller = new AbortController();
  const fail = () => { if (failure === "cancel") controller.abort(); else if (failure === "replace") replaced = true; else revoked = true; };
  const database: PluginDatabase = {
    get: (sql, parameters = []) => db.prepare(sql).get(...parameters) as never,
    all: (sql, parameters = []) => db.prepare(sql).all(...parameters) as never,
    transaction: async <T>(beforeEffect: () => Promise<void>, write: (transaction: PluginDatabaseTransaction) => T): Promise<T> => {
      await beforeEffect();
      phase += 1;
      // The write's own wait has passed; the caller is lost before its first statement runs.
      if ((phase === 1 && stage === "before-begin") || (phase === 2 && stage === "before-complete")) fail();
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
  const context: PluginStartContext = { install_id: "form-test", plugin_id: "io.molis.work.form", version: "0.0.0", deployment: "local",
    grants: [], project_id: "a", services: { database, artifacts }, requireGrant: () => {} };
  const handler = (await createFormPlugin().start(context)).actions!.find(action => action.capability_id === "form.promote")!;
  const refuse = () => {
    controller.signal.throwIfAborted();
    if (revoked) throw new ActionError("actions.forbidden", "revoked");
    if (replaced) throw new ActionError("actions.provider_changed", "replaced");
  };
  const caller: ActionExecutionContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: ["form:read", "form:write", "artifact:write", "artifact:read"],
    signal: controller.signal,
    beforeEffect: async () => refuse(),
    assert_authority_current: () => {
      refuse();
      // The nested async check succeeds, then the caller is lost before the promotion resumes to publish.
      if (stage === "after-publish-check" && beginCommitted && !armed) { armed = true; queueMicrotask(fail); }
    } };
  const outcome = await handler.handle(caller, { id: form.id }).then(() => null, (error: unknown) => error as { code?: string; name?: string });
  const after = openFormStore(home);
  try { return { outcome, row: after.get(form.id, "a"), published, armed }; }
  finally { after.close(); db.close(); await rm(home, { recursive: true, force: true }); }
}

/** W5-01-FORM-01: every publication side effect rechecks the original caller after its own wait. */
test("W5-01-FORM-01: cancel, revoke or a replaced provider at each publication stage keeps only already-committed stages", async () => {
  for (const stage of STAGES) for (const failure of FAILURES) {
    const { outcome, row, published, armed } = await promoteWith(stage, failure);
    const label = `${stage} / ${failure}`;
    assert.ok(outcome, `${label}: the promotion is refused`);
    if (failure === "cancel") assert.equal(outcome.name, "AbortError", label);
    else assert.equal(outcome.code, failure === "revoke" ? "actions.forbidden" : "actions.provider_changed", label);
    if (stage === "before-begin") { assert.equal(row.publication_pending, undefined, label); assert.equal(published, 0, label); }
    if (stage === "after-begin") { assert.equal(row.publication_pending?.version, 1, label); assert.equal(published, 0, label); assert.equal(row.artifact_version, 0, label); }
    if (stage === "after-publish-check") { assert.equal(armed, true, label); assert.equal(row.publication_pending?.version, 1, label); assert.equal(published, 0, label); assert.equal(row.artifact_version, 0, label); }
    if (stage === "after-artifact" || stage === "before-complete") { assert.equal(row.publication_pending?.version, 1, label); assert.equal(published, 1, label); assert.equal(row.artifact_version, 0, label); }
  }
  const control = await promoteWith("none", "revoke");
  assert.equal(control.outcome, null, "with nothing failing, the promotion goes through");
  assert.equal(control.row.publication_pending, undefined); assert.equal(control.row.artifact_version, 1); assert.equal(control.published, 1);
});
