import type { ContractDescriptor } from "../platform/package.js";

export const modulesFunctionsContract = {
  contractId: /* @version contract.io.molis.work.module.functions "io.molis.work.module.functions.v{version}" */ "io.molis.work.module.functions.v1",
  kind: "module",
  schemaVersion: /* @version contract.io.molis.work.module.functions */ 1,
  maturity: "partial",
  ssot: "specs/archive/functions-independent-authoring/spec.md",
} as const satisfies ContractDescriptor;

/** The provider every published rule is registered under, and the prefix of its capability id: the one place a rule's key is read from a reference. */
export const FUNCTIONS_PROVIDER_ID = "system.functions";
export const PUBLISHED_FUNCTION_PREFIX = "functions.published.";
/** The Functions rule a judgment reference names, if it names one; scene judgments are filed under that rule's key. */
export function publishedFunctionKey(reference: { readonly provider_id?: string; readonly capability_id: string }): string | null {
  return reference.provider_id === FUNCTIONS_PROVIDER_ID && reference.capability_id.startsWith(PUBLISHED_FUNCTION_PREFIX)
    ? reference.capability_id.slice(PUBLISHED_FUNCTION_PREFIX.length) : null;
}
// A plugin's own scenes and options (Feed's capture, Inbox's next step) are declared and exported by that plugin (M9); this contract
// keeps the platform's scene (Home) and the general shapes.
export const HOME_DOCK_SCENE_ID = "home.dock";
export const HOME_CONTINUE_OPTION_ID = "home.continue";
export const HOME_ASK_OPTION_ID = "home.ask";
export const SYSTEM_HOME_DOCK_FUNCTION_KEY = "system_pick_home_dock";
export const AGENT_MCP_DESTINATION_ID = "agent.mcp";
export const NOUL_TRUE_MAP_KEY = "true";
export const NOUL_FALSE_MAP_KEY = "false";
export const NOUL_POSITIVE_THRESHOLD = 0.5;

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
  readonly option_ids: readonly string[];
  readonly scene_version?: number;
  readonly provider_id?: string;
  readonly availability?: import("../platform/actions.js").ActionAvailability;
}

export interface JudgmentRuleAuthoringOption {
  readonly option_id: string;
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
  readonly options: readonly JudgmentRuleAuthoringOption[];
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
  /** Present on shared-scene results; a judgment made without a scene has none. */
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

export function filterSuggestedOptionIds(
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

export function isJudgmentRuleDestinationId(value: string): boolean {
  // Registration and live compatibility belong to the scene service. Drafts
  // retain valid identities even if their original provider is currently absent.
  return /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(value);
}

/** The kinds of object the platform itself judges; a plugin's kinds are titled by its own declarations (its search sources, M9). */
export const JUDGMENT_RULE_AUTHORING_SUBJECTS: readonly JudgmentRuleAuthoringSubject[] = [
  { subject_kind: "home_event", title: "首页事件" },
  { subject_kind: "mcp_invoke", title: "Agent" },
];

export function choiceCriteriaFollowContext(
  keys: readonly string[],
  catalogOptionIds: readonly string[],
): boolean {
  if (keys.length === 0) return true;
  if (keys.length === 2 && keys[0] === "yes" && keys[1] === "no") return true;
  const ids = new Set(catalogOptionIds);
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

