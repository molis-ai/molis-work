import assert from "node:assert/strict";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { TestContext } from "node:test";
import { pluginSyncNamespace } from "@molis-ai/molis-work-app-local-host";
import { ActionError, type ActionCallContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { homeSqlitePath, openSqliteConnection } from "@molis-ai/molis-work-storage";
import { openTestHome } from "./test-home.js";

interface PinOwner {
  slug: string;
  table: string;
  field: string;
  manifest: PluginManifest;
  actions: { create: ActionReference; get: ActionReference; promote: ActionReference; artifactPin: ActionReference };
}

/** Uses the actual project action, then changes its original caller while both databases are still in the transaction. */
export async function checkCreativePinAuthority(t: TestContext, owner: PinOwner): Promise<void> {
  const h = await openTestHome(t), project = await h.createProject("Pin authority", [owner.slug]);
  const person = await h.host.localPersonContext(project.reference), client = h.host.actionClient(project.reference);
  const read = (id: string) => client.invoke(person, owner.actions.get, { id });
  const created = await client.invoke(person, owner.actions.create, { title: "Authority" }) as Record<string, { id: string; version: number }>;
  const original = created[owner.field]!, id = original.id, artifactId = owner.slug + "-" + id;
  const archive = () => h.host.withProject(project.reference, ({ artifacts, store }) => [
    artifacts.query.listArtifactVersions(project.project_id, artifactId),
    store.eventCursor(project.project_id),
    store.db.prepare<[], { n: number }>("SELECT count(*) AS n FROM artifacts_replica_changes").get()?.n,
  ]);
  const changes = () => {
    const library = openSqliteConnection(homeSqlitePath(h.home, owner.slug), { readonly: true });
    const namespace = pluginSyncNamespace(owner.manifest, owner.manifest.sync!.collections[0]!.id);
    try { return library.prepare(`SELECT count(*) AS n FROM ${namespace}_replica_changes`).get()?.n; }
    finally { library.close(); }
  };
  const before = await read(id), artifactsBefore = await archive(), homeChanges = changes();
  const probe = new DatabaseSync(":memory:");
  const statements = Object.getPrototypeOf(probe.prepare("SELECT 1")) as Pick<StatementSync, "run">;
  probe.close();
  const run = statements.run;
  let afterWrite: ((sql: string) => void) | undefined;
  t.mock.method(statements, "run", function(this: StatementSync, ...parameters: Parameters<StatementSync["run"]>) {
    const result = Reflect.apply(run, this, parameters);
    afterWrite?.(this.sourceSQL);
    return result;
  });

  const stageSql = { pinned: /^\s*INSERT INTO library_artifact_versions\b/iu, associated: /^UPDATE OR ABORT molis_home\./iu };
  for (const [stage, sql] of Object.entries(stageSql)) for (const change of ["cancel", "revoke", "replace"] as const) {
    const controller = new AbortController(), label = stage + " " + change;
    let stale = false;
    const caller: ActionCallContext = { ...person, signal: controller.signal, assert_authority_current() {
      person.assert_authority_current?.();
      if (stale) throw new ActionError(change === "replace" ? "actions.provider_changed" : "actions.forbidden", label);
    } };
    afterWrite = statement => {
      if (!sql.test(statement) || stage === "associated" && !statement.includes(`"${owner.table}"`)) return;
      afterWrite = undefined;
      if (change === "cancel") controller.abort();
      else stale = true;
    };
    const action = stage === "pinned" ? owner.actions.promote : owner.actions.artifactPin;
    const input = stage === "pinned" ? { id, expected_version: original.version } : { subject_id: id };
    await assert.rejects(client.invoke(caller, action, input),
      change === "cancel" ? { name: "AbortError" } : { code: change === "replace" ? "actions.provider_changed" : "actions.forbidden" });
    assert.equal(afterWrite, undefined, label + " hit the real SQLite write");
    assert.deepEqual(await read(id), before, label);
    assert.deepEqual(await archive(), artifactsBefore, label);
    assert.equal(changes(), homeChanges, label);
  }
  const artifact = await client.invoke(person, owner.actions.artifactPin, { subject_id: id });
  assert.deepEqual(artifact, { artifact: { artifact_id: artifactId, version: 1 }, recovered: false });
  const competing = { id, expected_version: original.version + 1 };
  const results = await Promise.allSettled([
    client.invoke(person, owner.actions.promote, competing), client.invoke(person, owner.actions.promote, competing),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const refusal = results.find(result => result.status === "rejected");
  assert.equal((refusal?.reason as { code?: string } | undefined)?.code, owner.slug + ".conflict");
  const versions = await h.host.withProject(project.reference, ({ artifacts }) => artifacts.query.listArtifactVersions(project.project_id, artifactId));
  assert.deepEqual(versions.map(version => version.version), [1, 2]);
}
