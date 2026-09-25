import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { functionsActions, publishedFunctionAction } from "@molis-ai/molis-work-module-functions";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FunctionRecord, FunctionsPrimitive, FunctionCriteria, TypeSafeProvider, TypeSafeEvaluateResult } from "@molis-ai/molis-work-contracts/modules/functions";
import { withFunctionsService, withFunctionsServiceAsync } from "../apps/local-host/src/functions-host.ts";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const caller: ActionCallContext = { actor_id: "owner", project_id: null, audience: "user", permissions: ["functions:invoke"] };
const criteria: Record<FunctionsPrimitive, FunctionCriteria> = {
  choice: [{ key: "yes", description: "符合条件" }, { key: "no", description: "不符合" }],
  noul: { true_description: "符合", false_description: "不符合" }, score: ["低", "高"],
};

function fixtureOptions(calls: { value: number }) {
  const env = { TYPESAFE_API_KEY: "fixture-provider-credential" };
  const provider: TypeSafeProvider = { async evaluate(_key, record, input): Promise<TypeSafeEvaluateResult> {
    calls.value++;
    return { primitive: record.primitive, choice: record.primitive === "choice" ? input === "uncertain" ? null : "yes" : null,
      noul: record.primitive === "noul" ? 0.8 : null, score: record.primitive === "score" ? 1 : null,
      legend: record.primitive === "score" ? ["低", "高"] : null,
      probabilities: record.primitive === "choice" ? { yes: 0.9, no: 0.1 } : {}, confidence: null, model: "jev-1.13.0" };
  } };
  return { env, provider };
}

test("published rules become versioned system actions without a project, preserve uncertainty and reflect credential changes", async () => {
  const home = await mkdtemp(join(tmpdir(), "system-functions-"));
  const calls = { value: 0 }, options = fixtureOptions(calls);
  let host = new MolisWorkLocalHost({ homeDirectory: home, functions: options });
  try {
    const client = host.homeActionClient();
    await client.discover(caller); // Source exists before publication.
    const records: FunctionRecord[] = [];
    for (const primitive of ["choice", "noul", "score"] as const) {
      const record = await withFunctionsServiceAsync(home, async service => {
        const draft = service.create({ primitive, function_key: `test_${primitive}` });
        service.updateDraft(draft.id, { instructions: "根据用户文本判断", criteria: criteria[primitive] });
        assert.ok(!(await client.discover(caller)).some(action => action.capability_id === `functions.published.${draft.function_key}`));
        await service.preview(draft.id, "preview");
        return service.publish(draft.id);
      }, options);
      records.push(record);
      const definition = publishedFunctionAction(record);
      const discovered = (await client.discover(caller)).find(action => action.capability_id === definition.capability_id)!;
      assert.equal(discovered.version, record.version);
      assert.equal(discovered.provider.kind, "system");
      const result = await client.invoke(caller, definition, { content: "judge this" }) as { primitive: string; version: number; data: unknown };
      assert.equal(result.primitive, primitive);
      assert.equal(result.version, record.version);
      assert.deepEqual(result.data, primitive === "choice" ? { choice: "yes" } : primitive === "noul" ? { noul: 0.8 } : { score: 1, legend: ["低", "高"] });
    }
    assert.deepEqual(host.status().projects, [], "system operations must not create a dummy project");
    const definition = publishedFunctionAction(records[0]!);
    const uncertain = await client.invoke(caller, definition, { content: "uncertain" }) as { status: string; data: unknown };
    assert.equal(uncertain.status, "needs_review");
    assert.deepEqual(uncertain.data, { choice: null });
    const originalProvider = options.provider.evaluate;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    options.provider.evaluate = async (key, rule, input, signal) => {
      if (input !== "cancel this") return originalProvider(key, rule, input, signal);
      assert.ok(signal, "system action must forward cancellation to the provider");
      entered();
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    };
    const historyBeforeAbort = withFunctionsService(home, service => service.listJudgments(), options);
    const controller = new AbortController();
    const pending = client.invoke({ ...caller, signal: controller.signal }, definition, { content: "cancel this" });
    const aborted = assert.rejects(pending, { name: "AbortError" });
    await started;
    controller.abort();
    await aborted;
    assert.deepEqual(withFunctionsService(home, service => service.listJudgments(), options), historyBeforeAbort);
    options.provider.evaluate = originalProvider;
    const beforeDenied = calls.value;
    await assert.rejects(client.invoke({ ...caller, permissions: [] }, definition, { content: "no grant" }), { code: "actions.forbidden" });
    await assert.rejects(client.invoke(caller, { ...definition, version: 9 }, { content: "wrong version" }), { code: "actions.missing" });
    await assert.rejects(client.invoke({ ...caller, project_id: "forged" }, definition, { content: "scope" }), { code: "actions.scope_mismatch" });
    await assert.rejects(client.invoke(caller, definition, { content: "text", project_id: "forged" }), { code: "actions.input_invalid" });
    options.env.TYPESAFE_API_KEY = "";
    const disconnected = (await client.discover(caller)).find(action => action.capability_id === definition.capability_id)!;
    assert.equal(disconnected.availability.available, false);
    await assert.rejects(client.invoke(caller, definition, { content: "no credential" }), { code: "actions.connection_required" });
    assert.equal(calls.value, beforeDenied);
    options.env.TYPESAFE_API_KEY = "fixture-provider-credential";
    const project = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), boardId: "board-a", projectId: "project-a" });
    await host.actionClient(project).invoke({ ...caller, project_id: "project-a" }, definition, { content: "project content" });
    const history = withFunctionsService(home, service => service.listJudgments(), options);
    assert.equal(history.filter(row => row.function_key === records[0]!.function_key && row.subject.board_id === "project-a").length, 1);
    await host.close();
    await assert.rejects(client.invoke(caller, definition, { content: "closed" }), { code: "host.closed" });
    host = new MolisWorkLocalHost({ homeDirectory: home, functions: options });
    assert.deepEqual(withFunctionsService(home, service => service.listJudgments(), options), history);
    assert.ok((await host.homeActionClient().discover(caller)).some(action => action.capability_id === definition.capability_id));
    await assert.rejects(withFunctionsServiceAsync(home, service => service.invokePublished(records[0]!.function_key, "pinned", { version: 9 }), options), { code: "functions.version_conflict" });
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("global HTTP published invocation uses the same system handler and separate Homes never mix definitions", async () => {
  const root = await mkdtemp(join(tmpdir(), "functions-http-"));
  const home = join(root, "a"), otherHome = join(root, "b");
  const calls = { value: 0 }, options = fixtureOptions(calls);
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions: options });
  const other = new MolisWorkLocalHost({ homeDirectory: otherHome, functions: options });
  const token = "system-functions-http-test-0123456789";
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  const external = new Client({ name: "ordinary-llm-client", version: "1" });
  try {
    const record = await withFunctionsServiceAsync(home, async service => {
      const draft = service.createChoice({ function_key: "account_a_only" });
      service.updateDraft(draft.id, { instructions: "判断输入", criteria: criteria.choice });
      await service.preview(draft.id, "publish");
      return service.publish(draft.id);
    }, options);
    const definition = publishedFunctionAction(record);
    assert.ok(!(await other.homeActionClient().discover(caller)).some(action => action.capability_id === definition.capability_id));
    await assert.rejects(other.homeActionClient().invoke(caller, definition, { content: "another account" }), { code: "actions.missing" });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const before = calls.value;
    const response = await fetch(`${origin}/api/functions/by-key/${record.function_key}/invoke`, { method: "POST",
      headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": "system-function-invoke" },
      body: JSON.stringify({ input: "via HTTP" }) });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal((await response.json()).data.choice, "yes");
    assert.equal(calls.value, before + 1, "the configured system provider ran exactly once");
    assert.deepEqual(host.status().projects, []);
    const listed = await host.homeActionClient().invoke(caller, functionsActions.list, {}) as { functions: { function_key: string }[] };
    assert.ok(listed.functions.some(row => row.function_key === record.function_key));
    const invokeView = (await host.inspectActions({ actor_id: "runtime:codex", project_id: null, audience: "mcp", permissions: [] }))
      .find(view => view.capability_id === functionsActions.invoke.capability_id)!;
    await writeMcpActionGrant(home, createMcpActionGrant("runtime:codex", null, invokeView, true));
    await external.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx",
      fileURLToPath(new URL("./fixtures/system-functions-mcp-server.ts", import.meta.url)), home], stderr: "pipe" }));
    const tools = await external.listTools();
    const directoryName = "molis_work_v1_action_functions.list__v1";
    assert.ok(tools.tools.some(tool => tool.name === directoryName));
    const directory = await external.callTool({ name: directoryName, arguments: {} });
    assert.ok((directory.structuredContent as { functions: { function_key: string }[] }).functions.some(row => row.function_key === record.function_key));
    const result = await external.callTool({ name: "molis_work_v1_functions_invoke", arguments: { function_key: record.function_key, input: "external MCP" } });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(JSON.parse((result.content as { text: string }[])[0]!.text).data.choice, "yes");
    const history = withFunctionsService(home, service => service.listJudgments(), options);
    assert.equal(history.filter(row => row.function_key === record.function_key).length, 2, "HTTP and external MCP each persist one judgment in the same Home");
  } finally {
    await external.close();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); await other.close(); await rm(root, { recursive: true, force: true });
  }
});

test("system judgments use the selected TypeSafe account and a disconnected selection never falls back to an older key", async () => {
  const { resetSecretStoreCache, runWithMolisWorkHome, createLazyFileSecretStore } = await import("@molis-ai/molis-work-storage");
  const { FUNCTIONS_CREDENTIAL_REF } = await import("@molis-ai/molis-work-contracts/modules/functions");
  const { withConnectorConnections } = await import("../apps/local-host/src/connector-connection-store.ts");
  const { bindTypeSafeConnection } = await import("../apps/local-host/src/typesafe-connection.ts");
  const home = await mkdtemp(join(tmpdir(), "functions-account-"));
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  resetSecretStoreCache();
  const calls = { value: 0 }, base = fixtureOptions(calls);
  let expected = "fixture-account-a";
  const options = { env: {}, provider: { evaluate: (key, record, input) => {
    assert.equal(key, expected, "only the selected account credential reaches the provider");
    return base.provider.evaluate(key, record, input);
  } } satisfies TypeSafeProvider };
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions: options });
  try {
    runWithMolisWorkHome(home, () => createLazyFileSecretStore(home).put(FUNCTIONS_CREDENTIAL_REF, "fixture-old-key"));
    const [first, second] = withConnectorConnections(home, store => [
      store.createToken({ serviceId: "typesafe", displayName: "Account A", token: "fixture-account-a" }),
      store.createToken({ serviceId: "typesafe", displayName: "Account B", token: "fixture-account-b" }),
    ]);
    bindTypeSafeConnection(home, "functions", first!.connection_id);
    const record = await withFunctionsServiceAsync(home, async service => {
      const draft = service.createChoice({ function_key: "selected_account" });
      service.updateDraft(draft.id, { instructions: "选择是或否", criteria: criteria.choice });
      await service.preview(draft.id, "preview");
      return service.publish(draft.id);
    }, options);
    const action = publishedFunctionAction(record), client = host.homeActionClient();
    await client.invoke(caller, action, { content: "account a" });
    bindTypeSafeConnection(home, "functions", second!.connection_id);
    expected = "fixture-account-b";
    await client.invoke(caller, action, { content: "account b" });
    assert.equal(calls.value, 3);
    withConnectorConnections(home, store => store.disconnect(second!.connection_id));
    const unavailable = (await client.discover(caller)).find(item => item.capability_id === action.capability_id)!;
    assert.equal(unavailable.availability.available, false);
    await assert.rejects(client.invoke(caller, action, { content: "revoked" }), { code: "actions.connection_required" });
    assert.equal(calls.value, 3);
  } finally {
    await host.close();
    resetSecretStoreCache();
    if (previousBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND;
    else process.env.MOLIS_WORK_SECRET_BACKEND = previousBackend;
    await rm(home, { recursive: true, force: true });
  }
});
