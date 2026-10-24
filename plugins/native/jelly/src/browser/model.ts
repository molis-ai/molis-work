import { openGeneric } from "./dialog.js";
import { flushEditor } from "./notes.js";
import { run, showNote } from "./page.js";
import { API } from "./request.js";
import { esc } from "./util.js";
import type { JellyPage } from "./types.js";

interface ModelChoice { model_id: string; display_name?: string; enabled?: boolean }
interface ModelProvider { provider_id?: string; id?: string; name?: string; enabled?: boolean; models?: ModelChoice[] }
interface ModelConnection { connection_id: string; display_name: string; state: string }
interface ModelSelection { provider_id?: string; model_id?: string }
interface ModelSettings {
  selection?: ModelSelection; effective_selection?: ModelSelection; providers?: ModelProvider[]; connections?: ModelConnection[];
  custom_connection_id?: string; configured?: boolean;
}
type ApiFormat = "openai-chat-completions" | "anthropic-messages";

const keyOf = (provider: ModelProvider): string => provider.provider_id || provider.id || "";

/** What the person has picked so far in the open dialog. */
interface Pick { providerId: string; modelId: string; custom: boolean; apiFormat: ApiFormat }

function formHtml(page: JellyPage, settings: ModelSettings): string {
  const { tx } = page;
  const connections = (settings.connections || []).filter((connection) => connection.state === "connected")
    .map((connection) => `<option value="${esc(connection.connection_id)}"${settings.custom_connection_id === connection.connection_id ? " selected" : ""}>${esc(connection.display_name)}</option>`).join("");
  return `<p class="jelly-muted">${tx("jelly.model.privacy")}</p><div class="jelly-choice-row" data-jelly-model-providers></div><div class="jelly-choice-row" data-jelly-model-options style="margin-top:12px"></div>`
    + `<div data-jelly-model-custom hidden><label class="jelly-field" style="margin-top:16px">${tx("jelly.model.base-url")}<input class="mw-input" type="url" data-jelly-model-base placeholder="https://api.example.com/v1"></label>`
    + `<fieldset class="jelly-field" style="margin-top:12px"><legend>${tx("jelly.model.api-format")}</legend><div class="jelly-choice-row" data-jelly-model-api></div></fieldset>`
    + `<label class="jelly-field" style="margin-top:12px">${tx("jelly.model.model-id")}<input class="mw-input" data-jelly-model-id placeholder="model-id"></label>`
    + `<label class="jelly-field" style="margin-top:12px">${tx("jelly.model.connection")}<select class="mw-select" data-jelly-model-connection><option value="">${tx("jelly.model.choose-connection")}</option>${connections}</select></label>`
    + `<a href="/settings/connectors?connector=model-api" target="_blank" rel="noopener">${tx("jelly.model.manage-keys")}</a></div><p class="jelly-muted" data-jelly-model-status></p>`;
}

function statusText(settings: ModelSettings, providers: ModelProvider[], custom: boolean): string {
  if (settings.selection && !settings.configured) return "jelly.model.unavailable";
  if (!providers.length && !custom) return "jelly.model.none";
  return settings.configured ? "jelly.model.configured" : "jelly.model.not-configured";
}

function paint(page: JellyPage, settings: ModelSettings, providers: ModelProvider[], pick: Pick): void {
  const { $, btn, L } = page;
  const models = providers.find((entry) => keyOf(entry) === pick.providerId)?.models?.filter((model) => model.enabled !== false) || [];
  $("[data-jelly-model-providers]").innerHTML = providers.map((entry) => btn(entry.name || entry.id || "", `data-jelly-provider="${esc(keyOf(entry))}" aria-pressed="${!pick.custom && keyOf(entry) === pick.providerId}"`)).join("")
    + btn("jelly.model.custom", `data-jelly-provider="__custom" aria-pressed="${pick.custom}"`);
  $("[data-jelly-model-options]").innerHTML = pick.custom ? "" : models.map((model) => btn(model.display_name || model.model_id, `data-jelly-model-choice="${esc(model.model_id)}" aria-pressed="${model.model_id === pick.modelId}"`)).join("");
  $("[data-jelly-model-custom]").hidden = !pick.custom;
  $("[data-jelly-model-api]").innerHTML = btn("OpenAI Chat Completions", `data-jelly-api-format="openai-chat-completions" aria-pressed="${pick.apiFormat === "openai-chat-completions"}"`)
    + btn("Anthropic Messages", `data-jelly-api-format="anthropic-messages" aria-pressed="${pick.apiFormat === "anthropic-messages"}"`);
  const status = $("[data-jelly-model-status]");
  status.replaceChildren(document.createTextNode(L(statusText(settings, providers, pick.custom))));
  if (providers.length || pick.custom) return;
  status.append(document.createTextNode(" "));
  const link = document.createElement("a");
  link.href = "/settings/models";
  link.textContent = L("jelly.model.open-settings");
  link.addEventListener("click", () => { page.leftForSettings = true; $<HTMLDialogElement>("[data-jelly-dialog]").close(); });
  status.append(link);
}

async function save(page: JellyPage, pick: Pick): Promise<void> {
  const { $, L } = page;
  let body: Record<string, string>;
  if (pick.custom) {
    const base = $<HTMLInputElement>("[data-jelly-model-base]").value.trim();
    const model = $<HTMLInputElement>("[data-jelly-model-id]").value.trim();
    if (!base || !model) throw new Error(L("jelly.model.custom-required"));
    body = { base_url: base, api_format: pick.apiFormat, model_id: model, connection_id: $<HTMLSelectElement>("[data-jelly-model-connection]").value };
  } else {
    if (!pick.providerId || !pick.modelId) throw new Error(L("jelly.model.pick-required"));
    body = { provider_id: pick.providerId, model_id: pick.modelId };
  }
  await page.request("POST", `${API}/model-settings`, body);
  showNote(page, L("jelly.model.saved"));
}

/** Configuration uses the Host's existing model providers and credential storage. */
export async function openModelSettings(page: JellyPage): Promise<void> {
  page.leftForSettings = false;
  await flushEditor(page);
  const payload = await page.request<{ settings?: ModelSettings } & ModelSettings>("GET", `${API}/model-settings`);
  const settings = payload.settings || payload;
  const providers = (settings.providers || []).filter((provider) => provider.enabled !== false);
  const pick: Pick = {
    providerId: settings.selection?.provider_id || settings.effective_selection?.provider_id || providers[0] && keyOf(providers[0]) || "",
    modelId: settings.selection?.model_id || settings.effective_selection?.model_id || "", custom: false, apiFormat: "openai-chat-completions",
  };
  const firstModel = (): string => providers.find((entry) => keyOf(entry) === pick.providerId)?.models?.find((model) => model.enabled !== false)?.model_id || "";
  if (!pick.modelId) pick.modelId = firstModel();
  openGeneric(page, "jelly.model.title", formHtml(page, settings), "jelly.model.save", () => save(page, pick));
  const body = page.$("[data-jelly-dialog-body]");
  body.onclick = (event) => {
    const target = (event.target as Element).closest("button");
    if (!target) return;
    if (target.hasAttribute("data-jelly-provider")) {
      pick.custom = target.dataset.jellyProvider === "__custom";
      if (!pick.custom) { pick.providerId = target.dataset.jellyProvider ?? ""; pick.modelId = firstModel(); }
    }
    if (target.hasAttribute("data-jelly-model-choice")) pick.modelId = target.dataset.jellyModelChoice ?? "";
    if (target.hasAttribute("data-jelly-api-format")) pick.apiFormat = target.dataset.jellyApiFormat === "anthropic-messages" ? "anthropic-messages" : "openai-chat-completions";
    paint(page, settings, providers, pick);
  };
  page.dialog.cleanup = () => { body.onclick = null; };
  paint(page, settings, providers, pick);
}

/** Back from the model settings page: reopen this dialog, but only when this page is the one showing. */
export function installModelReady(page: JellyPage): void {
  document.addEventListener("molis-work:model-ready", () => {
    const back = page.leftForSettings;
    page.leftForSettings = false;
    if (back && page.root.getClientRects().length && getComputedStyle(page.root).visibility === "visible") void run(page, () => openModelSettings(page));
  });
}
