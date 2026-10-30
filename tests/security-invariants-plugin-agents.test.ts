import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import { createPluginPlatform, homeStores } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginAgentClient, PluginAgentRunInput, PluginAgentRunResult, PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { openTestHome } from "./fixtures/test-home.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { asideReply } from "./fixtures/ending-review.js";

const id = "io.molis.work.example.awaited-agent", grant = "agent:run";
const run: ActionDefinition = { capability_id: "awaited-agent.run", version: 1, operation: "command", action: {
  title: "Run", description: "Run a declared role", kind: "operation", scope: "project", audiences: ["user"], permissions: [grant, "storage:private"], subject_kinds: [], scheduling: "concurrent",
  input_schema: { type: "object" }, output_schema: { type: "object" },
} };
const serial = { ...run, capability_id: "awaited-agent.serial", action: { ...run.action, scheduling: undefined } };
const denied = { ...run, capability_id: "awaited-agent.undeclared", action: { ...run.action, permissions: ["storage:private"] } };
const query = { ...run, capability_id: "awaited-agent.query", operation: "query" as const, action: { ...run.action, kind: "query" as const } };
const input: PluginAgentRunInput = { role_id: "reader", title: "Read supplied context", task: "Return the supplied result." };

async function fixture(t: TestContext, hold = false, interaction = false) {
  let close = async () => {};
  t.after(() => close());
  const f = await openTestHome(t), project = await f.createProject("Awaited plugin Agent");
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), disconnected = Promise.withResolvers<void>();
  let requests = 0;
  const model = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString("utf8");
    const aside = asideReply(body);
    if (!aside) {
      requests++; response.on("close", () => disconnected.resolve()); started.resolve();
      if (hold) await release.promise;
    }
    if (response.destroyed) return;
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(await (interaction && !aside ? cogniaScriptedResponse({ name: "ask-user", input: { why: "确认安排", questions: [{ id: "when", prompt: "什么时候开会", options: [{ label: "今天" }, { label: "明天" }] }] } }) : cogniaModelResponse(aside ?? "Owned plugin result")).text());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { release.resolve(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address === "object");
  await seedConfiguredModels(f.home, [{ provider_id: "fixture", model_id: "fixture" }], `http://127.0.0.1:${address.port}`);
  const store = await f.host.withProject(project.reference, runtime => runtime.store);
  const ports = { db: store.db, appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event), eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const actions = { registry: f.host.actionRegistry(project.reference), client: { ...f.host.actionClient(project.reference), ...f.host.syncActionClient(project.reference) }, project_id: project.project_id };
  const platform = createPluginPlatform({ db: store.db, project_id: project.project_id, actor_id: LOCAL_PERSON_ACTOR_ID, actions,
    home: { directory: f.home, stores: homeStores(), completeText: () => null },
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  let context: PluginStartContext, borrowed: PluginAgentClient | undefined;
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, name: "Awaited Agent", version: "1.0.0", kind: "app",
    publisher: { publisher_id: "example", signature: "awaited-agent" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [grant, "storage:private"].map(permission => ({ permission, required: true, reason: "Run the declared role and store its answer" })),
    capabilities: { provides: [], consumes: [agentHostCapabilities.readSession.capability_id] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [run, serial, denied, query],
    agent: { roles: [{ role_id: "reader", version: 1, name: "Reader", workspace: interaction ? "business" : "none", execution: interaction ? "operate" : "read-only", host_tools: interaction ? ["ask-user"] : [], prompts: ["reader"] }], prompts: [{ prompt_id: "reader", version: 1 }] },
    databases: { project: { store_name: "awaited-agent", version: 1, read_permission: "storage:private", write_permission: "storage:private", schema: "CREATE TABLE awaited_agent_results (text TEXT NOT NULL);" } } },
    agent_prompts: [{ prompt_id: "reader", version: 1, layer: "role", body: "Return only a concise answer from the supplied task." }],
    async start(value) {
      context = value;
      return { kind: "app", actions: [run, serial, denied, query].map(action => ({ ...action, async handle(caller, given) {
        const result = await (borrowed ?? value.services!.agents!).run(given as PluginAgentRunInput);
        await value.services!.project_database!.transaction(caller.beforeEffect, tx => tx.run("INSERT INTO awaited_agent_results VALUES (?)", [result.text]));
        return result;
      } })) };
    },
  };
  const installed = await platform.start([{ definition, trust: { level: "host" } }]);
  assert.deepEqual(installed.failed, []); assert.ok(installed.running.includes(id));
  close = async () => { release.resolve(); await platform.closeCoordination(); for (const record of platform.runtime.list()) if (record.plugin_id === id && record.state === "running") await platform.runtime.stop(record.install_id); };
  const installation = () => platform.runtime.list().find(row => row.plugin_id === id)!;
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user", permissions: [grant, "storage:private"] };
  return { ...f, project, platform, installation, caller, get context() { return context!; }, requests: () => requests, borrow: (client: PluginAgentClient) => { borrowed = client; },
    started: started.promise, disconnected: disconnected.promise, release: () => release.resolve(),
    count: () => Number(store.db.prepare("SELECT COUNT(*) AS n FROM awaited_agent_results").get()?.n),
    invoke: (given = input, action = run, changes: Partial<ActionCallContext> = {}) => actions.client.invoke({ ...caller, ...changes }, { ...action, provider_id: id }, given) as Promise<PluginAgentRunResult>,
  };
}

test("SYS-15-A1: public plugin Agent uses its actual installation and the Home runtime, then persists its completed result", { timeout: 60_000 }, async t => {
  const f = await fixture(t), result = await f.invoke();
  assert.equal(result.text, "Owned plugin result"); assert.equal(f.count(), 1); assert.equal(f.requests(), 1);
  // Reading a session is the owning plugin's own action (R8 batch 3): the plugin reads back the session its Agent ran in.
  const session = await f.context.services!.actions!.invoke(agentHostCapabilities.readSession, [result.session]);
  assert.deepEqual(session.owner, { project_id: f.project.project_id, plugin_id: id, install_id: f.installation().install_id, actor_id: LOCAL_PERSON_ACTOR_ID });
  assert.equal(session.latest_run?.phase, "completed");
});

test("SYS-15-A2: outside, serial, read-only, undeclared and revoked calls cannot start an Agent", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  await assert.rejects(f.context.services!.agents!.run(input), { code: "actions.forbidden" });
  for (const action of [serial, query, denied]) await assert.rejects(f.invoke(input, action), { code: "actions.forbidden" });
  await assert.rejects(f.invoke({ ...input, role_id: "another-plugin-role" }), { code: "actions.forbidden" });
  await assert.rejects(f.invoke(input, run, { permissions: ["storage:private"] }));
  assert.equal(f.requests(), 0); assert.equal(f.count(), 0);
});

test("SYS-15-A2: a different project's Runtime action cannot borrow the captured Agent service", { timeout: 60_000 }, async t => {
  const a = await fixture(t), b = await fixture(t);
  b.borrow(a.context.services!.agents!);
  await assert.rejects(b.invoke(), { code: "actions.forbidden" });
  assert.equal(a.requests() + b.requests(), 0); assert.equal(a.count() + b.count(), 0);
});

for (const reason of ["cancel", "stop", "timeout"] as const) {
  test(`SYS-15-A3: ${reason} cancels the actual model request and cannot persist a late answer`, { timeout: 60_000 }, async t => {
    const f = await fixture(t, true), controller = new AbortController();
    const pending = f.invoke({ ...input, ...(reason === "timeout" ? { timeout_ms: 1500 } : {}) }, run, { signal: controller.signal });
    const refused = assert.rejects(pending);
    await f.started;
    if (reason === "cancel") controller.abort(new Error("Original action cancelled"));
    if (reason === "stop") await f.platform.runtime.stop(f.installation().install_id);
    await refused; await f.disconnected;
    f.release();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(f.count(), 0); assert.equal(f.requests(), 1);
  });
}


test("SYS-15-A3: a real Agent needing an answer is cancelled instead of keeping the scheduled caller waiting", { timeout: 60_000 }, async t => {
  const f = await fixture(t, false, true);
  await assert.rejects(f.invoke(), /需要人工处理/);
  assert.equal(f.count(), 0); assert.equal(f.requests(), 1);
});
