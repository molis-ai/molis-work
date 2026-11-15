import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { SurfaceRequest } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { mainlineAttention } from "./mainline-http.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { needsPositionWindow } from "./surface-placement.js";
import { positionCorrection, positionRecovery } from "./surface-position-correction.js";
import { confirmPositionOffer, positionOfferScope, surfaceClick, withSurfaceResponse } from "./surface-position-http.js";
import { positionOfferIntent, takePositionOffer, withPositionOfferWindow } from "./surface-position-offers.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";

const PATH = "/api/mainline/event/surfaces";
const key = (subject: ActionSubject) => JSON.stringify([subject.kind, subject.id]);
const named = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200;

/**
 * An event's card in the Assistant's dialog (specs/work-line §4.4, WLN-08): the event's own object, laid out by the composition
 * service from its owner's presentation declaration, in the conversation's place and expanded. What selects the object is the
 * person's own line, read again for this request: an event that is not on it, or that they cannot read, has no card. The card's
 * fields are read from the owner with the person's authority, and its actions run through the same position as any object shown
 * in a conversation; nothing here knows a plugin or an event kind. The page asks only when the event's tab is in front (WLN-27).
 */
export function handleMainlineEventSurfacesHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost, reference: LocalHostProjectReference) {
  if (url.pathname !== PATH) return false;
  return withSurfaceResponse(request, response, async signal => {
    const body = await readLocalWebBody(request, 16_000), wanted = body.subject as Partial<ActionSubject> | undefined;
    if (Object.keys(body).some(name => !["subject", "expanded", "click", "offer", "correct", "recovery"].includes(name)) || body.expanded !== undefined && body.expanded !== true
      || [body.click, body.offer, body.correct, body.recovery].filter(value => value !== undefined).length > 1 || body.offer !== undefined && body.expanded !== undefined
      || !wanted || typeof wanted !== "object" || Object.keys(wanted).some(name => name !== "kind" && name !== "id") || !named(wanted.kind) || !named(wanted.id))
      throw new ActionError("actions.input_invalid", "事件卡请求无效");
    const subject: ActionSubject = { kind: wanted.kind, id: wanted.id }, reads = mainlineAttention(request, host, reference);
    const line = reads ? await reads.line() : null;
    signal.throwIfAborted();
    if (!line?.events.some(event => key(event.subject) === key(subject))) throw new ActionError("actions.subject_unavailable", "事项线上没有这个事件，或你读不到它");
    const click = surfaceClick(body.click), intent = positionOfferIntent(body.offer), correction = positionCorrection(body.correct), recovery = positionRecovery(body.recovery);
    const scope = positionOfferScope(reference.project_id, "line-event", key(subject));
    if (intent) {
      const claimed = takePositionOffer(scope, intent);
      if (!claimed) { sendLocalWebJson(response, 200, { closed: true }); return true; }
      try { return await confirmPositionOffer(host, reference, signal, undefined, claimed, response); }
      finally { claimed.window.close(); }
    }
    // The event's own object is what the tab is about: shown in the fullest form its owner declared for a conversation (a card).
    const selection = { slot: { kind: "conversation" }, subjects: [subject], delivery_subjects: [subject], expanded: true } satisfies SurfaceRequest;
    return withPositionOfferWindow(scope, needsPositionWindow(click?.target.kind), window =>
      host.surfacePosition(reference, selection, "/projects/" + encodeURIComponent(reference.project_id), signal, undefined, async access => {
        const value = correction ? await access.correct(correction) : click ? await access.open(click.owner, click.target, 0, window && { window }) : await access.display(recovery);
        access.current();
        sendLocalWebJson(response, 200, value);
        return true;
      }, undefined, window));
  });
}
