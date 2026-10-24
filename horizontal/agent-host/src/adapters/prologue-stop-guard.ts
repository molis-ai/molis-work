import type { Runtime } from "@prologue/sdk";
import { actionEffect, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ANNOUNCE_HELD, BUTTON_CLAIM_HELD, SAVED_CLAIM_HELD, WRITTEN_CALL_HELD, actedThisRound, emptyRoundFacts, internalIdsHeld, memoryHeld, mentionsInternalIds, noteRoundEvent,
  writesToolCallAsText, type EndingClaim } from "./announce-guard.js";
import { GATEWAY_TOOLS, MEMORY_TOOLS } from "./prologue-action-gateway.js";
import { REVIEW_TIMEOUT_MS, reviewEnding, type EndingRound, type ReviewModel } from "./ending-review.js";
import type { PrologueStartInput } from "./prologue.js";
import { retainRunObserver, type HeldKind, type RoundState } from "./prologue-node-kit.js";

/** How a held ending reads in the round: what was wrong with it, and that the round was let go on to correct it. */
const HELD_LABELS: Record<HeldKind, { target: string; summary: string }> = {
  announce: { target: "上一段只说了要做什么，没有实际执行", summary: "这一轮只说明了接下来要做什么、没有调用工具，已让它接着实际去做（每轮最多一次）" },
  memory: { target: "上一段说记住或删掉了，但这一轮没有做到", summary: "回答说已经记住或删掉，可这一轮没有成功的记忆调用，已让它真正去做或如实更正" },
  written: { target: "上一段把调用写成了文字，并没有执行", summary: "回答里写的是调用的文字而不是调用本身，已让它真正去调用或改用平常的话回答" },
  button: { target: "上一段说按钮准备好了，但这一轮没有做出按钮", summary: "回答说按钮已经准备好，可这一轮没有成功准备操作卡，已让它真正去准备或如实更正" },
  ids: { target: "上一段写出了内部标识，已让它改用名称重写", summary: "回答里出现了工具名、能力标识或编号，已让它改用标题和名称重写" },
  saved: { target: "上一段说已经保存或建好，但这一轮没有成功的改动", summary: "回答说已经保存或建好，可这一轮没有成功的改动，已让它真正去做或如实更正" },
};

/** What the stop check knows of the round a session runs now, and of each run it has seen end. */
export interface StopGuard {
  writing: boolean;
  business: boolean;
  /** Who reads the round's replies: the person, or the work that handed this one over. */
  reader: "person" | "work";
  /** The person's own words this round: an identifier they wrote is theirs to read back. */
  task: string;
  materials: readonly string[];
  /** The model and pre-dispatch check the review runs with; absent: no review (the adapter was not given one). */
  review?: ReviewModel;
  signal?: AbortSignal;
  readonly runs: Map<string, { held: Set<HeldKind>; reviewedAt?: number; announcedAt?: number }>;
}

/** The stop hook waits for the review; a hook that does not answer in time holds the ending, so it has room to spare. */
const STOP_HOOK_TIMEOUT_MS = REVIEW_TIMEOUT_MS + 15_000;

/** Whether any call this round finished was a change (a capability no longer offered counts as one: nothing is held then). */
async function changedThisRound(done: { client: AgentActionClient; invoked: ExactActionReference[] }): Promise<boolean> {
  if (!done.invoked.length) return false;
  const views = await done.client.discover().catch(() => null);
  if (!views) return true;
  return done.invoked.some(reference => {
    const view = views.find(row => row.capability_id === reference.capability_id && row.version === reference.version && row.provider.provider_id === reference.provider_id);
    return !view || actionEffect(view.action, view.capability_id) !== "read";
  });
}

/** Keeps the facts of a round as its events arrive: the calls, how each ended, what the results named. */
export function watchRoundFacts(state: RoundState, run: { ref: { id: string }; subscribe(listener: (event: { type: string }) => void): () => void }): void {
  const facts = emptyRoundFacts();
  state.roundFacts.set(run.ref.id, facts);
  retainRunObserver(state, run.ref.id, run.subscribe(event => {
    if (state.roundFacts.get(run.ref.id) !== facts) return;
    noteRoundEvent(facts, event as { type: string; [key: string]: unknown });
    // A completed run's facts are read once more for how it ended (endedOnPromise), and dropped there.
    if (event.type === "failed" || event.type === "cancelled") { state.roundFacts.delete(run.ref.id); state.stopGuards.forEach(guard => guard.runs.delete(run.ref.id)); }
  }));
}

/** The round now starting, for the session's stop check: what it may do, who reads it, and how its ending is reviewed. */
export function guardRound(state: RoundState, input: PrologueStartInput, business: boolean, review: ReviewModel | undefined, signal: AbortSignal): StopGuard {
  const round = { writing: input.provenance.frozen.execution !== "read-only", business, reader: input.action_gateway?.client.reader ?? "person" as const,
    task: input.task, materials: (input.text_materials ?? []).map(material => material.title), ...(review ? { review } : {}), signal };
  const guard: StopGuard = Object.assign(state.stopGuards.get(input.session_id) ?? { runs: new Map() }, round);
  if (!review) delete guard.review;
  state.stopGuards.set(input.session_id, guard);
  return guard;
}

/**
 * The session's stop check, registered once. A call written out as text, or identifiers the Host handed the model shown
 * to the person, are held by what the Host sees itself. A writable round that changed nothing has its last words
 * reviewed against its facts once (ending-review.ts); what they claim and the facts do not show is held once per kind
 * per round. A session may alternate discussing and executing rounds, so the check follows the round now starting.
 */
export function ensureStopGuard(runtime: Runtime, state: RoundState, sessionId: string): void {
  if (state.stopHooks.has(sessionId)) return;
  state.stopHooks.add(sessionId);
  runtime.hooks.register({ id: `molis-announce-guard-${sessionId}`, event: "session-stop", forSession: sessionId, timeoutMs: STOP_HOOK_TIMEOUT_MS, handler: async context => {
    const run = context.origin?.run, text = (context.input as { text?: unknown } | undefined)?.text, guard = state.stopGuards.get(sessionId);
    if (!run || typeof text !== "string" || !guard) return { kind: "allow" as const };
    const record = guard.runs.get(run) ?? { held: new Set<HeldKind>() };
    guard.runs.set(run, record);
    const facts = state.roundFacts.get(run) ?? emptyRoundFacts();
    const hold = (kinds: HeldKind[], why: string) => {
      for (const kind of kinds) record.held.add(kind);
      if (kinds.includes("announce")) record.announcedAt = facts.calls.length;
      state.heldLabels.set(run, [...(state.heldLabels.get(run) ?? []), HELD_LABELS[kinds[0]!]]);
      return { kind: "deny" as const, why };
    };
    if (guard.business && !record.held.has("written") && writesToolCallAsText(text)) return hold(["written"], WRITTEN_CALL_HELD);
    if (guard.business && guard.reader === "person" && !record.held.has("ids")) {
      const ids = mentionsInternalIds(text, [...(state.gatewayKnown.get(sessionId) ?? []), ...facts.ids], guard.task);
      if (ids.length) return hold(["ids"], internalIdsHeld(ids));
    }
    // Reviewed once for what the round has done so far: after a hold, only new calls make a new review worth its cost.
    if (!guard.writing || !guard.review || record.reviewedAt === facts.calls.length) return { kind: "allow" as const };
    const done = state.changeRounds.get(sessionId), memory = state.memoryRounds.get(sessionId);
    const suggestionTools = new Set<string>([GATEWAY_TOOLS.suggest, MEMORY_TOOLS.propose]);
    const invokedChanged = done ? await changedThisRound(done) : false;
    const changed = guard.business ? actedThisRound(facts) || (memory ? memory.keep + memory.forget > 0 : false) || invokedChanged : facts.calls.length > 0;
    const actualChanged = guard.business ? actedThisRound(facts, { except: suggestionTools }) || (memory ? memory.keep + memory.forget > 0 : false) || invokedChanged : facts.calls.length > 0;
    // A round that only offered a card or a memory proposal did act (the person has something new), but it did not keep or save
    // anything: still review what it says it did, so "已记住"/"已保存" without the actual call is held. A true "按钮准备好了"
    // is allowed because suggest-action returned; suggest-memory does not make a keep.
    const returned = facts.calls.filter(call => call.ended === "returned");
    const suggestionsOnly = !actualChanged && returned.some(call => suggestionTools.has(call.tool));
    const suggestedAction = returned.some(call => call.tool === GATEWAY_TOOLS.suggest);
    const suggestedMemory = returned.some(call => call.tool === MEMORY_TOOLS.propose);
    // A suggestion is not a save or a memory. Only a round that suggests and then claims the thing itself is reviewed; a true
    // "按钮在上面" after suggest-action is not sent to the review model again.
    const claimAfterSuggestion = (suggestedAction && /保存|存到|已经建|建好|写入|改好|saved|stored|wrote|created/i.test(text))
      || (suggestedMemory && /记住|记下|保留|忘记|删掉|停用|remember|kept|forgot/i.test(text));
    if (changed && !(suggestionsOnly && claimAfterSuggestion)) return { kind: "allow" as const };
    record.reviewedAt = facts.calls.length;
    const round: EndingRound = { reply: text, facts, materials: guard.materials,
      ...(memory ? { memory: memory.off ? "switched-off" : memory.without.keep ? "not-given" : "available" } : {}) };
    const signal = AbortSignal.any([AbortSignal.timeout(REVIEW_TIMEOUT_MS), ...(guard.signal ? [guard.signal] : [])]);
    const held = heldFor(await reviewEnding(runtime, guard.review, round, signal), memory, guard.business, suggestedAction).filter(([kind]) => !record.held.has(kind));
    return held.length ? hold(held.map(([kind]) => kind), held.map(([, why]) => why).join("\n\n")) : { kind: "allow" as const };
  } });
}

/** What each claim the facts do not bear out is held as, and what the model reads; a claim the round could not make is none. */
function heldFor(claims: readonly EndingClaim[], memory: { off: boolean; without: { keep: boolean; forget: boolean } } | undefined, business: boolean, suggestedAction = false): Array<[HeldKind, string]> {
  const held: Array<[HeldKind, string]> = [];
  const memoryClaim = claims.includes("kept") ? "keep" : claims.includes("forgot") ? "forget" : undefined;
  if (memoryClaim && memory) held.push(["memory", memoryHeld(memory, memoryClaim)]);
  if (claims.includes("button") && business && !suggestedAction) held.push(["button", BUTTON_CLAIM_HELD]);
  if (claims.includes("changed")) held.push(["saved", SAVED_CLAIM_HELD]);
  if (claims.includes("will_do")) held.push(["announce", ANNOUNCE_HELD]);
  return held;
}

/** Whether a completed run was held for only announcing and called nothing after: it ended with nothing done. Taken once. */
export function endedOnPromise(state: RoundState, runId: string, sessionId: string): boolean {
  const guard = state.stopGuards.get(sessionId), record = guard?.runs.get(runId), facts = state.roundFacts.get(runId);
  guard?.runs.delete(runId);
  state.roundFacts.delete(runId);
  return Boolean(guard?.writing && record?.held.has("announce") && record.announcedAt === (facts?.calls.length ?? 0));
}
