import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentHostCapabilities, type AgentRunView, type AgentSessionView } from "@molis-ai/molis-work-contracts/services/agent-host";

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
