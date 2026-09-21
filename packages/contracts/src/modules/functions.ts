import type { ContractDescriptor } from "../platform/package.js";

export const modulesFunctionsContract = {
  contractId: "io.molis.work.module.functions.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "specs/functions-independent-authoring/spec.md",
} as const satisfies ContractDescriptor;

export const FUNCTIONS_EVALUATE_CAPABILITY_ID = "functions.evaluate";
export const HOME_DOCK_SCENE_ID = "home.dock";
export const FEED_CAPTURE_SCENE_ID = "feed.capture";
export const INBOX_NEXT_SCENE_ID = "inbox.next";
export const HOME_TALK_BEHAVIOR_ID = "home.talk";
export const HOME_CONTINUE_BEHAVIOR_ID = "home.continue";
export const HOME_ASK_BEHAVIOR_ID = "home.ask";
export const INBOX_DONE_BEHAVIOR_ID = "inbox.done";
export const INBOX_DISMISS_BEHAVIOR_ID = "inbox.dismiss";
export const INBOX_ADMIT_BEHAVIOR_ID = "inbox.admit";
export const FEED_REAUTH_BEHAVIOR_ID = "feed.reauth";
export const FEED_OPEN_BEHAVIOR_ID = "feed.open";
export const SYSTEM_HOME_DOCK_FUNCTION_KEY = "system_pick_home_dock";
export const SYSTEM_INBOX_ADMIT_FUNCTION_KEY = "system_admit_inbox";
export const SYSTEM_INBOX_NEXT_FUNCTION_KEY = "system_pick_inbox_next";
export const AGENT_MCP_DESTINATION_ID = "agent.mcp";
export const NOUL_TRUE_MAP_KEY = "true";
export const NOUL_FALSE_MAP_KEY = "false";
export const NOUL_POSITIVE_THRESHOLD = 0.5;

export const FUNCTIONS_PLUGIN_ID = "io.molis.work.functions";
export const FUNCTIONS_PROJECT_PLUGIN_ID = "functions";
export const FUNCTIONS_CREDENTIAL_REF = "plugin:io.molis.work.functions:typesafe";
export const FUNCTIONS_DEFAULT_MODEL = "jev-latest";
export const FUNCTIONS_MAX_SAMPLES = 8;

export type FunctionsPrimitive = "noul" | "choice" | "score";
export type FunctionStatus = "draft" | "published";
export type FunctionsCredentialSource = "ui" | "env" | "none";
export type FunctionsOutcome = "ok" | "needs_review";

export interface ChoiceCriterion {
  readonly key: string;
  readonly description: string;
}

export interface NoulCriteria {
  readonly true_description: string;
  readonly false_description: string;
}

export type ScoreCriteria = readonly string[];

export type FunctionCriteria = readonly ChoiceCriterion[] | NoulCriteria | ScoreCriteria;

export type FunctionSceneMap = Readonly<Record<string, string>>;

export interface FunctionSample {
  readonly id: string;
  readonly label: string;
  readonly input: string;
}

export interface FunctionsPreviewRecord {
  readonly input: string;
  readonly outcome: FunctionsOutcome;
  readonly primitive: FunctionsPrimitive;
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

interface FunctionRecordBase {
  readonly id: string;
  readonly name: string;
  readonly function_key: string;
  readonly status: FunctionStatus;
  readonly version: number | null;
  readonly model: string;
  readonly instructions: string;
  readonly scene_id: string | null;
  readonly subject_kinds: readonly string[];
  readonly scene_map: FunctionSceneMap;
  readonly config_hash: string;
  readonly last_preview: FunctionsPreviewRecord | null;
  readonly samples: readonly FunctionSample[];
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export type FunctionRecord =
  | (FunctionRecordBase & { readonly primitive: "choice"; readonly criteria: readonly ChoiceCriterion[] })
  | (FunctionRecordBase & { readonly primitive: "noul"; readonly criteria: NoulCriteria })
  | (FunctionRecordBase & { readonly primitive: "score"; readonly criteria: ScoreCriteria });

export interface FunctionDraftPatch {
  readonly name?: string;
  readonly function_key?: string;
  readonly instructions?: string;
  readonly criteria?: FunctionCriteria;
  readonly scene_id?: string | null;
  readonly subject_kinds?: readonly string[];
  readonly scene_map?: FunctionSceneMap;
}

export type FunctionAuthoringDestinationKind = "event" | "mcp";

export interface FunctionAuthoringSubject {
  readonly subject_kind: string;
  readonly title: string;
}

export interface FunctionAuthoringDestination {
  readonly destination_id: string;
  readonly kind: FunctionAuthoringDestinationKind;
  readonly title: string;
  readonly when: string;
  readonly configure_at: string;
  readonly effect: string;
  readonly subject_kinds: readonly string[];
  readonly behavior_ids: readonly string[];
}

export interface FunctionAuthoringBehavior {
  readonly behavior_id: string;
  readonly title: string;
  readonly hint?: string;
  readonly effect: "read" | "write";
  readonly source: "system" | "plugin" | "mcp";
  readonly plugin_id: string;
  readonly plugin_title: string;
  readonly subject_kinds: readonly string[];
  readonly clickable: boolean;
}

export interface FunctionAuthoringCatalog {
  readonly subjects: readonly FunctionAuthoringSubject[];
  readonly destinations: readonly FunctionAuthoringDestination[];
  readonly behaviors: readonly FunctionAuthoringBehavior[];
}

export interface FunctionAuthoringCatalogInput {
  readonly behaviors?: readonly {
    readonly behavior_id: string;
    readonly plugin_id: string;
    readonly title: string;
    readonly effect: "read" | "write";
    readonly subject_kinds: readonly string[];
    readonly source: "plugin" | "mcp" | "system";
  }[];
  readonly plugin_titles?: Readonly<Record<string, string>>;
  readonly extra_subjects?: readonly FunctionAuthoringSubject[];
}

export interface FunctionSummary {
  readonly function_key: string;
  readonly name: string;
  readonly primitive: FunctionsPrimitive;
  readonly version: number;
  readonly model: string;
}

export interface FunctionDescribe extends FunctionSummary {
  readonly instructions: string;
  readonly input: { readonly content: "string" };
  readonly criteria: FunctionCriteria;
}

export interface FunctionInvokeResult {
  readonly status: FunctionsOutcome;
  readonly function_key: string;
  readonly version: number;
  readonly model: string;
  readonly config_hash: string;
  readonly primitive: FunctionsPrimitive;
  readonly data: {
    readonly choice?: string | null;
    readonly noul?: number;
    readonly score?: number;
    readonly legend?: readonly string[];
  };
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number | null;
}

export interface FunctionsSettingsStatus {
  readonly has_credential: boolean;
  readonly source: FunctionsCredentialSource;
}

export type JudgmentSubjectKind = "feed_item" | "inbox_entry" | "home_event" | "source" | "session" | "mcp_invoke";

export interface JudgmentSubject {
  readonly kind: JudgmentSubjectKind;
  readonly id: string;
  readonly board_id?: string;
}

export interface JudgmentRecord {
  readonly judgment_id: string;
  readonly function_key: string;
  readonly function_version: number;
  readonly subject: JudgmentSubject;
  readonly scene_id: string | null;
  readonly outcome: FunctionsOutcome;
  readonly suggested_behavior_ids: readonly string[];
  readonly error_code: string | null;
  readonly created_at: string;
}

export interface FunctionSceneBinding {
  readonly scene_id: string;
  readonly function_key: string;
  readonly board_id: string | null;
  readonly ref: string | null;
}

export interface FunctionsSecretPort {
  put(ref: string, plaintext: string): void;
  get(ref: string): string | null;
  delete(ref: string): boolean | void;
}

export interface TypeSafeEvaluateResult {
  readonly primitive: FunctionsPrimitive;
  readonly choice: string | null;
  readonly noul: number | null;
  readonly score: number | null;
  readonly legend: readonly string[] | null;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number | null;
  readonly model: string;
}

export interface TypeSafeProvider {
  evaluate(apiKey: string, record: FunctionRecord, state: string, signal?: AbortSignal): Promise<TypeSafeEvaluateResult>;
}

export interface JudgeFunctionInput {
  readonly function_key: string;
  readonly input: string;
  readonly subject: JudgmentSubject;
  readonly scene_id?: string;
  readonly offered_behavior_ids: readonly string[];
}

export interface JudgmentPort {
  judge(input: JudgeFunctionInput): Promise<JudgmentRecord>;
  bindScene(sceneId: string, functionKey: string, boardId?: string | null, ref?: string | null): FunctionSceneBinding;
  unbindScene(sceneId: string, boardId?: string | null, ref?: string | null): void;
  sceneBinding(sceneId: string, boardId?: string | null, ref?: string | null): FunctionSceneBinding | null;
  latest(kind: JudgmentSubjectKind, id: string, boardId?: string, sceneId?: string | null): JudgmentRecord | null;
}

export class FunctionsError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FunctionsError";
    this.code = code;
  }
}

export function filterSuggestedBehaviorIds(
  offered: readonly string[],
  allowed: readonly string[],
  choice: string | null | undefined,
): string[] {
  const offeredSet = new Set(offered);
  const allowedSet = new Set(allowed);
  if (!choice || !offeredSet.has(choice) || !allowedSet.has(choice) || choice === HOME_TALK_BEHAVIOR_ID) {
    return [];
  }
  return [choice];
}

export function defaultHomeDockBehaviorIds(act: "continue" | "reauth", canDone: boolean): string[] {
  if (act === "reauth") return [FEED_REAUTH_BEHAVIOR_ID, HOME_ASK_BEHAVIOR_ID];
  return canDone ? [HOME_CONTINUE_BEHAVIOR_ID, INBOX_DONE_BEHAVIOR_ID] : [HOME_CONTINUE_BEHAVIOR_ID];
}

/** Home dock click paths Host already wires. MCP tools and unwired plugin ids stay off the bar. */
export const HOME_DOCK_ACTION_IDS: readonly string[] = [
  HOME_CONTINUE_BEHAVIOR_ID,
  HOME_ASK_BEHAVIOR_ID,
  INBOX_DONE_BEHAVIOR_ID,
  INBOX_DISMISS_BEHAVIOR_ID,
  FEED_REAUTH_BEHAVIOR_ID,
  FEED_OPEN_BEHAVIOR_ID,
];

const HOME_DOCK_PRIMARY_BEHAVIOR_IDS: readonly string[] = [
  HOME_CONTINUE_BEHAVIOR_ID,
  HOME_ASK_BEHAVIOR_ID,
  FEED_REAUTH_BEHAVIOR_ID,
  FEED_OPEN_BEHAVIOR_ID,
];

export function visibleDockBehaviorIds(
  suggested: readonly string[] | null | undefined,
  offered: readonly string[],
  fallback: readonly string[] = offered,
): string[] {
  const kept = (suggested ?? []).filter((id) => offered.includes(id) && id !== HOME_TALK_BEHAVIOR_ID);
  return kept.length > 0 ? kept : [...fallback];
}

export function offeredHomeDockBehaviorIds(
  catalog: readonly {
    readonly behavior_id: string;
    readonly source: "plugin" | "mcp" | "system";
    readonly subject_kinds: readonly string[];
  }[],
  subjects: readonly string[],
): string[] {
  const kinds = new Set(subjects);
  return catalog
    .filter((row) => row.source !== "mcp" && HOME_DOCK_ACTION_IDS.includes(row.behavior_id))
    .filter((row) => row.subject_kinds.some((kind) => kinds.has(kind)))
    .map((row) => row.behavior_id);
}

export function homeDockSubjectKinds(input: {
  readonly act: "continue" | "reauth";
  readonly hasInbox: boolean;
  readonly plugin?: string;
  readonly openPlugin?: string;
}): string[] {
  const kinds: string[] = [];
  if (input.hasInbox) kinds.push("inbox_entry");
  if (input.act === "reauth") kinds.push("source");
  else if (input.plugin === "feed" || input.openPlugin === "feed") kinds.push("feed_item");
  if (input.plugin === "sessions") kinds.push("session");
  return kinds;
}

export function defaultInboxNextBehaviorIds(active: boolean): string[] {
  return active ? [INBOX_DONE_BEHAVIOR_ID, INBOX_DISMISS_BEHAVIOR_ID] : [];
}

export function defaultFeedCaptureBehaviorIds(canAdmit: boolean): string[] {
  return canAdmit ? [INBOX_ADMIT_BEHAVIOR_ID, FEED_OPEN_BEHAVIOR_ID] : [];
}

export function sceneBehaviorIds(sceneId: string): string[] {
  if (sceneId === HOME_DOCK_SCENE_ID) return [...HOME_DOCK_ACTION_IDS];
  if (sceneId === INBOX_NEXT_SCENE_ID) return defaultInboxNextBehaviorIds(true);
  if (sceneId === FEED_CAPTURE_SCENE_ID) return defaultFeedCaptureBehaviorIds(true);
  return [];
}

export function clickableBehaviorIds(): string[] {
  return [...new Set([
    ...sceneBehaviorIds(HOME_DOCK_SCENE_ID),
    ...sceneBehaviorIds(INBOX_NEXT_SCENE_ID),
    ...sceneBehaviorIds(FEED_CAPTURE_SCENE_ID),
  ])];
}

export function isFunctionDestinationId(value: string): boolean {
  return value === HOME_DOCK_SCENE_ID
    || value === INBOX_NEXT_SCENE_ID
    || value === FEED_CAPTURE_SCENE_ID
    || value === AGENT_MCP_DESTINATION_ID;
}

export const FUNCTION_AUTHORING_SUBJECTS: readonly FunctionAuthoringSubject[] = [
  { subject_kind: "feed_item", title: "Feed 消息" },
  { subject_kind: "inbox_entry", title: "Inbox" },
  { subject_kind: "source", title: "来源出错" },
  { subject_kind: "home_event", title: "首页事件" },
  { subject_kind: "session", title: "Session" },
  { subject_kind: "mcp_invoke", title: "Agent" },
];

export function functionAuthoringDestinations(): FunctionAuthoringDestination[] {
  return [
    {
      destination_id: HOME_DOCK_SCENE_ID,
      kind: "event",
      title: "首页",
      when: "点开事件时，亮哪些按钮",
      configure_at: "发布后打开",
      effect: "亮哪些按钮",
      subject_kinds: ["inbox_entry", "feed_item", "source", "session", "home_event"],
      behavior_ids: sceneBehaviorIds(HOME_DOCK_SCENE_ID),
    },
    {
      destination_id: INBOX_NEXT_SCENE_ID,
      kind: "event",
      title: "Inbox",
      when: "新事项来时，显示「做完了」还是「忽略」",
      configure_at: "发布后打开",
      effect: "显示「做完了」还是「忽略」",
      subject_kinds: ["inbox_entry"],
      behavior_ids: sceneBehaviorIds(INBOX_NEXT_SCENE_ID),
    },
    {
      destination_id: FEED_CAPTURE_SCENE_ID,
      kind: "event",
      title: "Feed",
      when: "要不要出现「加入 Inbox」",
      configure_at: "去任务捕捉规则里选",
      effect: "「加入 Inbox」出不出现",
      subject_kinds: ["feed_item"],
      behavior_ids: sceneBehaviorIds(FEED_CAPTURE_SCENE_ID),
    },
    {
      destination_id: AGENT_MCP_DESTINATION_ID,
      kind: "mcp",
      title: "Agent",
      when: "给 Agent 选动作",
      configure_at: "发布后可用",
      effect: "给 Agent 选动作",
      subject_kinds: ["mcp_invoke"],
      behavior_ids: [],
    },
  ];
}

export function assembleFunctionAuthoringCatalog(
  input: FunctionAuthoringCatalogInput = {},
): FunctionAuthoringCatalog {
  const clickable = new Set(clickableBehaviorIds());
  const pluginTitles = input.plugin_titles ?? {};
  const behaviors: FunctionAuthoringBehavior[] = (input.behaviors ?? []).map((row) => {
    const plugin_title = row.plugin_id === "system" ? "系统" : (pluginTitles[row.plugin_id] ?? pluginTitleFallback(row.plugin_id));
    if (row.source === "mcp") {
      return {
        behavior_id: row.behavior_id,
        title: mcpAuthoringTitle(row.behavior_id, plugin_title),
        hint: row.title,
        effect: row.effect,
        source: row.source,
        plugin_id: row.plugin_id,
        plugin_title,
        subject_kinds: row.subject_kinds,
        clickable: false,
      };
    }
    return {
      behavior_id: row.behavior_id,
      title: row.title,
      effect: row.effect,
      source: row.source,
      plugin_id: row.plugin_id,
      plugin_title,
      subject_kinds: row.subject_kinds,
      clickable: clickable.has(row.behavior_id),
    };
  });
  const destinations = functionAuthoringDestinations().map((dest) => {
    if (dest.destination_id !== AGENT_MCP_DESTINATION_ID) return dest;
    return { ...dest, behavior_ids: behaviors.map((row) => row.behavior_id) };
  });
  return {
    subjects: mergeAuthoringSubjects(FUNCTION_AUTHORING_SUBJECTS, input.extra_subjects),
    destinations,
    behaviors,
  };
}

function pluginTitleFallback(pluginId: string): string {
  const segment = pluginId.split(".").at(-1) ?? pluginId;
  return segment;
}

function mcpAuthoringTitle(behaviorId: string, pluginTitle: string): string {
  const prefix = "molis_work_v1_";
  const rest = behaviorId.startsWith(prefix) ? behaviorId.slice(prefix.length) : behaviorId;
  const cut = rest.indexOf("_");
  const toolId = cut >= 0 ? rest.slice(cut + 1) : rest;
  return `${pluginTitle} · ${toolId}`;
}

function mergeAuthoringSubjects(
  base: readonly FunctionAuthoringSubject[],
  extra: readonly FunctionAuthoringSubject[] | undefined,
): FunctionAuthoringSubject[] {
  const byKind = new Map<string, FunctionAuthoringSubject>();
  for (const row of base) byKind.set(row.subject_kind, row);
  for (const row of extra ?? []) {
    if (!byKind.has(row.subject_kind)) byKind.set(row.subject_kind, row);
  }
  return [...byKind.values()];
}

export function functionOutputKeys(record: {
  readonly primitive: FunctionsPrimitive;
  readonly criteria: FunctionCriteria;
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

export function resolvedSceneBehaviors(
  record: {
    readonly primitive: FunctionsPrimitive;
    readonly criteria: FunctionCriteria;
    readonly scene_map?: FunctionSceneMap | null;
  },
  pool: readonly string[],
): string[] | null {
  const keys = functionOutputKeys(record);
  if (keys.length === 0) return null;
  const map = record.scene_map ?? {};
  const resolved: string[] = [];
  for (const key of keys) {
    const target = map[key] || (pool.includes(key) ? key : "");
    if (!target || !pool.includes(target)) return null;
    resolved.push(target);
  }
  return resolved;
}

export function mapJudgmentChoice(
  record: {
    readonly primitive: FunctionsPrimitive;
    readonly criteria: FunctionCriteria;
    readonly scene_map?: FunctionSceneMap | null;
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

export function functionFitsScene(
  record: {
    readonly primitive: FunctionsPrimitive;
    readonly criteria: FunctionCriteria;
    readonly scene_id?: string | null;
    readonly scene_map?: FunctionSceneMap | null;
  },
  sceneId: string,
  pool: readonly string[] = sceneBehaviorIds(sceneId),
): boolean {
  if (record.scene_id === AGENT_MCP_DESTINATION_ID) return sceneId === AGENT_MCP_DESTINATION_ID;
  if (record.scene_id && record.scene_id !== sceneId) return false;
  if (pool.length === 0) return true;
  const resolved = resolvedSceneBehaviors(record, pool);
  if (!resolved) return false;
  if (sceneId === HOME_DOCK_SCENE_ID) {
    const inboxPool = sceneBehaviorIds(INBOX_NEXT_SCENE_ID);
    if (
      resolved.every((id) => inboxPool.includes(id))
      && !resolved.some((id) => HOME_DOCK_PRIMARY_BEHAVIOR_IDS.includes(id))
    ) {
      return false;
    }
  }
  return true;
}
