import {
  FUNCTIONS_CREDENTIAL_REF,
  type FunctionDraftPatch,
  type FunctionRecord,
  type FunctionsPreviewRecord,
  type FunctionsSettingsStatus,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { FunctionsError } from "./keys.js";
import { createHttpTypeSafeProvider, type TypeSafeProvider } from "./provider.js";
import { FunctionsStore, assertReadyToPublish } from "./store.js";

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

  get(id: string): FunctionRecord {
    return this.store.require(id);
  }

  createChoice(input?: { name?: string; function_key?: string }): FunctionRecord {
    return this.store.createChoice(input);
  }

  updateDraft(id: string, patch: FunctionDraftPatch): FunctionRecord {
    return this.store.updateDraft(id, patch);
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
    const state = input.trim();
    if (!state || state.length > 8000) {
      throw new FunctionsError("functions.invalid", "试跑输入须为 1 到 8000 个字");
    }
    const current = this.store.require(id);
    assertReadyToEvaluate(current);
    const apiKey = this.resolveApiKey();
    const result = await this.provider.evaluate(apiKey, {
      model: current.model,
      state,
      question_key: current.function_key,
      instructions: current.instructions,
      criteria: current.criteria,
    });
    const preview: FunctionsPreviewRecord = {
      input: state,
      outcome: result.choice ? "selected" : "needs_review",
      choice: result.choice,
      probabilities: result.probabilities,
      confidence: result.confidence,
      model: result.model || current.model,
      config_hash: current.config_hash,
      at: new Date().toISOString(),
    };
    return this.store.savePreview(id, preview);
  }

  publish(id: string): FunctionRecord {
    return this.store.publish(id);
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

function assertReadyToEvaluate(record: FunctionRecord): void {
  if (!record.instructions.trim()) {
    throw new FunctionsError("functions.invalid", "判断说明须为 1 到 8000 个字");
  }
  if (record.criteria.some((item) => !item.description.trim()) || record.criteria.length < 2) {
    throw new FunctionsError("functions.invalid", "Choice 至少需要两个写了说明的选项");
  }
}

export { assertReadyToPublish };
