import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, bindActionClient, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionClient, PluginArtifactClient, PluginDatabase, PluginDatabaseTransaction, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPagesPlugin, PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";

type Stage = "before-begin" | "after-begin" | "after-publish-check" | "after-artifact" | "before-complete";
type Failure = "revoke" | "cancel" | "replace";
const STAGES: readonly Stage[] = ["before-begin", "after-begin", "after-publish-check", "after-artifact", "before-complete"];
const FAILURES: readonly Failure[] = ["revoke", "cancel", "replace"];

/** The start context Pages needs from a Runtime, with a library and a 成果库 the test watches; the action client is a real, empty one. */
function runtimeFor(home: string, db: ReturnType<typeof openHomeSqliteDatabase>, hooks: { onTransaction(phase: number): void; afterTransaction(phase: number): void; onPublish(): void }) {
  let phase = 0, published = 0;
  const database: PluginDatabase = {
    get: (sql, parameters = []) => db.prepare(sql).get(...parameters) as never,
    all: (sql, parameters = []) => db.prepare(sql).all(...parameters) as never,
    transaction: async <T>(beforeEffect: () => Promise<void>, write: (transaction: PluginDatabaseTransaction) => T): Promise<T> => {
      await beforeEffect();
      phase += 1;
      hooks.onTransaction(phase);
      const transaction: PluginDatabaseTransaction = { get: database.get, all: database.all, run: (sql, parameters = []) => db.prepare(sql).run(...parameters) };
      const result = write(transaction);
      hooks.afterTransaction(phase);
      return result;
    },
  };
  const artifacts: PluginArtifactClient = {
    publish: input => { published += 1; hooks.onPublish(); return { artifact: { artifact_id: input.artifact_id!, version: input.version } } as never; },
    read: () => null, head: () => null, readOwn: () => null,
  };
  const none = bindActionClient(new ActionService(), () => ({ actor_id: "owner", project_id: "a", audience: "user", permissions: [] }));
  const actions: PluginActionClient = { ...none, invokeQuery: async () => { throw new ActionError("actions.dependency_missing", "unused"); } };
  const context: PluginStartContext = { install_id: "pages-test", installation_generation: "1", plugin_id: "io.molis.work.pages", version: "0.0.0", deployment: "local",
    grants: [], project_id: "a", services: { database, artifacts, actions }, requireGrant: () => {} };
  return { context, published: () => published, home };
}

const permissions = [...PAGES_ACTION_PERMISSIONS, "artifact:read"];

/** W5-01-PAGES-06: every publication side effect rechecks the original caller after its own wait. */
test("W5-01-PAGES-06 cancel, revoke or a replaced provider at each publication stage keeps only already-committed stages", async () => {
  for (const stage of STAGES) for (const failure of FAILURES) {
    const home = await mkdtemp(join(tmpdir(), `pages-authority-${stage}-`));
    const seed = openPagesStore(home), page = seed.create({ project_id: "a", title: "Authority" });
    seed.close();
    const db = openHomeSqliteDatabase(home, "pages");
    let revoked = false, replaced = false, beginCommitted = false, armed = false;
    const controller = new AbortController();
    const fail = () => { if (failure === "cancel") controller.abort(); else if (failure === "replace") replaced = true; else revoked = true; };
    const runtime = runtimeFor(home, db, {
      // The write's own wait has passed; the caller is lost before its first statement runs.
      onTransaction: phase => { if ((phase === 1 && stage === "before-begin") || (phase === 2 && stage === "before-complete")) fail(); },
      afterTransaction: phase => { if (phase === 1) beginCommitted = true; if (phase === 1 && stage === "after-begin") fail(); },
      onPublish: () => { if (stage === "after-artifact") fail(); },
    });
    const started = await createPagesPlugin().start(runtime.context);
    const handler = started.actions!.find(action => action.capability_id === "pages.promote")!;
    const refuse = () => {
      controller.signal.throwIfAborted();
      if (revoked) throw new ActionError("actions.forbidden", "revoked");
      if (replaced) throw new ActionError("actions.provider_changed", "replaced");
    };
    const caller: ActionExecutionContext = { actor_id: "owner", project_id: "a", audience: "user", permissions, signal: controller.signal,
      beforeEffect: async () => refuse(),
      assert_authority_current: () => {
        refuse();
        // The caller is lost after the nested async check succeeds, before it resumes to publish.
        if (stage === "after-publish-check" && beginCommitted && !armed) { armed = true; queueMicrotask(fail); }
      } };
    await assert.rejects(handler.handle(caller, { id: page.id }), error => {
      const value = error as { code?: string; name?: string };
      return failure === "cancel" ? value.name === "AbortError" : value.code === (failure === "revoke" ? "actions.forbidden" : "actions.provider_changed");
    }, `${stage} / ${failure}`);
    const after = openPagesStore(home);
    try {
      const row = after.get(page.id, "a");
      if (stage === "before-begin") { assert.equal(row.publication_pending, undefined); assert.equal(runtime.published(), 0); }
      if (stage === "after-begin") { assert.equal(row.publication_pending?.version, 1); assert.equal(runtime.published(), 0); assert.equal(row.artifact_version, 0); }
      if (stage === "after-publish-check") { assert.equal(armed, true); assert.equal(row.publication_pending?.version, 1); assert.equal(runtime.published(), 0); assert.equal(row.artifact_version, 0); }
      if (stage === "after-artifact" || stage === "before-complete") { assert.equal(row.publication_pending?.version, 1); assert.equal(runtime.published(), 1); assert.equal(row.artifact_version, 0); }
    } finally { after.close(); db.close(); await rm(home, { recursive: true, force: true }); }
  }
});

test("W5-01-PAGES-06 with no loss of authority the same call publishes once and leaves no pending intent", async () => {
  const home = await mkdtemp(join(tmpdir(), "pages-authority-control-"));
  const seed = openPagesStore(home), page = seed.create({ project_id: "a", title: "Control" });
  seed.close();
  const db = openHomeSqliteDatabase(home, "pages");
  const runtime = runtimeFor(home, db, { onTransaction: () => {}, afterTransaction: () => {}, onPublish: () => {} });
  const handler = (await createPagesPlugin().start(runtime.context)).actions!.find(action => action.capability_id === "pages.promote")!;
  const caller: ActionExecutionContext = { actor_id: "owner", project_id: "a", audience: "user", permissions, beforeEffect: async () => {}, assert_authority_current: () => {} };
  await handler.handle(caller, { id: page.id });
  const after = openPagesStore(home);
  try {
    const row = after.get(page.id, "a");
    assert.equal(row.publication_pending, undefined); assert.equal(row.artifact_version, 1); assert.equal(runtime.published(), 1);
  } finally { after.close(); db.close(); await rm(home, { recursive: true, force: true }); }
});
