import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TypeSafeProvider } from "@molis-ai/molis-work-contracts/modules/functions";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { functionAuthoringActions as authoring, functionsActions, openFunctionsStore, publishedFunctionAction } from "@molis-ai/molis-work-module-functions";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant, writeMcpToolPreference } from "../apps/local-host/src/mcp-settings-store.js";

const alias = "molis_work_v1_functions_invoke";

test("production judgment aliases share canonical grants, execution owner, errors and revocation before history", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "judgment-mcp-alias-"));
  let entered: (() => void) | undefined, release: (() => void) | undefined, barrier: Promise<void> | undefined;
  const evaluated: string[] = [];
  const provider: TypeSafeProvider = { async evaluate(_key, _record, input) {
    evaluated.push(input);
    if (barrier) { entered!(); await barrier; }
    return { primitive: "noul", choice: null, noul: .8, score: null, legend: null, probabilities: {}, confidence: null, model: "jev-1.13.0" };
  } };
  const env = { TYPESAFE_API_KEY: "fixture-not-a-real-key" };
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions: { env, provider } });
  const owner: ActionCallContext = { actor_id: "user", audience: "user", project_id: null, permissions: ["functions:manage", "functions:invoke"] };
  const author = bindActionClient(host.homeActionClient(), () => owner);
  const draft = (await author.invoke(authoring.create, { primitive: "noul", function_key: "alias_contract", name: "Alias contract" })).function;
  const updated = (await author.invoke(authoring.update, { id: draft.id, patch: { instructions: "Check input", criteria: { true_description: "yes", false_description: "no" } } })).function;
  const previewed = (await author.invoke(authoring.preview, { id: draft.id, input: "preview", updated_at: updated.updated_at })).function;
  const live = (await author.invoke(authoring.publish, { id: draft.id, updated_at: previewed.updated_at })).function;
  evaluated.length = 0;
  const caller: ActionCallContext = { actor_id: "runtime:alias-client", audience: "mcp", project_id: null, permissions: [] };
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const clients: Client[] = [];
  const connect = async (id: string) => {
    const client = new Client({ name: "untrusted-client-name", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx",
      fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))], env: {
        ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
        MOLIS_WORK_HOME: home, MOLIS_WORK_RUNTIME_ID: id, MOLIS_WORK_WEB_URL: origin,
      }, stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
    await client.connect(transport).catch(error => { throw new Error(String(error) + errors); });
    return client;
  };
  const history = () => { const store = openFunctionsStore(home); try { return store.listJudgments(); } finally { store.close(); } };
  try {
    const sdk = await connect("alias-client");
    const names = async () => (await sdk.listTools()).tools.map(tool => tool.name);
    const canonical = hostActionToolName(functionsActions.invoke);
    assert.equal((await names()).includes(alias), false);
    assert.equal((await sdk.callTool({ name: alias, arguments: { function_key: live.function_key, input: "denied" } })).isError, true);
    assert.deepEqual(evaluated, []);
    const catalog = await host.inspectActions(caller);
    const view = catalog.find(view => view.capability_id === functionsActions.invoke.capability_id)!;
    const grant = createMcpActionGrant(caller.actor_id, null, view, true);
    await writeMcpActionGrant(home, grant);
    assert.ok((await names()).includes(alias)); assert.ok((await names()).includes(canonical));
    env.TYPESAFE_API_KEY = "";
    assert.equal((await names()).includes(alias), false); assert.equal((await names()).includes(canonical), false);
    assert.deepEqual(evaluated, [], "discovery does not execute the judgment provider");
    env.TYPESAFE_API_KEY = "fixture-not-a-real-key";
    const input = { function_key: live.function_key, input: "old spelling" };
    const result = await sdk.callTool({ name: alias, arguments: input });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.deepEqual(evaluated, [input.input]);
    assert.equal(history().length, 1);
    const oldRecord = history()[0];
    const missing = await sdk.callTool({ name: "molis_work_v1_functions_describe", arguments: { function_key: "missing_rule" } });
    assert.equal(missing.isError, true); assert.match(JSON.stringify(missing), /functions.not_found/);
    const other = await connect("other-client");
    assert.equal((await other.listTools()).tools.some(tool => tool.name === alias || tool.name === canonical), false);
    await writeMcpToolPreference(home, { [alias]: false });
    assert.equal((await names()).includes(alias), false); assert.ok((await names()).includes(canonical));
    assert.equal((await sdk.callTool({ name: alias, arguments: input })).isError, true);
    await writeMcpToolPreference(home, {});
    for (const target of [view, catalog.find(view => view.capability_id === publishedFunctionAction(live).capability_id)!]) {
      const currentGrant = createMcpActionGrant(caller.actor_id, null, target, true);
      await writeMcpActionGrant(home, currentGrant);
      const started = new Promise<void>(resolve => { entered = resolve; });
      barrier = new Promise<void>(resolve => { release = resolve; });
      const pending = sdk.callTool({ name: target === view ? alias : hostActionToolName(target),
        arguments: target === view ? { ...input, input: "revoke during model" } : { content: "revoke exact published rule" } });
      await started; await writeMcpActionGrant(home, { ...currentGrant, enabled: false }); release!();
      const revoked = await pending; barrier = undefined;
      assert.equal(revoked.isError, true); assert.match(JSON.stringify(revoked), /mcp.action_revoked/);
      assert.deepEqual(history(), [oldRecord], "revoked model results cannot create new history or replace old history");
    }
    assert.equal((await names()).includes(alias), false); assert.equal((await names()).includes(canonical), false);
    const listView = catalog.find(view => view.capability_id === functionsActions.list.capability_id)!;
    await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, null, listView, false));
    assert.equal((await names()).includes("molis_work_v1_functions_list"), false);
    assert.equal((await names()).includes(hostActionToolName(functionsActions.list)), false);
    assert.ok((await other.listTools()).tools.some(tool => tool.name === "molis_work_v1_functions_list"));
  } finally {
    release?.(); await Promise.all(clients.map(client => client.close()));
    await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); await rm(home, { recursive: true, force: true });
  }
});
