import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginAgentClient, PluginAgentRunInput, PluginAgentRunResult, PluginInstanceRecord, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { isTerminalAgentPhase, type AgentRunHandle, type AgentRunView, type AgentRuntimeAdapter, type AgentWorkspace } from "@molis-ai/molis-work-contracts/services/agent-host";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, inPluginInstance, markPluginActionChecked, pluginInvocationReadOnly } from "@molis-ai/molis-work-plugin-runtime";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";
import { PROLOGUE_RUNTIME_ID } from "@molis-ai/molis-work-service-agent-host";
import type { AgentHostComposition } from "./agent-host-composition.js";
import { pluginAgentRuntime, type PluginPlatformHome } from "./home-side.js";
import { hostLog } from "./host-log.js";
import { AGENT_RUN_PERMISSION } from "./plugin-service-permissions.js";

const permission = AGENT_RUN_PERMISSION;

/** A run belongs to its invocation, including cancellation; only this service retains its cleanup handle. */
export function pluginAgentsFor(home: PluginPlatformHome | null | undefined, manifest: PluginManifest, context: PluginStartContext,
  caller: HostPluginCaller, record: () => PluginInstanceRecord | null) {
  if (!home || !manifest.permissions.some(item => item.permission === permission)) return undefined;
  const generation = record()?.installation_generation, controllers = new Set<AbortController>();
  let active = true;
  const client = Object.freeze<PluginAgentClient>({
    async run(given) {
      const input = structuredClone(given), scope = currentPluginInvocation();
      if (!scope || !inPluginInstance(scope, context) || scope.caller.project_id !== caller.project_id || pluginInvocationReadOnly(scope)
        || "scene" in scope || "job" in scope && !scope.caller.permissions.includes(permission) || "definition" in scope && (scope.definition.operation !== "command" || scope.definition.action.scheduling !== "concurrent" || !scope.definition.action.permissions.includes(permission))) {
        throw new ActionError("actions.forbidden", "Agent 必须由本插件声明权限的并行动作或后台作业启动");
      }
      const role = manifest.agent?.roles.find(item => item.role_id === input.role_id);
      if (!role) throw new ActionError("actions.forbidden", "插件没有声明这个 Agent 角色");
      if (typeof input.task !== "string" || !input.task.trim() || input.task.length > 200_000 || typeof input.title !== "string" || !input.title.trim() || input.title.length > 240
        || input.workspace_id !== undefined && (typeof input.workspace_id !== "string" || !input.workspace_id)
        || input.timeout_ms !== undefined && (!Number.isSafeInteger(input.timeout_ms) || input.timeout_ms <= 0 || input.timeout_ms > 600_000)) {
        throw new ActionError("actions.input_invalid", "Agent 任务、标题、工作区或时限无效");
      }
      const check = () => {
        caller.assertActive(); context.requireGrant(permission);
        const current = record();
        if (!active || !generation || !current || current.installation_generation !== generation || current.state !== "running" || !current.grants.includes(permission)) {
          throw new ActionError("actions.forbidden", "Agent 所属的插件安装已经停止或撤权");
        }
        assertCapturedPluginActionCurrent(scope, context);
      };
      check();
      const controller = new AbortController(); controllers.add(controller);
      const lifetime = createExecutionLifetime({ signal: scope.caller.signal ? AbortSignal.any([scope.caller.signal, controller.signal]) : controller.signal,
        timeout: { milliseconds: input.timeout_ms ?? 600_000, reason: new ActionError("actions.timeout", "后台 Agent 执行超时") }, monitor: { intervalMs: 100, check } });
      const assertCurrent = () => { lifetime.assertActive(); check(); };
      const beforeEffect = async () => {
        assertCurrent();
        if ("definition" in scope) await scope.caller.beforeEffect(); else await scope.caller.validate_permissions?.([permission]);
        assertCurrent(); markPluginActionChecked(scope);
      };
      try {
        const runtime = pluginAgentRuntime(home);
        if (!runtime) throw new ActionError("actions.connection_required", "此 Home 的 Agent 服务尚未接通");
        await beforeEffect(); await lifetime.wait(runtime.ready); assertCurrent();
        const prepared = await lifetime.wait(runtime.preparePlugin(caller)); assertCurrent();
        let workspace: AgentWorkspace;
        if (role.workspace === "none" || role.workspace === "business") {
          if (input.workspace_id !== undefined) throw new ActionError("actions.input_invalid", "此角色不接收工作区");
          workspace = { workspace: role.workspace };
        } else {
          const chosen = input.workspace_id ? prepared.workspaces.find(item => item.workspace_id === input.workspace_id) : prepared.workspaces[0];
          if (!chosen?.realpath_verified) throw new ActionError("actions.forbidden", "这个项目没有授权的工作区");
          workspace = { directory: { canonical_path: chosen.canonical_path, realpath_verified: true } };
        }
        return await runPreparedAgent(runtime, caller, input, workspace, { ...prepared.authority, beforeStart: beforeEffect, assertBeforeStart: assertCurrent, beforeDispatch: beforeEffect }, lifetime.signal, assertCurrent);
      } finally { controllers.delete(controller); lifetime.dispose(); }
    },
  });
  return { client, dispose() { active = false; for (const controller of controllers) controller.abort(new ActionError("actions.forbidden", "插件已停止")); controllers.clear(); } };
}

async function runPreparedAgent(runtime: AgentHostComposition, caller: HostPluginCaller, input: PluginAgentRunInput, workspace: AgentWorkspace,
  authority: Awaited<ReturnType<AgentHostComposition["preparePlugin"]>>["authority"], signal: AbortSignal, check: () => void): Promise<PluginAgentRunResult> {
  const adapter = runtime.agentHost.adapter(PROLOGUE_RUNTIME_ID);
  const owner = { project_id: caller.project_id!, plugin_id: caller.plugin_id, install_id: caller.install_id, actor_id: caller.actor_id, role_id: input.role_id, ...workspace };
  const effect = <T>(operation: () => Promise<T>) => adapter.withEffect ? adapter.withEffect({ beforeEffect: async () => { await authority.beforeStart?.(); }, assert_current: check }, operation) : operation();
  let handle: AgentRunHandle | undefined, completed = false;
  try {
    const session = await effect(() => runtime.agentHost.createSession(PROLOGUE_RUNTIME_ID, { ...owner, title: input.title }, authority));
    check();
    handle = await effect(() => runtime.agentHost.start(PROLOGUE_RUNTIME_ID, { ...owner, session, task: input.task }, authority));
    check();
    const view = await awaitAgentResult(adapter, handle, signal, check);
    check();
    completed = isTerminalAgentPhase(view.phase);
    if (view.phase !== "completed") throw new ActionError("actions.execution_failed", view.stop_reason || `Agent 以 ${view.phase} 结束`);
    const text = [...view.turns].reverse().find(turn => turn.kind === "assistant")?.text;
    if (!text?.trim()) throw new ActionError("actions.output_invalid", "Agent 没有写出正文");
    return { session, run: handle.ref, text };
  } finally {
    // Cleanup controls only the handle created above. Revocation cannot prevent stopping that run.
    if (handle && !completed) await adapter.control(handle.ref, { kind: "cancel" }).catch(error => { hostLog.warn("plugin", "agent_cancel_failed", error); });
  }
}

function awaitAgentResult(adapter: AgentRuntimeAdapter, handle: AgentRunHandle, signal: AbortSignal, check: () => void): Promise<AgentRunView> {
  return new Promise((resolve, reject) => {
    let settled = false, stop = () => {};
    const finish = (outcome: () => void) => { if (settled) return; settled = true; signal.removeEventListener("abort", abort); queueMicrotask(stop); outcome(); };
    const abort = () => finish(() => reject(signal.reason));
    signal.addEventListener("abort", abort, { once: true });
    try {
      check();
      stop = adapter.observe(handle.ref, view => {
        if (settled) return;
        try {
          check();
          if (view.phase === "awaiting-input" || view.phase === "awaiting-review") throw new ActionError("actions.execution_failed", "后台 Agent 需要人工处理，已取消本次执行");
          if (isTerminalAgentPhase(view.phase)) finish(() => resolve(view));
        } catch (error) { finish(() => reject(error)); }
      });
      if (settled) stop();
    } catch (error) { finish(() => reject(error)); }
  });
}
