import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";
import { connectorAccountActions, CONNECTOR_ACCOUNT_PERMISSIONS } from "../apps/local-host/src/connector-account-actions.js";

test("a connected account is read through one registered connector action; connecting grants nothing else", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "connector-account-"));
  const priorBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file"; resetSecretStoreCache();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const user: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: CONNECTOR_ACCOUNT_PERMISSIONS };
  try {
    const client = host.homeActionClient();
    const rows = (await client.discover(user)).filter(row => row.provider.provider_id === "system.connectors");
    assert.deepEqual(rows.map(row => row.capability_id), ["connectors.account.read"]);
    // The account is read through one connection; an unknown or disconnected one is never replaced by another account.
    await assert.rejects(client.invoke(user, connectorAccountActions.read, { connection_id: "11111111-1111-4111-8111-111111111111" }), { code: "connectors.unknown" });
    const github = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "GitHub", token: "fixture-github-token" }));
    withConnectorConnections(home, store => store.disconnect(github.connection_id));
    await assert.rejects(client.invoke(user, connectorAccountActions.read, { connection_id: github.connection_id }), { code: "connectors.disconnected" });
    await assert.rejects(client.invoke({ ...user, audience: "mcp", actor_id: "runtime:x", permissions: [] }, connectorAccountActions.read, { connection_id: github.connection_id }), { code: "actions.forbidden" });
    const external = await client.discover({ ...user, audience: "mcp", actor_id: "runtime:x" });
    assert.ok(external.some(row => row.capability_id === "connectors.account.read"), "an external client can be granted the account check explicitly");
  } finally {
    await host.close();
    if (priorBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = priorBackend;
    resetSecretStoreCache();
    await rm(home, { recursive: true, force: true });
  }
});
