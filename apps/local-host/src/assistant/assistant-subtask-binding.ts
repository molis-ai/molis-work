import { isTerminalAgentPhase, type AgentRuntimeAdapter, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentWorkNode } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import type { AssistantSubtaskBinding } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import { assistantErrors } from "./assistant-errors.js";

/** Re-read at every effect boundary. A take-back revokes this qualification before it waits on stopping the Run. */
export function assertSubtaskWork(store: AssistantStore, actor: string, binding: AssistantSubtaskBinding): StoredWork {
  if (!binding || typeof binding.work_id !== "string" || typeof binding.parent_work_id !== "string"
    || !binding.run || typeof binding.run.run_id !== "string" || typeof binding.run.session_id !== "string") throw assistantErrors.invalid("子任务执行引用不完整");
  const work = store.get(actor, binding.work_id), parent = store.get(actor, binding.parent_work_id);
  const own = work.delegated_by;
  if (!own || own.taken_back_at || work.archived || parent.archived || own.graph_id !== binding.graph_id || own.node_id !== binding.node_id
    || parent.graph_id !== own.graph_id || parent.delegated_by) throw assistantErrors.stale("原子任务已收回或归属已改变，请回到父任务查看");
  if (work.executor.kind !== binding.executor?.kind || (work.executor.kind === "plugin"
    ? binding.executor.kind !== "plugin" || work.executor.plugin_id !== binding.executor.plugin_id || !work.executor.session_id || work.executor.session_id !== binding.executor_session_id
    : work.session_id !== binding.run.session_id || binding.executor_session_id !== undefined)) throw assistantErrors.stale("原子任务的执行者或会话已改变，未改投其他任务");
  return work;
}

export function assertSubtaskRun(binding: AssistantSubtaskBinding, latest: Pick<AgentRunView, "ref" | "phase"> | null | undefined, operation?: "send" | "continue"): void {
  if (!latest || latest.ref.session_id !== binding.run.session_id || latest.ref.run_id !== binding.run.run_id) throw assistantErrors.stale("原子任务执行已改变，请读取后再操作");
  if (operation === "send" && isTerminalAgentPhase(latest.phase)) throw assistantErrors.stale("原执行已经结束，请明确继续此子任务");
  if (operation === "continue" && (!isTerminalAgentPhase(latest.phase) || latest.phase === "reconcile-required")) throw assistantErrors.stale("这次执行还不能继续，请先处理原运行或核对结果");
}

/** Stored Work references locate the original graph; the graph's current assignee is still its own fact. */
export async function assertSubtaskGraph(adapter: AgentRuntimeAdapter, work: StoredWork, parent: StoredWork): Promise<void> {
  const own = work.delegated_by, graphs = adapter.collaboration?.works;
  if (!own || !graphs) throw assistantErrors.scope("原子任务归属不可核对");
  assertSubtaskNodes(await graphs.read(own.graph_id), work, parent);
}

export function assertSubtaskNodes(nodes: readonly AgentWorkNode[], work: StoredWork, parent: StoredWork): void {
  const own = work.delegated_by;
  if (!own) throw assistantErrors.scope("原子任务归属不可核对");
  const root = nodes.find(node => node.node_id === "work"), child = nodes.find(node => node.node_id === own.node_id);
  if (!root || root.parent || root.session_id !== parent.session_id || child?.parent !== root.node_id || child.session_id !== work.session_id)
    throw assistantErrors.stale("原子任务的图节点或会话归属已改变");
}
