import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginDatabase, PluginStartContext, PluginDatabaseTransaction } from "@molis-ai/molis-work-contracts/platform/plugin";
import { applySqliteBaseline, homeSqlitePath, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { createPptPlugin, openPptStore, PPT_DATABASE } from "@molis-ai/molis-work-plugin-ppt";

type Stage = "before-begin" | "after-begin" | "after-artifact" | "none";
type Failure = "revoke" | "cancel";

/** W5-01-PPT-07: every publication side effect rechecks the original caller after its own wait. */
test("W5-01-PPT-07: cancel or revoke at each publication stage keeps only already-committed stages", async t => {
  for (const stage of ["before-begin", "after-begin", "after-artifact"] as const) for (const failure of ["revoke", "cancel"] as const) {
    const home = await mkdtemp(join(tmpdir(), `ppt-authority-${stage}-`));
    const db = openHomeSqliteDatabase(home, "ppt");
    applySqliteBaseline(db, homeSqlitePath(home, "ppt"), PPT_DATABASE);
    const seed = openPptStore(home), deck = seed.create({ project_id: "a", title: "Authority" });
    seed.close();
    let revoked = false, phase = 0, published = 0;
    const controller = new AbortController();
    const fail = () => { if (failure === "cancel") controller.abort(); else revoked = true; };
    const database: PluginDatabase = {
      get: (sql, parameters = []) => db.prepare(sql).get(...parameters) as never,
      all: (sql, parameters = []) => db.prepare(sql).all(...parameters) as never,
      transaction: async <T>(beforeEffect: () => Promise<void>, write: (transaction: PluginDatabaseTransaction) => T): Promise<T> => {
        await beforeEffect();
        phase += 1;
        if (phase === 1 && stage === "before-begin") fail();
        const transaction: PluginDatabaseTransaction = { get: database.get, all: database.all,
          run: (sql, parameters = []) => db.prepare(sql).run(...parameters) };
        const result = write(transaction);
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
    const caller: ActionExecutionContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: ["ppt:read", "ppt:write", "artifact:write", "artifact:read"],
      signal: controller.signal,
      beforeEffect: async () => { controller.signal.throwIfAborted(); if (revoked) throw Object.assign(new Error("revoked"), { code: "actions.forbidden" }); },
      assert_authority_current: () => { controller.signal.throwIfAborted(); if (revoked) throw Object.assign(new Error("revoked"), { code: "actions.forbidden" }); } };
    await assert.rejects(handler.handle(caller, { id: deck.id }), error => {
      const value = error as { code?: string; name?: string };
      return failure === "revoke" ? value.code === "actions.forbidden" : value.name === "AbortError";
    });
    const after = openPptStore(home);
    try {
      const row = after.get(deck.id, "a");
      if (stage === "before-begin") { assert.equal(row.publication_pending, undefined); assert.equal(published, 0); }
      if (stage === "after-begin") { assert.equal(row.publication_pending?.version, 1); assert.equal(published, 0); assert.equal(row.artifact_version, 0); }
      if (stage === "after-artifact") { assert.equal(row.publication_pending?.version, 1); assert.equal(published, 1); assert.equal(row.artifact_version, 0); }
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
