import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import {
  assistantServiceFor, captureHostLog, closeAssistantService, ensureSystemAgentService, MolisWorkLocalHost,
  type AssistantHttpPorts, type HostLogEntry,
} from "@molis-ai/molis-work-app-local-host";
import { withCallId } from "@molis-ai/molis-work-kernel";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

const CALL_ID = "751e9090-0000-4000-9000-000000000116";
const PRIVATE_TEXT = "以后每次整理都先列风险，RAC116 PRIVATE PROMPT";
const PRIVATE_URL = "https://private.invalid/rac116";
const PRIVATE_CREDENTIAL = "RAC116 PRIVATE CREDENTIAL";
const privateFailure = () => Object.assign(new Error(`${PRIVATE_TEXT} ${PRIVATE_URL} ${PRIVATE_CREDENTIAL}`), { code: "EIO" });

async function until<T>(read: () => T | Promise<T>, done: (value: T) => boolean, label: string): Promise<T> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function fixture(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "assistant-http-logging-"));
  const local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const agents = ensureSystemAgentService(local, home);
  const entries: HostLogEntry[] = [], warnings: unknown[][] = [];
  const restoreLog = captureHostLog(entries);
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  t.after(async () => {
    restoreLog(); closeAssistantService(local);
    await local.close();
    await rm(home, { recursive: true, force: true });
  });
  const ports: AssistantHttpPorts = { localHost: local, homeDirectory: home, agentHost: agents.agentHost,
    agentReady: async () => {}, projectTitle: async () => null, pages: async () => [] };
  return { home, local, agents, ports, entries, warnings };
}

function warning(entries: HostLogEntry[], area: string, event: string, failure: Error) {
  const found = entries.filter(entry => entry.area === area && entry.event === event);
  assert.equal(found.length, 1, "the actual failure path writes one structured warning");
  const { at, ...entry } = found[0]!;
  assert.ok(!Number.isNaN(Date.parse(at)));
  assert.deepEqual(entry, { level: "warn", area, event, call_id: CALL_ID, error: { name: "Error", code: "EIO" } });
  const written = JSON.stringify(found);
  for (const value of [PRIVATE_TEXT, PRIVATE_URL, PRIVATE_CREDENTIAL, failure.message, failure.stack!]) {
    assert.equal(written.includes(value), false, "private input and original error details must not enter the log");
  }
}

async function modelServer(t: TestContext, gate: () => Promise<void>) {
  const server = createServer((request, response) => {
    request.resume();
    void gate().then(async () => {
      const reply = cogniaModelResponse("整理完成。");
      response.writeHead(200, Object.fromEntries(reply.headers));
      response.end(await reply.text());
    }).catch((error: unknown) => response.destroy(error instanceof Error ? error : undefined));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}/v1/messages`;
}

// A detached callback has no current call after its owner ends; keep this operation open through the observed refusal.
test("RAC-116: learning enqueue refusal stays observable and private while the completed work and next explicit round keep their behavior", { timeout: 60_000 }, async t => withCallId(CALL_ID, async () => {
  const f = await fixture(t);
  // Public composition ports use an owned real SDK, without starting another Home runtime or calling an external model.
  t.mock.getter(f.agents, "ready", () => Promise.resolve());
  let modelGate = Promise.resolve(), finishModel = () => {};
  const endpoint = await modelServer(t, () => modelGate);
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-log-test", appVersion: "1.0.0" }, storageRoot: join(f.home, "sdk"),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint, model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  f.agents.agentHost.register(adapter);
  try {
    const schedule = adapter.schedule; assert.ok(schedule);
    const enqueue = schedule.enqueue.bind(schedule), attempts: Array<Parameters<typeof enqueue>[0]> = [];
    const failure = privateFailure(); let refuse = true;
    t.mock.method(schedule, "enqueue", async (input: Parameters<typeof enqueue>[0]) => {
      if (input.kind === "memory.learn") { attempts.push(input); if (refuse) throw failure; }
      return enqueue(input);
    });
    const { service, store } = assistantServiceFor(f.ports);
    const round = async (text: string) => {
      modelGate = new Promise<void>(resolve => { finishModel = resolve; });
      const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: ASSISTANT_PERSONAL_OWNER, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_PLUGIN_ID };
      const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "assistant", title: text });
      const work = store.create({ actor_id: LOCAL_PERSON_ACTOR_ID, title: text, scope: { kind: "personal" }, origin: null });
      store.update(LOCAL_PERSON_ACTOR_ID, work.work_id, null, { session_id: session.session_id });
      const run = await adapter.start({ ...owner, session, task: text, workspace: "none", role_id: "assistant",
        role: { role_id: "assistant", workspace: "none", version: 1, execution: "read-only", prompts: [], host_tools: [] } });
      store.addRound(work.work_id, { run_id: run.ref.run_id, text, materials: [], context: null, started_at: new Date().toISOString() });
      await until(async () => (await service.list()).find(item => item.work_id === work.work_id)?.state, state => state === "running", "real work running before completion");
      finishModel();
      await until(async () => (await adapter.read(run.ref)).phase, phase => phase === "completed", "real SDK round completion");
      const completed = await withCallId(CALL_ID, () => service.list());
      assert.equal(completed.find(item => item.work_id === work.work_id)?.state, "completed");
      return { work, run, session, key: `memory-learn:${work.work_id}:${run.ref.run_id}` };
    };
    const first = await round(PRIVATE_TEXT);
    await until(() => attempts.length, count => count === 1, "the production Memory Host's enqueue refusal");
    await until(() => f.entries.some(entry => entry.event === "learning_not_queued"), Boolean, "structured learning enqueue warning");
    warning(f.entries, "memory", "learning_not_queued", failure);
    assert.deepEqual(f.warnings, [], "the old console must not print the raw error");
    assert.equal(Boolean(schedule.find(first.key)), false, "a refused enqueue creates no task");
    await service.list(); await service.list();
    assert.equal(attempts.length, 1, "observing a completed work does not automatically retry its rejected enqueue");
    assert.equal((await service.read(first.work.work_id)).work.state, "completed");
    refuse = false;
    const second = await round(`${PRIVATE_TEXT}，第二次明确整理`);
    await until(() => schedule.find(second.key), Boolean, "next explicit round's real queued task");
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[1]!.payload, { actor_id: LOCAL_PERSON_ACTOR_ID, work_id: second.work.work_id, run_id: second.run.ref.run_id,
      session_id: second.session.session_id, sources: [{ run_id: second.run.ref.run_id, input_id: null, version: "1" }] });
    assert.equal(Boolean(schedule.find(first.key)), false);
    assert.equal(f.entries.filter(entry => entry.event === "learning_not_queued").length, 1);
    assert.deepEqual(f.warnings, []);
  } finally { finishModel(); await adapter.close(); }
}));

test("RAC-116: rule action registration refusal logs once, keeps the cached service usable and a fresh registration can succeed", async t => {
  const f = await fixture(t), registry = f.local.actionRegistry();
  const register = registry.registerProvider.bind(registry), failure = privateFailure();
  let attempts = 0;
  const rejected = t.mock.method(f.local, "actionRegistry", () => ({
    registerProvider: (input: Parameters<typeof register>[0]) => {
      if (input.definitions.some(definition => definition.capability_id === "assistant.rules.list")) { attempts++; throw failure; }
      return register(input);
    },
  }));
  const entry = await withCallId(CALL_ID, () => assistantServiceFor(f.ports));
  assert.equal(attempts, 1);
  assert.deepEqual(await entry.service.list(), []);
  assert.equal(assistantServiceFor(f.ports), entry, "the same service is cached despite failed registration");
  assert.equal(attempts, 1, "reading the cached service does not register again");
  warning(f.entries, "assistant", "rule_actions_registration_failed", failure);
  assert.deepEqual(f.warnings, []);
  rejected.mock.restore();
  closeAssistantService(f.local);
  const fresh = assistantServiceFor(f.ports);
  assert.notEqual(fresh, entry);
  assert.deepEqual(await fresh.service.list(), []);
  const views = await f.local.homeActionClient().discover({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: ["assistant:read"] });
  assert.ok(views.some(view => view.capability_id === "assistant.rules.list"), "the next fresh service registers its real rule actions");
  assert.equal(f.entries.filter(item => item.event === "rule_actions_registration_failed").length, 1);
  assert.deepEqual(f.warnings, []);
});
