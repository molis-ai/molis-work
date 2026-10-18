import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnectorAuthorizationMonitor } from "../apps/workbench/dist/scripts/connector-authorization-monitor.js";
import { beginConnectorAuthorization, cancelConnectorAuthorization, connectorAuthorizationStatus, finishConnectorAuthorization } from "../apps/local-host/dist/connector-authorization-status.js";
import { startApiOAuth, completeApiOAuth } from "../apps/local-host/dist/connector-api-oauth.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";

test("authorization receipts survive polling, distinguish denial and expiry, and cannot be overwritten by replay", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-authorization-recovery-"));
  try {
    const origin = "http://localhost:19358";
    const first = await startApiOAuth(home, { serviceId: "asana", displayName: "Work", clientId: "app", clientSecret: "fixture-secret", origin });
    const state = new URL(first.authorization_url).searchParams.get("state")!;
    assert.equal(connectorAuthorizationStatus(home, first.authorization_id)?.status, "pending");
    await assert.rejects(completeApiOAuth(home, { origin, state, error: "access_denied" }));
    assert.equal(connectorAuthorizationStatus(home, first.authorization_id)?.status, "cancelled");
    finishConnectorAuthorization(home, state, "connected");
    assert.equal(connectorAuthorizationStatus(home, first.authorization_id)?.status, "cancelled");
    assert.deepEqual(withConnectorConnections(home, store => store.list()), []);
    const second = beginConnectorAuthorization(home, "other-state", "other-id", "asana");
    assert.equal(connectorAuthorizationStatus(home, second, Date.now() + 600_001)?.status, "expired");
    assert.equal(connectorAuthorizationStatus(home, "unknown"), null);
    assert.doesNotMatch(JSON.stringify(connectorAuthorizationStatus(home, first.authorization_id)), /fixture-secret|state_hash|access_token/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

function harness(read: () => Promise<"pending" | "connected" | "cancelled">, connected = async () => {}) {
  const events: string[] = [];
  const scheduled = new Map<number, () => void>(); let sequence = 0;
  const browserController = runInNewContext("(" + createConnectorAuthorizationMonitor.toString() + ")") as typeof createConnectorAuthorizationMonitor;
  const monitor = browserController({ read, connected, ended: state => events.push(state), refreshFailed: () => events.push("refresh-failed"), alive: () => true,
    now: () => 1, expires: 100,
    schedule: fn => { scheduled.set(++sequence, fn); return sequence as unknown as ReturnType<typeof setTimeout>; },
    unschedule: timer => { scheduled.delete(timer as unknown as number); },
  });
  return { monitor, scheduled, events };
}
test("successful authorization with failed HTML reload ends polling and exposes refresh recovery", async () => {
  let reads = 0;
  const h = harness(async () => { reads++; return "connected"; }, async () => { throw new Error("offline"); });
  await h.monitor.check(); await h.monitor.check();
  assert.equal(reads, 1); assert.equal(h.scheduled.size, 0);
  assert.deepEqual(h.events, ["refresh-failed"]);
});
test("denied grant immediately ends the original window's wait", async () => {
  const h = harness(async () => "cancelled"); await h.monitor.check();
  assert.deepEqual(h.events, ["cancelled"]); assert.equal(h.scheduled.size, 0);
});
test("transient polling errors retry but stopping an in-flight check cannot report success", async () => {
  let release!: (value: "connected") => void; let first = true;
  const h = harness(async () => { if (first) { first = false; throw new Error("offline"); } return new Promise(resolve => { release = resolve; }); }, async () => { h.events.push("connected"); });
  await h.monitor.check(); assert.equal(h.scheduled.size, 1); assert.deepEqual(h.events, []);
  const pending = h.monitor.check(); h.monitor.stop(); release("connected"); await pending;
  assert.equal(h.scheduled.size, 0); assert.deepEqual(h.events, []);
});

test("disconnected custom OAuth never borrows credentials from a product app with the same ID", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-custom-reconnect-"));
  const keys = ["MOLIS_WORK_CONNECTOR_ASANA_OAUTH_CLIENT_ID", "MOLIS_WORK_CONNECTOR_ASANA_OAUTH_CLIENT_SECRET"];
  const previous = keys.map(key => process.env[key]);
  try {
    const origin = "http://localhost:19358";
    const first = await startApiOAuth(home, { serviceId: "asana", displayName: "Custom", clientId: "same-id", clientSecret: "custom-secret", origin });
    await completeApiOAuth(home, { origin, state: new URL(first.authorization_url).searchParams.get("state")!, code: "fixture" }, async url => new Response(JSON.stringify(String(url).includes("oauth_token") ? { access_token: "fixture-token" } : { data: { gid: "account", name: "Custom" } })));
    withConnectorConnections(home, store => store.disconnect(first.connection_id));
    process.env[keys[0]!] = "same-id"; process.env[keys[1]!] = "product-secret";
    await assert.rejects(startApiOAuth(home, { serviceId: "asana", displayName: "Custom", clientId: "", connectionId: first.connection_id, origin }), /自定义应用/);
  } finally {
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
    rmSync(home, { recursive: true, force: true });
  }
});

for (const phase of ["before-exchange", "exchange", "identity"] as const) test(`ASC-35 cancelled API OAuth at ${phase} never activates and cannot be replayed`, async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-api-oauth-cancel-"));
  try {
    const origin = "http://localhost:19358";
    const started = await startApiOAuth(home, { serviceId: "asana", displayName: "Work", clientId: "app", clientSecret: "fixture-secret", origin });
    const state = new URL(started.authorization_url).searchParams.get("state")!;
    let reached!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { reached = resolve; });
    const waiting = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const transport: typeof fetch = async url => {
      calls++;
      const exchange = String(url).includes("oauth_token");
      if (exchange === (phase === "exchange")) { reached(); await waiting; }
      return Response.json(exchange ? { access_token: "fixture-access", refresh_token: "fixture-refresh" } : { data: { gid: "account", name: "Work" } });
    };
    if (phase === "before-exchange") cancelConnectorAuthorization(home, started.authorization_id);
    const pending = completeApiOAuth(home, { origin, state, code: "fixture-code" }, transport);
    if (phase !== "before-exchange") { await entered; assert.equal(cancelConnectorAuthorization(home, started.authorization_id)?.status, "cancelled"); release(); }
    await assert.rejects(pending);
    assert.equal(connectorAuthorizationStatus(home, started.authorization_id)?.status, "cancelled");
    assert.deepEqual(withConnectorConnections(home, store => store.list()), []);
    await assert.rejects(completeApiOAuth(home, { origin, state, code: "fixture-code" }, transport));
    if (phase === "before-exchange") assert.equal(calls, 0);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
