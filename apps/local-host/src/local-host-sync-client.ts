import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, requireSynchronous, type ActionDefinition, type SyncActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { hostErrors } from "./host-errors.js";
import type { LocalHostOptions } from "./local-host-types.js";
import { normalizeReference, type ProjectLine } from "./local-host-project-line.js";
import { snapshotCaller } from "./local-host-caller.js";
import { verifiedCaller } from "./plugin-callers.js";

/** What a synchronous client asks of the Host that hands it out. */
export interface SyncClientHost<Runtime> {
  readonly actionService: ActionService;
  readonly line: ProjectLine<Runtime>;
  readonly options: Pick<LocalHostOptions<Runtime>, "actionAvailability">;
  assertRunning(): void;
}

/** Transaction-bound Plugin SDK calls only; public actions retain queued asynchronous dispatch. */
export function createSyncActionClient<Runtime>(host: SyncClientHost<Runtime>, reference: LocalHostProjectReference): SyncActionClient {
  const project = normalizeReference(reference), entry = host.line.ensureEntry(project);
  return { invokeSync: (caller, capability, input) => {
    host.assertRunning();
    if (!host.line.isReady(entry)) {
      throw hostErrors.project_closing("同步能力需要已打开且仍有效的项目运行环境");
    }
    if (caller.project_id !== project.project_id) throw new ActionError("actions.scope_mismatch", "调用上下文与项目不一致");
    if (caller.audience !== "plugin") throw new ActionError("actions.forbidden", "同步入口只接受可信插件 SDK 上下文");
    const bound = verifiedCaller(snapshotCaller(caller));
    const actions = host.actionService.discover(bound);
    const check = (reference: Pick<ActionDefinition, "capability_id" | "version" | "provider_id">, ancestors = new Set<string>()): void => {
      const action = actions.find(item => item.capability_id === reference.capability_id && item.version === reference.version);
      if (!action) throw new ActionError("actions.missing", "能力未注册或不可访问");
      if (action.action.audiences.length !== 1 || action.action.audiences[0] !== "plugin") {
        throw new ActionError("actions.async_required", "公共能力必须通过 Host 的异步调度入口执行");
      }
      if (reference.provider_id && reference.provider_id !== action.provider.provider_id) throw new ActionError("actions.provider_changed", "能力提供方已变化");
      if (!action.availability.available) throw new ActionError(action.availability.code, action.availability.reason);
      const key = `${action.capability_id}@${action.version}`;
      if (ancestors.has(key)) throw new ActionError("actions.dependency_cycle", "能力存在循环依赖");
      const state = requireSynchronous(host.options.actionAvailability?.(bound, action), "Host 可用性检查需要异步调用");
      if (state && !state.available) throw new ActionError(state.code, state.reason);
      if (action.action.required_scene) throw new ActionError("actions.async_required", "消费场景绑定需要异步检查");
      for (const dependency of action.action.required_actions ?? []) check(dependency, new Set(ancestors).add(key));
    };
    return host.actionService.invokeSync(bound, capability, input, () => check(capability));
  } };
}
