import type { AiRuntimePort, GenerationResult, RuntimeModel, StructuredGenerationRequest } from "../../domain/kernel/ports.js";
import type { RuntimeSettings } from "../../domain/settings/runtime-settings.js";
import type { RuntimeSettingsDto } from "../../shared/contracts/settings.js";
import type { SqliteSettingsRepository } from "../db/settings-repository.js";
import { generateWithHost, type AlchemistAiPort } from "./host-port.js";

interface RuntimeSelectorOptions {
  workspaceId: string;
  settings: SqliteSettingsRepository;
  ai: AlchemistAiPort;
  now(): string;
}
export class RuntimeSelector implements AiRuntimePort {
  constructor(private readonly options: RuntimeSelectorOptions) {}
  async listModels(): Promise<readonly RuntimeModel[]> { return this.options.ai.listModels(); }
  async generateStructured<Result>(input: StructuredGenerationRequest<Result>): Promise<GenerationResult<Result>> {
    const settings = this.settings();
    const models = await this.listModels();
    const selected = settings.modelPolicy === "fixed" ? models.find(model => model.id === settings.modelId) : models[0];
    if (!selected) throw new Error(settings.modelPolicy === "fixed" ? "RUNTIME_MODEL_UNAVAILABLE" : "RUNTIME_NOT_CONFIGURED");
    return generateWithHost(this.options.ai, input, selected.id);
  }
  async isRealEnabled(): Promise<boolean> { return (await this.getPublicSettings()).configured; }
  async getPublicSettings(): Promise<RuntimeSettingsDto> { return this.publicSettings(this.settings(), await this.listModels()); }
  async update(input: Omit<RuntimeSettings, "workspaceId" | "provider" | "updatedAt">): Promise<RuntimeSettingsDto> {
    const models = await this.listModels();
    if (input.modelPolicy === "fixed" && !models.some(model => model.id === input.modelId)) throw new Error("RUNTIME_MODEL_UNAVAILABLE");
    const updated = this.options.settings.update({ ...this.settings(), ...input, provider: models.length ? "prologue" : "none", updatedAt: this.options.now() });
    return this.publicSettings(updated, models);
  }
  async verifyAndEnable(): Promise<RuntimeSettingsDto> {
    const current = await this.getPublicSettings();
    if (!current.configured) throw new Error("RUNTIME_NOT_CONFIGURED");
    return current;
  }
  private settings(): RuntimeSettings {
    const settings = this.options.settings.get(this.options.workspaceId);
    if (!settings) throw new Error("RUNTIME_SETTINGS_NOT_FOUND");
    return settings;
  }
  private publicSettings(settings: RuntimeSettings, models: readonly RuntimeModel[]): RuntimeSettingsDto {
    const selected = settings.modelPolicy === "fixed" ? models.find(model => model.id === settings.modelId) : models[0];
    const { workspaceId: _workspaceId, ...publicValues } = settings;
    return { ...publicValues, provider: selected ? "prologue" : "none", configured: Boolean(selected), runtimeLabel: selected?.runtimeLabel ?? "请在 Molis Work 设置中配置模型", models };
  }
}
