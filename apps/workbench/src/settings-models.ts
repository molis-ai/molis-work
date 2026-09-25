import { renderSwitch, type MolisWorkIcon } from "@molis-ai/molis-work-design-system";
import type {
  ModelApiFormat,
  ModelProviderHealth,
  ModelProviderRecord,
  ModelProviderStatus,
  ModelPromptCacheMode,
  ModelRecord,
} from "@molis-ai/molis-work-contracts/modules/model-providers";
import { promptCacheIsClientControlled } from "@molis-ai/molis-work-contracts/modules/model-providers";
import type { ConnectorConnectionView } from "@molis-ai/molis-work-contracts/services/connector-host";

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
  icon(name: MolisWorkIcon): string;
}

export interface ModelSettingsModel {
  readonly providers: readonly ModelProviderRecord[];
  readonly health: readonly ModelProviderHealth[];
  readonly draft_provider?: ModelProviderRecord;
  /** Which provider the detail pane shows. Null when nothing is configured yet. */
  readonly selected_provider_id: string | null;
  readonly connections?: readonly ConnectorConnectionView[];
  readonly selected_connection_ids?: Readonly<Record<string, string>>;
  readonly primitives: ModelSettingsPrimitives;
}

const API_FORMATS: ReadonlyArray<{ value: ModelApiFormat; label: string }> = [
  { value: "anthropic-messages", label: "Anthropic Messages (/v1/messages)" },
  { value: "openai-chat-completions", label: "OpenAI Chat Completions (/chat/completions)" },
];

const PROMPT_CACHE_MODES: ReadonlyArray<{ value: ModelPromptCacheMode; label: string }> = [
  { value: "off", label: "关闭" },
  { value: "best-effort", label: "尽量使用缓存" },
  { value: "required", label: "要求缓存支持（不支持就失败）" },
];

/** Status maps to the family colours already in the palette, never to new ones. */
const STATUS_TONE: Record<ModelProviderStatus, string> = {
  ready: "done",
  "needs-credential": "attention",
  "credential-unavailable": "attention",
  "no-models": "attention",
  disabled: "idle",
};

export function renderModelSettingsDocument(model: ModelSettingsModel): string {
  const { primitives: p } = model;
  const selected = model.draft_provider ?? model.providers.find(
    (provider) => provider.provider_id === model.selected_provider_id,
  ) ?? model.providers[0];
  return `<section class="settings-document model-settings-document" aria-labelledby="settings-title" data-model-settings>
    <header class="settings-heading">
      <div class="settings-heading-title"><h1 id="settings-title">${p.L("模型设置")}</h1></div>
      <div class="model-settings-head">
        <p>${p.L("管理自定义模型供应商，配置后可在聊天时选择使用。")}</p>
        <div class="model-settings-actions">
          <button type="button" class="mw-btn" data-model-refresh aria-label="${p.L("重新检查所有供应商")}">${p.icon("refresh")}</button>
          <button type="button" class="mw-btn mw-btn--primary" data-model-add-provider>${p.icon("plus")}${p.L("添加供应商")}</button>
        </div>
      </div>
    </header>
    <p role="status" aria-live="polite" data-model-status></p>
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
  const hasCredential = health?.credential_status === "present" || health?.status === "ready";
  const formats = API_FORMATS.map((format) => `<option value="${format.value}"${format.value === provider.api_format ? " selected" : ""}>${p.escape(format.label)}</option>`).join("");
  return `<div class="model-provider-detail" data-model-detail="${p.escape(provider.provider_id)}">
    <header class="model-provider-detail-head">
      ${p.icon("package")}
      <h2>${p.escape(provider.display_name)}</h2>
      ${renderSwitch({ label: p.L("启用供应商"), checked: provider.enabled, attrs: { "data-model-provider-enabled": provider.provider_id } })}
      <button type="button" class="mw-btn" data-model-provider-remove="${p.escape(provider.provider_id)}">${p.icon("trash")}${p.L("移除供应商")}</button>
    </header>

    <div class="model-field"><label for="model-provider-name">${p.L("名称")}</label>
      <input class="mw-input" id="model-provider-name" data-model-name value="${p.escape(provider.display_name)}" maxlength="120"></div>
    <div class="model-field">
      <label for="model-base-url">${p.L("Base URL")}</label>
      <input class="mw-input" id="model-base-url" type="url" inputmode="url" spellcheck="false"
        value="${p.escape(provider.base_url)}" data-model-base-url="${p.escape(provider.provider_id)}">
    </div>

    <div class="model-field">
      <label for="model-api-format">${p.L("API 格式")}</label>
      <select class="mw-select" id="model-api-format" data-model-api-format="${p.escape(provider.provider_id)}">${formats}</select>
    </div>

    ${renderPromptCacheField(provider, p)}

    ${renderCredentialField(hasCredential, p, model.connections ?? [], model.selected_connection_ids?.[provider.provider_id])}
    ${health?.status === "credential-unavailable" ? `<p role="alert">${p.escape(p.L(health.detail))}</p>` : ""}
    ${renderModelList(provider, p)}
    <div data-model-delete-confirm hidden><p>${p.L("移除这个供应商及其密钥？后续任务将无法再选择它，历史记录会保留。")}</p><button class="mw-btn" type="button" data-model-delete-cancel>${p.L("取消")}</button><button class="mw-btn" type="button" data-model-delete>${p.L("确认移除")}</button></div>
    <footer class="model-settings-actions"><button class="mw-btn" type="button" data-model-discard>${p.L("撤销未保存修改")}</button><button class="mw-btn mw-btn--primary" type="button" data-model-save>${p.L("保存配置")}</button><span>${p.L("保存后用于后续执行；文字生成期间更改模型或连接，需重新生成。")}</span></footer>
  </div>`;
}

/**
 * The prompt cache field.
 *
 * On a format with no breakpoint we can set, "要求缓存支持" is not offered at all —
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
    ? p.L("请求缓存不保证命中；供应商返回的缓存用量会显示在这一轮的记录里。")
    : p.L("这个格式由对方自动做前缀缓存，没有我们能打开的开关，所以给不了「要求缓存支持」。");
  return `<div class="model-field">
      <label for="model-prompt-cache">${p.L("提示缓存")}</label>
      <select class="mw-select" id="model-prompt-cache" data-model-prompt-cache="${p.escape(provider.provider_id)}">${options}</select>
      <p class="model-field-note">${p.escape(note)}</p>
    </div>`;
}

/** Provider settings select an existing Home connection; the key stays in Connectors. */
function renderCredentialField(hasCredential: boolean, p: ModelSettingsPrimitives,
  connections: readonly ConnectorConnectionView[], selectedId?: string): string {
  return `<div class="model-field"><label for="model-connection">${p.L("使用的账号连接")}</label>
    <select class="mw-select" id="model-connection" data-model-connection>
      <option value="">${p.L("选择连接")}</option>
      ${connections.filter((row) => row.service_id === "model-api" && (row.state === "connected" || row.connection_id === selectedId))
        .map((row) => `<option value="${p.escape(row.connection_id)}"${row.connection_id === selectedId ? " selected" : ""}${row.state !== "connected" ? " disabled" : ""}>${p.escape(row.display_name)}${row.state !== "connected" ? ` · ${p.L("连接不可用")}` : ""}</option>`).join("")}
      ${selectedId && !connections.some(row => row.service_id === "model-api" && row.connection_id === selectedId)
        ? `<option value="${p.escape(selectedId)}" selected disabled>${p.L("原连接已不可用，请重新选择")}</option>` : ""}
    </select><a class="mw-btn mw-btn--link" href="/settings/connectors?connector=model-api">${p.L("在 Connectors 管理 API Key")}</a>
    ${hasCredential ? "" : `<p class="model-field-hint mw-status" data-tone="attention">${p.icon("circle-alert")}${p.L("请选择一条已保存的连接")}</p>`}
  </div>`;
}

function renderModelList(provider: ModelProviderRecord, p: ModelSettingsPrimitives): string {
  const rows = provider.models.length === 0
    ? `<p class="model-field-hint">${p.L("还没有添加模型")}</p>`
    : provider.models.map((model) => renderModelRow(provider.provider_id, model, p)).join("");
  return `<section class="model-list" aria-label="${p.L("模型列表")}">
    <header class="model-list-head">
      <h3>${p.L("模型列表")}</h3>
      <button type="button" class="mw-btn" data-model-add="${p.escape(provider.provider_id)}">${p.icon("plus")}${p.L("添加模型")}</button>
    </header>
    <div data-model-rows>${rows}</div>
    <template data-model-row-template>${renderModelRow(provider.provider_id, { model_id: "", enabled: true }, p)}</template>
  </section>`;
}

function renderModelRow(providerId: string, model: ModelRecord, p: ModelSettingsPrimitives): string {
  // Badges state facts the provider gave us. An unknown context window shows no
  // badge rather than a guessed number.
  const badges = [
    model.context_tokens === undefined ? "" : `<span class="model-badge">${p.escape(formatContext(model.context_tokens))}</span>`,
    model.vision === true ? `<span class="model-badge">${p.L("视觉")}</span>` : "",
  ].join("");
  return `<div class="model-row" data-model-row="${p.escape(model.model_id)}" data-model-record="${p.escape(JSON.stringify(model))}">
    <input class="mw-input model-row-id" data-model-id value="${p.escape(model.model_id)}" aria-label="${p.L("模型 ID")}" placeholder="MiniMax-M3" maxlength="200">
    ${badges}
    <span class="model-row-spacer"></span>
    <button type="button" class="mw-btn" data-model-test="${p.escape(model.model_id)}" aria-label="${p.L("测试这个模型")}">${p.icon("link")}</button>
    <button type="button" class="mw-btn" data-model-remove="${p.escape(model.model_id)}" aria-label="${p.L("删除")}">${p.icon("trash")}</button>
    ${renderSwitch({ checked: model.enabled, attrs: { "data-model-enabled": `${providerId}:${model.model_id}`, "aria-label": p.L("启用模型") } })}
  </div>`;
}

export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`.replace(".0M", "M");
  if (tokens >= 1_000) return `${Math.round(tokens / 100) / 10}K`.replace(".0K", "K");
  return String(tokens);
}
