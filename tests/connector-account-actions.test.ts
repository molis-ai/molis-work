import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";
import { connectorAccountActions, CONNECTOR_ACCOUNT_PERMISSIONS } from "../apps/local-host/src/connector-account-actions.js";

test("a connected account is read through one registered connector action; connecting grants nothing else", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "connector-account-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const user: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: CONNECTOR_ACCOUNT_PERMISSIONS };
  try {
    const client = host.homeActionClient();
    const rows = (await client.discover(user)).filter(row => row.provider.provider_id === "io.molis.work.connectors");
    assert.deepEqual(rows.map(row => row.capability_id), ["connectors.account.read"]);
    await runWithMolisWorkHome(home, async () => {
      await assert.rejects(client.invoke(user, connectorAccountActions.read, { connector_id: "github" }), { code: "connectors.disconnected" });
      await assert.rejects(client.invoke(user, connectorAccountActions.read, { connector_id: "not-a-connector" }), (error: { code?: string }) => ["connectors.disconnected", "connectors.unknown"].includes(error.code ?? ""));
    });
    await assert.rejects(client.invoke({ ...user, audience: "mcp", actor_id: "runtime:x", permissions: [] }, connectorAccountActions.read, { connector_id: "github" }), { code: "actions.forbidden" });
    const external = await client.discover({ ...user, audience: "mcp", actor_id: "runtime:x" });
    assert.ok(external.some(row => row.capability_id === "connectors.account.read"), "an external client can be granted the account check explicitly");
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
