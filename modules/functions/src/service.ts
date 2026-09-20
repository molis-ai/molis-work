import {
  FUNCTIONS_CREDENTIAL_REF,
  filterSuggestedBehaviorIds,
  type FunctionDescribe,
  type FunctionDraftPatch,
  type FunctionInvokeResult,
  type FunctionRecord,
  type FunctionSceneBinding,
  type FunctionSummary,
  type FunctionsOutcome,
  type FunctionsPreviewRecord,
  type FunctionsPrimitive,
  type FunctionsSecretPort,
  type FunctionsSettingsStatus,
  type JudgeFunctionInput,
  type JudgmentRecord,
  type TypeSafeEvaluateResult,
  type TypeSafeProvider,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { FunctionsError } from "./keys.js";
import { FunctionsStore, assertReadyToEvaluate, assertReadyToPublish } from "./store.js";

export type { FunctionsSecretPort, TypeSafeProvider, TypeSafeEvaluateResult };

export interface FunctionsServiceOptions {
  readonly store: FunctionsStore;
  readonly secrets: FunctionsSecretPort;
  readonly env?: NodeJS.Dict<string>;
  readonly provider?: TypeSafeProvider;
  readonly allowed_behavior_ids?: readonly string[];
}

const missingProvider: TypeSafeProvider = {
  async evaluate() {
    throw new FunctionsError("functions.provider_not_configured", "还没有配置 TypeSafe API Key");
  },
};

export class FunctionsService {
  private readonly store: FunctionsStore;
  private readonly secrets: FunctionsSecretPort;
  private readonly env: NodeJS.Dict<string>;
  private readonly provider: TypeSafeProvider;
  private readonly allowedBehaviorIds: readonly string[];

  constructor(options: FunctionsServiceOptions) {
    this.store = options.store;
    this.secrets = options.secrets;
    this.env = options.env ?? {};
    this.provider = options.provider ?? missingProvider;
    this.allowedBehaviorIds = options.allowed_behavior_ids ?? [];
  }

  list(): FunctionRecord[] {
    return this.store.list();
  }

  listPublished(): FunctionSummary[] {
    return this.store.list()
      .filter((record) => record.status === "published" && record.version != null)
      .map((record) => ({
        function_key: record.function_key,
        name: record.name,
        primitive: record.primitive,
        version: record.version!,
        model: record.model,
      }));
  }

  get(id: string): FunctionRecord {
    return this.store.require(id);
  }

  describePublished(functionKey: string): FunctionDescribe {
    const record = this.store.requirePublishedByKey(functionKey);
    return {
      function_key: record.function_key,
      name: record.name,
      primitive: record.primitive,
      version: record.version!,
      model: record.model,
      instructions: record.instructions,
      input: { content: "string" },
      criteria: record.criteria,
    };
  }

  create(input?: { primitive?: FunctionsPrimitive; name?: string; function_key?: string }): FunctionRecord {
    return this.store.create(input);
  }

  createChoice(input?: { name?: string; function_key?: string }): FunctionRecord {
    return this.store.createChoice(input);
  }

  updateDraft(id: string, patch: FunctionDraftPatch): FunctionRecord {
    return this.store.updateDraft(id, patch);
  }

  addSample(id: string, input: { label?: string; input: string }): FunctionRecord {
    return this.store.addSample(id, input);
  }

  removeSample(id: string, sampleId: string): FunctionRecord {
    return this.store.removeSample(id, sampleId);
  }

  deleteDraft(id: string): void {
    this.store.deleteDraft(id);
  }

  settingsStatus(): FunctionsSettingsStatus {
    if (envKey(this.env)) return { has_credential: true, source: "env" };
    if (this.secrets.get(FUNCTIONS_CREDENTIAL_REF)?.trim()) return { has_credential: true, source: "ui" };
    return { has_credential: false, source: "none" };
  }

  saveCredential(apiKey: string): FunctionsSettingsStatus {
    const value = apiKey.trim();
    if (!value) throw new FunctionsError("functions.invalid", "请填写 TypeSafe API Key");
    this.secrets.put(FUNCTIONS_CREDENTIAL_REF, value);
    return this.settingsStatus();
  }

  clearCredential(): FunctionsSettingsStatus {
    this.secrets.delete(FUNCTIONS_CREDENTIAL_REF);
    return this.settingsStatus();
  }

  async preview(id: string, input: string): Promise<FunctionRecord> {
    const current = this.store.require(id);
    const result = await this.evaluate(current, input);
    const preview: FunctionsPreviewRecord = {
      input: input.trim(),
      outcome: outcomeOf(result),
      primitive: result.primitive,
      choice: result.choice,
      noul: result.noul,
      score: result.score,
      legend: result.legend,
      probabilities: result.probabilities,
      confidence: result.confidence,
      model: result.model || current.model,
      config_hash: current.config_hash,
      at: new Date().toISOString(),
    };
    return this.store.savePreview(id, preview);
  }

  async invokePublished(functionKey: string, input: string): Promise<FunctionInvokeResult> {
    const current = this.store.requirePublishedByKey(functionKey);
    const result = await this.evaluate(current, input);
    const outcome = outcomeOf(result);
    this.store.recordJudgment({
      function_key: current.function_key,
      function_version: current.version!,
      subject: { kind: "mcp_invoke", id: current.function_key },
      scene_id: null,
      outcome,
      suggested_behavior_ids: outcome === "ok"
        ? filterSuggestedBehaviorIds(this.allowedBehaviorIds, this.allowedBehaviorIds, result.choice)
        : [],
      error_code: null,
    });
    return {
      status: outcome,
      function_key: current.function_key,
      version: current.version!,
      model: result.model || current.model,
      config_hash: current.config_hash,
      primitive: current.primitive,
      data: invokeData(result),
      probabilities: result.probabilities,
      confidence: result.confidence,
    };
  }

  sceneBinding(sceneId: string, boardId?: string | null, ref?: string | null): FunctionSceneBinding | null {
    return this.store.getSceneBinding(sceneId, boardId ?? null, ref ?? null);
  }

  bindScene(sceneId: string, functionKey: string, boardId?: string | null, ref?: string | null): FunctionSceneBinding {
    this.store.requirePublishedByKey(functionKey);
    return this.store.bindScene(sceneId, functionKey, boardId ?? null, ref ?? null);
  }

  unbindScene(sceneId: string, boardId?: string | null, ref?: string | null): void {
    this.store.unbindScene(sceneId, boardId ?? null, ref ?? null);
  }

  listSceneBindings(functionKey?: string): FunctionSceneBinding[] {
    return this.store.listSceneBindings(functionKey);
  }

  listJudgments(): JudgmentRecord[] {
    return this.store.listJudgments();
  }

  latestJudgment(kind: JudgmentRecord["subject"]["kind"], id: string, boardId?: string): JudgmentRecord | null {
    return this.store.latestJudgment(kind, id, boardId);
  }

  async judge(input: JudgeFunctionInput): Promise<JudgmentRecord> {
    const allowed = this.allowedBehaviorIds.length > 0 ? this.allowedBehaviorIds : input.offered_behavior_ids;
    const offered = input.offered_behavior_ids;
    try {
      const current = this.store.requirePublishedByKey(input.function_key);
      const result = await this.evaluate(current, input.input);
      const outcome = outcomeOf(result);
      const suggested = outcome === "ok"
        ? filterSuggestedBehaviorIds(offered, allowed, result.choice)
        : [];
      return this.store.recordJudgment({
        function_key: current.function_key,
        function_version: current.version!,
        subject: input.subject,
        scene_id: input.scene_id ?? null,
        outcome,
        suggested_behavior_ids: suggested,
        error_code: null,
      });
    } catch (error) {
      const code = error instanceof FunctionsError ? error.code : "functions.failed";
      return this.store.recordJudgment({
        function_key: input.function_key,
        function_version: 0,
        subject: input.subject,
        scene_id: input.scene_id ?? null,
        outcome: "needs_review",
        suggested_behavior_ids: [],
        error_code: code,
      });
    }
  }

  publish(id: string): FunctionRecord {
    return this.store.publish(id);
  }

  private async evaluate(record: FunctionRecord, input: string): Promise<TypeSafeEvaluateResult> {
    const state = input.trim();
    if (!state || state.length > 8000) {
      throw new FunctionsError("functions.invalid", "试跑输入须为 1 到 8000 个字");
    }
    assertReadyToEvaluate(record);
    return this.provider.evaluate(this.resolveApiKey(), record, state);
  }

  private resolveApiKey(): string {
    const fromEnv = envKey(this.env);
    if (fromEnv) return fromEnv;
    const stored = this.secrets.get(FUNCTIONS_CREDENTIAL_REF)?.trim() ?? "";
    if (stored) return stored;
    throw new FunctionsError("functions.provider_not_configured", "还没有配置 TypeSafe API Key");
  }
}

export function createFunctionsService(options: FunctionsServiceOptions): FunctionsService {
  return new FunctionsService(options);
}

function envKey(env: NodeJS.Dict<string>): string {
  return env.TYPESAFE_API_KEY?.trim() ?? "";
}

function outcomeOf(result: TypeSafeEvaluateResult): FunctionsOutcome {
  if (result.primitive === "choice" && !result.choice) return "needs_review";
  return "ok";
}

function invokeData(result: TypeSafeEvaluateResult): FunctionInvokeResult["data"] {
  if (result.primitive === "noul") return { noul: result.noul ?? 0 };
  if (result.primitive === "score") return { score: result.score ?? 0, legend: result.legend ?? [] };
  return { choice: result.choice };
}

export { assertReadyToPublish };
