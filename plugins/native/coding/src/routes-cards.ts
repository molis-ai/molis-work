import { cardInputValues, dismissActionCard, runActionCard } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginRouteBinding, PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { codingCardErrors, codingCardPorts, landRoundOffers, sessionCards } from "./action-cards.js";
import { type CodingActivation, selected } from "./route-activation.js";
import { bodyOf } from "./route-selections.js";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PluginCapabilityClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { CodingSessionRecord } from "./store.js";
import { codingActions, type CodingBeforeWrite } from "./route-entry.js";

/** The zone the person works in, as their page says; a name the platform does not know is none. */
function zoneOf(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || value.length > 64) return undefined;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return value; } catch { return undefined; }
}

/**
 * Coding routes for a session's cards (specs/ai-interaction-experience D25): the person runs one exactly as shown, with
 * their changes to its open fields, or puts it away. The card is claimed before it runs, so a second click runs nothing.
 */
export function cardsRoutes(a: CodingActivation): PluginRouteBinding[] {
  const card = async (request: PluginRouteRequest, api: PluginCapabilityClient, record: CodingSessionRecord, beforeWrite: CodingBeforeWrite) => {
    let cards = sessionCards(a.context, record.session_id);
    if (!cards.some(entry => entry.card_id === request.params.cardId) && record.runtime_session_id) {
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await codingActions(a.context, beforeWrite).invoke(agent.readSession, [session]);
      const runs = await Promise.all(snapshot.runs.map(run => codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, run])));
      cards = await landRoundOffers(a.context, api, record, runs, beforeWrite, true);
    }
    return cards.find(entry => entry.card_id === request.params.cardId) ?? (() => { throw codingCardErrors.card_unknown("这个会话没有这张建议卡"); })();
  };
  return [
    a.route("coding.card-run", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution), body = bodyOf(request), zone = zoneOf(body.time_zone), held = await card(request, api, record, beforeWrite);
      return { card: await runActionCard(held, { revision: Number(body.revision), values: cardInputValues(body.values, zone) }, codingCardPorts(a.context, api, record, held, beforeWrite, zone)) };
    }),
    a.route("coding.card-dismiss", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution), held = await card(request, api, record, beforeWrite);
      return { card: dismissActionCard(held, codingCardPorts(a.context, api, record, held, beforeWrite).store) };
    }),
  ];
}
