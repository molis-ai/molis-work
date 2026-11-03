import { ActionError, requireSynchronous, LOCAL_PERSON_ACTOR_ID, type ActionExecutionContext, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemoryExecutionControl } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, type MemoryBackendPort, type MemoryCaller } from "@molis-ai/molis-work-service-memory";

export function memoryCaller(context: ActionCallContext, work?: { work_id: string; title: string } | null): MemoryCaller {
  const consumer = context.audience === "plugin" ? "plugin" : context.audience === "mcp" ? "mcp" : context.audience === "user" ? "ui" : "agent";
  return { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: context.project_id, consumer, plugin_id: context.host_plugin?.plugin_id ?? null, work: work ?? null,
    ...(context.memory_operation_id ?? context.call_id ? { operation_id: context.memory_operation_id ?? context.call_id } : {}),
    ...(context.signal ? { signal: context.signal } : {}),
    person: context.audience === "user" && context.actor_kind !== "runtime" };
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
    requireSynchronous(context.assert_authority_current?.(), "最终授权检查必须同步完成");
  };
  return { beforeEffect: () => context.beforeEffect(), assert_current };
}

/** The ledger's methods are synchronous: their actual SQL starts under this call's final synchronous assertion. */
function controlledMemoryLedger(ledger: MemoryLedgerPort, control: AgentMemoryExecutionControl): MemoryLedgerPort {
  return new Proxy(ledger, { get(target, key) {
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
