import type {
  ModelApiFormat,
  ModelProviderHealth,
  ModelProviderRecord,
  ModelProviderStatus,
  ModelPromptCacheMode,
  ModelRecord,
} from "@molis-ai/molis-work-contracts/modules/model-providers";
import { promptCacheIsClientControlled } from "@molis-ai/molis-work-contracts/modules/model-providers";

/**
 * The model settings page: which providers exist, what each speaks, and which
 * models they offer.
 *
 * The API key is never rendered. The field shows whether one is stored and
 * nothing more — a page that echoed the key would put it in every screenshot,
 * cache and view-source.
 */

export interface ModelSettingsPrimitives {
  L(text: string): string;
  escape(value: unknown): string;
  icon(name: string): string;
}

export interface ModelSettingsModel {
  readonly providers: readonly ModelProviderRecord[];
  readonly health: readonly ModelProviderHealth[];
  /** Which provider the detail pane shows. Null when nothing is configured yet. */
  readonly selected_provider_id: string | null;
  readonly primitives: ModelSettingsPrimitives;
}

const API_FORMATS: ReadonlyArray<{ value: ModelApiFormat; label: string }> = [
  { value: "anthropic-messages", label: "Anthropic Messages (/v1/messages)" },
  { value: "openai-chat-completions", label: "OpenAI Chat Completions (/chat/completions)" },
];

const PROMPT_CACHE_MODES: ReadonlyArray<{ value: ModelPromptCacheMode; label: string }> = [
  { value: "off", label: "关闭" },
  { value: "best-effort", label: "尽量命中" },
  { value: "required", label: "必须命中（不支持就失败）" },
];

/** Status maps to the family colours already in the palette, never to new ones. */
const STATUS_TONE: Record<ModelProviderStatus, string> = {
  ready: "done",
  "needs-credential": "attention",
  "no-models": "attention",
  disabled: "idle",
};

export function renderModelSettingsDocument(model: ModelSettingsModel): string {
  const { primitives: p } = model;
  const selected = model.providers.find(
    (provider) => provider.provider_id === model.selected_provider_id,
  ) ?? model.providers[0];
  return `<section class="settings-document model-settings-document" aria-labelledby="settings-title" data-model-settings>
    <header class="settings-heading">
      <div class="settings-heading-title"><h1 id="settings-title">${p.L("模型设置")}</h1></div>
      <div class="model-settings-head">
        <p>${p.L("管理自定义模型供应商，配置后可在聊天时选择使用。")}</p>
        <div class="model-settings-actions">
          <button type="button" class="mw-button" data-model-refresh aria-label="${p.L("重新检查所有供应商")}">${p.icon("refresh")}</button>
          <button type="button" class="mw-button mw-button--primary" data-model-add-provider>${p.icon("plus")}${p.L("添加供应商")}</button>
        </div>
      </div>
    </header>
    <div class="model-settings-panes">
      ${renderProviderList(model, selected?.provider_id ?? null)}
      ${selected === undefined ? renderEmptyDetail(p) : renderProviderDetail(selected, model)}
    </div>
  </section>`;
}

function renderProviderList(model: ModelSettingsModel, selectedId: string | null): string {
  const { primitives: p } = model;
  if (model.providers.length === 0) {
    return `<nav class="model-provider-list" aria-label="${p.L("供应商")}"></nav>`;
  }
  const rows = model.providers.map((provider) => {
    const health = model.health.find((entry) => entry.provider_id === provider.provider_id);
    const status = health?.status ?? "needs-credential";
    const current = provider.provider_id === selectedId;
    return `<button type="button" class="model-provider-row${current ? " is-current" : ""}"
      data-model-provider="${p.escape(provider.provider_id)}"${current ? ' aria-current="true"' : ""}>
      ${p.icon("package")}
      <span class="model-provider-name">${p.escape(provider.display_name)}</span>
      <span class="mw-status" data-tone="${STATUS_TONE[status]}" title="${p.escape(health?.detail ?? "")}">${p.icon("dot")}</span>
    </button>`;
  }).join("");
  return `<nav class="model-provider-list" aria-label="${p.L("供应商")}">
    <h2 class="model-provider-group">${p.L("自定义供应商")}</h2>
    ${rows}
  </nav>`;
}

function renderEmptyDetail(p: ModelSettingsPrimitives): string {
  return `<div class="model-provider-detail mw-empty" data-model-detail-empty>
    ${p.icon("package")}<p>${p.L("还没有配置供应商")}</p>
  </div>`;
}

function renderProviderDetail(provider: ModelProviderRecord, model: ModelSettingsModel): string {
  const { primitives: p } = model;
  const health = model.health.find((entry) => entry.provider_id === provider.provider_id);
  const hasCredential = health?.status !== "needs-credential";
  const formats = API_FORMATS.map((format) => `<option value="${format.value}"${format.value === provider.api_format ? " selected" : ""}>${p.escape(format.label)}</option>`).join("");
  return `<div class="model-provider-detail" data-model-detail="${p.escape(provider.provider_id)}">
    <header class="model-provider-detail-head">
      ${p.icon("package")}
      <h2>${p.escape(provider.display_name)}</h2>
      <label class="mw-switch">
        <input type="checkbox" data-model-provider-enabled="${p.escape(provider.provider_id)}"${provider.enabled ? " checked" : ""}>
        <span>${p.L("启用这个供应商")}</span>
      </label>
      <button type="button" class="mw-button" data-model-provider-menu="${p.escape(provider.provider_id)}" aria-label="${p.L("更多操作")}">${p.icon("more")}</button>
    </header>

    <div class="model-field">
      <label for="model-base-url">${p.L("Base URL")}</label>
      <input id="model-base-url" type="url" inputmode="url" spellcheck="false"
        value="${p.escape(provider.base_url)}" data-model-base-url="${p.escape(provider.provider_id)}">
    </div>

    <div class="model-field">
      <label for="model-api-format">${p.L("API 格式")}</label>
      <select id="model-api-format" data-model-api-format="${p.escape(provider.provider_id)}">${formats}</select>
    </div>

    ${renderPromptCacheField(provider, p)}

    ${renderCredentialField(provider, hasCredential, p)}
    ${renderModelList(provider, p)}
  </div>`;
}

/**
 * The prompt cache field.
 *
 * On a format with no breakpoint we can set, "必须命中" is not offered at all —
 * rather than offered and refused on save. An option that exists but can never
 * be chosen teaches the user nothing; its absence plus one sentence does.
 */
function renderPromptCacheField(
  provider: ModelProviderRecord,
  p: ModelSettingsPrimitives,
): string {
  const controllable = promptCacheIsClientControlled(provider.api_format);
  const current = provider.prompt_cache ?? "off";
  const options = PROMPT_CACHE_MODES
    .filter((mode) => controllable || mode.value !== "required")
    .map((mode) => `<option value="${mode.value}"${mode.value === current ? " selected" : ""}>${p.escape(p.L(mode.label))}</option>`)
    .join("");
  const note = controllable
    ? p.L("命中的缓存 token 会显示在这一轮的用量里。")
    : p.L("这个格式由对方自动做前缀缓存，没有我们能打开的开关，所以给不了「必须命中」。");
  return `<div class="model-field">
      <label for="model-prompt-cache">${p.L("提示缓存")}</label>
      <select id="model-prompt-cache" data-model-prompt-cache="${p.escape(provider.provider_id)}">${options}</select>
      <p class="model-field-note">${p.escape(note)}</p>
    </div>`;
}

/**
 * The key field.
 *
 * It renders a fixed mask when a key is stored and an empty field when none is,
 * never the key and never its length. Typing a new value replaces it; leaving it
 * untouched keeps what the secret store already has.
 */
function renderCredentialField(
  provider: ModelProviderRecord,
  hasCredential: boolean,
  p: ModelSettingsPrimitives,
): string {
  return `<div class="model-field">
    <label for="model-api-key">${p.L("API Key")}</label>
    <div class="model-key-row">
      <input id="model-api-key" type="password" autocomplete="off" spellcheck="false"
        data-model-api-key="${p.escape(provider.provider_id)}"
        placeholder="${hasCredential ? p.L("已保存，留空则不改动") : p.L("填入 API Key")}">
      <button type="button" class="mw-button" data-model-key-reveal aria-label="${p.L("显示输入的内容")}">${p.icon("eye")}</button>
    </div>
    ${hasCredential ? "" : `<p class="model-field-hint mw-status" data-tone="attention">${p.icon("alert-circle")}${p.L("还没有填 API Key，这个供应商用不了")}</p>`}
  </div>`;
}

function renderModelList(provider: ModelProviderRecord, p: ModelSettingsPrimitives): string {
  const rows = provider.models.length === 0
    ? `<p class="model-field-hint">${p.L("还没有添加模型")}</p>`
    : provider.models.map((model) => renderModelRow(provider.provider_id, model, p)).join("");
  return `<section class="model-list" aria-label="${p.L("模型列表")}">
    <header class="model-list-head">
      <h3>${p.L("模型列表")}</h3>
      <button type="button" class="mw-button" data-model-add="${p.escape(provider.provider_id)}">${p.icon("plus")}${p.L("添加模型")}</button>
    </header>
    ${rows}
  </section>`;
}

function renderModelRow(providerId: string, model: ModelRecord, p: ModelSettingsPrimitives): string {
  // Badges state facts the provider gave us. An unknown context window shows no
  // badge rather than a guessed number.
  const badges = [
    model.context_tokens === undefined ? "" : `<span class="model-badge">${p.escape(formatContext(model.context_tokens))}</span>`,
    model.vision === true ? `<span class="model-badge">${p.L("视觉")}</span>` : "",
  ].join("");
  return `<div class="model-row" data-model-row="${p.escape(model.model_id)}">
    <code class="model-row-id">${p.escape(model.display_name ?? model.model_id)}</code>
    ${badges}
    <span class="model-row-spacer"></span>
    <button type="button" class="mw-button" data-model-test="${p.escape(model.model_id)}" aria-label="${p.L("测试这个模型")}">${p.icon("plug")}</button>
    <button type="button" class="mw-button" data-model-edit="${p.escape(model.model_id)}" aria-label="${p.L("编辑")}">${p.icon("pencil")}</button>
    <button type="button" class="mw-button" data-model-remove="${p.escape(model.model_id)}" aria-label="${p.L("删除")}">${p.icon("trash")}</button>
    <label class="mw-switch">
      <input type="checkbox" data-model-enabled="${p.escape(providerId)}:${p.escape(model.model_id)}"${model.enabled ? " checked" : ""}>
      <span class="mw-visually-hidden">${p.L("启用")}</span>
    </label>
  </div>`;
}

export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`.replace(".0M", "M");
  if (tokens >= 1_000) return `${Math.round(tokens / 100) / 10}K`.replace(".0K", "K");
  return String(tokens);
}
