import type { ContractDescriptor } from "../platform/package.js";

export const modulesFunctionsContract = {
  contractId: "io.molis.work.module.functions.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "specs/archive/functions-independent-authoring/spec.md",
} as const satisfies ContractDescriptor;

export const FUNCTIONS_EVALUATE_CAPABILITY_ID = "functions.evaluate";
/** The provider every published rule is registered under, and the prefix of its capability id: the one place a rule's key is read from a reference. */
export const FUNCTIONS_PROVIDER_ID = "system.functions";
export const PUBLISHED_FUNCTION_PREFIX = "functions.published.";
/** The Functions rule a judgment reference names, if it names one; scene judgments are filed under that rule's key. */
export function publishedFunctionKey(reference: { readonly provider_id?: string; readonly capability_id: string }): string | null {
  return reference.provider_id === FUNCTIONS_PROVIDER_ID && reference.capability_id.startsWith(PUBLISHED_FUNCTION_PREFIX)
    ? reference.capability_id.slice(PUBLISHED_FUNCTION_PREFIX.length) : null;
}
export const HOME_DOCK_SCENE_ID = "home.dock";
export const FEED_CAPTURE_SCENE_ID = "feed.capture";
export const INBOX_NEXT_SCENE_ID = "inbox.next";
export const HOME_CONTINUE_BEHAVIOR_ID = "home.continue";
export const HOME_ASK_BEHAVIOR_ID = "home.ask";
export const INBOX_DONE_BEHAVIOR_ID = "inbox.done";
export const INBOX_DISMISS_BEHAVIOR_ID = "inbox.dismiss";
export const INBOX_COMPOSE_BEHAVIOR_ID = "inbox.compose";
export const INBOX_VERIFY_BEHAVIOR_ID = "inbox.verify";
export const INBOX_ADMIT_BEHAVIOR_ID = "inbox.admit";
export const FEED_REAUTH_BEHAVIOR_ID = "feed.reauth";
export const FEED_OPEN_BEHAVIOR_ID = "feed.open";
export const FEED_SAVE_BEHAVIOR_ID = "feed.save";
export const FEED_PROMOTE_BEHAVIOR_ID = "feed.promote";
export const FEED_ARCHIVE_BEHAVIOR_ID = "feed.archive";
export const SYSTEM_HOME_DOCK_FUNCTION_KEY = "system_pick_home_dock";
export const SYSTEM_INBOX_ADMIT_FUNCTION_KEY = "system_admit_inbox";
export const SYSTEM_INBOX_NEXT_FUNCTION_KEY = "system_pick_inbox_next";
export const AGENT_MCP_DESTINATION_ID = "agent.mcp";
export const NOUL_TRUE_MAP_KEY = "true";
export const NOUL_FALSE_MAP_KEY = "false";
export const NOUL_POSITIVE_THRESHOLD = 0.5;

export const FUNCTIONS_PLUGIN_ID = "io.molis.work.functions";
export const FUNCTIONS_PROJECT_PLUGIN_ID = "functions";
export const FUNCTIONS_DEFAULT_MODEL = "jev-latest";
export const FUNCTIONS_MAX_SAMPLES = 8;

export type JudgmentRulePrimitive = "noul" | "choice" | "score";
export type JudgmentRuleStatus = "draft" | "published";
export type JudgmentRuleCredentialSource = "ui" | "env" | "none";
export type JudgmentRuleOutcome = "ok" | "needs_review";

export interface ChoiceCriterion {
  readonly key: string;
  readonly description: string;
}

export interface NoulCriteria {
  readonly true_description: string;
  readonly false_description: string;
}

export type ScoreCriteria = readonly string[];

export type JudgmentRuleCriteria = readonly ChoiceCriterion[] | NoulCriteria | ScoreCriteria;

export type JudgmentRuleSceneMap = Readonly<Record<string, string>>;

export interface JudgmentRuleSample {
  readonly id: string;
  readonly label: string;
  readonly input: string;
}

export interface JudgmentRulePreviewRecord {
  readonly input: string;
  readonly outcome: JudgmentRuleOutcome;
  readonly primitive: JudgmentRulePrimitive;
  readonly choice: string | null;
  readonly noul: number | null;
  readonly score: number | null;
  readonly legend: readonly string[] | null;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number | null;
  readonly model: string;
  readonly config_hash: string;
  readonly at: string;
}

interface JudgmentRuleRecordBase {
  readonly id: string;
  readonly name: string;
  readonly function_key: string;
  readonly status: JudgmentRuleStatus;
  readonly version: number | null;
  readonly model: string;
  readonly instructions: string;
  readonly scene_id: string | null;
  readonly scene_version?: number | null;
  readonly scene_provider_id?: string | null;
  readonly subject_kinds: readonly string[];
  readonly scene_map: JudgmentRuleSceneMap;
  readonly action_map?: JudgmentRuleActionMap;
  readonly config_hash: string;
  readonly last_preview: JudgmentRulePreviewRecord | null;
  readonly samples: readonly JudgmentRuleSample[];
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export type JudgmentRuleRecord =
  | (JudgmentRuleRecordBase & { readonly primitive: "choice"; readonly criteria: readonly ChoiceCriterion[] })
  | (JudgmentRuleRecordBase & { readonly primitive: "noul"; readonly criteria: NoulCriteria })
  | (JudgmentRuleRecordBase & { readonly primitive: "score"; readonly criteria: ScoreCriteria });

export interface JudgmentRuleDraftPatch {
  readonly name?: string;
  readonly function_key?: string;
  readonly instructions?: string;
  readonly criteria?: JudgmentRuleCriteria;
  readonly scene_id?: string | null;
  readonly scene_version?: number | null;
  readonly scene_provider_id?: string | null;
  readonly subject_kinds?: readonly string[];
  readonly scene_map?: JudgmentRuleSceneMap;
  readonly action_map?: JudgmentRuleActionMap;
}

export type JudgmentRuleActionMap = Readonly<Record<string, import("../platform/actions.js").ActionReference & { readonly provider_id: string }>>;

export type JudgmentRuleAuthoringDestinationKind = "event" | "mcp";

export interface JudgmentRuleAuthoringSubject {
  readonly subject_kind: string;
  readonly title: string;
}

export interface JudgmentRuleAuthoringDestination {
  readonly destination_id: string;
  readonly kind: JudgmentRuleAuthoringDestinationKind;
  readonly title: string;
  readonly when: string;
  readonly configure_at: string;
  readonly effect: string;
  readonly subject_kinds: readonly string[];
  readonly behavior_ids: readonly string[];
  readonly scene_version?: number;
  readonly provider_id?: string;
  readonly availability?: import("../platform/actions.js").ActionAvailability;
}

export interface JudgmentRuleAuthoringBehavior {
  readonly behavior_id: string;
  readonly title: string;
  readonly hint?: string;
  readonly effect: "read" | "write";
  readonly source: "system" | "plugin" | "mcp";
  /** The owning plugin's id (`provider.plugin_id`, else the provider id of a Host-assembled provider), never an installation id. */
  readonly plugin_id: string;
  readonly plugin_title: string;
  readonly subject_kinds: readonly string[];
  readonly clickable: boolean;
  readonly availability?: import("../platform/actions.js").ActionAvailability;
  /** Consumer output symbols are scoped to their scene, not global action names. */
  readonly destination_id?: string;
  readonly scene_version?: number;
  readonly provider_id?: string;
  readonly action_ref?: import("../platform/actions.js").ActionReference & { readonly provider_id: string };
}

export interface JudgmentRuleAuthoringCatalog {
  readonly subjects: readonly JudgmentRuleAuthoringSubject[];
  readonly destinations: readonly JudgmentRuleAuthoringDestination[];
  readonly behaviors: readonly JudgmentRuleAuthoringBehavior[];
}


export interface JudgmentRuleSummary {
  readonly function_key: string;
  readonly name: string;
  readonly primitive: JudgmentRulePrimitive;
  readonly version: number;
  readonly model: string;
}

export interface JudgmentRuleDescribe extends JudgmentRuleSummary {
  readonly instructions: string;
  readonly input: { readonly content: "string" };
  readonly criteria: JudgmentRuleCriteria;
}

export interface JudgmentRuleInvokeResult {
  readonly recommended_actions?: readonly (import("../platform/actions.js").ActionReference & { readonly provider_id: string })[];
  readonly suggested_behavior_ids?: readonly string[];
  readonly status: JudgmentRuleOutcome;
  readonly function_key: string;
  readonly version: number;
  readonly model: string;
  readonly config_hash: string;
  readonly primitive: JudgmentRulePrimitive;
  readonly data: {
    readonly choice?: string | null;
    readonly noul?: number;
    readonly score?: number;
    readonly legend?: readonly string[];
  };
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number | null;
}

export interface JudgmentRuleSettingsStatus {
  readonly has_credential: boolean;
  readonly source: JudgmentRuleCredentialSource;
}

/** Plugin-owned subject kinds are open; access is resolved through registered context readers. */
export type JudgmentSubjectKind = string;

export interface JudgmentSubject {
  readonly kind: JudgmentSubjectKind;
  readonly id: string;
  readonly project_id?: string;
}

export interface JudgmentRecord {
  readonly recommended_actions?: JudgmentRuleInvokeResult["recommended_actions"];
  readonly judgment_id: string;
  readonly function_key: string;
  readonly function_version: number;
  readonly subject: JudgmentSubject;
  readonly scene_id: string | null;
  readonly outcome: JudgmentRuleOutcome;
  readonly suggested_behavior_ids: readonly string[];
  readonly error_code: string | null;
  readonly created_at: string;
  /** Present on shared-scene results; old records remain readable history. */
  readonly scene_provenance?: {
    readonly binding_id: string;
    readonly binding_revision: string;
    readonly function: import("../platform/actions.js").ActionReference;
    readonly subject_revision: string;
    /** Preparation identity and digest let Home recheck original offer parameters without storing their content. */
    readonly offer_request_id?: string;
    readonly offer_revision?: string;
  };
}

export interface TypeSafeEvaluateResult {
  readonly primitive: JudgmentRulePrimitive;
  readonly choice: string | null;
  readonly noul: number | null;
  readonly score: number | null;
  readonly legend: readonly string[] | null;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number | null;
  readonly model: string;
}

export interface TypeSafeProvider {
  evaluate(apiKey: string, record: JudgmentRuleRecord, state: string, signal?: AbortSignal): Promise<TypeSafeEvaluateResult>;
}

export function filterSuggestedBehaviorIds(
  offered: readonly string[],
  allowed: readonly string[],
  choice: string | null | undefined,
): string[] {
  const offeredSet = new Set(offered);
  const allowedSet = new Set(allowed);
  if (!choice || !offeredSet.has(choice) || !allowedSet.has(choice)) {
    return [];
  }
  return [choice];
}

export function defaultInboxNextBehaviorIds(active: boolean): string[] {
  return active ? [INBOX_DONE_BEHAVIOR_ID, INBOX_DISMISS_BEHAVIOR_ID] : [];
}

export const FEED_CAPTURE_DISPOSITION_IDS: readonly string[] = [
  INBOX_ADMIT_BEHAVIOR_ID,
  FEED_SAVE_BEHAVIOR_ID,
  FEED_PROMOTE_BEHAVIOR_ID,
  FEED_ARCHIVE_BEHAVIOR_ID,
];

export function defaultFeedCaptureBehaviorIds(canAdmit: boolean): string[] {
  return canAdmit ? [...FEED_CAPTURE_DISPOSITION_IDS, FEED_OPEN_BEHAVIOR_ID] : [];
}

/** Footer dispositions on a Feed item. `feed.open` maps to "stay in Feed" and is not a footer button. */
export function visibleFeedDispositionIds(
  suggested: readonly string[] | null | undefined,
  canAdmit: boolean,
): string[] {
  if (!canAdmit) return [];
  const offered = [...FEED_CAPTURE_DISPOSITION_IDS];
  const suggestedIds = suggested ?? [];
  const picked = offered.filter((id) => suggestedIds.includes(id));
  if (picked.length > 0) return picked;
  if (suggestedIds.includes(FEED_OPEN_BEHAVIOR_ID)) {
    return offered.filter((id) => id !== INBOX_ADMIT_BEHAVIOR_ID);
  }
  return offered;
}

export function isJudgmentRuleDestinationId(value: string): boolean {
  // Registration and live compatibility belong to the scene service. Drafts
  // retain valid identities even if their original provider is currently absent.
  return /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(value);
}

export const JUDGMENT_RULE_AUTHORING_SUBJECTS: readonly JudgmentRuleAuthoringSubject[] = [
  { subject_kind: "feed_item", title: "Feed 消息" },
  { subject_kind: "inbox_entry", title: "Inbox" },
  { subject_kind: "source", title: "来源出错" },
  { subject_kind: "home_event", title: "首页事件" },
  { subject_kind: "mcp_invoke", title: "Agent" },
];

export function choiceCriteriaFollowContext(
  keys: readonly string[],
  catalogBehaviorIds: readonly string[],
): boolean {
  if (keys.length === 0) return true;
  if (keys.length === 2 && keys[0] === "yes" && keys[1] === "no") return true;
  const ids = new Set(catalogBehaviorIds);
  return keys.every((key) => ids.has(key));
}

export function functionOutputKeys(record: {
  readonly primitive: JudgmentRulePrimitive;
  readonly criteria: JudgmentRuleCriteria;
}): string[] {
  if (record.primitive === "noul") return [NOUL_TRUE_MAP_KEY, NOUL_FALSE_MAP_KEY];
  if (record.primitive !== "choice" || !Array.isArray(record.criteria)) return [];
  const keys: string[] = [];
  for (const row of record.criteria) {
    if (!row || typeof row !== "object" || !("key" in row) || typeof (row as ChoiceCriterion).key !== "string") continue;
    keys.push((row as ChoiceCriterion).key);
  }
  return keys;
}

export function mapJudgmentChoice(
  record: {
    readonly primitive: JudgmentRulePrimitive;
    readonly criteria: JudgmentRuleCriteria;
    readonly scene_map?: JudgmentRuleSceneMap | null;
  },
  result: { readonly choice?: string | null; readonly noul?: number | null },
): string | null {
  const map = record.scene_map ?? {};
  if (record.primitive === "noul") {
    const key = (result.noul ?? 0) >= NOUL_POSITIVE_THRESHOLD ? NOUL_TRUE_MAP_KEY : NOUL_FALSE_MAP_KEY;
    return map[key] ?? null;
  }
  if (record.primitive !== "choice" || !result.choice) return null;
  return map[result.choice] ?? result.choice;
}

