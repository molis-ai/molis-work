import {
  WORK_PROGRESS_CONTINUITY_ROLES,
  workProgressContinuityRoleOf,
  type ActionDefinition,
  type ActionReference,
  type WorkProgressContinuityRole,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { ImError } from "../errors.js";
import type { ActionFactory, BoundActions } from "./types.js";

/** Platform actions Continuity always uses directly (independent of any project plugin). */
export const CONTINUITY_BASE_ACTIONS = [
  { capability_id: "artifacts.read", version: /* @version action.artifacts.read */ 1, provider_id: "system.artifacts" },
] as const satisfies readonly ActionReference[];

export type ContinuityRole = WorkProgressContinuityRole | "artifacts.read";

export interface ResolvedContinuityAction {
  readonly reference: ActionReference;
  readonly plugin_id: string;
}

export interface ResolvedContinuityActions {
  readonly bound: BoundActions;
  readonly roles: Partial<Record<ContinuityRole, ResolvedContinuityAction>>;
}

/**
 * Derive the Continuity action references from any plugin registry/manifest list by matching
 * `WORK_PROGRESS_CONTINUITY_PROTOCOL`, followed by `CONTINUITY_BASE_ACTIONS`.
 * Keeps the server and Host free of hardcoded plugin IDs or capability names.
 */
export function continuityActionsFrom(
  providers: readonly { readonly plugin_id: string; readonly actions?: readonly ActionDefinition[] }[],
): readonly ActionReference[] {
  const discovered: ActionReference[] = [];
  for (const role of WORK_PROGRESS_CONTINUITY_ROLES) {
    for (const provider of providers) {
      for (const action of provider.actions ?? []) {
        if (workProgressContinuityRoleOf(action.action) === role) {
          discovered.push({
            capability_id: action.capability_id,
            version: action.version,
            provider_id: provider.plugin_id,
          });
        }
      }
    }
  }
  return [...discovered, ...CONTINUITY_BASE_ACTIONS];
}

export class ContinuityActions {
  constructor(readonly factory: ActionFactory) {}
  async connect(input: Parameters<ActionFactory>[0]): Promise<ResolvedContinuityActions> {
    input.validate();
    const bound = this.factory(input);
    const views = await bound.client.discover(bound.caller);
    input.validate();
    const byProvider = new Map<string, Partial<Record<WorkProgressContinuityRole, ResolvedContinuityAction>>>();
    for (const view of views) {
      if (!view.availability.available) continue;
      const role = workProgressContinuityRoleOf(view.action);
      if (!role) continue;
      const providerId = view.provider.provider_id;
      const group = byProvider.get(providerId) ?? {};
      group[role] ??= {
        reference: { capability_id: view.capability_id, version: view.version, provider_id: providerId },
        plugin_id: view.provider.plugin_id ?? providerId,
      };
      byProvider.set(providerId, group);
    }
    const chosen = [...byProvider.values()].find(group => group["states.read"] && group["progress.record"] && group["progress.receipt"])
      ?? [...byProvider.values()].find(group => group["states.read"])
      ?? [...byProvider.values()][0]
      ?? {};
    const roles: Partial<Record<ContinuityRole, ResolvedContinuityAction>> = {
      ...chosen,
      "artifacts.read": { reference: CONTINUITY_BASE_ACTIONS[0], plugin_id: CONTINUITY_BASE_ACTIONS[0].provider_id },
    };
    return { bound, roles };
  }
  async invoke<T>(resolved: ResolvedContinuityActions, role: ContinuityRole, input: unknown): Promise<T> {
    const entry = resolved.roles[role];
    if (!entry) throw new ImError("im.continuity.progress_unavailable", "此项目尚未启用可用的工作进展插件", 503);
    const { bound } = resolved;
    const { reference } = entry;
    await bound.caller.validate_authority?.(reference);
    bound.caller.signal?.throwIfAborted();
    const result = await bound.client.invoke(bound.caller, reference, input);
    await bound.caller.validate_authority?.(reference);
    return result as T;
  }
}
