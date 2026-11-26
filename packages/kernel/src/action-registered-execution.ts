import { ActionError, requireSynchronous, type ActionCallContext, type ActionDefinition, type ActionExecutionContext,
  type ActionAvailability, type ActionHandlerBinding, type ActionProvider, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityDescriptor } from "@molis-ai/molis-work-contracts/platform/app-host";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk/execution";
import type { CapabilityRegistry } from "./index.js";
import { actionExecutionContext, assertReadOnlyEffects, prepareSubjectStateResult } from "./action-execution-context.js";
import { assertCallerProvenance } from "./action-authorship.js";
import { type ActionValidator, validateActionValue } from "./action-schema.js";
import { assertCurrentAuthority, runActionHandler } from "./action-settlement.js";
import { consumeTrustedDecision } from "./action-trusted-decision.js";
import { inDirectoryPass } from "./directory-pass.js";
import { validateActionInput } from "./version-precondition.js";

export interface ActionExecutionEffects {
  beforeEffect?(context: ActionCallContext, reference: ActionReference): void | Promise<void>;
  /** The Host's live runtime check, without yielding after the final authority check. */
  assertCurrent?(context: ActionCallContext, reference: ActionReference): void;
}

interface ExecutionRegistration {
  readonly registeredDefinition: ActionDefinition & { action_provider: ActionProvider };
  readonly handler: ActionHandlerBinding;
  readonly validateInput: ActionValidator;
  readonly validateOutput?: ActionValidator;
  readonly registry: CapabilityRegistry<ActionCallContext>;
  readonly resolve: (caller: ActionCallContext, reference: ActionReference) => HostCapabilityDescriptor | undefined;
  readonly availability: (caller: ActionCallContext) => ActionAvailability;
  readonly effects: ActionExecutionEffects;
}

/** A registered handler owns its call windows. Each invocation holds its own lifetime and exact authority. */
export function registerActionExecution({ registeredDefinition, handler, validateInput, validateOutput, registry, resolve,
  availability, effects }: ExecutionRegistration) {
  const definition = registeredDefinition;
  const provider = registeredDefinition.action_provider;
  const reference = { capability_id: definition.capability_id, version: definition.version, provider_id: provider.provider_id };
  const callWindows = new Map<string, number[]>();
  return (context: ActionCallContext, input: unknown) => {
    assertReadOnlyEffects(context, definition);
    context.signal?.throwIfAborted(); assertCallerProvenance(definition.action, context);
    validateActionInput(validateInput, definition, context, input);
    const checkDecision = definition.action.requires_trusted_decision ? consumeTrustedDecision(context, reference, input) : undefined;
    const policy = definition.action.execution;
    if (policy?.max_calls_per_minute) {
      const now = Date.now();
      for (const [key, calls] of callWindows) {
        const recent = calls.filter(at => now - at < 60_000);
        if (recent.length) callWindows.set(key, recent); else callWindows.delete(key);
      }
      const key = JSON.stringify([context.actor_id, context.project_id ?? null, context.plugin_install_id ?? null]);
      const recent = callWindows.get(key) ?? [];
      if (recent.length >= policy.max_calls_per_minute) throw new ActionError("actions.rate_limited", "这项能力一分钟内调用次数太多，请稍后再试");
      recent.push(now); callWindows.set(key, recent);
    }
    const lifetime = policy?.timeout_ms === undefined ? undefined : createExecutionLifetime({ signal: context.signal,
      timeout: { milliseconds: policy.timeout_ms, reason: new ActionError("actions.timeout", "这项能力执行超时，已停止本机等待；请检查结果后决定是否重试") } });
    const registration = registry.registrationToken(registeredDefinition);
    let executing = true;
    const assertCurrent = () => inDirectoryPass(() => {
      if (!executing) throw new ActionError("actions.expired", "原调用已经结束，不能继续产生副作用");
      lifetime?.assertActive();
      context.signal?.throwIfAborted();
      checkDecision?.check();
      if (registry.registrationToken(registeredDefinition) !== registration) throw new ActionError("actions.provider_changed", "能力已重新加载，不能继续原副作用");
      const available = availability(context);
      if (!available.available) throw new ActionError(available.code, available.reason, { kind: available.kind });
      requireSynchronous(effects.assertCurrent?.(context, reference), "最终运行环境检查必须同步完成");
    });
    // Copy the context so a concurrent/nested invocation cannot replace this call's check.
    try {
      const execution: ActionExecutionContext = { ...actionExecutionContext(context, reference,
        definition.action.permissions, assertCurrent, checkDecision?.beforeEffect ? async (caller, target) => {
          await checkDecision.beforeEffect!(); await effects.beforeEffect?.(caller, target);
        } : (caller, target) => effects.beforeEffect?.(caller, target), registry, ref => resolve(context, ref), effects.assertCurrent), ...(lifetime ? { signal: lifetime.signal } : {}) };
      checkDecision?.attach(execution);
      const checked = prepareSubjectStateResult(execution, definition, provider, input, registry, () => executing, value => checkedActionResult(definition, validateOutput, value), () => inDirectoryPass(() => {
        assertCurrentAuthority(context, reference, definition.action.permissions);
        assertCurrent();
      }));
      // The call is settled by whoever dispatched it (ActionService.invoke / invokeSync), where refusals before this point are seen too.
      const result = runActionHandler(context, execution, () => executing, () => handler.handle(execution, checkDecision ? checkDecision.input : input));
      if (handler.execution === "sync") {
        try { return checked(requireSynchronous(result)); }
        finally { executing = false; lifetime?.dispose(); }
      }
      const pending = Promise.resolve(result);
      const deliver = async (value: unknown) => {
        if (definition.operation === "query") {
          if (!executing) throw new ActionError("actions.expired", "原调用已经结束，不能继续产生副作用");
          await context.validate_authority?.(reference);
          await context.validate_permissions?.(definition.action.permissions);
        }
        return checked(value);
      };
      const settled = pending.then(deliver);
      return (lifetime ? lifetime.wait(settled) : settled).finally(() => { executing = false; lifetime?.dispose(); });
    } catch (error) { executing = false; lifetime?.dispose(); throw error; }
  };
}

function checkedActionResult(definition: ActionDefinition, validateOutput: ActionValidator | undefined, value: unknown): unknown {
  if (!validateOutput) return value;
  try { validateActionValue(validateOutput, value, "output"); }
  catch (error) {
    // An operation that returned has already committed; reporting a plain failure would invite a retry that repeats it.
    if (definition.operation === "command" && definition.action.kind === "operation" && error instanceof ActionError) throw new ActionError("actions.output_invalid_after_effect", `操作已执行，但${error.message}；请刷新后查看，不要重复操作`);
    throw error;
  }
  return value;
}
