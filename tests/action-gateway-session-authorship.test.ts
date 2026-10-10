import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalActionGatewayClient, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";

/** The resident Host judges a Runtime client by what the gateway request says about its Session; a client that names none is marked on its context. */
const CLIENT = "runtime:gateway-author";
const recorded: ActionDefinition<{ text: string }, { author: string }> = { capability_id: "fixture.gateway.recorded", version: 1, operation: "command", action: {
  title: "记在会话名下", description: "作者取自可信调用上下文", kind: "operation", scope: "project", audiences: ["mcp"], permissions: ["notes:write"], subject_kinds: [],
  authorship: "session",
  input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
  output_schema: { type: "object", properties: { author: { type: "string" } }, required: ["author"], additionalProperties: false } } };

test("the gateway refuses a Runtime client that names no Session for an action that declares authorship, and records the Session otherwise", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "action-gateway-authorship-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Gateway", actor_id: "user" }));
  const reference = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const handled: string[] = [];
  await host.withProject(reference, () => {
    host.actionRegistry(reference).registerProvider({ provider: { provider_id: "fixture-gateway", title: "Fixture", kind: "plugin", plugin_id: "io.molis.work.example.gateway-author" },
      definitions: [recorded], handlers: [{ ...recorded, handle: caller => { handled.push(caller.audit_actor_id ?? caller.actor_id); return { author: caller.audit_actor_id ?? caller.actor_id }; } }] });
  });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const ref = { capability_id: recorded.capability_id, version: recorded.version, provider_id: "fixture-gateway" };
  try {
    await grantGoalsMcp(host, home, project, CLIENT, [recorded]);
    const bare: ActionCallContext = { actor_id: CLIENT, project_id: project.project_id, audience: "mcp", permissions: [] };
    const withoutSession = new LocalActionGatewayClient({ url: origin, homeDirectory: home, clientId: CLIENT, projectId: project.project_id });
    await withoutSession.discover(bare);
    await assert.rejects(withoutSession.invoke(bare, ref, { text: "no session" }), { code: "mcp.runtime_identity_missing" });
    assert.deepEqual(handled, [], "the handler never ran");

    const bound: ActionCallContext = { ...bare, audit_actor_id: `${CLIENT}:s1`, actor_kind: "runtime", runtime_session_id: "s1" };
    const withSession = new LocalActionGatewayClient({ url: origin, homeDirectory: home, clientId: CLIENT, projectId: project.project_id, runtimeSessionId: "s1" });
    await withSession.discover(bound);
    assert.deepEqual(await withSession.invoke(bound, ref, { text: "with session" }), { author: `${CLIENT}:s1` });
    assert.deepEqual(handled, [`${CLIENT}:s1`]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
