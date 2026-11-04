import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { LocalProjectDatabase, MolisWorkLocalHost, composeAgentHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentHostCapabilities, type AgentRunView, type AgentSessionView, type AgentRuntimeAdapter, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { callerPlugin, startPlugin, withReaderRole } from "./fixtures/plugin-callers.js";

// BL-470, RAC-667: the nested objects of a run and a session view list the fields callers read, with their types. The action
// service checks every result against the view's schema, so a nested field of the wrong shape is refused, while a field the
// schema does not list (the runtime's own record) still passes.

const provider = { provider_id: "fixture.agent-host", title: "Fixture", kind: "system" as const };
const caller: ActionCallContext = { actor_id: "alice", project_id: "project-one", audience: "user", permissions: [] };
/** The view's own contract, offered to the test's user caller instead of a plugin. */
const forUser = <I, O>(definition: ActionDefinition<I, O>): ActionDefinition<I, O> => ({ ...definition, action: { ...definition.action, audiences: ["user"] } });
const readRun = forUser(agentHostCapabilities.readRun), readSession = forUser(agentHostCapabilities.readSession);

const run = (): AgentRunView => ({
  ref: { run_id: "run-1", session_id: "session-1" }, phase: "awaiting-input", started_at: "2026-10-25T10:00:00.000Z", ended_at: null,
  frozen: { role_id: "coder", role_version: 1, execution: "workspace-write", model_id: "model-a", budget: null, directory: { canonical_path: "/work", realpath_verified: true },
    prompts: [{ prompt_id: "base", version: 2, layer: "base" }], skills: [], mcp_tools: [], host_tools: ["suggest-action"],
    text_materials: [{ material_id: "m1", source_artifact_id: "a1", source_version: 1 }], model_context: { window_tokens: 200_000, prompt_includes_cache: true } },
  turns: [{ turn_id: "t1", kind: "user", text: "Fix it", at: null, sequence: 0, steer: { id: "i1", state: "read", key: "k1" } }],
  activity: [{ call_id: "c1", name: "read_file", target: "a.ts", state: "completed", summary: "Read a.ts", at: "2026-10-25T10:00:01.000Z", output: "…", output_truncated: false }],
  usage: { tokens: { input: 1200, output: 300, cached_input: 800 }, coverage: { input: "reported", output: "reported", cached_input: "reported", cache_creation: "unknown", cost_usd: "unknown" },
    context: { tokens: 1200, coverage: "reported" } },
  awaiting_input: [{ pending_id: "p1", pending_revision: 0, kind: "clarification", prompt: "Which file?", options: [{ value: "a", label: "a.ts" }], allows_free_text: true }],
  step_board: { project_id: "project-one", version: 3, terminal: false, nodes: [{ id: "n1", state: "running", title: "Read",
    reports: [{ note: "Started", at_ms: 1, by: { kind: "handover", label: "改派" } }], owner: { kind: "subtask", label: "子任务「Read」", title: "Read", subagent_id: "s1" } }] },
  memory_recalled: { method: "pinned", injected: [{ memory_id: "mem-1", version: 1 }], omitted: [], unavailable: [] },
  todo: [{ id: "td1", text: "Read a.ts", state: "in-progress" }],
  turn_changes: [{ turn: 0, sequence: 1, at: null, files: [{ path: "a.ts", byte_length: 10, digest: "d", checkpoint_id: "cp1" }] }],
  retry_wait: { until: "2026-10-25T10:01:00.000Z", reason: "rate-limited", attempt: 2 }, model_switch: { requested: "model-b" },
  offers: [{ offer_id: "o1", title: "加入计划", summary: "Adds one step", offered_at: "2026-10-25T10:00:02.000Z", action_digest: "x",
    reference: { capability_id: "todo.add", version: 1, provider_id: "io.molis.work.todo" }, input: { title: "Read" }, missing: [{ field: "due", question: "When?" }] }],
});
const session = (latest: AgentRunView | null): AgentSessionView => ({
  owner: { project_id: "project-one", plugin_id: "coding", install_id: "coding", actor_id: "alice" }, session: { session_id: "session-1", runtime_id: "prologue" },
  title: "Fix it", runs: [{ run_id: "run-1", session_id: "session-1" }], latest_run: latest,
  queued_inputs: [{ input_id: "q1", text: "Also b.ts", source: "peer", left_by: { run_id: "run-0", applied: false } }],
});

function serviceAnswering(answer: () => unknown): ActionService {
  const service = new ActionService();
  service.registerProvider({ provider, definitions: [readRun, readSession], handlers: [
    { ...readRun, handle: () => answer() as AgentRunView },
    { ...readSession, handle: () => answer() as AgentSessionView },
  ] });
  return service;
}
const ref = [{ session_id: "session-1", runtime_id: "prologue" }, { run_id: "run-1", session_id: "session-1" }] as const;

test("RAC-667 BL-470 a full run view and its session pass, fields the schema does not list included", async () => {
  const view = run();
  // The runtime's own record carries more than callers read; an open nested object lets it through.
  Object.assign(view.activity[0]!, { runtime_extra: { nested: true } });
  Object.assign(view.usage, { provider_receipt: "r-1" });
  assert.deepEqual(await serviceAnswering(() => view).invoke(caller, readRun, [...ref]), view);
  const whole = session(view);
  assert.deepEqual(await serviceAnswering(() => whole).invoke(caller, readSession, [ref[0]]), whole);
  assert.deepEqual(await serviceAnswering(() => session(null)).invoke(caller, readSession, [ref[0]]), session(null));
});

test("RAC-667 BL-470 a nested field of the wrong shape is refused, in the run view and in the session's latest run", async () => {
  const broken: Array<[string, (view: AgentRunView) => void]> = [
    ["usage tokens are numbers", view => { (view.usage.tokens as { input: unknown }).input = "1200"; }],
    ["a turn's kind is one of four", view => { (view.turns[0] as { kind: string }).kind = "robot"; }],
    ["an activity's time is a string or null", view => { delete (view.activity[0] as { at?: unknown }).at; }],
    ["a question lists its options", view => { delete (view.awaiting_input[0] as { options?: unknown }).options; }],
    ["a step's holder has a label", view => { delete (view.step_board!.nodes[0]!.owner as { label?: string }).label; }],
    ["a report's author kind is one of five", view => { (view.step_board!.nodes[0]!.reports[0]!.by as { kind: string }).kind = "robot"; }],
    ["a frozen prompt names its layer", view => { (view.frozen.prompts[0] as { layer: string }).layer = "elsewhere"; }],
    ["a frozen budget is an object or null", view => { (view.frozen as { budget: unknown }).budget = 5; }],
    ["a frozen execution is one of four", view => { (view.frozen as { execution: unknown }).execution = { mode: "runtime" }; }],
    ["an offer names its provider", view => { delete (view.offers![0]!.reference as { provider_id?: string }).provider_id; }],
    ["a written file has its digest", view => { delete (view.turn_changes![0]!.files[0] as { digest?: string }).digest; }],
    ["a retry wait gives its reason", view => { (view.retry_wait as { reason: string }).reason = "bored"; }],
    ["a todo item's state is one of four", view => { (view.todo![0] as { state: string }).state = "later"; }],
  ];
  for (const [rule, change] of broken) {
    const view = run(); change(view);
    await assert.rejects(serviceAnswering(() => view).invoke(caller, readRun, [...ref]), { code: "actions.output_invalid" }, rule);
    await assert.rejects(serviceAnswering(() => session(view)).invoke(caller, readSession, [ref[0]]), { code: "actions.output_invalid" }, `${rule} (session)`);
  }
  const waiting = session(run());
  (waiting.queued_inputs![0] as { source: string }).source = "stranger";
  await assert.rejects(serviceAnswering(() => waiting).invoke(caller, readSession, [ref[0]]), { code: "actions.output_invalid" }, "a waiting input's source is one of three");
});

test("RAC-2922 real AgentHost registration accepts ordinary/fixed starts and refuses malformed sources before adapter.start; read/session/wait validate mixed frozen materials", async t => {
  const root = await mkdtemp(join(tmpdir(), "agent-material-schema-"));
  const localHost = new MolisWorkLocalHost({ completeText: null });
  const directory = { canonical_path: root, realpath_verified: true };
  const reference = molisWorkHostProjectReference({ databasePath: join(root, "project.db"), projectId: "project-one" });
  const composition = composeAgentHost({ localHost, workspaceFor: () => ({ ...directory, workspace_id: "work" }) });
  const store = new LocalProjectDatabase(join(root, "plugins.sqlite"));
  t.after(async () => { composition.dispose(); await localHost.close(); store.close(); await rm(root, { recursive: true, force: true }); });
  const definitions = [agentHostCapabilities.createSession, agentHostCapabilities.startRun, agentHostCapabilities.readRun, agentHostCapabilities.readSession, agentHostCapabilities.waitRun];
  const consumer = withReaderRole(callerPlugin("material-schema", "project", {}, definitions.map(definition => definition.capability_id)));
  const starts: AgentStartRequest[] = [];
  const capabilities = emptyCapabilityMatrix();
  for (const name of Object.keys(capabilities) as Array<keyof typeof capabilities>) capabilities[name] = "supported";
  let whole = session(null), view = run();
  const runtime: AgentRuntimeAdapter = {
    descriptor: { runtime_id: "material-fixture", display_name: "Materials", provider_version: "1", capabilities },
    async health() { return { ok: true, status: "ready", message: "ready" }; },
    async createSession(request) {
      whole = { ...session(null), owner: { project_id: request.project_id, plugin_id: request.plugin_id, install_id: request.install_id, actor_id: request.actor_id },
        session: { runtime_id: "material-fixture", session_id: "session-1" }, runs: [] };
      return whole.session;
    },
    async start(request) {
      starts.push(structuredClone(request));
      view = run(); view.phase = "completed"; view.ended_at = view.started_at;
      view.frozen = { ...view.frozen, directory, role_id: request.role_id, role_version: request.role!.version, execution: request.role!.execution,
        text_materials: (request.text_materials ?? []).map(({ text: _text, ...metadata }) => metadata) };
      whole.runs = [view.ref]; whole.latest_run = view;
      return { ref: view.ref, frozen: view.frozen };
    },
    async readSession() { return whole; }, async read() { return view; },
    observe(_ref, listener) { listener(view); return () => {}; }, async control() {},
  };
  composition.agentHost.register(runtime);
  await startPlugin(localHost, reference, store, consumer, { actorId: "alice" });
  const actions = consumer.actions("project-one"), agent = agentHostCapabilities;
  const runtimeId = runtime.descriptor.runtime_id;
  const own = await actions.invoke(agent.createSession, [runtimeId, { title: "Materials", directory }]);
  const input = { session: own, directory, role_id: "reader", task: "Read the attached material" };
  const plain = { material_id: "ordinary", title: "Ordinary", text: "An ordinary note" };
  const fixed = { material_id: "fixed", title: "Fixed", text: "An immutable version", source_artifact_id: "actual-fixed", source_version: 7 };
  assert.deepEqual([agent.startRun.version, agent.readRun.version, agent.readSession.version, agent.waitRun.version], [3, 4, 4, 4]);
  for (const materials of [[plain], [fixed], [plain, fixed]]) {
    await actions.invoke(agent.startRun, [runtimeId, { ...input, text_materials: materials }]);
    assert.deepEqual(starts.at(-1)!.text_materials, materials, "each legal shape actually reached adapter.start");
  }
  const entered = starts.length;
  const invalid: object[] = [
    { source_artifact_id: "actual-fixed" }, { source_version: 7 },
    ...[null, 4, "", "x".repeat(201)].map(source_artifact_id => ({ source_artifact_id, source_version: 7 })),
    ...[null, "7", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity].map(source_version => ({ source_artifact_id: "actual-fixed", source_version })),
  ];
  for (const fields of invalid) {
    await assert.rejects(actions.invoke(agent.startRun, [runtimeId, { ...input, text_materials: [{ ...plain, ...fields }] }] as never), { code: "actions.input_invalid" });
    assert.equal(starts.length, entered, "the input boundary rejected the source before adapter.start");
  }
  const expected = [{ material_id: plain.material_id, title: plain.title }, { material_id: fixed.material_id, title: fixed.title, source_artifact_id: fixed.source_artifact_id, source_version: 7 }];
  const readAll = async () => [
    (await actions.invoke(agent.readRun, [own, view.ref])).frozen.text_materials,
    (await actions.invoke(agent.readSession, [own])).latest_run!.frozen.text_materials,
    (await actions.invoke(agent.waitRun, [own, view.ref, null, 0])).view.frozen.text_materials,
  ];
  for (const materials of await readAll()) assert.deepEqual(materials, expected);
  for (const fields of invalid) {
    view.frozen.text_materials = [{ material_id: "bad", ...fields }] as AgentRunView["frozen"]["text_materials"];
    await assert.rejects(actions.invoke(agent.readRun, [own, view.ref]), { code: "actions.output_invalid" });
    await assert.rejects(actions.invoke(agent.readSession, [own]), { code: "actions.output_invalid" });
    await assert.rejects(actions.invoke(agent.waitRun, [own, view.ref, null, 0]), { code: "actions.output_invalid" });
  }
});
