import { projectsCapabilities, projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { defineErrorCodes, type WorkExecutorMode } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginCapabilityClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, type AgentMcpToolRef, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentSteerReceipt } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { codingExecutorActions } from "./executor-actions.js";
import type { CodingActivation } from "./route-activation.js";
import { codingActions, type CodingActionCall } from "./route-entry.js";
import { unlessMissing } from "./route-selections.js";
import { nextConfiguration } from "./run-inputs.js";
import { projectRuntime, runtimeDirectory, supports } from "./runtime-choice.js";

/** The ways a handed-over work may run: Coding's own that need nothing chosen first (collaborating and parallel writers are set up on the page). */
export const CODING_EXECUTOR_MODES: readonly WorkExecutorMode[] = [{ id: "discuss", title: "讨论" }, { id: "plan", title: "规划" }, { id: "edit", title: "修改" },
  { id: "execute", title: "执行" }, { id: "review", title: "评审" }];
const DEFAULT_MODE = "execute";
/** The rounds a read brings when the caller names no window: as many as the Assistant shows. */
const READ_WINDOW = 6;

const executorErrors = defineErrorCodes("coding", { executor_mode_unknown: "invalid", executor_unprepared: "unavailable" });

type Settings = ReturnType<typeof nextConfiguration>;
/** What `coding.read-session` answers that the protocol's session takes. */
interface SessionRead {
  session: { session_id: string; title: string; runtime_session_id?: string | null };
  runs: AgentRunView[];
  configuration: Settings | null;
  mcp_tools?: AgentMcpToolRef[];
  recovery_required?: boolean;
  error?: string;
}

const known = (mode: string) => {
  if (!CODING_EXECUTOR_MODES.some(entry => entry.id === mode)) throw executorErrors.executor_mode_unknown(`Coding 没有「${mode}」这种方式`);
};
/** The directory new rounds run in, picked as the page's directory read picks it: the project's browsing workspace, else its preferred one. */
const currentWorkspace = async (api: PluginCapabilityClient) =>
  await unlessMissing(api.invoke(projectSettingsCapabilities.browsingWorkspace, []), null) ?? await unlessMissing(api.invoke(projectsCapabilities.readWorkspace, []), null);
/** The session's next-round settings as Coding keeps them, or null when none were chosen. */
const kept = (a: CodingActivation, sessionId: string): Settings | null => {
  const saved = a.context.services?.storage?.get(`configuration:${sessionId}`);
  return typeof saved === "string" ? nextConfiguration(JSON.parse(saved)) : null;
};
/** Settings a round starts with: the session's own, in the mode given; with none, Coding's defaults (execute, the first model, the current directory). */
async function settings(call: CodingActionCall, own: Settings | null, mode?: string): Promise<Settings> {
  if (own) return mode === undefined ? own : { ...own, intent: mode };
  const model = call.execution.models.list()[0], workspace = await currentWorkspace(call.api);
  if (!model) throw executorErrors.executor_unprepared("Coding 还没有可用的模型，先在模型设置里添加");
  if (!workspace) throw executorErrors.executor_unprepared("Coding 需要先为这个项目选择工作目录：在项目设置里选择，或打开 Coding 选择");
  return { intent: mode ?? DEFAULT_MODE, provider_id: model.provider_id, model_id: model.model_id, workspace_id: workspace.workspace_id };
}
/** Saved to the session itself, so the page starts its next round the same way. */
const keep = (call: CodingActionCall, sessionId: string, configuration: Settings) =>
  call.routed("coding.update-session", { method: "PATCH", params: { sessionId }, query: {}, body: { configuration } });
/**
 * What the page sends with every round it starts besides the settings (`client.ts` startRound): the session's methods and MCP
 * choices, and writer assignments only for parallel writers. The start reads the session's other choices itself.
 */
const roundOf = (a: CodingActivation, sessionId: string, { writer_assignments, ...chosen }: Settings, task: string) => {
  const saved = (key: string) => {
    const value = a.context.services?.storage?.get(`${key}:${sessionId}`);
    return typeof value === "string" ? JSON.parse(value) as unknown : undefined;
  };
  return { ...chosen, ...(chosen.intent === "parallel" && writer_assignments ? { writer_assignments } : {}),
    methods: saved("methods"), mcp_tools: saved("mcp"), mcp_sources: saved("mcp-sources"), task };
};

/**
 * Coding's answers to the work-executor protocol (PG-036). Each role runs a route's own handler, under the role action's fence: a work the
 * Assistant hands over is a Coding session like any other, and the page and the Assistant show and control one conversation.
 */
export function codingExecutor(a: CodingActivation): void {
  const { action } = a.route;
  action(codingExecutorActions.state, async (_input, { api, beforeWrite }) => {
    const actions = codingActions(a.context, beforeWrite);
    const workspace = await currentWorkspace(api), workspaces = await unlessMissing(api.invoke(projectSettingsCapabilities.workspaces, []), []);
    const { runtime } = projectRuntime(await runtimeDirectory(actions, api));
    return { modes: [...CODING_EXECUTOR_MODES], default_mode: DEFAULT_MODE, images: false, workspace_id: workspace?.workspace_id ?? null,
      workspaces: workspaces.map(row => ({ workspace_id: row.workspace_id, path: row.canonical_path,
        name: (row.display_name || row.canonical_path.split("/").filter(Boolean).at(-1) || row.canonical_path).slice(0, 200) })),
      mcp: runtime && supports(runtime, "mcp") ? await actions.invoke(agent.listMcp, [runtime.runtime_id]) : [] };
  });
  action(codingExecutorActions["session.open"], async (input, call) => {
    if (input.mode !== undefined) known(input.mode);
    // Checked before the session exists, so a refusal leaves nothing behind.
    const chosen = input.mode === undefined ? null : await settings(call, null, input.mode);
    const { session } = await call.routed("coding.create-session", { method: "POST", params: {}, query: {}, body: input.title.trim() ? { title: input.title } : {} }) as { session: { session_id: string } };
    if (chosen) await keep(call, session.session_id, chosen);
    return { session_id: session.session_id };
  });
  action(codingExecutorActions["session.read"], async (input, call) => {
    const read = await call.routed("coding.read-session", { method: "GET", params: { sessionId: input.session_id }, query: { window: String(input.window ?? READ_WINDOW) }, body: {} }) as SessionRead;
    return { session_id: read.session.session_id, title: read.session.title, mode: read.configuration?.intent ?? null, runs: read.runs,
      runtime_session_id: read.session.runtime_session_id ?? null,
      recovery: read.recovery_required ? { message: (read.error || "这个会话的执行记录要先在 Coding 页面核对").slice(0, 2000) } : null,
      workspace_id: read.configuration?.workspace_id ?? null, mcp_tools: read.mcp_tools ?? [] };
  });
  action(codingExecutorActions["session.update"], async (input, call) => {
    known(input.mode);
    await keep(call, input.session_id, await settings(call, kept(a, input.session_id), input.mode));
    return { session_id: input.session_id, mode: input.mode };
  });
  action(codingExecutorActions["run.start"], async (input, call) => {
    const own = kept(a, input.session_id), chosen = await settings(call, own);
    const started = await call.routed("coding.start-run", { method: "POST", params: { sessionId: input.session_id }, query: {},
      body: roundOf(a, input.session_id, chosen, input.task) }) as { run: { ref: { run_id: string } } };
    // Kept once the round runs, so a refused start leaves the session as it was; settings the person chose meanwhile stay theirs.
    if (!own) {
      await call.beforeWrite();
      if (!kept(a, input.session_id)) await keep(call, input.session_id, chosen);
    }
    return { run_id: started.run.ref.run_id };
  });
  action(codingExecutorActions["run.control"], async ({ session_id, ...body }, call) => {
    const done = await call.routed("coding.control-run", { method: "POST", params: { sessionId: session_id }, query: {}, body }) as { accepted: boolean; receipt?: AgentSteerReceipt };
    // The page's answer carries more (a receipt's wording, the next round); the protocol's is whether it was taken, and a supplement's receipt.
    return { accepted: done.accepted, ...(done.receipt ? { receipt: { input_id: done.receipt.input_id, replayed: done.receipt.replayed, delivered: done.receipt.delivered } } : {}) };
  });
}
