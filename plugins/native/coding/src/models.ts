import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";

/** A model the person can pick for a round, as the page lists it. */
export interface CodingModelChoice { provider_id: string; model_id: string; label: string;
  /** The person marked this model as taking a reasoning effort; only then is one offered and sent. */
  reasoning_effort?: boolean }

/** Why the chosen model cannot run now, in the words the page shows. */
export const MODEL_UNAVAILABLE = "所选模型不可用，请在全局模型设置中检查配置";

/**
 * The models Coding offers, and whether one can run now: both come from `services.model` (PG-047), which holds the one list the
 * platform keeps for every plugin, so Coding has no list of its own to disagree with it (V-13). Coding declares `model:read` and
 * not `model:invoke`: it lists and checks models for the Agent runtime, which makes the call itself, and `complete()` stays
 * unavailable to it. A Host with no Home lends no model service; the list is then empty and no model can be chosen.
 */
export function codingModels(context: PluginStartContext) {
  const service = () => context.services?.model;
  return {
    list: (): readonly CodingModelChoice[] => (service()?.choices() ?? []).map(({ provider_id, model_id, label, reasoning_effort }) =>
      ({ provider_id, model_id, label, reasoning_effort })),
    /** The reason this model cannot run now (it is not configured, or its connection is gone), or undefined when it can. */
    unavailable: (selection: { provider_id: string; model_id: string }): string | undefined => {
      const state = service()?.availability(selection);
      if (state?.available) return undefined;
      return state && "reason" in state && state.reason ? `${MODEL_UNAVAILABLE}（${state.reason}）` : MODEL_UNAVAILABLE;
    },
  };
}
