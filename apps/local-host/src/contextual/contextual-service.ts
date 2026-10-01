import { isDeepStrictEqual } from "node:util";
import { assertActionInput, subjectOfferChoiceKey } from "@molis-ai/molis-work-kernel";
import { ActionError, SUBJECT_OFFERS_INPUT_TYPE, SUBJECT_OFFERS_OUTPUT_TYPE, type ActionAvailability, type ActionCallContext, type ActionClient,
  type ActionReference, type ActionView, type SubjectActionOffer, type SubjectOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * The one place that prepares what can be done with an object (specs/archive/contextual-interaction §6.4.3): the context row,
 * the Assistant's starting points, the Home / Dock and `home.actions.*` all ask here. Candidates themselves are derived
 * in the kernel (`contextualCandidates`); this module turns a chosen one into a complete, checked input. Judgment is not
 * here: the row asks Jev, the Dock, Feed and Inbox run the rule the person bound.
 */

/** The directory under one caller's authority. */
export interface ContextualDirectory {
  discover(): readonly ActionView[] | Promise<readonly ActionView[]>;
  invoke(reference: ActionReference, input: unknown): Promise<unknown>;
}

/** A subject offer with its current input, the query that prepared it, whether it can run, and its rule key when declared. */
export interface PreparedSubjectOffer extends SubjectActionOffer { source: ActionReference; availability: ActionAvailability; recommendation_key?: string }
export interface PreparedSubjectOffers { offers: PreparedSubjectOffer[]; issues: string[]; sources: ActionReference[] }

export const sameReference = (a: ActionReference, b: ActionReference) => a.capability_id === b.capability_id && a.version === b.version && a.provider_id === b.provider_id;

/** The directory as one caller sees it. */
export const callerDirectory = (client: ActionClient, caller: ActionCallContext): ContextualDirectory =>
  ({ discover: () => client.discover(caller), invoke: (reference, input) => client.invoke(caller, reference, input) });

/**
 * The one subject offer a choice names, prepared again by the query that declared it (`source`): the check before a
 * chosen offer is shown for confirmation (context row, starting points) and before it runs (Home / Dock).
 */
export async function prepareSubjectOffer(actions: ContextualDirectory, subject: SubjectOffersInput["subject"], requestId: string, source: ActionReference,
  names: (offer: PreparedSubjectOffer) => boolean): Promise<PreparedSubjectOffer> {
  const { offers } = await prepareSubjectOffers(actions, { subject, request_id: requestId }, source);
  const offer = offers.find(names);
  if (!offer) throw new ActionError("actions.offer_changed", "事项或动作参数已变化，请重新载入后选择");
  return offer;
}

/** Before running a chosen offer: prepared again it must be the same — action, input, title and rule key — and runnable. */
export async function confirmSubjectOffer(actions: ContextualDirectory, input: SubjectOffersInput & { offer: SubjectActionOffer & { source: ActionReference; recommendation_key?: string } }): Promise<PreparedSubjectOffer> {
  const offer = await prepareSubjectOffer(actions, input.subject, input.request_id, input.offer.source, item => item.offer_id === input.offer.offer_id);
  if (!sameReference(offer.action, input.offer.action) || !isDeepStrictEqual(offer.input, input.offer.input) || offer.title !== input.offer.title
    || (input.offer.recommendation_key !== undefined && input.offer.recommendation_key !== offer.recommendation_key)) {
    throw new ActionError("actions.offer_changed", "事项或动作参数已变化，请重新载入后选择");
  }
  if (!offer.availability.available) throw new ActionError(offer.availability.code, offer.availability.reason);
  return offer;
}

/**
 * Every provider's current offers for one object, each checked against its declaration and its action's input
 * contract. With `source`, only that provider, and it must still be there. Preparing never runs an offer.
 */
export async function prepareSubjectOffers(actions: ContextualDirectory, input: SubjectOffersInput, source?: ActionReference): Promise<PreparedSubjectOffers> {
  const directory = await actions.discover();
  const providers = directory.filter(view => view.action.input_type === SUBJECT_OFFERS_INPUT_TYPE && view.action.output_type === SUBJECT_OFFERS_OUTPUT_TYPE
    && view.action.subject_kinds.includes(input.subject.kind) && (!source || sameReference(source, { ...view, provider_id: view.provider.provider_id })));
  if (source && providers.length !== 1) throw new ActionError("actions.offer_source_changed", "原动作提供方已不可访问，请重新载入事项");
  const offers: PreparedSubjectOffer[] = [], issues: string[] = [], sources: ActionReference[] = [];
  for (const provider of providers) {
    const providerReference = { capability_id: provider.capability_id, version: provider.version, provider_id: provider.provider.provider_id };
    if (!provider.availability.available) { issues.push(`${provider.action.title}：${provider.availability.reason}`); continue; }
    try {
      const result = await actions.invoke(providerReference, input) as { offers: SubjectActionOffer[] };
      const current = await actions.discover();
      if (!current.some(view => sameReference(providerReference, { ...view, provider_id: view.provider.provider_id }) && view.availability.available)) throw new ActionError("actions.offer_source_changed", "动作提供方在准备期间已失效");
      const ids = new Set<string>();
      for (const offer of result.offers) {
        if (ids.has(offer.offer_id)) throw new ActionError("actions.offer_invalid", "插件返回了重复动作标识");
        ids.add(offer.offer_id);
        if (offer.action.provider_id && offer.action.provider_id !== providerReference.provider_id) throw new ActionError("actions.offer_invalid", "事项动作不能借用另一个提供方的身份");
        const action = { ...offer.action, provider_id: providerReference.provider_id };
        const declaration = provider.action.subject_offer_choices?.find(choice => choice.offer_id === offer.offer_id);
        if (declaration && (declaration.action.capability_id !== action.capability_id || declaration.action.version !== action.version
          || !(declaration.subject_kinds ?? provider.action.subject_kinds).includes(input.subject.kind))) throw new ActionError("actions.offer_invalid", "实际动作与插件声明的推荐选项不符");
        const target = current.find(view => sameReference(action, { ...view, provider_id: view.provider.provider_id }));
        let state: ActionAvailability = target?.availability ?? { available: false, code: "actions.missing", reason: "原动作尚未注册或当前授权不可访问" };
        if (target && state.available) {
          try { assertActionInput(target.action.input_schema, offer.input); }
          catch { state = { available: false, code: "actions.input_invalid", reason: "插件尚未提供符合动作合同的完整输入" }; }
        }
        offers.push({ ...offer, action, source: providerReference, availability: state,
          ...(declaration ? { recommendation_key: subjectOfferChoiceKey(providerReference, declaration) } : {}) });
      }
      sources.push(providerReference);
    } catch (error) {
      if (source) throw error;
      // Do not keep a partially accepted batch from a malformed or withdrawn provider.
      for (let i = offers.length - 1; i >= 0; i--) if (sameReference(offers[i]!.source, providerReference)) offers.splice(i, 1);
      issues.push(`${provider.action.title}：${error instanceof ActionError ? error.message : "暂时无法读取可用动作"}`);
    }
  }
  return { offers, issues, sources };
}
