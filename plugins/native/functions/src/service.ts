import {
  FUNCTIONS_CREDENTIAL_REF,
  type FunctionDescribe,
  type FunctionDraftPatch,
  type FunctionInvokeResult,
  type FunctionRecord,
  type FunctionSummary,
  type FunctionsOutcome,
  type FunctionsPreviewRecord,
  type FunctionsPrimitive,
  type FunctionsSettingsStatus,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { FunctionsError } from "./keys.js";
import { createHttpTypeSafeProvider, type TypeSafeEvaluateResult, type TypeSafeProvider } from "./provider.js";
import { FunctionsStore, assertReadyToEvaluate, assertReadyToPublish } from "./store.js";

export interface FunctionsSecretPort {
  put(ref: string, plaintext: string): void;
  get(ref: string): string | null;
  delete(ref: string): void;
}

export interface FunctionsServiceOptions {
  readonly store: FunctionsStore;
  readonly secrets: FunctionsSecretPort;
  readonly env?: NodeJS.Dict<string>;
  readonly provider?: TypeSafeProvider;
}

export class FunctionsService {
  private readonly store: FunctionsStore;
  private readonly secrets: FunctionsSecretPort;
  private readonly env: NodeJS.Dict<string>;
  private readonly provider: TypeSafeProvider;

  constructor(options: FunctionsServiceOptions) {
    this.store = options.store;
    this.secrets = options.secrets;
    this.env = options.env ?? {};
    this.provider = options.provider ?? createHttpTypeSafeProvider();
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
    return {
      status: outcomeOf(result),
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
