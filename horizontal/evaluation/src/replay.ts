import {
  retainActionAuthority,
  type ActionCallContext,
  type ActionClient,
  type ActionReference,
  type ActionView,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  EvaluationReplayReceipt,
  EvaluationSampleView,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import { evaluationErrors } from "./errors.js";

export interface EvaluationReplayContext {
  readonly replayId: string;
  readonly sample: EvaluationSampleView;
  readonly caller: ActionCallContext;
  readonly client: ActionClient;
}

export type EvaluationReplayScenario = (context: EvaluationReplayContext) => Promise<void>;

const EXTERNAL_CAPABILITY_PATTERNS = [
  /^connectors\./u,
  /\.send(?:\.|$)/u,
  /\.publish(?:\.|$)/u,
  /\.dispatch_external(?:\.|$)/u,
  /\.webhook(?:\.|$)/u,
  /^mail\.send/u,
  /^slack\.post/u,
];

function isExternalEffectCapability(capabilityId: string, view: ActionView | undefined): string | null {
  if (view) {
    if (view.provider.kind === "mcp" && view.action.effect === "write") {
      return "isolated_replay_blocks_external_mcp_write";
    }
    if (
      view.action.effect === "write"
      && view.action.permissions.some((perm) => perm.startsWith("network.") || perm.startsWith("connector."))
    ) {
      return "isolated_replay_blocks_external_permissioned_write";
    }
    if (view.action.effect === "read" && capabilityId.startsWith("connectors.")) {
      return null;
    }
  }
  for (const pattern of EXTERNAL_CAPABILITY_PATTERNS) {
    if (pattern.test(capabilityId)) {
      return "isolated_replay_blocks_external_capability";
    }
  }
  return null;
}

export async function executeIsolatedReplay(options: {
  readonly replayId: string;
  readonly scenario: EvaluationReplayScenario;
  readonly sample: EvaluationSampleView;
  readonly caller: ActionCallContext;
  readonly origin: ActionReference;
  readonly baseClient: ActionClient;
  readonly runInReplayScope: <T>(fn: () => Promise<T>) => Promise<T>;
}): Promise<{
  readonly blockedExternalEffects: EvaluationReplayReceipt["blocked_external_effects"];
}> {
  const blocked: { readonly capability_id: string; readonly reason: string }[] = [];
  const retainedCaller = retainActionAuthority(options.caller, options.origin);
  let cachedDirectory: readonly ActionView[] | undefined;

  const lookupView = async (ctx: ActionCallContext, ref: ActionReference): Promise<ActionView | undefined> => {
    if (!cachedDirectory) {
      cachedDirectory = await options.baseClient.discover(ctx);
    }
    return cachedDirectory.find(
      (item) => item.capability_id === ref.capability_id
        && item.version === ref.version
        && (!ref.provider_id || item.provider.provider_id === ref.provider_id),
    );
  };

  const guardedClient: ActionClient = {
    discover: (ctx) => options.baseClient.discover(ctx),
    invoke: async (ctx, action, input) => {
      const view = await lookupView(ctx, action);
      const blockReason = isExternalEffectCapability(action.capability_id, view);
      if (blockReason !== null) {
        blocked.push({ capability_id: action.capability_id, reason: blockReason });
        throw evaluationErrors.replay_external_effect_blocked(
          `隔离回放禁止触发外部副作用动作 ${action.capability_id}（${blockReason}）`,
        );
      }
      return options.runInReplayScope(() => options.baseClient.invoke(ctx, action, input));
    },
  };

  await options.runInReplayScope(() =>
    options.scenario({
      replayId: options.replayId,
      sample: options.sample,
      caller: retainedCaller,
      client: guardedClient,
    }),
  );

  return { blockedExternalEffects: blocked };
}
