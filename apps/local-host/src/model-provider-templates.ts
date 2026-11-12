import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ModelApiFormat } from "@molis-ai/molis-work-contracts/modules/model-providers";
import type { ModelTemplateChoice } from "@molis-ai/molis-work-app-workbench";

/**
 * The providers the model settings page offers as one click. The Host owns this list because it is model-settings
 * content, not a contract: it changes when a vendor renames a model or moves an endpoint, and a vendor fix should not
 * be a change to a public package. The page is given only what it draws (`modelTemplateChoices`); it never sees an
 * address, and it has no catalog of its own.
 */

/**
 * A provider the first-time setup offers as one click.
 *
 * A template is only a starting form: the name, the address, the format and, where the provider has a model name that
 * stays put, that model. It holds no key and nothing about the user; saving still goes through the same check as a
 * form filled in by hand, so a wrong address or a model name that has moved is told at save, not at the first Run.
 */
interface ModelProviderTemplate {
  /** Lower-case key used in the settings address (`?template=`). Not a provider id: saving mints a fresh one. */
  template_id: string;
  /** The brand or the default title placed in the editable name field. */
  display_name: string;
  /** A platform label for template names that vary with the language. */
  display_name_key?: string;
  base_url: string;
  api_format: ModelApiFormat;
  /** Model names the provider keeps stable (aliases). Empty when we cannot promise one: the person types it. */
  model_ids: readonly string[];
  /** Where the person gets a key: the console and its section, as a stable interface key (no link to follow blind). */
  key_hint: string;
}

/**
 * MiniMax's Anthropic-compatible base address, mainland China. The one place that writes it: the MiniMax template below
 * and the development-only `MINIMAX_API_KEY` default (`host-complete-text.ts`) both read it, so the product has a single
 * "China default" for MiniMax. MiniMax's documentation moved to platform.minimax.cn (platform.minimaxi.com redirects
 * there) and its Anthropic-compatible page sets `ANTHROPIC_BASE_URL=https://api.minimax.cn/anthropic` (2026-10-10).
 */
export const MINIMAX_ANTHROPIC_BASE_URL = "https://api.minimax.cn/anthropic";

const ANY_CONSOLE = "workbench.settings-models.find-api-key-services-console";

/**
 * The common providers, one entry per address, plus one blank form for each request shape the product speaks.
 * Anthropic-compatible and OpenAI-compatible are exactly the two shapes Prologue's adapters carry.
 *
 * Every address, format and prefilled model name below was read off the provider's own public documentation
 * (2026-10-09, again 2026-10-10), with the mainland-China endpoint where the provider has one. A model name is
 * prefilled only where the documentation lists it as current; a provider's retired names (DeepSeek's `deepseek-chat`)
 * are not, and neither is a name the documentation only uses as an example or a family (Qwen's `qwen-plus`: its current
 * list is the versioned names). Checked again whenever a template changes, because a name that moved is told to the
 * person at save, not to us.
 *
 * Qwen's address is the shared one that the documentation says still works. It now recommends a per-workspace address
 * (`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`) that needs an id only the person has, so a
 * template cannot fill it; they can paste it over the Base URL. International addresses differ per provider (and a key
 * only works in its own region), so they are not offered here: the person types them.
 */
export const MODEL_PROVIDER_TEMPLATES: readonly ModelProviderTemplate[] = [
  { template_id: "anthropic", display_name: "Anthropic", base_url: "https://api.anthropic.com", api_format: "anthropic-messages", model_ids: [],
    key_hint: "workbench.model-provider-template.anthropic-key" },
  { template_id: "openai", display_name: "OpenAI", base_url: "https://api.openai.com/v1", api_format: "openai-chat-completions", model_ids: [],
    key_hint: "workbench.model-provider-template.openai-key" },
  { template_id: "deepseek", display_name: "DeepSeek", base_url: "https://api.deepseek.com", api_format: "openai-chat-completions", model_ids: ["deepseek-flash"],
    key_hint: "workbench.model-provider-template.deepseek-key" },
  { template_id: "minimax", display_name: "MiniMax", base_url: MINIMAX_ANTHROPIC_BASE_URL, api_format: "anthropic-messages", model_ids: ["MiniMax-M3"],
    key_hint: "workbench.model-provider-template.minimax-key" },
  { template_id: "qwen", display_name: "通义千问（阿里云）", display_name_key: "workbench.model-provider-template.qwen-name", base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", api_format: "openai-chat-completions", model_ids: [],
    key_hint: "workbench.model-provider-template.qwen-key" },
  { template_id: "kimi", display_name: "Kimi（月之暗面）", display_name_key: "workbench.model-provider-template.kimi-name", base_url: "https://api.moonshot.cn/v1", api_format: "openai-chat-completions", model_ids: [],
    key_hint: "workbench.model-provider-template.kimi-key" },
  { template_id: "glm", display_name: "GLM（智谱）", display_name_key: "workbench.model-provider-template.glm-name", base_url: "https://open.bigmodel.cn/api/paas/v4", api_format: "openai-chat-completions", model_ids: [],
    key_hint: "workbench.model-provider-template.glm-key" },
  { template_id: "openrouter", display_name: "OpenRouter", base_url: "https://openrouter.ai/api/v1", api_format: "openai-chat-completions", model_ids: [],
    key_hint: "workbench.model-provider-template.openrouter-key" },
  { template_id: "anthropic-compatible", display_name: "Anthropic 兼容", display_name_key: "workbench.model-provider-template.anthropic-compatible-name", base_url: "", api_format: "anthropic-messages", model_ids: [], key_hint: ANY_CONSOLE },
  { template_id: "openai-compatible", display_name: "OpenAI 兼容", display_name_key: "workbench.model-provider-template.openai-compatible-name", base_url: "", api_format: "openai-chat-completions", model_ids: [], key_hint: ANY_CONSOLE },
];

/**
 * Where to get a key for the provider the settings page shows: its template's console, by the template a draft started from or by
 * the address a saved provider has. A provider at an address no template has is told to look in its own service's console.
 */
export function modelKeyHint(baseUrl: string, templateId?: string | null): string {
  return uiText.text(templateAt(baseUrl, templateId)?.key_hint ?? ANY_CONSOLE);
}

/** Whether the address is the one a template fills in, so the page may say the template filled it (and not of a custom one). */
export function modelAddressFromTemplate(baseUrl: string, templateId?: string | null): boolean {
  const template = templateAt(baseUrl, templateId);
  return template !== undefined && template.base_url !== "" && template.base_url === addressOf(baseUrl);
}

const addressOf = (baseUrl: string): string => baseUrl.trim().replace(/\/+$/u, "");

function templateAt(baseUrl: string, templateId?: string | null): ModelProviderTemplate | undefined {
  const address = addressOf(baseUrl);
  return modelProviderTemplate(templateId) ?? MODEL_PROVIDER_TEMPLATES.find((one) => one.base_url !== "" && one.base_url === address);
}

/** The template an address names, or null for anything else (an unknown id opens the blank form). */
export function modelProviderTemplate(templateId: string | null | undefined): ModelProviderTemplate | null {
  return MODEL_PROVIDER_TEMPLATES.find((template) => template.template_id === templateId) ?? null;
}

/** The translated suggestion is resolved only when the person sees the template, before they can edit it. */
export function modelTemplateName(template: ModelProviderTemplate): string {
  return template.display_name_key ? uiText.text(template.display_name_key) : template.display_name;
}

/** What the settings page is given: the name to draw and what the template fills in, never an address or a model name. */
export function modelTemplateChoices(): readonly ModelTemplateChoice[] {
  return MODEL_PROVIDER_TEMPLATES.map((template) => ({
    template_id: template.template_id,
    display_name: modelTemplateName(template),
    fills_base_url: template.base_url !== "",
    fills_model: template.model_ids.length > 0,
  }));
}
