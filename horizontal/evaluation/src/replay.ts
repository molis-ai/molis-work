import {
  actionEffect,
  retainActionAuthority,
  type ActionCallContext,
  type ActionClient,
  type ActionExecutionContext,
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
    const effect = actionEffect(view.action, view.capability_id);
    if (view.action.external === true && effect !== "read") {
      return "isolated_replay_blocks_external_declared_action";
    }
    if (view.provider.kind === "mcp" && effect !== "read") {
      return "isolated_replay_blocks_external_mcp_write";
    }
    if (
      effect !== "read"
      && view.action.permissions.some(
        (perm) => perm.startsWith("network.") || perm.startsWith("network:") || perm.startsWith("connector.") || perm.startsWith("connectors:"),
      )
    ) {
      return "isolated_replay_blocks_external_permissioned_write";
    }
    if (effect === "read" && capabilityId.startsWith("connectors.")) {
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
  readonly caller: ActionExecutionContext;
  readonly origin: ActionReference;
  readonly clientFor: (caller: ActionCallContext) => ActionClient;
  readonly runInReplayScope: <T>(fn: () => Promise<T>, replayId: string) => Promise<T>;
}): Promise<{
  readonly blockedExternalEffects: EvaluationReplayReceipt["blocked_external_effects"];
}> {
  const blocked: { readonly capability_id: string; readonly reason: string }[] = [];
  const retainedCaller = retainActionAuthority(options.caller, options.origin, options.caller.beforeEffect);

  const lookupView = async (ctx: ActionCallContext, ref: ActionReference): Promise<ActionView | undefined> =>
    await options.clientFor(ctx).discoverOne(ctx, ref);

  const findExternalBlock = async (
    ctx: ActionCallContext,
    ref: ActionReference,
    visited: Set<string>,
  ): Promise<string | null> => {
    const key = `${ref.provider_id ?? ""}:${ref.capability_id}@${ref.version}`;
    if (visited.has(key)) return null;
    visited.add(key);
    const view = await lookupView(ctx, ref);
    const direct = isExternalEffectCapability(ref.capability_id, view);
    if (direct !== null) return direct;
    for (const required of view?.action.required_actions ?? []) {
      const nested = await findExternalBlock(ctx, required, visited);
      if (nested !== null) return nested;
    }
    return null;
  };

  const guardedClient: ActionClient = {
    discover: (ctx) => options.clientFor(ctx).discover(ctx),
    discoverOne: (ctx, ref) => options.clientFor(ctx).discoverOne(ctx, ref),
    invoke: async (ctx, action, input) => {
      const blockReason = await findExternalBlock(ctx, action, new Set());
      if (blockReason !== null) {
        blocked.push({ capability_id: action.capability_id, reason: blockReason });
        throw evaluationErrors.replay_external_effect_blocked(
          `隔离回放禁止触发外部副作用动作 ${action.capability_id}（${blockReason}）`,
        );
      }
      return options.runInReplayScope(() => options.clientFor(ctx).invoke(ctx, action, input), options.replayId);
    },
  };

  await options.runInReplayScope(() =>
    options.scenario({
      replayId: options.replayId,
      sample: options.sample,
      caller: retainedCaller,
      client: guardedClient,
    }), options.replayId,
  );

  return { blockedExternalEffects: blocked };
}
