import { isDeepStrictEqual } from "node:util";
import { assertActionInput, subjectOfferChoices, subjectOfferChoiceKey, type SubjectOfferChoiceView } from "@molis-ai/molis-work-kernel";
import { ActionError, ACTION_REFERENCE_SCHEMA, SUBJECT_OFFER_SCHEMA, SUBJECT_OFFERS_INPUT_SCHEMA, SUBJECT_OFFERS_INPUT_TYPE, SUBJECT_OFFERS_OUTPUT_TYPE,
  type ActionAvailability, type ActionCallContext, type ActionClient, type ActionDefinition, type ActionHandlerBinding, type ActionReference, type SubjectActionOffer, type SubjectOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
export interface HomeActionOffer extends SubjectActionOffer { source: ActionReference; availability: ActionAvailability; recommendation_key?: string }
export interface HomeActionOffers { offers: HomeActionOffer[]; issues: string[]; sources: ActionReference[] }
export interface HomeOfferExecutionInput extends SubjectOffersInput { offer: SubjectActionOffer & { source: ActionReference; recommendation_key?: string } }
const availability = { anyOf: [{ type: "object", properties: { available: { const: true } }, required: ["available"], additionalProperties: false },
  { type: "object", properties: { available: { const: false }, code: { type: "string" }, reason: { type: "string" } }, required: ["available", "code", "reason"], additionalProperties: false }] };
const recommendationKey = { type: "string", pattern: "^offer\\.[a-f0-9]{58}$" };
const preparedOffer = { ...SUBJECT_OFFER_SCHEMA, properties: { ...SUBJECT_OFFER_SCHEMA.properties, source: ACTION_REFERENCE_SCHEMA, recommendation_key: recommendationKey }, required: [...SUBJECT_OFFER_SCHEMA.required, "source"] };
const metadata = { scope: "project" as const, scheduling: "concurrent" as const, audiences: ["user", "agent", "workflow", "mcp"] as const, permissions: ["home:read"], subject_kinds: [] };
export const homeOfferActions = {
  choices: { capability_id: "home.actions.choices", version: 1, operation: "query", action: { ...metadata, title: "事项动作的规则选项", description: "从原插件声明发现可供规则选择的动作身份；实际事项输入仍须准备和检查。", kind: "query",
    input_schema: { type: "object", properties: { subject_kind: { type: "string", minLength: 1 } }, additionalProperties: false },
    output_schema: { type: "object", properties: { choices: { type: "array", items: { type: "object", properties: {
      key: recommendationKey, offer_id: { type: "string" }, title: { type: "string" }, source: ACTION_REFERENCE_SCHEMA, action: ACTION_REFERENCE_SCHEMA,
      provider_title: { type: "string" }, subject_kinds: { type: "array", items: { type: "string" } }, availability,
    }, required: ["key", "offer_id", "title", "source", "action", "provider_title", "subject_kinds", "availability"], additionalProperties: false } } }, required: ["choices"], additionalProperties: false } } } as ActionDefinition<{ subject_kind?: string }, { choices: SubjectOfferChoiceView[] }>,
  offers: { capability_id: "home.actions.prepare", version: 1, operation: "query", action: { ...metadata, title: "事项可用动作", description: "发现插件提供的当前事项动作，核对权限与完整输入；不会执行。", kind: "query",
    input_schema: SUBJECT_OFFERS_INPUT_SCHEMA, output_schema: { type: "object", properties: { offers: { type: "array", items: { ...preparedOffer, properties: { ...preparedOffer.properties, availability }, required: [...preparedOffer.required, "availability"] } }, issues: { type: "array", items: { type: "string" } }, sources: { type: "array", items: ACTION_REFERENCE_SCHEMA } }, required: ["offers", "issues", "sources"], additionalProperties: false } } } as ActionDefinition<SubjectOffersInput, HomeActionOffers>,
  execute: { capability_id: "home.actions.execute", version: 1, operation: "command", action: { ...metadata, title: "执行事项动作", description: "重新核对原提供方、动作和输入，再通过共同执行服务调用；业务幂等与恢复由原动作负责。", kind: "operation",
    input_schema: { ...SUBJECT_OFFERS_INPUT_SCHEMA, properties: { ...SUBJECT_OFFERS_INPUT_SCHEMA.properties, offer: preparedOffer }, required: [...SUBJECT_OFFERS_INPUT_SCHEMA.required, "offer"] },
    output_schema: { type: "object", properties: { title: { type: "string" }, result: {} }, required: ["title", "result"], additionalProperties: false } } } as ActionDefinition<HomeOfferExecutionInput, { title: string; result: unknown }>,
};
const sameReference = (a: ActionReference, b: ActionReference) => a.capability_id === b.capability_id && a.version === b.version && a.provider_id === b.provider_id;
export function createHomeOfferHandlers(client: ActionClient): ActionHandlerBinding[] {
  const prepare = async (caller: ActionCallContext, input: SubjectOffersInput, source?: ActionReference): Promise<HomeActionOffers> => {
    const directory = await client.discover(caller);
    const providers = directory.filter(view => view.action.input_type === SUBJECT_OFFERS_INPUT_TYPE && view.action.output_type === SUBJECT_OFFERS_OUTPUT_TYPE
      && view.action.subject_kinds.includes(input.subject.kind) && (!source || sameReference(source, { ...view, provider_id: view.provider.provider_id })));
    if (source && providers.length !== 1) throw new ActionError("actions.offer_source_changed", "原动作提供方已不可访问，请重新载入事项");
    const offers: HomeActionOffer[] = [], issues: string[] = [], sources: ActionReference[] = [];
    for (const provider of providers) {
      const providerReference = { capability_id: provider.capability_id, version: provider.version, provider_id: provider.provider.provider_id };
      if (!provider.availability.available) { issues.push(`${provider.action.title}：${provider.availability.reason}`); continue; }
      try {
        const result = await client.invoke(caller, providerReference, input) as { offers: SubjectActionOffer[] };
        const current = await client.discover(caller);
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
  };
  return [
    { ...homeOfferActions.choices, handle: async (caller, input) => ({ choices: subjectOfferChoices(await client.discover(caller), (input as { subject_kind?: string }).subject_kind) }) },
    { ...homeOfferActions.offers, handle: (caller, input) => prepare(caller, input as SubjectOffersInput) },
    { ...homeOfferActions.execute, handle: async (caller, value) => {
      const input = value as HomeOfferExecutionInput;
      const current = await prepare(caller, { subject: input.subject, request_id: input.request_id }, input.offer.source);
      const offer = current.offers.find(item => item.offer_id === input.offer.offer_id);
      if (!offer || !sameReference(offer.action, input.offer.action) || !isDeepStrictEqual(offer.input, input.offer.input) || offer.title !== input.offer.title
        || (input.offer.recommendation_key !== undefined && input.offer.recommendation_key !== offer.recommendation_key)) {
        throw new ActionError("actions.offer_changed", "事项或动作参数已变化，请重新载入后选择");
      }
      if (!offer.availability.available) throw new ActionError(offer.availability.code, offer.availability.reason);
      const guarded: ActionCallContext = { ...caller, validate_authority: async reference => {
        await caller.validate_authority?.(reference);
        await caller.validate_authority?.(offer.source);
        const source = (await client.discover(caller)).find(view => sameReference(offer.source, { ...view, provider_id: view.provider.provider_id }));
        if (!source?.availability.available) throw new ActionError("actions.offer_source_changed", "原动作提供方已失效，请重新载入事项");
      } };
      return { title: offer.title, result: await client.invoke(guarded, offer.action, offer.input) };
    } },
  ];
}
