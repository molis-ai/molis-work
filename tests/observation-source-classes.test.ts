import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createConnectorSourcePort, createHostObservation, homeIntegrationRegistry, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { currentObservationSource, readRecords } from "@molis-ai/molis-work-service-observation";

// OCL-02, OCL-13 (specs/observation-collection/spec.md; design §3, contract-design §5): a pull from a bound account says what it read. With no
// cursor it is the first read of what the account already held; with a rebuilt cursor, a catch-up of what a break missed; any other pull is
// real. The class covers the provider's work during the pull and ends with it, and the record joins the call that asked for the pull.

const PLUGIN = "io.molis.work.example.sourceclass", INSTALL = "plugin-install-source-class";

async function boundSource(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), "observation-source-classes-")), observation = createHostObservation(home);
  t.after(async () => { observation.close(); await rm(home, { recursive: true, force: true }); });
  const seen: (string | undefined)[] = [];
  const registry = homeIntegrationRegistry(home, (): IntegrationProviderPort => ({
    type: "github",
    async health() { return { ok: true, status: "connected", message: "ok" }; },
    async sync() { seen.push(currentObservationSource()); return { ok: true, mode: "live", items: [{ externalId: "n1", title: "Review requested", summary: "Wants review" }], cursor: "c1" }; },
  }));
  const port = createConnectorSourcePort({ home, registry: () => registry });
  const target = { plugin_id: PLUGIN, install_id: INSTALL, slot_id: "github", service_id: "github", project_id: "p-1", record_key: "src-1" };
  const account = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "Work", token: "fixture-token-for-source-classes" }));
  withConnectorConnections(home, store => store.bind({ scopeId: pluginBindingScope({ install_id: INSTALL, project_id: "p-1", record_key: "src-1" }), pluginId: PLUGIN,
    slotId: "github", serviceId: "github", connectionId: account.connection_id }));
  const run = { signal: new AbortController().signal, current() {}, async beforeEffect() {}, retainProvider() {} };
  const pull = (cursor: unknown, sync_mode?: string) => port.pull(target, { integration_id: "github", cursor, ...(sync_mode ? { intent: { sync_mode } } : {}) }, run);
  const records = () => { observation.layer.flush(); return readRecords(observation.layer.writer.database()!.db, { fact: "connections.pull" }); };
  return { pull, records, seen, account };
}

test("OCL-02 OCL-13: a first pull is a first read, a rebuilt cursor a catch-up and any other pull real, during the provider's work and on its record", async t => {
  const f = await boundSource(t);
  for (const [cursor, mode] of [[null, undefined], ["c1", "rebuild_cursor"], ["c1", undefined]] as const) assert.equal((await f.pull(cursor, mode)).result.ok, true);
  assert.deepEqual(f.seen, ["first_read", "catch_up", undefined], "the provider's own work carries the class, and only while it pulls");
  assert.equal(currentObservationSource(), undefined);
  const records = f.records();
  assert.deepEqual(records.map(record => record.source_class), ["first_read", "catch_up", "real"]);
  for (const record of records) {
    assert.deepEqual([record.owner, record.entry, record.actor.actor_id, record.project_id, record.install_id, record.outcome],
      [{ kind: "service", id: "connections" }, "background", `plugin:${PLUGIN}`, "p-1", INSTALL, "succeeded"]);
    assert.deepEqual(record.subjects, [{ kind: "source", id: "src-1" }, { kind: "connection", id: f.account.connection_id }]);
    assert.equal(record.detail.events, 1);
  }
});
