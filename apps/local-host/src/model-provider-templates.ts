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
export interface ModelProviderTemplate {
  /** Lower-case key used in the settings address (`?template=`). Not a provider id: saving mints a fresh one. */
  template_id: string;
  /**
   * The name shown on the choice and saved as the provider's name. Written the way every interface text is: the
   * Chinese wording is the key the UI translator looks up (English lives in the Workbench's dictionary); a brand name
   * with no Chinese in it is the same in every language.
   */
  display_name: string;
  base_url: string;
  api_format: ModelApiFormat;
  /** Model names the provider keeps stable (aliases). Empty when we cannot promise one: the person types it. */
  model_ids: readonly string[];
}

/**
 * MiniMax's Anthropic-compatible base address, mainland China. The one place that writes it: the MiniMax template below
 * and the development-only `MINIMAX_API_KEY` default (`host-complete-text.ts`) both read it, so the product has a single
 * "China default" for MiniMax. MiniMax's documentation moved to platform.minimax.cn (platform.minimaxi.com redirects
 * there) and its Anthropic-compatible page sets `ANTHROPIC_BASE_URL=https://api.minimax.cn/anthropic` (2026-10-10).
 */
export const MINIMAX_ANTHROPIC_BASE_URL = "https://api.minimax.cn/anthropic";

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
  { template_id: "anthropic", display_name: "Anthropic", base_url: "https://api.anthropic.com", api_format: "anthropic-messages", model_ids: [] },
  { template_id: "openai", display_name: "OpenAI", base_url: "https://api.openai.com/v1", api_format: "openai-chat-completions", model_ids: [] },
  { template_id: "deepseek", display_name: "DeepSeek", base_url: "https://api.deepseek.com", api_format: "openai-chat-completions", model_ids: ["deepseek-flash"] },
  { template_id: "minimax", display_name: "MiniMax", base_url: MINIMAX_ANTHROPIC_BASE_URL, api_format: "anthropic-messages", model_ids: ["MiniMax-M3"] },
  { template_id: "qwen", display_name: "通义千问（阿里云）", base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", api_format: "openai-chat-completions", model_ids: [] },
  { template_id: "kimi", display_name: "Kimi（月之暗面）", base_url: "https://api.moonshot.cn/v1", api_format: "openai-chat-completions", model_ids: [] },
  { template_id: "glm", display_name: "GLM（智谱）", base_url: "https://open.bigmodel.cn/api/paas/v4", api_format: "openai-chat-completions", model_ids: [] },
  { template_id: "openrouter", display_name: "OpenRouter", base_url: "https://openrouter.ai/api/v1", api_format: "openai-chat-completions", model_ids: [] },
  { template_id: "anthropic-compatible", display_name: "Anthropic 兼容", base_url: "", api_format: "anthropic-messages", model_ids: [] },
  { template_id: "openai-compatible", display_name: "OpenAI 兼容", base_url: "", api_format: "openai-chat-completions", model_ids: [] },
];

/** The template an address names, or null for anything else (an unknown id opens the blank form). */
export function modelProviderTemplate(templateId: string | null | undefined): ModelProviderTemplate | null {
  return MODEL_PROVIDER_TEMPLATES.find((template) => template.template_id === templateId) ?? null;
}

/** What the settings page is given: the name to draw and what the template fills in, never an address or a model name. */
export function modelTemplateChoices(): readonly ModelTemplateChoice[] {
  return MODEL_PROVIDER_TEMPLATES.map((template) => ({
    template_id: template.template_id,
    display_name: template.display_name,
    fills_base_url: template.base_url !== "",
    fills_model: template.model_ids.length > 0,
  }));
}
