import { subjectOfferChoices, type SubjectOfferChoiceView } from "@molis-ai/molis-work-kernel";
import { ActionError, ACTION_REFERENCE_SCHEMA, SUBJECT_OFFER_SCHEMA, SUBJECT_OFFERS_INPUT_SCHEMA,
  type ActionCallContext, type ActionClient, type ActionDefinition, type ActionHandlerBinding, type ActionReference, type SubjectActionOffer, type SubjectOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { callerDirectory, confirmSubjectOffer, prepareSubjectOffers, sameReference, type PreparedSubjectOffer, type PreparedSubjectOffers } from "./contextual/contextual-service.js";
export type HomeActionOffer = PreparedSubjectOffer;
export type HomeActionOffers = PreparedSubjectOffers;
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
/**
 * `home.actions.*` keep their contracts for every caller (Dock, Agents, workflows, MCP) and are thin over the contextual
 * service (specs/contextual-interaction §6.4.3): the same derivation, preparation and pre-run check as the context row.
 */
export function createHomeOfferHandlers(client: ActionClient): ActionHandlerBinding[] {
  return [
    { ...homeOfferActions.choices, handle: async (caller, input) => ({ choices: subjectOfferChoices(await client.discover(caller), (input as { subject_kind?: string }).subject_kind) }) },
    { ...homeOfferActions.offers, handle: (caller, input): Promise<HomeActionOffers> => prepareSubjectOffers(callerDirectory(client, caller), input as SubjectOffersInput) },
    { ...homeOfferActions.execute, handle: async (caller, value) => {
      const offer = await confirmSubjectOffer(callerDirectory(client, caller), value as HomeOfferExecutionInput);
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
