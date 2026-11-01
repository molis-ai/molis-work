import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { defineAction, definePlugin } from "@molis-ai/molis-work-plugin-sdk";
import {
  assertPluginActionCurrent, createPluginBackgroundClient, createPluginModelClient, MemoryPluginRuntimeRepository, PluginRuntime, type PluginModelPort,
} from "@molis-ai/molis-work-plugin-runtime";
import { ActionError, type ActionCallContext, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineInstructionPrompt, instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { pluginErrors, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * PG-047 (S-18): once a model answer is handed to a call, the platform checks it again itself, whether the plugin calls
 * `validateResult()` or not. These run the real dispatcher (`ActionService`) and Runtime; the plugin's model client and background
 * client are the Runtime's own, over a gate whose `model:invoke` grant the test can take away and a model port whose answer the
 * test can make stale. A write here is what every platform write service does first (`assertPluginActionCurrent`), and only then
 * the row; RAC-333 in `tests/plugin-model-service.test.ts` proves the same through the Host's private storage.
 */

const PLUGIN = "io.molis.work.example.heldresults";
const MODEL = "model:invoke";
const prompt = instructed(defineInstructionPrompt({ owner_id: PLUGIN, prompt_id: "probe", version: 1, title: "探针", purpose: "测试",
  used_by: ["模型结果探针"], body: "回答。" }), "数据");
const empty = { type: "object", additionalProperties: false } as const;
const idInput = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string" } } } as const;

type Step = { step: string; outcome: string };
const outcome = async (run: () => unknown): Promise<string> =>
  Promise.resolve().then(run).then(() => "ok", error => error instanceof ActionError ? error.code : String(error));

async function openProbe() {
  const state = { revoked: false, stale: false };
  const seen: Step[] = [], rows: string[] = [];
  const service = new ActionService();
  const ask = defineAction<Record<string, never>, string>({ capability_id: `${PLUGIN}.ask`, version: 1, operation: "command",
    action: { title: "ask", description: "调模型后写一行", kind: "operation", scope: "project", audiences: ["user"], permissions: [MODEL],
      scheduling: "concurrent", subject_kinds: [], input_schema: empty, output_schema: { type: "string" } } }, async () => "unused");
  const status = defineAction<{ id: string }, { state: string }>({ capability_id: `${PLUGIN}.status`, version: 1, operation: "query",
    action: { title: "status", description: "后台执行的状态", kind: "query", scope: "project", audiences: ["user"], permissions: [MODEL], subject_kinds: [],
      input_schema: idInput, output_schema: { type: "object", additionalProperties: false, required: ["state"], properties: { state: { type: "string" } } } } },
    async () => ({ state: "running" }));
  const start = defineAction<{ id: string }, { id: string; state: string }>({ capability_id: `${PLUGIN}.start`, version: 1, operation: "command",
    action: { title: "start", description: "后台调模型后写一行", kind: "operation", scope: "project", audiences: ["user"], permissions: [MODEL],
      scheduling: "concurrent", subject_kinds: [], input_schema: idInput,
      output_schema: { type: "object", additionalProperties: false, required: ["id", "state"], properties: { id: { type: "string" }, state: { type: "string" } } },
      background_job: { status: { capability_id: status.definition.capability_id, version: 1 }, id: "id", input: "id", state: "state", done: ["succeeded"], failed: ["failed"] } } },
    async () => ({ id: "unused", state: "running" }));
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: PLUGIN, version: "1.0.0", name: "模型结果探针", kind: "app",
    publisher: { publisher_id: "molis", signature: "held-results-example" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: MODEL, required: true, reason: "模型结果探针" }], capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [ask.definition, status.definition, start.definition] };
  let background: Promise<unknown> | undefined;
  const definition = definePlugin({ manifest, async start(context) {
    const gate = { install_id: context.install_id, installation_generation: context.installation_generation, assertActive() {},
      installationPermissions: manifest.permissions.map(row => row.permission), requireGrant(permission: string) {
        if (state.revoked && permission === MODEL) throw pluginErrors.grant_denied(`Plugin 没有 ${MODEL} grant`);
        context.requireGrant(permission);
      } };
    const port: PluginModelPort = { choices: () => [], availability: () => ({ available: true }), decodeJson: () => ({ ok: false }),
      async complete(_owner, _prompt, dispatch) {
        await dispatch.beforeDispatch();
        return { text: "回答", validateResult() { if (state.stale) throw new ActionError("actions.configuration_changed", "模型配置已改变"); } };
      } };
    const model = createPluginModelClient(manifest, port, gate), backgroundClient = createPluginBackgroundClient(gate).client;
    // What a platform write service does: check the running call, then write the row.
    const write = (row: string) => { assertPluginActionCurrent(gate); rows.push(row); };
    const after = async (control: Pick<ActionExecutionContext, "beforeEffect">, change: () => void) => {
      await model.complete(prompt);
      change();
      seen.push({ step: "beforeEffect", outcome: await outcome(() => control.beforeEffect()) });
      seen.push({ step: "write", outcome: await outcome(() => write("answer")) });
    };
    return { kind: "app", actions: [
      { ...ask.definition, handle: async (caller: ActionExecutionContext) => { await after(caller, () => { state.revoked = true; }); return "done"; } },
      { ...status.definition, handle: () => ({ state: "running" }) },
      { ...start.definition, handle: async (_caller: ActionExecutionContext, input: unknown) => {
        const handle = await backgroundClient.start(async control => { await after(control, () => { state.stale = true; }); return "done"; });
        background = handle.result;
        return { id: (input as { id: string }).id, state: "running" };
      } },
    ] };
  } });
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined,
    { hostIds: new Set([PLUGIN]), actions: { registry: service, project_id: "project-one", providerId: () => PLUGIN } });
  // This fixture Host ships the definition; the stable plugin-id provider requires the Host's evidence.
  const installed = runtime.install({ trust: { level: "host" }, definition, deployment: "local", grants: [MODEL] }).install;
  await runtime.start(installed.install_id);
  const caller: ActionCallContext = { actor_id: "alice", audience: "user", project_id: "project-one", permissions: [MODEL] };
  return { service, caller, ask: ask.definition, start: start.definition, seen, rows, settled: () => background };
}

test("RAC-334 PG-047 S-18 once the installation's model:invoke is taken away after the model answered, the call's beforeEffect and its next write are refused and nothing is written, though the plugin never called validateResult", async () => {
  const probe = await openProbe();
  await probe.service.invoke(probe.caller, probe.ask, {});
  assert.deepEqual(probe.seen, [{ step: "beforeEffect", outcome: "plugin.grant_denied" }, { step: "write", outcome: "plugin.grant_denied" }]);
  assert.deepEqual(probe.rows, [], "the answer of a call that lost model:invoke wrote no row");
});

test("RAC-335 PG-047 S-18 background work the call accepted holds its model answers too: once the answer goes stale, the work's own beforeEffect and its next write are refused and nothing is written", async () => {
  const probe = await openProbe();
  await probe.service.invoke(probe.caller, probe.start, { id: "one" });
  assert.equal(await probe.settled(), "done");
  assert.deepEqual(probe.seen, [
    { step: "beforeEffect", outcome: "actions.configuration_changed" },
    { step: "write", outcome: "actions.configuration_changed" },
  ]);
  assert.deepEqual(probe.rows, [], "the stale answer wrote no row from the background work");
});
