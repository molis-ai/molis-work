import type { ContractDescriptor } from "../platform/package.js";

export const modulesFunctionsContract = {
  contractId: "io.molis.work.module.functions.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "specs/functions-system-capability/spec.md",
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
  latest(kind: JudgmentSubjectKind, id: string, boardId?: string): JudgmentRecord | null;
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

export function visibleDockBehaviorIds(
  suggested: readonly string[] | null | undefined,
  defaults: readonly string[],
): string[] {
  const kept = (suggested ?? []).filter((id) => defaults.includes(id) && id !== HOME_TALK_BEHAVIOR_ID);
  return kept.length > 0 ? kept : [...defaults];
}
