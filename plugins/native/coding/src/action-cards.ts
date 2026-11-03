import { defineErrorCodes, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, agentOfferActions, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { draftActionCard, type ActionCard, type ActionCardPorts, type ActionCardRefusal, type CardStore } from "@molis-ai/molis-work-plugin-sdk";
import { codingActions, codingActionControl, type CodingBeforeWrite } from "./route-entry.js";
import type { CodingSessionRecord } from "./store.js";

/**
 * A round's suggestions as Coding's cards (specs/ai-interaction-experience D25): what the person runs with one click, or
 * puts away. The rules are the SDK's (`draftActionCard`, `runActionCard`); Coding keeps the cards of a session in its
 * private storage under `cards:<session_id>`, and a card runs only through the Agent Host's `agent.offers.run`, which runs
 * exactly the action its suggestion names under that round's own grant.
 */
interface CodingActionCard extends ActionCard {
  /** The suggestion it came from, and the round that made it: one card per suggestion, whatever reads it. */
  offer_id: string;
  run_id: string;
}

export const codingCardErrors = defineErrorCodes("coding", {
  card_unknown: "not_found",
  card_conflict: "conflict",
  card_invalid: "invalid",
  card_revoked: "forbidden",
  card_storage_unsupported: "unavailable",
});
const REFUSALS: Record<ActionCardRefusal, keyof typeof codingCardErrors> = { revoked: "card_revoked", invalid: "card_invalid", conflict: "card_conflict" };
const keyOf = (sessionId: string) => `cards:${sessionId}`;

/** A session's cards, in the order they were suggested. */
export function sessionCards(context: PluginStartContext, sessionId: string): CodingActionCard[] {
  const raw = context.services?.storage?.get(keyOf(sessionId));
  return typeof raw === "string" ? (JSON.parse(raw) as { cards: CodingActionCard[] }).cards : [];
}

/**
 * Replace the session's cards in one atomic step: `change` reads the cards as stored and returns them changed, or null for
 * no change. Another writer in between (another card of the session, another tab) makes it read again, never overwrite.
 */
function writeCards(context: PluginStartContext, sessionId: string, beforeWrite: CodingBeforeWrite, change: (cards: CodingActionCard[]) => CodingActionCard[] | null): CodingActionCard[] {
  const storage = context.services?.storage;
  if (!storage?.compareAndSet) throw codingCardErrors.card_storage_unsupported("这个宿主不能原子地保存建议卡");
  for (let attempt = 0; attempt < 8; attempt++) {
    const raw = storage.get(keyOf(sessionId)), cards = typeof raw === "string" ? (JSON.parse(raw) as { cards: CodingActionCard[] }).cards : [];
    const next = change(cards);
    if (!next) return cards;
    // A cancelled, revoked or stopped call writes nothing.
    beforeWrite.assert_current();
    if (storage.compareAndSet(keyOf(sessionId), typeof raw === "string" ? raw : null, JSON.stringify({ cards: next }))) return next;
  }
  throw codingCardErrors.card_conflict("建议卡正被同时修改，请稍后再试");
}

/** Where a session's cards are kept: a card changes only at the revision it was read at, which is the claim. */
function cardStore(context: PluginStartContext, sessionId: string, beforeWrite: CodingBeforeWrite): CardStore<CodingActionCard> {
  return { update(card, expected, patch) {
    let updated: CodingActionCard | undefined;
    writeCards(context, sessionId, beforeWrite, cards => {
      const held = cards.find(entry => entry.card_id === card.card_id);
      if (!held || held.revision !== expected) throw codingCardErrors.card_conflict("这张建议卡已经变化，请查看最新内容后再点");
      updated = { ...held, ...patch, revision: expected + 1, updated_at: new Date().toISOString() } as CodingActionCard;
      return cards.map(entry => entry === held ? updated! : entry);
    });
    return updated!;
  } };
}

/** What a session's card runs and is checked with: the round's suggestions, as the Agent Host runs them. */
export function codingCardPorts(context: PluginStartContext, record: CodingSessionRecord, card: Pick<CodingActionCard, "offer_id" | "run_id">,
  beforeWrite: CodingBeforeWrite, timeZone?: string): ActionCardPorts<CodingActionCard> {
  const runtimeSession = record.runtime_session_id ?? "";
  return { store: cardStore(context, record.session_id, beforeWrite), readSubject: async () => null, now: () => new Date(), ...(context.project_id ? { projectId: context.project_id } : {}), ...(timeZone ? { timeZone } : {}),
    refuse: (reason, message) => codingCardErrors[REFUSALS[reason]](message),
    authority: async () => ({
      discover: () => codingActions(context, beforeWrite).invoke(agent.listActions, [record.runtime_id]),
      // The Agent Host checks the input against the action's own contract in `agent.offers.run`, before anything runs.
      check: () => {},
      invoke: async (reference, input) => (await context.services!.actions!.invoke(agentOfferActions.run, { runtime_id: record.runtime_id, session_id: runtimeSession,
        run_id: card.run_id, offer_id: card.offer_id, reference, input }, codingActionControl(beforeWrite))).output,
    }) };
}

/**
 * The suggestions of the rounds just read, made cards once each: checked against the actions the round's grant offers
 * now, written only after the call's own check (`beforeWrite`). A suggestion whose action is no longer offered (access
 * revoked, the action switched off) lands nothing; a later read tries it again.
 */
export async function landRoundOffers(context: PluginStartContext, record: CodingSessionRecord, runs: readonly AgentRunView[],
  beforeWrite: CodingBeforeWrite, persist = false): Promise<CodingActionCard[]> {
  const held = sessionCards(context, record.session_id), known = new Set(held.map(card => card.offer_id));
  const offers = runs.flatMap(run => (run.offers ?? []).filter(offer => !known.has(offer.offer_id)).map(offer => ({ offer, run_id: run.ref.run_id })));
  if (!offers.length) return held;
  let views: readonly ActionView[];
  try { views = await codingActions(context, beforeWrite).invoke(agent.listActions, [record.runtime_id]); } catch { return held; /* Nothing offered to this round now: nothing lands. */ }
  const drafted: CodingActionCard[] = [];
  for (const { offer, run_id } of offers) {
    try {
      const card = await draftActionCard(`card-${offer.offer_id}`, offer, views, { readSubject: async () => null, now: () => new Date(offer.offered_at), check: () => {},
        refuse: (reason, message) => codingCardErrors[REFUSALS[reason]](message) });
      drafted.push({ ...card, offer_id: offer.offer_id, run_id });
    } catch { /* Not offered now (revoked or switched off): this suggestion lands no card. */ }
  }
  if (!drafted.length) return held;
  await beforeWrite();
  if (!persist) { beforeWrite.assert_current(); return [...held, ...drafted]; }
  return writeCards(context, record.session_id, beforeWrite, cards => {
    const landed = new Set(cards.map(card => card.offer_id)), fresh = drafted.filter(card => !landed.has(card.offer_id));
    return fresh.length ? [...cards, ...fresh] : null;
  });
}

/** The rounds read, each with its own cards beside it (landed first), so a card that changed resends its round to the page. */
export async function runsWithCards(context: PluginStartContext, record: CodingSessionRecord, runs: readonly AgentRunView[],
  beforeWrite: CodingBeforeWrite): Promise<Array<AgentRunView & { cards: CodingActionCard[] }>> {
  const cards = await landRoundOffers(context, record, runs, beforeWrite);
  return runs.map(run => Object.assign({ ...run }, { cards: cards.filter(card => card.run_id === run.ref.run_id) }));
}
