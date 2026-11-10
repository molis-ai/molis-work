import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { SurfaceRequest } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { PRESENTATION_LIMITS } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { AssistantStore } from "./assistant-store.js";
import { identity } from "./assistant-relations.js";
import type { MolisWorkLocalHost } from "../project-host.js";
import { confirmPositionOffer, positionOfferScope, surfaceClick, withSurfaceResponse } from "../surface-position-http.js";
import { positionOfferIntent, takePositionOffer, withPositionOfferWindow, type CaptureOfferSource } from "../surface-position-offers.js";
import { needsPositionWindow } from "../surface-placement.js";
import { positionCorrection, positionRecovery } from "../surface-position-correction.js";
import { readLocalWebBody, sendLocalWebJson } from "../web-http.js";

const key = (object: ActionSubject) => JSON.stringify([object.kind, object.id]);
const changed = () => new ActionError("actions.provider_changed", "对话引用已变化，请重新读取");

function conversationSource(store: AssistantStore, workId: string, projectId: string) {
  const workHere = () => {
    const work = store.get(LOCAL_PERSON_ACTOR_ID, workId);
    if (work.scope.kind !== "project" || work.scope.project_id !== projectId)
      throw new ActionError("actions.scope_mismatch", "在工作所属项目打开它的对象");
    return work;
  };
  const read = (expanded: boolean, capture = false) => {
    const relations = store.relations.forWork(identity(workHere()));
    const result = new Set(relations.filter(row => row.relation === "result").map(row => key(row.object)));
    const unique = new Map<string, ActionSubject>(), witnesses = new Map<string, string[]>();
    const include = ({ kind, id }: ActionSubject, evidence: readonly unknown[]) => {
      const item = key({ kind, id });
      unique.set(item, { kind, id });
      if (!capture) return;
      const original = witnesses.get(item);
      if (original) original.push(JSON.stringify(evidence));
      else witnesses.set(item, [JSON.stringify(evidence)]);
    };
    for (const { object, relation, recorded_at } of relations.slice(-40))
      include(object, [relation, recorded_at, object.revision]);
    for (const round of store.rounds(workId, 40))
      for (const material of round.materials) if (material.object)
        include(material.object, [round.run_id, material.material_id, material.object.version]);
    const subjects = [...unique.values()].slice(-PRESENTATION_LIMITS.values_subjects);
    const request = { slot: { kind: "conversation" }, subjects, delivery_subjects: subjects.filter(subject => result.has(key(subject))),
      ...(expanded ? { expanded: true } : {}) } satisfies SurfaceRequest;
    return { request, witnesses };
  };
  const guard = (subject: ActionSubject, expected: string[] | undefined) => {
    const id = key(subject);
    if (!expected?.length) throw changed();
    const stamp = JSON.stringify(expected);
    return { current() {
      const actual = read(false, true);
      if (!actual.request.subjects.some(subject => key(subject) === id) || JSON.stringify(actual.witnesses.get(id)) !== stamp) throw changed();
    } };
  };
  return { read, current: () => { workHere(); }, guard };
}

/** A work's original edges and object materials select the objects. No model or message text participates. */
export function handleAssistantSurfaceHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined, openStore: () => AssistantStore) {
  const match = /^\/api\/assistant\/works\/([A-Za-z0-9_-]{1,200})\/surfaces$/u.exec(url.pathname);
  if (!match) return undefined;
  return withSurfaceResponse(request, response, async signal => {
    const workId = match[1]!, body = await readLocalWebBody(request, 16_000);
    if (Object.keys(body).some(key => !["expanded", "click", "offer", "correct", "recovery"].includes(key)) || body.expanded !== undefined && body.expanded !== true
      || [body.click, body.offer, body.correct, body.recovery].filter(value => value !== undefined).length > 1 || body.offer !== undefined && body.expanded !== undefined)
      throw new ActionError("actions.input_invalid", "对话对象请求无效");
    if (!reference) throw new ActionError("actions.scope_mismatch", "在工作所属项目打开它的对象");
    const source = conversationSource(openStore(), workId, reference.project_id), click = surfaceClick(body.click);
    const intent = positionOfferIntent(body.offer), correction = positionCorrection(body.correct), recovery = positionRecovery(body.recovery);
    const scope = positionOfferScope(reference.project_id, "conversation", workId);
    if (intent) {
      source.current();
      const claimed = takePositionOffer(scope, intent);
      if (!claimed) { sendLocalWebJson(response, 200, { closed: true }); return true; }
      try { return await confirmPositionOffer(host, reference, signal, source.current, claimed, response); }
      finally { claimed.window.close(); }
    }
    return withPositionOfferWindow(scope, needsPositionWindow(click?.target.kind), window => {
      const { request: selection, witnesses } = source.read(body.expanded === true, Boolean(window)), stamp = JSON.stringify(selection);
      const capture: CaptureOfferSource = (_owner, subject) => source.guard(subject, witnesses.get(key(subject)));
      const exactSource = () => { if (JSON.stringify(source.read(body.expanded === true).request) !== stamp) throw changed(); };
      return host.surfacePosition(reference, selection, "/projects/" + encodeURIComponent(reference.project_id), signal,
        correction?.subject ? exactSource : source.current, async access => {
        const value = correction ? await access.correct(correction) : click ? await access.open(click.owner, click.target, 0, window && { window, source: capture })
          : { ...await access.display(recovery), declared_kinds: access.declaredKinds() };
        access.current();
        exactSource();
        sendLocalWebJson(response, 200, value);
        return true;
      }, undefined, window);
    });
  });
}
