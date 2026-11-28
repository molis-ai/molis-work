import { requireSynchronous, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { gatewayProblem, prologueActionGateway } from "./prologue-action-gateway.js";
import { PrologueActionReviews } from "./prologue-action-reviews.js";
import { pinnedMaterialRevisions, prologueActionTools, SUGGEST_HOST_TOOL } from "./prologue-action-tools.js";
import { prepareRoundExtensions, type PreparedRoundExtension, type RoundExtension } from "./prologue-round-extension.js";
import type { RunDeps } from "./prologue-run.js";
import type { RoundMcp } from "./prologue-round-mcp.js";
import { actionWorkVerdict, workToolVerdict, type PrologueWorkDelegation } from "./prologue-work-delegation.js";
import type { PrologueStartInput } from "./prologue.js";
import type { RoundState } from "./prologue-node-kit.js";

type Memory = RoundState["memoryRounds"] extends Map<string, infer M> ? M : never;

/**
 * The round's actions: the business gateway's three tools, or one tool per frozen action. What the round really keeps,
 * forgets and changes is counted for the stop check; a call to a capability that is gone is refused before review.
 * Scenario-specific per-round tools and hooks plug in through `extensions` with uniform lifecycle cleanup.
 */
export function roundGateway(
  deps: Pick<RunDeps, "state" | "runtime" | "options">,
  input: Pick<PrologueStartInput, "action_gateway" | "actions" | "assertBeforeDispatch" | "character" | "root_path" | "session_id" | "text_materials">,
  none: boolean,
  stopping: () => boolean,
  work: PrologueWorkDelegation | undefined,
  mcp: RoundMcp | undefined,
  extensions: readonly RoundExtension[] = [],
) {
  const { state, runtime } = deps;
  const actionController = new AbortController();
  const reviews = new PrologueActionReviews(input.session_id, () => {
    if (stopping()) throw new Error("原轮次正在停止");
    actionController.signal.throwIfAborted(); requireSynchronous(input.assertBeforeDispatch?.(), "最终授权检查必须同步完成");
  }, work);
  state.actionReviews.set(input.session_id, reviews);
  // A business round the person gave no memory (switched off) keeps nothing, so any claim of keeping is held too.
  const memory = input.action_gateway?.client.memory;
  const memoryDone: Memory = { keep: 0, forget: 0, off: !memory, without: { keep: !!memory && !memory.remember, forget: !!memory && !memory.forget } };
  if (input.action_gateway) state.memoryRounds.set(input.session_id, memoryDone); else state.memoryRounds.delete(input.session_id);
  const client = input.action_gateway?.client;
  const changesDone = client ? { client, invoked: [] as ExactActionReference[] } : undefined;
  if (changesDone) state.changeRounds.set(input.session_id, changesDone); else state.changeRounds.delete(input.session_id);
  const gatewayForRun = input.action_gateway && client ? { ...input.action_gateway, client: { ...client,
    ...(work && work.permission.mode !== "original" ? { direct: undefined } : {}),
    invoke: async (...args: Parameters<typeof client.invoke>) => { const result = await client.invoke(...args); changesDone!.invoked.push(args[0]); return result; },
    ...(memory ? { memory: {
      ...(memory.remember ? { remember: async (...args: Parameters<NonNullable<typeof memory.remember>>) => { const kept = await memory.remember!(...args); memoryDone.keep += 1; return kept; } } : {}),
      list: memory.list.bind(memory),
      ...(memory.forget ? { forget: async (...args: Parameters<NonNullable<typeof memory.forget>>) => { const result = await memory.forget!(...args); if (result.forgotten) memoryDone.forget += 1; return result; } } : {}),
      ...(memory.propose ? { propose: memory.propose.bind(memory) } : {}),
    } } : {}),
  } } : input.action_gateway;
  const pinnedRevisions = none ? undefined : pinnedMaterialRevisions(input.text_materials);
  const gatewayTools = none || !gatewayForRun ? undefined : prologueActionGateway(gatewayForRun, Math.min(60_000, runtime.tools.limits.maxTimeoutMs), actionController.signal, reviews, pinnedRevisions);
  const extensionContext = { runtime, state, options: deps.options, input, none, hasGateway: gatewayTools !== undefined };
  const hasExtensionTools = !none && gatewayTools === undefined && extensions.some(extension => extension.contributesTools(extensionContext));
  const actionTools = none ? undefined : gatewayTools ? { ...gatewayTools, scope: "gateway" }
    : prologueActionTools(input.actions, Math.min(60_000, runtime.tools.limits.maxTimeoutMs), actionController.signal, input.character.tools.includes(SUGGEST_HOST_TOOL),
      // Extension tools are part of this pack's identity (the catalog allows one registration per name and `prepare` compares content).
      hasExtensionTools, reviews, pinnedRevisions);
  const gateway = gatewayForRun && { ...gatewayForRun, declare: gatewayTools?.declare };
  if (gateway) {
    state.gatewayRuns.set(input.session_id, gateway);
    if (gatewayTools) { state.gatewayKnown.set(input.session_id, gatewayTools.known); state.gatewayOffered.set(input.session_id, gatewayTools.offered); }
  }
  let hookId: string | undefined;
  let preparedExtensions: PreparedRoundExtension | undefined;
  try {
    if (input.action_gateway || input.actions || work || mcp) {
      const sessionId = input.session_id;
      hookId = `molis-action-gateway-${sessionId}`;
      if (state.gatewayHooks.has(sessionId)) runtime.hooks.unregister(hookId);
      state.gatewayHooks.add(sessionId);
      runtime.hooks.register({ id: hookId, event: "tool-before", forSession: sessionId, handler: async context => {
        if (!context.toolName) return { kind: "allow" as const };
        try {
          const verdict = actionTools && "writes" in actionTools && actionTools.writes?.has(context.toolName)
            ? actionWorkVerdict(work) : workToolVerdict(work, context);
          if (verdict?.kind === "deny") return verdict;
          await mcp?.prepare(context.origin, context.toolName, context.input);
          const problem = gateway ? await gatewayProblem(gateway, context.toolName, context.input, gatewayTools?.known, gatewayTools?.offered, { calls: reviews, origin: context.origin }) : null;
          if (problem) return { kind: "deny" as const, why: problem };
          if (actionTools && "prepareReview" in actionTools) await actionTools.prepareReview(context.origin, context.toolName, context.input);
          return verdict ?? { kind: "allow" as const };
        } catch (error) { return { kind: "deny" as const, why: error instanceof Error ? error.message : "原能力审查授权不可读取" }; }
      } });
    }
    preparedExtensions = prepareRoundExtensions(extensions, { ...extensionContext, packScope: actionTools?.scope });
    let augmentedTools = actionTools;
    const toolOverrides = new Map<string, string>();
    const excludedHostTools = new Set<string>(preparedExtensions.excludedHostTools ?? []);
    if (augmentedTools && preparedExtensions.tools.length > 0) {
      let pack = augmentedTools.pack;
      let executors = augmentedTools.executors;
      const names = [...augmentedTools.names];
      for (const tool of preparedExtensions.tools) {
        const applied = tool.apply({ pack, executors });
        pack = applied.pack;
        executors = applied.executors;
        names.push(tool.name);
        if (tool.hostTool !== undefined) toolOverrides.set(tool.hostTool, tool.name);
      }
      augmentedTools = { ...augmentedTools, pack, executors, names };
    }
    return {
      actionController,
      actionTools: augmentedTools,
      reviews,
      parameterBranches: gatewayTools?.parameterBranches,
      hookId,
      extensions: preparedExtensions,
      toolOverrides,
      excludedHostTools,
      hasExtensionTools: preparedExtensions.tools.length > 0,
    };
  } catch (error) {
    actionController.abort();
    if (state.actionReviews.get(input.session_id) === reviews) state.actionReviews.delete(input.session_id);
    if (hookId) {
      runtime.hooks.unregister(hookId);
      state.gatewayHooks.delete(input.session_id);
    }
    if (preparedExtensions) void preparedExtensions.close().catch(() => undefined);
    throw error;
  }
}
