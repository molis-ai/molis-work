// Regression coverage promoted from the 2026-09-27 Connector review.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startApiOAuth, completeApiOAuth } from "../apps/local-host/dist/connector-api-oauth.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";

const origin = "http://localhost:19358";
const app = { serviceId: "asana", displayName: "Review account", clientId: "review-app", clientSecret: "review-fixture-secret", origin };
const transport: typeof fetch = async (url) => new Response(JSON.stringify(String(url).includes("oauth_token")
  ? { access_token: "review-fixture-access", refresh_token: "review-fixture-refresh", expires_in: 3600 }
  : { data: { gid: "review-account", name: "Review account" } }), { headers: { "content-type": "application/json" } });
async function complete(home: string, authorization: string) {
  return completeApiOAuth(home, { origin, state: new URL(authorization).searchParams.get("state")!, code: "review-code" }, transport);
}

test("product-configured OAuth can reconnect the disconnected account without asking the user for a client secret", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-review-reconnect-"));
  const keys = ["MOLIS_WORK_CONNECTOR_ASANA_OAUTH_CLIENT_ID", "MOLIS_WORK_CONNECTOR_ASANA_OAUTH_CLIENT_SECRET"];
  const previous = keys.map(key => process.env[key]);
  process.env[keys[0]!] = app.clientId; process.env[keys[1]!] = app.clientSecret;
  try {
    const first = await startApiOAuth(home, { serviceId: "asana", displayName: app.displayName, clientId: "", origin });
    await complete(home, first.authorization_url);
    withConnectorConnections(home, store => store.disconnect(first.connection_id));
    const retry = await startApiOAuth(home, { serviceId: "asana", displayName: app.displayName, clientId: "", connectionId: first.connection_id, origin });
    assert.equal(retry.connection_id, first.connection_id);
  } finally {
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
    rmSync(home, { recursive: true, force: true });
  }
});

// The account sources that read through a connection follow it in the Runtime Feed, which looks at them again when the Host says a connection
// changed (RAC-1036, feed-runtime-plugin.test.ts); Feed keeps no connection of its own (T-121), so this checks only the connection itself.
test("generic OAuth reconnect restores the same connection after disconnect", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-review-feed-"));
  try {
    const first = await startApiOAuth(home, app);
    await complete(home, first.authorization_url);
    withConnectorConnections(home, store => store.disconnect(first.connection_id));
    assert.equal(withConnectorConnections(home, store => store.state(store.require(first.connection_id))), "disconnected");
    // Supply fixture app credentials here to isolate this bug from the first one.
    const retry = await startApiOAuth(home, { ...app, connectionId: first.connection_id });
    await complete(home, retry.authorization_url);
    assert.equal(withConnectorConnections(home, store => store.state(store.require(first.connection_id))), "connected");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
