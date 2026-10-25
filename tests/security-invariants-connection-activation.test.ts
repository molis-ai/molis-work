import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { activateConnectorConnection, pluginSlotScope, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { ConnectorProtocolStore } from "@molis-ai/molis-work-service-connector-host";
import { createFileSecretStore, homeSqlitePath, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

type Completion = Parameters<typeof activateConnectorConnection>[1];
const beforeToken = "fixture-original-tenant-credential";
const afterToken = "fixture-replacement-tenant-credential";
const invalid = (error: unknown) => error instanceof ActionError && error.code === "connector.connection.invalid"
  && !error.message.includes(afterToken) && !error.message.includes("catalog");
const tenant = (service: string, name = "acme") => `https://${name}.${service === "salesforce" ? "my.salesforce.com" : "atlassian.net"}`;

async function homeFor(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "connection-activation-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

function oauth(serviceId: string, context: Record<string, string>, connectionId = randomUUID()): Extract<Completion, { kind: "oauth" }> {
  const accessRef = `connector-protocol:${connectionId}:access`, refreshRef = `connector-protocol:${connectionId}:refresh`;
  const protocol = { connectionId, serviceId, protocol: "oauth" as const, context };
  return { kind: "oauth", target: { connectionId }, protocol,
    credentials: { [accessRef]: beforeToken, [refreshRef]: "fixture-original-refresh-material" },
    input: { connectionId, serviceId, displayName: "Original account", accessRef, refreshRef } };
}

function snapshot(home: string, id: string) {
  const connection = withConnectorConnections(home, store => ({ row: store.require(id), origin: store.targetOrigin(id),
    binding: store.binding(pluginSlotScope("tenant-activation"), "io.molis.work.example.activation", "account")?.connection_id ?? null }));
  const db = new DatabaseSync(homeSqlitePath(home, "connectors"));
  let protocol;
  try { protocol = new ConnectorProtocolStore(db).get(id); } finally { db.close(); }
  const secrets = runWithMolisWorkHome(home, () => {
    const store = createFileSecretStore();
    return [connection.row.credential_ref, connection.row.refresh_ref, `connector-protocol:${id}:candidate`].map(ref => ref ? store.get(ref) : null);
  });
  return { ...connection, protocol, secrets };
}

test("S-69 RAC-654 tenant reauthorization without a valid origin refuses before changing credentials, connection, pin, binding or protocol", async t => {
  const home = await homeFor(t);
  for (const service of ["salesforce", "jira", "confluence"]) {
    const context = service === "salesforce" ? { instance: tenant(service) } : { site_url: tenant(service), cloud_id: "original-cloud", base: `https://api.atlassian.com/ex/${service}/original-cloud` };
    const original = oauth(service, context), saved = activateConnectorConnection(home, original), id = saved.connection_id;
    withConnectorConnections(home, store => store.bind({ scopeId: pluginSlotScope("tenant-activation"), pluginId: "io.molis.work.example.activation", slotId: "account", serviceId: service, connectionId: id }));
    const before = snapshot(home, id);
    for (const context of [{}, service === "salesforce" ? { instance: "https://outside.example" } : { site_url: "https://outside.example" }]) {
      const replacement = oauth(service, context, id);
      replacement.target.expectedRevision = before.row.updated_at;
      replacement.input.displayName = "Replacement account";
      replacement.credentials = { [replacement.input.accessRef]: afterToken, [replacement.input.refreshRef!]: null, [`connector-protocol:${id}:candidate`]: afterToken };
      assert.throws(() => activateConnectorConnection(home, replacement), invalid, `${service}: origin must be known before any write`);
      assert.deepEqual(snapshot(home, id), before, `${service}: every original fact and secret remains`);
    }
    const crossed = oauth(service, service === "salesforce" ? { instance: tenant(service, "other") } : { site_url: tenant(service, "other") }, id);
    crossed.target.expectedRevision = before.row.updated_at;
    assert.throws(() => activateConnectorConnection(home, crossed), (error: unknown) => error instanceof ActionError && error.code === "connector.connection.service_mismatch");
    assert.deepEqual(snapshot(home, id), before);
    const same = oauth(service, context, id); same.target.expectedRevision = before.row.updated_at;
    same.credentials[same.input.accessRef] = afterToken;
    assert.equal(activateConnectorConnection(home, same).connection_id, id);
    const after = snapshot(home, id);
    assert.equal(after.origin, tenant(service));
    assert.equal(after.secrets[0], afterToken);
    assert.notEqual(after.row.updated_at, before.row.updated_at);
    assert.deepEqual(after.binding, before.binding);
  }
});

test("S-69 RAC-654 malformed tenant tokens use the connector error contract and preserve existing or absent connections", async t => {
  const home = await homeFor(t);
  for (const serviceId of ["salesforce", "jira", "confluence"]) {
    const token = `${tenant(serviceId)}|${serviceId === "salesforce" ? "" : "person@example.com|"}${beforeToken}`;
    const saved = activateConnectorConnection(home, { kind: "token", input: { serviceId, displayName: "Original token", token } });
    const before = snapshot(home, saved.connection_id);
    const input = { serviceId, displayName: "Changed name", token: afterToken };
    assert.throws(() => activateConnectorConnection(home, { kind: "token", input, target: { connectionId: saved.connection_id, expectedRevision: before.row.updated_at } }), invalid);
    assert.deepEqual(snapshot(home, saved.connection_id), before);
    const count = withConnectorConnections(home, store => store.list().length);
    assert.throws(() => activateConnectorConnection(home, { kind: "token", input }), invalid);
    assert.equal(withConnectorConnections(home, store => store.list().length), count, "a parsing failure never becomes a successful new unpinned connection");
  }
});

test("S-69 RAC-654 a revision changed while reauthorizing refuses before replacing token or OAuth material", async t => {
  const home = await homeFor(t);
  const initial: Completion[] = [{ kind: "token", input: { serviceId: "salesforce", displayName: "Token", token: `${tenant("salesforce")}|${beforeToken}` } }, oauth("salesforce", { instance: tenant("salesforce") })];
  for (const completion of initial) {
    const saved = activateConnectorConnection(home, completion);
    const captured = withConnectorConnections(home, store => store.require(saved.connection_id).updated_at);
    withConnectorConnections(home, store => store.rename(saved.connection_id, "Concurrent edit"));
    const before = snapshot(home, saved.connection_id);
    const replacement: Completion = completion.kind === "token"
      ? { ...completion, input: { ...completion.input, token: `${tenant("salesforce")}|${afterToken}` }, target: { connectionId: saved.connection_id, expectedRevision: captured } }
      : { ...oauth("salesforce", { instance: tenant("salesforce") }, saved.connection_id), target: { connectionId: saved.connection_id, expectedRevision: captured } };
    if (replacement.kind === "oauth") replacement.credentials[replacement.input.accessRef] = afterToken;
    assert.throws(() => activateConnectorConnection(home, replacement), invalid);
    assert.deepEqual(snapshot(home, saved.connection_id), before);
  }
});
