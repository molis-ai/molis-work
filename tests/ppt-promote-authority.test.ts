import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginDatabase, PluginStartContext, PluginDatabaseTransaction } from "@molis-ai/molis-work-contracts/platform/plugin";
import { applySqliteBaseline, homeSqlitePath, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { createPptPlugin, openPptStore, PPT_DATABASE } from "@molis-ai/molis-work-plugin-ppt";

type Stage = "before-begin" | "after-begin" | "after-publish-check" | "after-artifact" | "before-complete" | "none";
type Failure = "revoke" | "cancel" | "replace";
const STAGES = ["before-begin", "after-begin", "after-publish-check", "after-artifact", "before-complete"] as const;
const FAILURES = ["revoke", "cancel", "replace"] as const;

/** W5-01-PPT-07: every publication side effect rechecks the original caller after its own wait. */
test("W5-01-PPT-07: cancel, revoke or a replaced provider at each publication stage keeps only already-committed stages", async t => {
  for (const stage of STAGES) for (const failure of FAILURES) {
    const home = await mkdtemp(join(tmpdir(), `ppt-authority-${stage}-`));
    const db = openHomeSqliteDatabase(home, "ppt");
    applySqliteBaseline(db, homeSqlitePath(home, "ppt"), PPT_DATABASE);
    const seed = openPptStore(home), deck = seed.create({ project_id: "a", title: "Authority" });
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
        const transaction: PluginDatabaseTransaction = { get: database.get, all: database.all,
          run: (sql, parameters = []) => db.prepare(sql).run(...parameters) };
        const result = write(transaction);
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
    const context: PluginStartContext = { install_id: "ppt-test", plugin_id: "io.molis.work.ppt", version: "0.0.0", deployment: "local",
      grants: [], project_id: "a", services: { database, artifacts }, requireGrant: () => {} };
    const started = await createPptPlugin().start(context);
    const handler = started.actions!.find(action => action.capability_id === "ppt.promote")!;
    const refuse = () => {
      controller.signal.throwIfAborted();
      if (revoked) throw new ActionError("actions.forbidden", "revoked");
      if (replaced) throw new ActionError("actions.provider_changed", "replaced");
    };
    const caller: ActionExecutionContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: ["ppt:read", "ppt:write", "artifact:write", "artifact:read"],
      signal: controller.signal,
      beforeEffect: async () => refuse(),
      assert_authority_current: () => {
        refuse();
        // W5-01-PPT-07: the caller is lost after the nested async check succeeds, before it resumes to publish.
        if (stage === "after-publish-check" && beginCommitted && !armed) { armed = true; queueMicrotask(fail); }
      } };
    await assert.rejects(handler.handle(caller, { id: deck.id }), error => {
      const value = error as { code?: string; name?: string };
      return failure === "cancel" ? value.name === "AbortError" : value.code === (failure === "revoke" ? "actions.forbidden" : "actions.provider_changed");
    });
    const after = openPptStore(home);
    try {
      const row = after.get(deck.id, "a");
      if (stage === "before-begin") { assert.equal(row.publication_pending, undefined); assert.equal(published, 0); }
      if (stage === "after-begin") { assert.equal(row.publication_pending?.version, 1); assert.equal(published, 0); assert.equal(row.artifact_version, 0); }
      if (stage === "after-publish-check") { assert.equal(armed, true); assert.equal(row.publication_pending?.version, 1); assert.equal(published, 0); assert.equal(row.artifact_version, 0); }
      if (stage === "after-artifact" || stage === "before-complete") { assert.equal(row.publication_pending?.version, 1); assert.equal(published, 1); assert.equal(row.artifact_version, 0); }
    } finally { after.close(); db.close(); await rm(home, { recursive: true, force: true }); }
  }
  const home = await mkdtemp(join(tmpdir(), "ppt-authority-control-"));
  const db = openHomeSqliteDatabase(home, "ppt");
  applySqliteBaseline(db, homeSqlitePath(home, "ppt"), PPT_DATABASE);
  const seed = openPptStore(home), deck = seed.create({ project_id: "a", title: "Control" });
  seed.close();
  let published = 0;
  const database: PluginDatabase = {
    get: (sql, parameters = []) => db.prepare(sql).get(...parameters) as never,
    all: (sql, parameters = []) => db.prepare(sql).all(...parameters) as never,
    transaction: async <T>(beforeEffect: () => Promise<void>, write: (transaction: PluginDatabaseTransaction) => T): Promise<T> => {
      await beforeEffect();
      return write({ get: database.get, all: database.all, run: (sql, parameters = []) => db.prepare(sql).run(...parameters) });
    },
  };
  const artifacts: PluginArtifactClient = {
    publish: input => { published += 1; return { artifact: { artifact_id: input.artifact_id!, version: input.version } } as never; },
    read: () => null, head: () => null, readOwn: () => null,
  };
  const context: PluginStartContext = { install_id: "ppt-test", plugin_id: "io.molis.work.ppt", version: "0.0.0", deployment: "local",
    grants: [], project_id: "a", services: { database, artifacts }, requireGrant: () => {} };
  const handler = (await createPptPlugin().start(context)).actions!.find(action => action.capability_id === "ppt.promote")!;
  const caller: ActionExecutionContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: ["ppt:read", "ppt:write", "artifact:write", "artifact:read"],
    beforeEffect: async () => {}, assert_authority_current: () => {} };
  await handler.handle(caller, { id: deck.id });
  const after = openPptStore(home);
  try {
    const row = after.get(deck.id, "a");
    assert.equal(row.publication_pending, undefined); assert.equal(row.artifact_version, 1); assert.equal(published, 1);
  } finally { after.close(); db.close(); await rm(home, { recursive: true, force: true }); }
});
