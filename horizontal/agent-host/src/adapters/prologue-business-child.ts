import type { ExactRef } from "@prologue/sdk";
import { agentErrors } from "../errors.js";
import { roundGateway } from "./prologue-round-gateway.js";
import { businessChildTools } from "./prologue-action-gateway.js";
import { packToDynamicTools } from "./prologue-action-tools.js";
import { prologueToolName } from "./prologue-node-kit.js";
import { ensureStopGuard } from "./prologue-stop-guard.js";
import type { PrologueStartInput } from "./prologue-ports.js";
import type { PrologueWorkDelegation } from "./prologue-work-delegation.js";
import type { RunDeps } from "./prologue-run.js";

/** Bind the actual child Session's business tools before its first model dispatch. */
export async function bindBusinessSubagent(deps: Pick<RunDeps, "runtime" | "state" | "options">, ref: ExactRef<"session">,
  role: NonNullable<PrologueStartInput["subagents"]>[number], gateway: NonNullable<PrologueStartInput["action_gateway"]>, requested: readonly string[], authority: { assertCurrent(): void; stopping(): boolean; work?: PrologueWorkDelegation }) {
  const parts = roundGateway(deps, { session_id: ref.id, action_gateway: gateway,
    assertBeforeDispatch: authority.assertCurrent, character: { id: role.role_id, version: role.version, tools: role.host_tools, name: role.name, instructions: "" } }, false, authority.stopping, authority.work, undefined);
  const tools = parts.actionTools;
  if (!tools) throw agentErrors.capability_unavailable("业务子任务缺少动作工具绑定");
  // The SDK grants these two for the child's assigned step, independently of the Character's own tool declaration.
  const allowed = [...role.host_tools.map(prologueToolName), ...businessChildTools(tools.names, role.execution), "board-read", "board-report"];
  if (requested.some(tool => !allowed.includes(tool))) throw agentErrors.role_execution_exceeded("子任务请求了当前未授权的业务工具");
  const session = await deps.runtime.sessions.open(ref, { tools: packToDynamicTools(tools.pack, tools.executors, parts.parameterBranches) });
  if (!session) throw agentErrors.session_unknown("业务子会话不存在");
  deps.state.sessions.set(ref.id, ref);
  deps.state.actionToolSessions.add(ref.id);
  deps.state.childActionControllers.get(ref.id)?.abort();
  deps.state.childActionControllers.set(ref.id, parts.actionController);
  ensureStopGuard(deps.runtime, deps.state, ref.id);
  deps.state.stopGuards.set(ref.id, { writing: role.execution === "operate", business: true, reader: "work", task: "", materials: [],
    signal: parts.actionController.signal, runs: new Map() });
}
