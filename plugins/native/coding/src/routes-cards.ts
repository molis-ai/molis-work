import { cardInputValues, dismissActionCard, runActionCard } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginRouteBinding, PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { codingCardErrors, codingCardPorts, sessionCards } from "./action-cards.js";
import { type CodingActivation, selected } from "./route-activation.js";
import { bodyOf } from "./route-selections.js";

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
  const card = (request: PluginRouteRequest, sessionId: string) =>
    sessionCards(a.context, sessionId).find(entry => entry.card_id === request.params.cardId) ?? (() => { throw codingCardErrors.card_unknown("这个会话没有这张建议卡"); })();
  return [
    a.route("coding.card-run", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution), body = bodyOf(request), zone = zoneOf(body.time_zone), held = card(request, record.session_id);
      return { card: await runActionCard(held, { revision: Number(body.revision), values: cardInputValues(body.values, zone) }, codingCardPorts(a.context, api, record, held, beforeWrite, zone)) };
    }),
    a.route("coding.card-dismiss", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution), held = card(request, record.session_id);
      return { card: dismissActionCard(held, codingCardPorts(a.context, api, record, held, beforeWrite).store) };
    }),
  ];
}
