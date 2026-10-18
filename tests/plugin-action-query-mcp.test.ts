import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { pagesActions, pagesContentActions } from "@molis-ai/molis-work-plugin-pages";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { openTestHome } from "./fixtures/test-home.js";
import { queryProbe } from "./fixtures/action-query.js";

test("AQD-05 actual MCP parent-only and partial grants refuse, full exact grants read Pages, and revocation survives a held call", { timeout: 90_000 }, async t => {
  const probe = queryProbe("querymcp"), s = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { home: [probe.definition] } } });
  const project = await s.createProject("Query MCP", ["pages"]), platform = await s.host.homePlugins!.ready(), install = s.host.homePlugins!.installation(probe.id)!;
  await platform.runtime.stop(install.install_id); platform.runtime.grant(install.install_id, ["storage:private", "pages:read"]); await platform.supervisor.restart(probe.id);
  const page = await s.host.actionClient(project.reference).invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: ["pages:write"] }, pagesActions.create,
    { title: "MCP material", markdown: "Exact delegated content" }) as { document: { id: string } };
  const context = { runtime_id: "query-client", stable_work_context_id: "query-session", host_declares_stable: true }, clientId = "runtime:query-client";
  await withMolisWorkProjectCatalog({ homeDirectory: s.home }, catalog => catalog.bindRuntimeContext({ context, project_id: project.project_id, actor_id: LOCAL_PERSON_ACTOR_ID, user_confirmed: true }));
  const sdk = new Client({ name: "query-client", version: "1" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))], env: {
    ...Object.fromEntries(Object.entries(process.env).filter((row): row is [string, string] => row[1] !== undefined)),
    MOLIS_WORK_HOME: s.home, MOLIS_WORK_WEB_URL: s.origin, MOLIS_WORK_RUNTIME_ID: context.runtime_id,
    MOLIS_WORK_WORK_CONTEXT_ID: context.stable_work_context_id, MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
  }, stderr: "pipe" });
  t.after(() => sdk.close());
  await sdk.connect(transport);
  await s.grant(clientId, project.project_id, [probe.action]);
  const call = () => sdk.callTool({ name: molisWorkActionToolName(probe.action), arguments: { item_id: page.document.id } });
  assert.equal((await call()).isError, true);
  await s.grant(clientId, project.project_id, [pagesContentActions.read]);
  assert.equal((await call()).isError, true);
  await s.grant(clientId, project.project_id, [pagesActions.get]);
  const result = await call(); assert.notEqual(result.isError, true, JSON.stringify(result)); assert.match(JSON.stringify(result), /Exact delegated content/);
  assert.equal(probe.seen.at(-1)!.audience, "mcp"); assert.equal(probe.seen.at(-1)!.actor_id, clientId);
  probe.contexts.at(-1)!.services!.storage!.delete("delivered");
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  probe.behavior.before = async () => { entered.resolve(); await release.promise; };
  const pending = call();
  try { await Promise.race([entered.promise, pending.then(() => { throw new Error("Missed MCP wait"); })]); await s.revoke(clientId, project.project_id, [pagesActions.get]); }
  finally { release.resolve(); }
  assert.equal((await pending).isError, true); assert.equal(probe.contexts.at(-1)!.services!.storage!.get("delivered"), null);
});
