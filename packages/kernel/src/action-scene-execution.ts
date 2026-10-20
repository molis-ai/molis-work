import {
  ActionError, requireSynchronous, type ActionCallContext, type ActionReference, type ActionSceneExecutionContext,
  type ActionSceneBinding, type ActionSceneDefinition, type ActionSceneHandlerBinding,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { assertCurrentAuthority } from "./action-settlement.js";
import { validateActionValue, type ActionValidator } from "./action-schema.js";

export function assertSceneHandler(definition: ActionSceneDefinition, handler: ActionSceneHandlerBinding): void {
  const key = `${definition.scene_id}@${definition.version}`;
  if ([handler.bind, handler.bindings, handler.consume].some(value => typeof value !== "function")) {
    throw new ActionError("actions.unredeemed", `场景 ${key} 必须兑现绑定查询、保存及结果消费`);
  }
  if (handler.targets !== undefined && (!definition.configuration_permissions || typeof handler.targets !== "function")) throw new ActionError("actions.definition_invalid", `场景 ${key} 缺少配置权限合同`);
  if (handler.prepare !== undefined && typeof handler.prepare !== "function") throw new ActionError("actions.unredeemed", `场景 ${key} 的 prepare 不是函数`);
  if (handler.failed !== undefined && typeof handler.failed !== "function") throw new ActionError("actions.unredeemed", `场景 ${key} 的 failed 不是函数`);
  if (handler.prepare && !definition.event_schema) throw new ActionError("actions.definition_invalid", `场景 ${key} 的 prepare 缺少事件合同`);
}

/** The original registration is checked without re-entering the availability callback being inspected. */
export function protectSceneReads(handler: ActionSceneHandlerBinding, registered: () => void): ActionSceneHandlerBinding {
  const read = <T>(caller: ActionCallContext, handle: (context: ActionCallContext) => T | Promise<T>): T | Promise<T> => {
    let active = true;
    const check = (reference?: ActionReference, permissions?: readonly string[]) => {
      if (!active) throw new ActionError("actions.expired", "原场景回调已经结束");
      caller.signal?.throwIfAborted(); registered();
      assertCurrentAuthority(caller, reference, permissions);
      caller.signal?.throwIfAborted(); registered();
    };
    const context: ActionCallContext = { ...caller, query_only: true, retain_background_authority: undefined, assert_authority_current: check };
    try {
      check();
      const result = handle(context);
      if (result && typeof result === "object" && "then" in result) {
        return Promise.resolve(result).finally(() => { active = false; });
      }
      active = false;
      return result;
    } catch (error) { active = false; throw error; }
  };
  return { ...handler,
    bindings: caller => read(caller, context => handler.bindings(context)),
    ...(handler.targets ? { targets: (caller: ActionCallContext) => read(caller, context => handler.targets!(context)) } : {}),
    ...(handler.prepare ? { prepare: (caller: ActionCallContext, event: unknown) => read(caller, context => handler.prepare!(context, event)) } : {}),
    ...(handler.availability ? { availability: (caller: ActionCallContext) => requireSynchronous(read(caller, context => handler.availability!(context))) } : {}),
    ...(handler.configuration_availability ? { configuration_availability: (caller: ActionCallContext) =>
      requireSynchronous(read(caller, context => handler.configuration_availability!(context))) } : {}),
  };
}

/** One callback's finite authority; the consumer retains its own atomic revision checks. */
interface SceneEffect {
  reference?: ActionReference; permissions: readonly string[]; assertCurrent(): void; recheck(): Promise<void>;
}
export async function runSceneEffect<T>(caller: ActionCallContext, options: SceneEffect,
  handle: (context: ActionSceneExecutionContext) => T | Promise<T>): Promise<T> {
  let active = true;
  const check = (reference?: ActionReference, permissions: readonly string[] = []) => {
    if (!active) throw new ActionError("actions.expired", "原场景回调已经结束");
    if (caller.query_only) throw new ActionError("actions.forbidden", "只读调用不能修改场景");
    caller.signal?.throwIfAborted(); options.assertCurrent();
    assertCurrentAuthority(caller, options.reference, options.permissions);
    if (reference || permissions.length) assertCurrentAuthority(caller, reference, permissions);
    caller.signal?.throwIfAborted(); options.assertCurrent();
  };
  const context: ActionSceneExecutionContext = { ...caller, retain_background_authority: undefined, assert_authority_current: check,
    beforeEffect: async () => {
      check();
      await options.recheck();
      check();
    } };
  try { check(); return await handle(context); }
  finally { active = false; }
}

/** Success and failure consumers receive the same finite effect authority after the judgment settles. */
export async function consumeScene(context: ActionCallContext, scene: {
  handler: ActionSceneHandlerBinding; validateInput: ActionValidator; validateResult: ActionValidator;
}, binding: ActionSceneBinding, prepared: { input: unknown; state?: unknown }, effect: SceneEffect,
  invoke: () => Promise<unknown>): Promise<unknown> {
  let result: unknown;
  try {
    validateActionValue(scene.validateInput, prepared.input, "input");
    result = await invoke();
  } catch (error) {
    await effect.recheck();
    assertCurrentAuthority(context, effect.reference, effect.permissions);
    effect.assertCurrent();
    if (!scene.handler.failed) throw error;
    return runSceneEffect(context, effect, caller => scene.handler.failed!(caller, prepared.input, error, { binding: structuredClone(binding), state: prepared.state }));
  }
  await effect.recheck();
  validateActionValue(scene.validateResult, result, "output");
  assertCurrentAuthority(context, effect.reference, effect.permissions);
  effect.assertCurrent();
  return runSceneEffect(context, effect, caller => scene.handler.consume(caller, prepared.input, result, { binding: structuredClone(binding), state: prepared.state }));
}
