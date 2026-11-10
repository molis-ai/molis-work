import { t as uiText, renderButton, renderCard, renderChoice, renderStateRing, renderStatusMark, renderSwitch, type MwStatusTone, type PluginIconName, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
import type {
  ModelApiFormat,
  ModelProviderCheck,
  ModelProviderHealth,
  ModelProviderRecord,
  ModelProviderStatus,
  ModelPromptCacheMode,
  ModelRecord,
  ModelThinkingMode,
} from "@molis-ai/molis-work-contracts/modules/model-providers";
import { promptCacheIsClientControlled } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { renderCollapsible, renderCombobox } from "@molis-ai/molis-work-design-system";
import type { ConnectorConnectionView } from "@molis-ai/molis-work-contracts/services/connector-host";
import { renderConnectionProgress } from "./service-connection-parts.js";

/**
 * The model settings page: which providers exist, what each speaks, and which models they offer.
 *
 * Laid out as the service-connection decision's plan A (specs/assistant-service-connections §13.1): a provider asks only for
 * what it needs on the default path (a key, said where to get it, and the models), a saved one says in four plain rows whose key
 * it uses, whether it answers (with when it was checked), what it can do and who uses it, and the address, format, cache and
 * thinking modes and the raw check sit in the folded 高级 at the bottom. A draft whose template cannot know the address or format
 * asks for those on the default path too (§13.2: they are the basic configuration when nothing fills them in).
 *
 * The API key is never rendered. The field shows whether one is stored and nothing more — a page that echoed the key would put
 * it in every screenshot, cache and view-source.
 */

export interface ModelSettingsPrimitives {
  readText(text: string, values?: Record<string, string | number>): string;
  escape(value: unknown): string;
  icon(name: PluginIconName): string;
}

/**
 * One provider choice the Host offers, as the page draws it. The Host owns the catalog (names, addresses, model names);
 * the page is told the name to show and what the template fills in, so it can say what is still missing, and never sees
 * an address.
 */
export interface ModelTemplateChoice {
  readonly template_id: string;
  /** The Chinese wording is the key the page translates; a brand name with no Chinese is the same in every language. */
  readonly display_name: string;
  /** Whether choosing it fills the Base URL; the blank forms for a request shape do not. */
  readonly fills_base_url: boolean;
  /** Whether choosing it fills a model ID the provider keeps stable. */
  readonly fills_model: boolean;
}

export interface ModelSettingsModel {
  readonly providers: readonly ModelProviderRecord[];
  readonly health: readonly ModelProviderHealth[];
  /** The one-click choices the Host offers, in the order shown. */
  readonly templates: readonly ModelTemplateChoice[];
  readonly draft_provider?: ModelProviderRecord;
  /** The provider template the draft started from, shown as chosen. Null for a blank form. */
  readonly draft_template_id?: string | null;
  /** Which provider the detail pane shows. Null when nothing is configured yet. */
  readonly selected_provider_id: string | null;
  readonly connections?: readonly ConnectorConnectionView[];
  readonly selected_connection_ids?: Readonly<Record<string, string>>;
  /** Where to get a key for the provider shown (a Chinese key the page translates), from the Host's template catalog. */
  readonly key_hint?: string;
  /** Whether that provider's address is the one its template fills in; a custom or proxy address is not said to be the template's. */
  readonly address_from_template?: boolean;
  readonly primitives: ModelSettingsPrimitives;
}

const API_FORMATS: ReadonlyArray<{ value: ModelApiFormat; label: string }> = [
  { value: "anthropic-messages", label: "Anthropic Messages (/v1/messages)" },
  { value: "openai-chat-completions", label: "OpenAI Chat Completions (/chat/completions)" },
];

const PROMPT_CACHE_MODES: ReadonlyArray<{ value: ModelPromptCacheMode; label: string }> = [
  { value: "off", label: "workbench.settings-models.prompt-cache-off" },
  { value: "best-effort", label: "workbench.settings-models.prompt-cache-best-effort" },
  { value: "required", label: "workbench.settings-models.prompt-cache-required" },
];

/** The first key's three steps, the same names the component board's key specimen uses. */
const KEY_STEPS = ["workbench.settings-models.enter-key", "workbench.settings-models.check-key", "workbench.settings-models.ready"] as const;

/** Status maps to the family colours already in the palette, never to new ones. */
const STATUS_TONE: Record<ModelProviderStatus, string> = {
  ready: "done",
  "needs-credential": "attention",
  "credential-unavailable": "attention",
  "no-models": "attention",
  disabled: "idle",
};

const STATUS_RING: Record<ModelProviderStatus, StateRingState> = { ready: "ready", "needs-credential": "reauth", "credential-unavailable": "unavailable", "no-models": "unavailable", disabled: "disabled" };

/** A failed check's reason (`ModelProviderCheck.code`) in the person's words, with the ring and tone it shows in. */
const CHECK_FAILURES: Readonly<Record<string, readonly [string, StateRingState, MwStatusTone]>> = {
  "model_provider.key_rejected": ["密钥被拒", "failed", "blocked"],
  // The model path reports the status only, so a throttle and an exhausted account read the same (§13.2, user 11-05).
  "model_provider.rate_limited": ["请求太多或额度用完", "retrying", "hold"],
  "model_provider.request_refused": ["服务不接受这次请求，多半是模型名不对", "failed", "attention"],
  "model_provider.provider_failed": ["服务那边出错了", "failed", "attention"],
  "model_provider.unreachable": ["连不上这个地址", "unavailable", "attention"],
  "model_provider.timed_out": ["一直没等到回应", "unavailable", "attention"],
  "model_provider.response_invalid": ["回应不像这个接口格式", "failed", "attention"],
};

export function renderModelSettingsDocument(model: ModelSettingsModel): string {
  const { primitives: p } = model;
  const selected = model.draft_provider ?? model.providers.find(
    (provider) => provider.provider_id === model.selected_provider_id,
  ) ?? model.providers[0];
  return `<section class="settings-document model-settings-document" aria-labelledby="settings-title" data-model-settings>
    <header class="settings-heading">
      <div class="settings-heading-title"><h1 id="settings-title">${uiText("workbench.settings-models.models")}</h1></div>
      <div class="model-settings-head">
        <p>${uiText("workbench.settings-models.configure-model-providers-coding-conversations")}</p>
        <div class="model-settings-actions">
          <button type="button" class="mw-btn" data-model-refresh aria-label="${uiText("workbench.settings-models.refresh-provider-configuration")}">${p.icon("refresh")}</button>
          <button type="button" class="mw-btn mw-btn--primary" data-model-add-provider>${p.icon("plus")}${uiText("workbench.settings-models.add-provider")}</button>
        </div>
      </div>
    </header>
    <p role="status" aria-live="polite" data-model-status></p>
    <div data-model-released hidden><p></p><button class="mw-btn" type="button" data-model-released-remove>${uiText("workbench.settings-models.remove-old-key")}</button><button class="mw-btn mw-btn--ghost" type="button" data-model-released-keep>${uiText("workbench.settings-models.keep")}</button></div>
    ${renderModelBody(model, selected)}
  </section>`;
}

/**
 * With providers, the list and the open provider share the column. With none, there is no list to reserve:
 * the choices (and the first draft) sit in the same centered column as the title, the way other settings pages do.
 */
function renderModelBody(model: ModelSettingsModel, selected: ModelProviderRecord | undefined): string {
  const detail = selected === undefined ? renderEmptyDetail(model) : renderProviderDetail(selected, model, selected === model.draft_provider);
  if (model.providers.length === 0) return detail;
  return `<div class="model-settings-panes">
      ${renderProviderList(model, selected?.provider_id ?? null)}
      ${detail}
    </div>`;
}

function renderProviderList(model: ModelSettingsModel, selectedId: string | null): string {
  const { primitives: p } = model;
  const rows = model.providers.map((provider) => {
    const health = model.health.find((entry) => entry.provider_id === provider.provider_id);
    const status = health?.status ?? "needs-credential";
    const current = provider.provider_id === selectedId;
    return `<button type="button" class="model-provider-row${current ? " is-current" : ""}"
      data-model-provider="${p.escape(provider.provider_id)}"${current ? ' aria-current="true"' : ""}>
      ${p.icon("package")}
      <span class="model-provider-name">${p.escape(provider.display_name)}</span>
      <span class="mw-status" data-tone="${STATUS_TONE[status]}" title="${p.escape(health?.detail ?? "")}">${renderStateRing({ state: STATUS_RING[status] })}</span>
    </button>`;
  }).join("");
  return `<nav class="model-provider-list" aria-label="${uiText("workbench.settings-models.providers")}">
    <h2 class="model-provider-group">${uiText("workbench.settings-models.custom-providers")}</h2>
    ${rows}
  </nav>`;
}

function renderEmptyDetail(model: ModelSettingsModel): string {
  const { primitives: p } = model;
  return `<div class="model-provider-detail mw-empty" data-model-detail-empty>
    <span class="mw-empty__mark">${p.icon("package")}</span><strong>${uiText("workbench.settings-models.no-providers-configured-yet")}</strong>
    <p>${uiText("workbench.settings-models.pick-common-provider-its-address-format-filled-add")}</p>
    ${renderTemplateChoices(model.templates, p, null)}
  </div>`;
}

/** One click per common provider; the form it opens is the same one a hand-made provider uses. */
function renderTemplateChoices(templates: readonly ModelTemplateChoice[], _p: ModelSettingsPrimitives, chosen: string | null): string {
  return `<div class="mw-choice-group" role="group" aria-label="${uiText("workbench.settings-models.common-providers")}">${templates.map((template) => renderChoice({
    label: template.display_name, selected: template.template_id === chosen, attrs: { "data-model-template": template.template_id },
  })).join("")}</div>`;
}

function renderProviderDetail(provider: ModelProviderRecord, model: ModelSettingsModel, draft: boolean): string {
  const { primitives: p } = model;
  const id = p.escape(provider.provider_id);
  const health = model.health.find((entry) => entry.provider_id === provider.provider_id);
  const hasCredential = health?.credential_status === "present" || health?.status === "ready";
  // A draft is told what its template cannot know: the address unless the template fills it, the format only on the blank form.
  const template = draft ? model.templates.find((choice) => choice.template_id === model.draft_template_id) ?? null : undefined;
  const askAddress = draft && template?.fills_base_url !== true, askFormat = draft && template === null;
  const advanced = [
    `<div class="model-field"><label for="model-provider-name">${uiText("workbench.settings-models.name")}</label><input class="mw-input" id="model-provider-name" data-model-name value="${p.escape(provider.display_name)}" maxlength="120"></div>`,
    askAddress ? "" : renderAddressField(provider, p, model.address_from_template === true
      ? uiText.text("workbench.settings-models.filled-template-change-only-proxy-own-deployment") : uiText.text("workbench.settings-models.services-api-address-change-here-when-switch-proxy")),
    askFormat ? "" : renderFormatField(provider, p),
    renderPromptCacheField(provider, p),
    renderThinkingField(provider, p),
    draft ? "" : renderDiagnostics(provider, health, model, p),
  ].join("");
  return `<div class="model-provider-detail" data-model-detail="${id}"${!draft && hasCredential ? " data-model-saved" : ""}>
    <header class="model-provider-detail-head">
      ${p.icon("package")}
      <h2>${p.escape(provider.display_name)}</h2>
      ${renderSwitch({ label: uiText.text("workbench.settings-models.enable-provider"), checked: provider.enabled, attrs: { "data-model-provider-enabled": provider.provider_id } })}
      <button type="button" class="mw-btn" data-model-provider-remove="${id}">${p.icon("trash")}${uiText("workbench.settings-models.remove-provider")}</button>
    </header>
    ${draft ? renderDraftTemplates(model, p) : renderFacts(provider, health, model)}
    ${health?.status === "credential-unavailable" ? `<p class="mw-alert mw-alert--danger" role="alert">${p.escape(health.detail)}</p>` : ""}
    <section class="model-section" aria-label="${uiText("workbench.settings-models.key")}">
      ${renderCredentialField(provider, hasCredential, model)}
      ${askAddress ? renderAddressField(provider, p, uiText.text("workbench.settings-models.find-base-url-services-documentation-stop-domain-version")) : ""}
      ${askFormat ? renderFormatField(provider, p) : ""}
    </section>
    <section class="model-section" aria-label="${uiText("workbench.settings-models.model")}">
      ${renderModelList(provider, p)}
    </section>
    ${renderCollapsible({ summary: uiText.text("workbench.settings-models.advanced-name-address-api-format-prompt-cache-thinking"), body: advanced, className: "model-advanced" })}
    <div class="mw-alert mw-alert--warning" role="status" data-model-limited hidden><strong>${uiText("workbench.settings-models.name-says-too-many-requests-out-credit", { name: provider.display_name })}</strong><p></p>${renderButton({ label: uiText.text("workbench.settings-models.check-now"), variant: "secondary", size: "sm", attrs: { "data-model-recheck": "" } })}</div>
    <div data-model-delete-confirm hidden><p>${uiText("workbench.settings-models.remove-provider-future-tasks-cannot-select-history-preserved")}</p><button class="mw-btn" type="button" data-model-delete-cancel>${uiText("common.control.cancel")}</button><button class="mw-btn" type="button" data-model-delete>${uiText("workbench.settings-models.confirm-removal")}</button></div>
    <footer class="model-settings-actions model-save-bar">
      ${draft ? renderConnectionProgress({ steps: KEY_STEPS.map((step) => uiText.text(step)), at: 0, state: "running" }, p.readText) : ""}
      <span class="model-save-note">${draft ? uiText("workbench.settings-models.checks-before-saving-if-check-fails-nothing-saved") : uiText("workbench.settings-models.checks-before-saving-if-check-fails-nothing-saved-2")}</span>
      <button class="mw-btn" type="button" data-model-discard>${uiText("workbench.settings-models.discard-unsaved-changes")}</button>
      ${renderButton({ label: uiText.text("workbench.settings-models.save-check"), variant: "primary", key: "↵", attrs: { "data-model-save": "" } })}
    </footer>
  </div>`;
}

function renderAddressField(provider: ModelProviderRecord, p: ModelSettingsPrimitives, note: string): string {
  return `<div class="model-field">
      <label for="model-base-url">${uiText("workbench.settings-models.address-base-url")}</label>
      <input class="mw-input" id="model-base-url" type="url" inputmode="url" spellcheck="false" placeholder="https://"
        value="${p.escape(provider.base_url)}" data-model-base-url="${p.escape(provider.provider_id)}">
      <p class="model-field-note">${note}</p>
    </div>`;
}

function renderFormatField(provider: ModelProviderRecord, p: ModelSettingsPrimitives): string {
  const formats = API_FORMATS.map((format) => `<option value="${format.value}"${format.value === provider.api_format ? " selected" : ""}>${p.escape(format.label)}</option>`).join("");
  return `<div class="model-field">
      <label for="model-api-format">${uiText("workbench.settings-models.api-format")}</label>
      <select class="mw-select" id="model-api-format" data-model-api-format="${p.escape(provider.provider_id)}">${formats}</select>
    </div>`;
}

/** A new provider starts from a template or from nothing; what the template cannot know is named, not guessed. */
function renderDraftTemplates(model: ModelSettingsModel, p: ModelSettingsPrimitives): string {
  const template = model.templates.find((choice) => choice.template_id === model.draft_template_id) ?? null;
  const name = template === null ? "" : p.escape(template.display_name);
  const note = template === null ? "" : !template.fills_base_url ? uiText.text("workbench.settings-models.name-format-chosen-still-needed-base-url-api", { name })
    : !template.fills_model ? uiText.text("workbench.settings-models.name-address-format-filled-still-needed-api-key", { name })
    : uiText.text("workbench.settings-models.name-address-format-model-filled-still-needed-api", { name });
  return `<section class="model-section" aria-label="${uiText("workbench.settings-models.common-providers")}">
      <h3>${uiText("workbench.settings-models.start-common-provider")}</h3>
      ${renderTemplateChoices(model.templates, p, template?.template_id ?? null)}
      ${note === "" ? "" : `<p class="model-field-note">${note}</p>`}
    </section>`;
}

/** A check's time as month-day and hour:minute in the Host's clock (the page and the Host are the same machine). */
function checkTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.valueOf())) return "";
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** Whether the provider answers, from its health and its last real check: never verified, verified, or why not, with when. */
function reachability(health: ModelProviderHealth | undefined, _p: ModelSettingsPrimitives): string {
  const mark = (label: string, state: StateRingState, tone: MwStatusTone) => renderStatusMark({ label, state, tone, plain: true });
  if (!health || health.status === "disabled") return mark(uiText.text("workbench.settings-models.switched-off"), "disabled", "quiet");
  if (health.status === "needs-credential") return mark(uiText.text("workbench.settings-models.no-key-yet"), "reauth", "attention");
  if (health.status === "credential-unavailable") return mark(uiText.text("workbench.settings-models.cant-read-key"), "unavailable", "blocked");
  const last: ModelProviderCheck | undefined = health.last_check;
  if (!last) return mark(uiText.text("workbench.settings-models.not-checked-yet-checked-next-save"), "idle", "quiet");
  const time = checkTime(last.at);
  if (last.outcome === "connected") return last.current ? mark(uiText.text("workbench.settings-models.reachable-checked-time", { time }), "connected", "done")
    : mark(uiText.text("workbench.settings-models.not-checked-since-change-reachable-time", { time }), "idle", "quiet");
  const [words, state, tone] = CHECK_FAILURES[last.code ?? ""] ?? ["检查没有完成", "failed", "attention"] as const;
  const retry = last.retry_at ? ` · ${uiText.text("workbench.settings-models.checks-again-after-time", { time: checkTime(last.retry_at) })}` : "";
  return mark(`${uiText.text(words)} · ${time}${retry}`, state, tone);
}

/**
 * A saved provider in four plain rows (§13.1): whose key it uses, whether it answers, what it can do, who uses it. The default
 * provider is the first one that can run, in the order listed, the order the Host resolves a run that names no model.
 */
function renderFacts(provider: ModelProviderRecord, health: ModelProviderHealth | undefined, model: ModelSettingsModel): string {
  const { primitives: p } = model;
  const row = (title: string, note: string, value: string) => `<div class="settings-setting-row"><span class="setting-copy"><strong>${title}</strong><span>${note}</span></span><span class="setting-value">${value}</span></div>`;
  const connections = model.connections ?? [], keys = model.selected_connection_ids ?? {};
  const key = connections.find((connection) => connection.connection_id === keys[provider.provider_id]);
  const enabled = provider.models.filter((entry) => entry.enabled).map((entry) => entry.model_id);
  const named = enabled.slice(0, 2).join(uiText.text("common.list.separator"));
  const models = enabled.length === 0 ? uiText.text("workbench.settings-models.no-model-turned") : enabled.length <= 2 ? uiText.text("workbench.settings-models.uses-list", { list: named })
    : uiText.text("workbench.settings-models.uses-list-more-count-count", { list: named, count: enabled.length });
  const ready = (one: ModelProviderRecord) => model.health.find((entry) => entry.provider_id === one.provider_id)?.status === "ready";
  const sharing = model.providers.filter((one) => one.provider_id !== provider.provider_id && key && keys[one.provider_id] === key.connection_id).map((one) => one.display_name);
  const users = !ready(provider) ? uiText.text("workbench.settings-models.nothing-can-use-right-now")
    : model.providers.find(ready)?.provider_id === provider.provider_id ? uiText.text("workbench.settings-models.default-used-wherever-no-model-chosen") : uiText.text("workbench.settings-models.used-only-where-chosen");
  return renderCard({ className: "model-facts", body: [
    row(uiText.text("workbench.settings-models.key"), uiText.text("workbench.settings-models.encrypted-computer-neither-page-nor-assistant-sees"), `<strong>${key ? p.escape(key.display_name) : uiText("workbench.settings-models.no-key-yet")}</strong>`),
    row(uiText.text("workbench.settings-models.reachable"), uiText.text("workbench.settings-models.checked-before-each-save"), reachability(health, p)),
    row(uiText.text("workbench.settings-models.what-can-do"), uiText.text("workbench.settings-models.each-call-billed-account-service"), `<span>${p.escape(models)}</span>`),
    row(uiText.text("workbench.settings-models.used"), sharing.length ? p.escape(uiText.text("workbench.settings-models.same-key-also-serves-names", { names: sharing.join(uiText.text("common.list.separator")) })) : uiText.text("workbench.settings-models.changing-key-turning-off-affects-these"), `<span>${users}</span>`),
  ].join("") });
}

/** The raw facts behind the four rows, for whoever needs them: the last check as recorded, the key's connection, the ids. */
function renderDiagnostics(provider: ModelProviderRecord, health: ModelProviderHealth | undefined, model: ModelSettingsModel, p: ModelSettingsPrimitives): string {
  const last = health?.last_check;
  const lines = [
    [uiText.text("workbench.settings-models.provider-id"), provider.provider_id],
    [uiText.text("workbench.settings-models.last-check"), last ? `${last.at}  ${last.outcome}${last.code ? `  ${last.code}` : ""}${last.current ? "" : `  (${uiText.text("workbench.settings-models.changed-since")})`}` : "—"],
    ...(last?.retry_at ? [[uiText.text("workbench.settings-models.wait-until"), last.retry_at]] : []),
    [uiText.text("workbench.settings-models.key-connection"), model.selected_connection_ids?.[provider.provider_id] || "—"],
  ];
  return `<div class="model-field"><span class="model-field-label">${uiText("workbench.settings-models.diagnostics")}</span><pre class="model-diagnostics">${lines.map(([label, value]) => `${p.escape(label)}  ${p.escape(value)}`).join("\n")}</pre></div>`;
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
    .map((mode) => `<option value="${mode.value}"${mode.value === current ? " selected" : ""}>${p.escape(uiText.text(mode.label))}</option>`)
    .join("");
  const note = controllable
    ? uiText.text("workbench.settings-models.requesting-cache-does-not-guarantee-hit-provider-reported")
    : uiText.text("workbench.settings-models.provider-manages-prefix-caching-format-required-cache-mode");
  return `<div class="model-field">
      <label for="model-prompt-cache">${uiText("workbench.settings-models.prompt-cache")}</label>
      <select class="mw-select" id="model-prompt-cache" data-model-prompt-cache="${p.escape(provider.provider_id)}">${options}</select>
      <p class="model-field-note">${p.escape(note)}</p>
    </div>`;
}

/**
 * Whether the model thinks before answering. It costs more tokens and time, so it is off until the user turns it on.
 * A format with no thinking field shows why instead of an option that could never be saved.
 */
function renderThinkingField(provider: ModelProviderRecord, p: ModelSettingsPrimitives): string {
  const current: ModelThinkingMode = provider.thinking ?? "off";
  if (provider.api_format !== "anthropic-messages") return `<div class="model-field">
      <label for="model-thinking">${uiText("workbench.settings-models.thinking")}</label>
      <select class="mw-select" id="model-thinking" data-model-thinking="${p.escape(provider.provider_id)}" disabled><option value="off" selected>${p.escape(uiText.text("common.control.close"))}</option></select>
      <p class="model-field-note">${p.escape(uiText.text("workbench.settings-models.format-has-no-thinking-level-turn"))}</p>
    </div>`;
  const options = ([["off", "关闭"], ["adaptive", "开启（由模型决定想多少）"]] as const)
    .map(([value, label]) => `<option value="${value}"${value === current ? " selected" : ""}>${p.escape(uiText.text(label))}</option>`).join("");
  return `<div class="model-field">
      <label for="model-thinking">${uiText("workbench.settings-models.thinking")}</label>
      <select class="mw-select" id="model-thinking" data-model-thinking="${p.escape(provider.provider_id)}">${options}</select>
      <p class="model-field-note">${p.escape(uiText.text("workbench.settings-models.when-model-thinks-before-answering-usage-waiting-time"))}</p>
    </div>`;
}

/**
 * The one key the default path asks for (§13.1), said where to get it; a saved connection can stand in for it. Changing the key
 * of a saved provider is choosing 换一把新密钥: the old one keeps working until the new one passes the check. The key is never
 * rendered back.
 */
function renderCredentialField(provider: ModelProviderRecord, hasCredential: boolean, model: ModelSettingsModel): string {
  const { primitives: p } = model;
  const connections = model.connections ?? [], selectedId = model.selected_connection_ids?.[provider.provider_id];
  const usable = connections.filter((row) => row.service_id === "model-api" && (row.state === "connected" || row.connection_id === selectedId));
  const missing = selectedId && !connections.some(row => row.service_id === "model-api" && row.connection_id === selectedId);
  const replacing = hasCredential || Boolean(selectedId);
  const where = model.key_hint ?? uiText.text("workbench.settings-models.find-api-key-services-console");
  const keyField = `<div class="model-field" data-model-key-field${selectedId ? " hidden" : ""}>
      <label for="model-api-key">${replacing ? uiText("workbench.settings-models.new-api-key") : uiText("workbench.settings-models.name-api-key", { name: provider.display_name })}</label>
      <input class="mw-input" id="model-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…" data-model-api-key>
      <p class="model-field-note">${replacing ? uiText("workbench.settings-models.current-key-keeps-working-new-one-replaces-only") : `${p.escape(where)}${uiText.text("workbench.settings-models.encrypted-computer-never-shown-again-after-saving")}`}</p>
    </div>`;
  if (!usable.length && !missing) return keyField;
  return `<div class="model-field"><label for="model-connection">${uiText("workbench.settings-models.which-key")}</label>
    <select class="mw-select" id="model-connection" data-model-connection>
      <option value="">${uiText(replacing ? "workbench.settings-models.use-new-key" : "workbench.settings-models.enter-new-key")}</option>
      ${usable.map((row) => `<option value="${p.escape(row.connection_id)}"${row.connection_id === selectedId ? " selected" : ""}${row.state !== "connected" ? " disabled" : ""}>${p.escape(row.display_name)}${row.state !== "connected" ? ` · ${uiText.text("workbench.settings-models.connection-unavailable")}` : ""}</option>`).join("")}
      ${missing ? `<option value="${p.escape(selectedId)}" selected disabled>${uiText("workbench.settings-models.previous-connection-unavailable-choose-another")}</option>` : ""}
    </select><a class="mw-btn mw-btn--link" href="/settings/connectors?connector=model-api">${uiText("workbench.settings-models.manage-keys-service-connections")}</a>
  </div>
    ${keyField}`;
}

function renderModelList(provider: ModelProviderRecord, p: ModelSettingsPrimitives): string {
  const rows = provider.models.length === 0
    ? `<p class="model-field-hint">${uiText("workbench.settings-models.no-models-added-yet")}</p>`
    : provider.models.map((model) => renderModelRow(provider.provider_id, model, p)).join("");
  return `<section class="model-list" aria-label="${uiText("workbench.settings-models.models-2")}">
    <header class="model-list-head">
      <h3>${uiText("workbench.settings-models.models-2")}</h3>
      <button type="button" class="mw-btn" data-model-fetch="${p.escape(provider.provider_id)}">${p.icon("download")}${uiText("workbench.settings-models.fetch-models")}</button>
      <button type="button" class="mw-btn" data-model-add="${p.escape(provider.provider_id)}">${p.icon("plus")}${uiText("workbench.settings-models.add-model")}</button>
    </header>
    ${renderModelPicker(provider.provider_id, p)}
    <div data-model-rows>${rows}</div>
    <template data-model-row-template>${renderModelRow(provider.provider_id, { model_id: "", enabled: true }, p)}</template>
  </section>`;
}

/**
 * The models the service offers, fetched on request with the Base URL, format and key on the form (§13.2): typing filters,
 * choosing one adds it as a row (or fills the empty one). Typing a name into a row by hand still works; nothing here is saved
 * until the form is.
 */
function renderModelPicker(providerId: string, p: ModelSettingsPrimitives): string {
  const label = `model-picker-label-${providerId}`;
  return `<div class="model-field model-picker" data-model-picker hidden>
    <p class="model-field-note" id="${p.escape(label)}" data-model-picker-note>${uiText("workbench.settings-models.pick-one-add-can-keep-picking-anything-not")}</p>
    ${renderCombobox({ labelledBy: label, placeholder: uiText.text("workbench.settings-models.filter-models"), items: "", attrs: { "data-model-picker-box": "" } })}
  </div>`;
}

function renderModelRow(providerId: string, model: ModelRecord, p: ModelSettingsPrimitives): string {
  // Badges show saved model metadata; an unknown context window has no badge.
  const badges = [
    model.context_tokens === undefined ? "" : `<span class="model-badge">${p.escape(formatContext(model.context_tokens))}</span>`,
    model.vision === true ? `<span class="model-badge">${uiText("workbench.settings-models.vision")}</span>` : "",
  ].join("");
  return `<div class="model-row" data-model-row="${p.escape(model.model_id)}" data-model-record="${p.escape(JSON.stringify(model))}">
    <input class="mw-input model-row-id" data-model-id value="${p.escape(model.model_id)}" aria-label="${uiText("workbench.settings-models.model-id")}" placeholder="MiniMax-M3" maxlength="200">
    ${badges}
    <span class="model-row-spacer"></span>
    <label class="model-row-flag">${uiText("workbench.settings-models.image-input")}<select class="mw-select" data-model-vision>
      <option value="">${uiText("workbench.settings-models.not-declared")}</option>
      <option value="true"${model.vision === true ? " selected" : ""}>${uiText("workbench.settings-models.can-read-images")}</option>
      <option value="false"${model.vision === false ? " selected" : ""}>${uiText("workbench.settings-models.cannot-read-images")}</option>
    </select></label>
    <label class="model-row-flag" title="${uiText("workbench.settings-models.tick-only-when-model-accepts-reasoning-effort-quick")}"><input type="checkbox" data-model-effort${model.reasoning_effort === true ? " checked" : ""}>${uiText("workbench.settings-models.reasoning-effort")}</label>
    <button type="button" class="mw-btn" data-model-test="${p.escape(model.model_id)}" aria-label="${uiText("workbench.settings-models.test-model")}">${p.icon("link")}</button>
    <button type="button" class="mw-btn" data-model-remove="${p.escape(model.model_id)}" aria-label="${uiText("common.control.delete")}">${p.icon("trash")}</button>
    ${renderSwitch({ checked: model.enabled, attrs: { "data-model-enabled": `${providerId}:${model.model_id}`, "aria-label": uiText.text("workbench.settings-models.enable-model") } })}
  </div>`;
}

export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`.replace(".0M", "M");
  if (tokens >= 1_000) return `${Math.round(tokens / 100) / 10}K`.replace(".0K", "K");
  return String(tokens);
}
