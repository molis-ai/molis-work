import { randomUUID } from "node:crypto";
import { ActionError, actionEffect, bindActionClient, type ActionReference, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PresentationValues, PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { SurfaceConsequence } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { subjectOfferChoices } from "@molis-ai/molis-work-kernel";
import { presentationValuesProblems } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { confirmSubjectOffer, prepareSubjectOffers, sameReference, type PreparedSubjectOffer } from "./contextual/contextual-service.js";
import { homeChanged, homeReference as reference } from "./surface-home-display.js";
import type { SurfaceProjectContext } from "./surface-project-read.js";

type Choice = { source: ActionView; action: ActionView; offerId: string };
export type SurfaceOfferObject = { subject: ActionSubject; values: ActionView; fields: readonly string[]; revision: string };
export type HeldSurfaceOffer = { target: SurfaceOfferObject; choice: Choice; offer: PreparedSubjectOffer; request: string; key: string };

/** The original directory can offer another plugin's operations in a workbench peek; framed slots keep their owner restriction. */
export function surfaceOfferSources(directory: readonly ActionView[], kind: string, permits: (view: ActionView) => boolean = () => true) {
  const find = (ref: ActionReference) => directory.find(view => view.availability.available && permits(view) && sameReference(ref, reference(view)));
  return subjectOfferChoices(directory, kind).flatMap(choice => {
    const source = find(choice.source), action = find(choice.action);
    return choice.availability.available && source && action && source.operation === "query" && !source.action.external
      && source.action.execution?.cost !== "metered" && !source.action.permissions.includes("model:invoke")
      && (source.action.effect === undefined || source.action.effect === "read")
      ? [{ source, action, offerId: choice.offer_id }] : [];
  });
}

export function offerConsequences(view: ActionView): SurfaceConsequence[] {
  return [
    ...(view.action.external ? ["external" as const] : []),
    ...(view.action.execution?.cost === "metered" ? ["cost" as const] : []),
    ...(actionEffect(view.action, view.capability_id) === "irreversible" ? ["irreversible" as const] : []),
  ];
}

export const surfaceOfferLabel = (held: HeldSurfaceOffer) =>
  ({ key: held.key, label: held.offer.title, consequence: offerConsequences(held.choice.action) });

export function surfaceOfferOperation({ client, caller, transport }: SurfaceProjectContext, current: () => void) {
  const control = {
    signal: transport.signal, locale: transport.locale, assert_authority_current: current,
    async beforeEffect() { await transport.beforeEffect(); current(); },
  };
  const readonly = bindActionClient(client, () => ({ ...caller, query_only: true, read_only_effects: true }));
  const read = (view: ActionView, input: unknown) => readonly.invoke({ ...view, ...reference(view) }, input, control);
  const directory = (source: ActionView, targets: readonly ActionView[]) => ({
    discover() { current(); return [source, ...new Set(targets)]; },
    invoke(ref: ActionReference, input: unknown) {
      current();
      if (!sameReference(ref, reference(source))) throw homeChanged();
      return read(source, input);
    },
  });
  async function version({ subject, values, fields, revision }: SurfaceOfferObject) {
    current();
    const input: PresentationValuesInput = { subjects: [subject], fields: [...fields] };
    const answer = await read(values, input) as PresentationValues;
    current();
    const value = answer.items?.[0];
    if (presentationValuesProblems(input, answer).length || value?.state !== "ok" || value.revision !== revision) throw homeChanged();
  }
  return {
    version,
    async prepare(target: SurfaceOfferObject, choices: readonly Choice[], recheck = true) {
      if (recheck) await version(target);
      else current();
      const request = randomUUID(), sources = new Map<ActionView, Choice[]>(), prepared: HeldSurfaceOffer[] = [];
      for (const choice of choices) sources.set(choice.source, [...sources.get(choice.source) ?? [], choice]);
      for (const [source, declarations] of sources) {
        const result = await prepareSubjectOffers(directory(source, declarations.map(choice => choice.action)),
          { subject: target.subject, request_id: request }, reference(source));
        for (const offer of result.offers) {
          const choice = declarations.find(({ action, offerId }) => offerId === offer.offer_id && sameReference(offer.action, reference(action)));
          if (choice && offer.availability.available) prepared.push({ target, choice, offer, request, key: randomUUID() });
        }
      }
      current();
      return prepared;
    },
    async confirm(held: HeldSurfaceOffer, beforeWrite?: () => void) {
      const { target, choice: { source, action }, offer, request } = held;
      await version(target);
      const proof = await confirmSubjectOffer(directory(source, [action]), { subject: target.subject, request_id: request, offer });
      current(); beforeWrite?.();
      const click = bindActionClient(client, () => ({ ...caller,
        user_action: { source: "web", conversation_ref: `web:${caller.project_id}`, message_ref: `web:request:${request}` } }));
      const result = await click.invoke({ ...action, ...reference(action) }, proof.input, {
        ...control, async beforeEffect() { await control.beforeEffect(); beforeWrite?.(); },
      });
      try { current(); }
      catch (cause) {
        if (action.operation !== "command") throw cause;
        throw new ActionError("actions.outcome_unknown", "操作结果需要到原对象核对", { cause });
      }
      return { title: proof.title, result };
    },
  };
}
