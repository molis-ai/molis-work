import { createHash } from "node:crypto";
import { ActionError, SUBJECT_OFFERS_INPUT_TYPE, SUBJECT_OFFERS_OUTPUT_TYPE,
  type ActionAvailability, type ActionReference, type ActionView, type ActionDefinition, type SubjectOfferChoice } from "@molis-ai/molis-work-contracts/platform/actions";

/** Finite output choices are required so binding can validate every possible recommendation. */
export function judgmentRecommendationKeys(definition: ActionDefinition): string[] | null {
  const properties = definition.action.output_schema?.properties as Record<string, { items?: { enum?: unknown } }> | undefined;
  const choices = properties?.suggested_behavior_ids?.items?.enum;
  return Array.isArray(choices) && choices.length > 0 && choices.every(choice => typeof choice === "string") ? [...new Set(choices)] : null;
}

export function subjectOfferCompatibilityReason(definition: ActionDefinition, directory: readonly ActionView[]): string | undefined {
  const keys = judgmentRecommendationKeys(definition);
  if (!keys) return "判断规则尚未声明完整的推荐选项";
  const choices = subjectOfferChoices(directory);
  for (const key of keys) {
    const choice = choices.find(choice => choice.key === key);
    if (!choice) return "规则引用的动作选项已不存在或当前授权不可访问，请重新配置";
    if (!choice.availability.available) return `${choice.title}：${choice.availability.reason}`;
    if (definition.action.subject_kinds.length && !choice.subject_kinds.some(kind => definition.action.subject_kinds.includes(kind))) return `${choice.title} 不适用于此规则声明的对象`;
  }
  return undefined;
}

export interface SubjectOfferChoiceView extends SubjectOfferChoice {
  readonly key: string;
  readonly source: ActionReference;
  readonly action: ActionReference;
  readonly provider_title: string;
  readonly subject_kinds: readonly string[];
  readonly availability: ActionAvailability;
}

/** Fixed identity fits Jev's 64-character option key; titles and current object inputs are not identity. */
export function subjectOfferChoiceKey(source: ActionReference, choice: SubjectOfferChoice): string {
  if (!source.provider_id) throw new ActionError("actions.offer_invalid", "推荐选项必须固定原提供方");
  return "offer." + createHash("sha256").update(JSON.stringify([source.provider_id, source.capability_id, source.version,
    choice.offer_id, choice.action.capability_id, choice.action.version])).digest("hex").slice(0, 58);
}

/** Derive from one authorized directory snapshot. This does not invoke queries or prove object input is ready. */
export function subjectOfferChoices(directory: readonly ActionView[], subjectKind?: string): SubjectOfferChoiceView[] {
  const targets = new Map(directory.map(view => [JSON.stringify([view.provider.provider_id, view.capability_id, view.version]), view]));
  return directory.filter(view => view.action.input_type === SUBJECT_OFFERS_INPUT_TYPE && view.action.output_type === SUBJECT_OFFERS_OUTPUT_TYPE
    && (!subjectKind || view.action.subject_kinds.includes(subjectKind))).flatMap(view => {
    const source = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
    return (view.action.subject_offer_choices ?? []).filter(choice => !subjectKind || (choice.subject_kinds ?? view.action.subject_kinds).includes(subjectKind)).map(choice => {
      const action = { ...choice.action, provider_id: source.provider_id };
      const target = targets.get(JSON.stringify([source.provider_id, action.capability_id, action.version]));
      const kinds = choice.subject_kinds ?? view.action.subject_kinds;
      const availability: ActionAvailability = !view.availability.available ? view.availability : !target
        ? { available: false, code: "actions.missing", reason: "原执行能力尚未注册或当前授权不可访问" }
        : target.action.subject_kinds.length && kinds.some(kind => !target.action.subject_kinds.includes(kind))
          ? { available: false, code: "actions.subject_incompatible", reason: "原执行能力不支持声明的事项类型" } : target.availability;
      return { ...choice, key: subjectOfferChoiceKey(source, choice), source, action, provider_title: view.provider.title,
        subject_kinds: kinds, availability };
    });
  });
}
