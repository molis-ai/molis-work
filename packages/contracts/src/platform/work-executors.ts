import type { ActionAudience, ActionDefinition, ActionSchema } from "./actions.js";
import type { ActionExecutionPolicy } from "./action-execution.js";
import type { AgentMcpServerView } from "../services/agent-host-ports.js";
import type { AgentMcpToolRef } from "../services/agent-host-start.js";
import type { AgentRunView } from "../services/agent-host-run-view.js";
import type { AgentAnswerControl } from "../services/agent-interaction.js";
import { AGENT_INPUT_KEY_PATTERN, AGENT_INPUT_SOURCES, AGENT_STEER_MODES, type AgentInputSend, type AgentSteerReceipt } from "../services/agent-inputs.js";

/**
 * How a plugin takes on a work the Assistant hands it (PG-036, specs/repository-anti-corruption): one action per role below, all
 * from one provider, each with its role's input and output types. The Assistant finds an executor in the project's common
 * directory by these types, never by a list or a plugin's name, and calls it only as the local person (audience `user`), through
 * the person's own client and its checks of the installation's grants. The provider's other actions and audiences stay its own.
 */
export const WORK_EXECUTOR_ROLES = ["state", "session.open", "session.read", "session.update", "run.start", "run.control"] as const;
export type WorkExecutorRole = (typeof WORK_EXECUTOR_ROLES)[number];

/** A way the executor works a round (discuss, plan, execute…), offered by the executor and chosen per session. */
export interface WorkExecutorMode { id: string; title: string }
export interface WorkExecutorWorkspace { workspace_id: string; name: string; path: string }

/** What the executor offers now. Workspaces and MCP servers are for an executor that has them; another leaves them out. */
export interface WorkExecutorState {
  modes: WorkExecutorMode[];
  /** The mode a session works in until one is chosen. */
  default_mode: string;
  /** Whether a task may carry images. */
  images: boolean;
  /** The workspace a session without its own runs in. */
  workspace_id?: string | null;
  workspaces?: WorkExecutorWorkspace[];
  mcp?: AgentMcpServerView[];
}

export interface WorkExecutorSessionOpen { title: string; mode?: string }
export interface WorkExecutorSessionRef { session_id: string }
export interface WorkExecutorSessionReadInput { session_id: string; window?: number }
/** One session as its executor keeps it: the latest rounds, oldest first, at most `window` of them. */
export interface WorkExecutorSession {
  session_id: string;
  title: string;
  mode: string | null;
  runs: AgentRunView[];
  /** The Agent Host session its rounds run in, where their confirmations wait; null before the first round. */
  runtime_session_id: string | null;
  /** An interrupted operation the person checks on the executor's own page before anything else is sent. */
  recovery: { message: string } | null;
  workspace_id?: string | null;
  mcp_tools?: AgentMcpToolRef[];
}
export interface WorkExecutorSessionUpdate { session_id: string; mode: string }
/** A new round: the executor applies the session's own settings, else its defaults, and refuses in its own words when it cannot. */
export interface WorkExecutorRunStart { session_id: string; task: string }
export interface WorkExecutorRunStarted { run_id: string }
type RoundRef = { session_id: string; run_id: string };
export type WorkExecutorRunControl = RoundRef & ({ kind: "stop" | "pause" | "resume" } | (AgentAnswerControl & { pending_revision: number })
  | ({ kind: "steer" } & AgentInputSend) | { kind: "withdraw"; input_id: string });
export interface WorkExecutorRunControlResult { accepted: boolean; receipt?: AgentSteerReceipt }

/** Each role's input and output, for a typed call through a bound client. */
export interface WorkExecutorCalls {
  state: { input: Record<string, never>; output: WorkExecutorState };
  "session.open": { input: WorkExecutorSessionOpen; output: WorkExecutorSessionRef };
  "session.read": { input: WorkExecutorSessionReadInput; output: WorkExecutorSession };
  "session.update": { input: WorkExecutorSessionUpdate; output: WorkExecutorSessionUpdate };
  "run.start": { input: WorkExecutorRunStart; output: WorkExecutorRunStarted };
  "run.control": { input: WorkExecutorRunControl; output: WorkExecutorRunControlResult };
}

const id = { type: "string", minLength: 1, maxLength: 200 };
const words = (maxLength: number) => ({ type: "string", minLength: 1, maxLength, pattern: "\\S" });
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [{ type: "null" }, schema] });
const closed = (properties: Record<string, unknown>, required: readonly string[] = Object.keys(properties)): ActionSchema =>
  ({ type: "object", properties, required: [...required], additionalProperties: false });
const list = (items: Record<string, unknown>, maxItems = 200) => ({ type: "array", maxItems, items });
const MODE = { type: "string", minLength: 1, maxLength: 64, pattern: "^[a-z][a-z0-9_-]*$" };
const round = { session_id: id, run_id: id };
const control = (kind: string, extra: Record<string, unknown> = {}, required: readonly string[] = Object.keys(extra)) =>
  closed({ ...round, kind: { const: kind }, ...extra }, ["session_id", "run_id", "kind", ...required]);
const answer = { pending_id: words(200), pending_revision: { type: "integer", minimum: 1 } };

/** The role's fixed half of a declaration: its operation, its two types and the schemas checked against them. */
export interface WorkExecutorRoleContract {
  readonly operation: "query" | "command";
  readonly input_type: string;
  readonly output_type: string;
  readonly input_schema: ActionSchema;
  readonly output_schema: ActionSchema;
}
const role = (name: WorkExecutorRole, operation: "query" | "command", input_schema: ActionSchema, output_schema: ActionSchema): WorkExecutorRoleContract =>
  ({ operation, input_type: `molis.work-executor.${name}.input.v1`, output_type: `molis.work-executor.${name}.output.v1`, input_schema, output_schema });

/** Version 1 of each role. A new shape is a `.v2` type, and the Assistant follows in the same change (CONTRACT-CHANGES §3). */
export const WORK_EXECUTOR_PROTOCOL: Readonly<Record<WorkExecutorRole, WorkExecutorRoleContract>> = {
  state: role("state", "query", closed({}), closed({ modes: { ...list(closed({ id: MODE, title: words(40) }), 20), minItems: 1 }, default_mode: MODE, images: { type: "boolean" },
    workspace_id: nullable(id), workspaces: list(closed({ workspace_id: id, name: words(200), path: words(4096) })), mcp: list({ type: "object" }) }, ["modes", "default_mode", "images"])),
  "session.open": role("session.open", "command", closed({ title: { type: "string", maxLength: 200 }, mode: MODE }, ["title"]), closed({ session_id: id })),
  // A run is an `AgentRunView` (services/agent-host); its own fields are the Agent Host's contract, not this protocol's.
  "session.read": role("session.read", "query", closed({ session_id: id, window: { type: "integer", minimum: 1, maximum: 50 } }, ["session_id"]),
    closed({ session_id: id, title: { type: "string", maxLength: 200 }, mode: nullable(MODE), runs: list({ type: "object", required: ["ref", "phase", "turns"] }, 50),
      runtime_session_id: nullable(id), recovery: nullable(closed({ message: words(2000) })), workspace_id: nullable(id),
      mcp_tools: list({ type: "object", required: ["server", "tool"] }) }, ["session_id", "title", "mode", "runs", "runtime_session_id", "recovery"])),
  "session.update": role("session.update", "command", closed({ session_id: id, mode: MODE }), closed({ session_id: id, mode: MODE })),
  "run.start": role("run.start", "command", closed({ session_id: id, task: words(100_000) }), closed({ run_id: id })),
  // A questionnaire answer's items are the Agent Host's answer shape; the executor checks them against the question it asked.
  "run.control": role("run.control", "command", { oneOf: [
    control("answer", { ...answer, text: words(100_000) }), control("answer", { ...answer, answers: { type: "array", minItems: 1, maxItems: 10, items: { type: "object" } } }),
    control("steer", { text: words(100_000), source: { enum: [...AGENT_INPUT_SOURCES] }, key: { type: "string", pattern: AGENT_INPUT_KEY_PATTERN },
      mode: { enum: [...AGENT_STEER_MODES] }, about: words(200) }, ["text"]),
    control("withdraw", { input_id: words(200) }), control("stop"), control("pause"), control("resume"),
  ] }, closed({ accepted: { type: "boolean" }, receipt: closed({ input_id: id, replayed: { type: "boolean" }, delivered: { enum: ["run", "queued"] } }) }, ["accepted"])),
};

/** The role an action takes on by its two types, or null; one type of a role without the other is no role (the SDK refuses it). */
export function workExecutorRoleOf(action: { input_type?: string; output_type?: string }): WorkExecutorRole | null {
  return WORK_EXECUTOR_ROLES.find(name => WORK_EXECUTOR_PROTOCOL[name].input_type === action.input_type && WORK_EXECUTOR_PROTOCOL[name].output_type === action.output_type) ?? null;
}

/** What a provider says about one of its role actions; the role fixes the rest. */
export interface WorkExecutorActionOptions {
  readonly capability_id: string;
  readonly version?: number;
  readonly title: string;
  readonly description: string;
  readonly permissions: readonly string[];
  /** Who else may call it. `user` is always one: the Assistant calls as the local person. */
  readonly audiences?: readonly ActionAudience[];
  readonly subject_kinds?: readonly string[];
  readonly scheduling?: "concurrent";
  readonly execution?: ActionExecutionPolicy;
}

/** One role action, scoped to the project, with the role's operation, types and schemas filled in. */
export function defineWorkExecutorAction<R extends WorkExecutorRole>(name: R, options: WorkExecutorActionOptions): ActionDefinition<WorkExecutorCalls[R]["input"], WorkExecutorCalls[R]["output"]> {
  const { operation, ...contract } = WORK_EXECUTOR_PROTOCOL[name];
  return { capability_id: options.capability_id, version: options.version ?? 1, operation, action: { title: options.title, description: options.description,
    kind: operation === "query" ? "query" : "operation", scope: "project", audiences: [...new Set<ActionAudience>(["user", ...options.audiences ?? []])],
    permissions: [...options.permissions], subject_kinds: [...options.subject_kinds ?? []], ...(options.scheduling ? { scheduling: options.scheduling } : {}),
    ...(options.execution ? { execution: options.execution } : {}), ...contract } };
}

/** The whole set at once, so a provider cannot publish half an executor. */
export function defineWorkExecutorActions(options: Readonly<Record<WorkExecutorRole, WorkExecutorActionOptions>>): { readonly [R in WorkExecutorRole]: ActionDefinition<WorkExecutorCalls[R]["input"], WorkExecutorCalls[R]["output"]> } {
  return Object.fromEntries(WORK_EXECUTOR_ROLES.map(name => [name, defineWorkExecutorAction(name, options[name])])) as { [R in WorkExecutorRole]: ActionDefinition<WorkExecutorCalls[R]["input"], WorkExecutorCalls[R]["output"]> };
}
