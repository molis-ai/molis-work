import { ActionError, requireSynchronous, LOCAL_PERSON_ACTOR_ID, type ActionExecutionContext, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemoryExecutionControl } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, type MemoryBackendPort, type MemoryCaller } from "@molis-ai/molis-work-service-memory";

export function memoryCaller(context: ActionCallContext, work?: { work_id: string; title: string } | null): MemoryCaller {
  const agent = context.actor_kind === "runtime" && context.audience !== "mcp", run = agent ? context.runtime_memory : undefined;
  if (agent && (!run || !context.runtime_session_id)) throw new ActionError("memory.unavailable", "原 Run 的记忆权限快照不可用，请新开一轮");
  if (context.memory_context_selection) {
    if (!agent || !run || !context.runtime_session_id) throw new ActionError("memory.unavailable", "记忆选择缺少当前 Run");
    context.memory_context_selection.assert_current();
  }
  const consumer = agent ? "agent" : context.audience === "plugin" ? "plugin" : context.audience === "mcp" ? "mcp" : context.audience === "user" ? "ui" : "agent";
  const session = context.memory_session;
  if (session && (agent || context.audience !== "user" || context.actor_kind === "runtime"))
    throw new ActionError("memory.forbidden", "会话管理绑定只属于本人的原业务入口");
  session?.assertCurrent();
  return { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: context.project_id, consumer, plugin_id: run?.plugin_id ?? context.host_plugin?.plugin_id ?? null, work: work ?? null,
    ...(session ? { session_id: session.session.session_id, memory_session: structuredClone({ session: session.session, current_scene: session.current_scene, target: session.target }),
      current_scene: session.current_scene, purpose: "management" as const } : {}),
    ...(context.memory_context_selection ? { context_selection: true } : {}),
    ...(run ? { session_id: context.runtime_session_id, purpose: "task" as const, current_scene: run.current_scene, class_restrictions: structuredClone(run.class_restrictions) } : {}),
    ...(context.memory_operation_id ?? context.call_id ? { operation_id: context.memory_operation_id ?? context.call_id } : {}),
    ...(context.signal ? { signal: context.signal } : {}),
    person: !agent && context.audience === "user" && context.actor_kind !== "runtime" };
}

/** The HTTP replay key protects one transport request; this identity belongs to one unchanged Memory command. */
export function memoryCommandBody(input: Record<string, unknown>): { body: Record<string, unknown>; operation_id?: string } {
  const { operation_id, ...body } = input;
  if (operation_id === undefined) return { body };
  if (typeof operation_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(operation_id)) {
    throw new ActionError("memory.invalid", "记忆操作号无效，请重新发起操作");
  }
  return { body, operation_id };
}

function memoryExecutionControl(context: ActionExecutionContext, alive: () => boolean): AgentMemoryExecutionControl {
  const assert_current = () => {
    if (!alive()) throw new ActionError("actions.expired", "原记忆服务已关闭");
    context.signal?.throwIfAborted();
    context.memory_context_selection?.assert_current();
    context.memory_session?.assertCurrent();
    requireSynchronous(context.assert_authority_current?.(), "最终授权检查必须同步完成");
  };
  return { beforeEffect: async () => { await context.beforeEffect(); await context.memory_session?.beforeEffect(); assert_current(); }, assert_current };
}

/** The ledger's methods are synchronous: their actual SQL starts under this call's final synchronous assertion. */
function controlledMemoryLedger(ledger: MemoryLedgerPort, control: AgentMemoryExecutionControl): MemoryLedgerPort {
  return new Proxy(ledger, { get(target, key) {
    if (key === "forgetting") return {
      read: () => { control.assert_current(); return target.forgetting.read(); },
      accept: (selection: Parameters<MemoryLedgerPort["forgetting"]["accept"]>[0]) => { control.assert_current(); return target.forgetting.accept(selection); },
    };
    const value: unknown = Reflect.get(target, key);
    if (typeof value !== "function") return value;
    return (...args: unknown[]) => { control.assert_current(); return Reflect.apply(value, target, args); };
  } });
}

export function memoryCallService(context: ActionExecutionContext, ports: ConstructorParameters<typeof MemoryService>[0],
  backend: (control: AgentMemoryExecutionControl) => MemoryBackendPort, alive: () => boolean): MemoryService {
  return controlledMemoryService(ports, backend, memoryExecutionControl(context, alive));
}

/** A trusted background invocation restores its own source checks, never an expired HTTP call's authority. */
export function controlledMemoryService(ports: ConstructorParameters<typeof MemoryService>[0],
  backend: (control: AgentMemoryExecutionControl) => MemoryBackendPort, control: AgentMemoryExecutionControl): MemoryService {
  return new MemoryService({ ...ports, beforeEffect: () => control.beforeEffect(), backend: backend(control), ledger: controlledMemoryLedger(ports.ledger, control) });
}
