// Regression coverage promoted from the 2026-09-27 Connector review.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { startApiOAuth, completeApiOAuth } from "../apps/local-host/src/connector-api-oauth.ts";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.ts";
import { refreshFeedConnectionState } from "../apps/local-host/src/web-connector-connections.ts";
import { createLocalFeedApplication, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";

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

test("generic OAuth reconnect restores its bound Feed source after disconnect", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-review-feed-"));
  mkdirSync(join(home, "projects"));
  const path = join(home, "projects", "review.db");
  const catalog = new DatabaseSync(join(home, "projects", "catalog.db"));
  catalog.exec("CREATE TABLE projects (database_path TEXT NOT NULL)");
  catalog.prepare("INSERT INTO projects VALUES (?)").run(path); catalog.close();
  seedDemoBoard(path);
  const board = new LocalProjectDatabase(path);
  try {
    const first = await startApiOAuth(home, app);
    await complete(home, first.authorization_url);
    const connection = withConnectorConnections(home, store => store.require(first.connection_id));
    const feed = createLocalFeedApplication(board.db);
    feed.upsertSource({ project_id: DEMO_PROJECT_ID, source_id: "review-source", kind: "asana", definition_id: "asana", sync_kind: "connector",
      name: "Review source", description: "Fixture", status: "active", enabled: true, item_count: 0, origin: "molis_work",
      config: { connection_id: first.connection_id }, schedule: { mode: "manual", enabled: false }, cursor: {},
      credential_ref: connection.credential_ref, account_label: "Review account", last_sync_at: null, last_outcome: null,
      last_error_code: null, imported_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    withConnectorConnections(home, store => store.disconnect(first.connection_id));
    refreshFeedConnectionState(home, first.connection_id);
    assert.equal(feed.getSource(DEMO_PROJECT_ID, "review-source").status, "disconnected");
    // Supply fixture app credentials here to isolate this bug from the first one.
    const retry = await startApiOAuth(home, { ...app, connectionId: first.connection_id });
    await complete(home, retry.authorization_url);
    assert.equal(withConnectorConnections(home, store => store.state(store.require(first.connection_id))), "connected");
    assert.equal(feed.getSource(DEMO_PROJECT_ID, "review-source").status, "active");
  } finally { board.close(); rmSync(home, { recursive: true, force: true }); }
});
