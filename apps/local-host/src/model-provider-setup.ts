import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { randomUUID } from "node:crypto";
import type { ResolvedModelSelection } from "@molis-ai/molis-work-service-agent-host";
import type { ModelProviderRecord } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { withConnectorConnections } from "./connector-connection-store.js";
import type { ModelProviderInput } from "./model-provider-store.js";
import type { ModelSettingsModel } from "@molis-ai/molis-work-app-workbench";
import { modelProviderTemplate, modelTemplateChoices } from "./model-provider-templates.js";
import { testConfiguredModel } from "./model-provider-test.js";
import { modelCheckReason, modelProviderCheckErrors } from "./model-provider-checks.js";
import type { MolisWorkProjectCatalog } from "./project-catalog.js";

/**
 * Setting up a model provider from the settings page: the form a template starts, and the one connectivity check a save
 * runs. The key is only ever carried as a value in memory or as a reference: no message here quotes it, and a failed
 * check leaves no connection, no provider and no pinned address behind.
 */

/** The form a provider template starts, or a blank one. A template mints a fresh id: choosing it twice never overwrites. */
function modelProviderDraft(templateId: string | null | undefined): { provider: ModelProviderRecord; template_id: string | null } {
  const template = modelProviderTemplate(templateId);
  // A template whose model name is not one we can promise still shows the empty row, so what is missing is visible.
  const models = (template?.model_ids ?? []).map((model_id) => ({ model_id, enabled: true }));
  return {
    template_id: template?.template_id ?? null,
    provider: {
      provider_id: template ? `${template.template_id}-${randomUUID().slice(0, 8)}` : `custom-${randomUUID()}`,
      display_name: uiText.text(template?.display_name ?? "workbench.model-provider-setup.new-provider"), base_url: template?.base_url ?? "",
      api_format: template?.api_format ?? "anthropic-messages", credential_ref: "", enabled: true, prompt_cache: "off",
      models: template && models.length === 0 ? [{ model_id: "", enabled: true }] : models, created_at: "", updated_at: "",
    },
  };
}

/**
 * The template part of the settings page data: the choices the page draws (never an address) and, for `?new=1`, the form
 * `?template=` starts. The page is given this and has no catalog of its own.
 */
export function modelTemplatePageData(query: URLSearchParams): Pick<ModelSettingsModel, "templates" | "draft_provider" | "draft_template_id"> {
  const draft = query.get("new") === "1" ? modelProviderDraft(query.get("template")) : null;
  return { templates: modelTemplateChoices(), ...(draft ? { draft_provider: draft.provider, draft_template_id: draft.template_id } : {}) };
}

/**
 * What the journey's model step reads. The choices carry no address. A chosen template also returns the unsaved form
 * the settings page would open; nothing is stored, and the form holds no key.
 */
export function modelSetupOffer(templateId: string | null): {
  templates: ReturnType<typeof modelTemplateChoices>;
  draft: ReturnType<typeof modelProviderDraft> | null;
} {
  return { templates: modelTemplateChoices(), draft: templateId ? modelProviderDraft(templateId) : null };
}

export interface ModelProviderSave {
  provider_id: string;
  input: ModelProviderInput;
  /** A key typed on the page, trimmed; empty when none. */
  api_key: string;
  /** A saved connection chosen on the page; empty when none. */
  connection_id: string;
  /** Ask for the connectivity check. The settings page always does; a caller that only stores a provider does not. */
  check_connection: boolean;
}

/** What a save refuses on its own, before a key is read or becomes a connection. Shared by the check and the commit. */
function assertSaveable(catalog: MolisWorkProjectCatalog, save: ModelProviderSave) {
  if (save.api_key && save.connection_id) throw new Error(uiText.text("workbench.model-provider-setup.choose-saved-connection-enter-new-api-key-not"));
  if (save.api_key && save.api_key.length < 8) throw new Error(uiText.text("workbench.model-provider-setup.api-key-too-short"));
  const alreadyStored = Boolean(catalog.models.get(save.provider_id) && catalog.models.hasCredential(save.provider_id));
  if (!save.api_key && !save.connection_id && !alreadyStored) throw new Error(uiText.text("workbench.model-provider-setup.enter-api-key-choose-saved-connection"));
  if (save.check_connection && save.input.models?.some((model) => !model.model_id.trim())) {
    throw new Error(uiText.text("workbench.model-provider-setup.enter-model-id-model-name-provider-s-documentation"));
  }
  return catalog.models.check(save.input);
}

/**
 * The selection to check before this save, or null when nothing about reaching the provider changed (a rename, a model
 * switched off) or the provider would not run anyway (turned off, or its models all off). A model switched on, added or
 * turned back on, is a change: that model is the one tried. Read-only: it pins no address and creates nothing. A saved
 * connection is only used for the address it was pinned to, as at the commit.
 */
export function planConnectionCheck(catalog: MolisWorkProjectCatalog, home: string | undefined, save: ModelProviderSave): ResolvedModelSelection | null {
  const record = assertSaveable(catalog, save);
  if (!save.check_connection || !record.enabled) return null;
  const existing = catalog.models.get(save.provider_id);
  const enabled = record.models.filter((model) => model.enabled).map((model) => model.model_id);
  if (enabled.length === 0) {
    if (existing) return null;
    throw new Error(uiText.text("workbench.model-provider-setup.no-model-yet-add-model-id-model-name"));
  }
  if (!home && (save.api_key || save.connection_id)) throw new Error(uiText.text("workbench.model-provider-setup.local-connection-store-unavailable"));
  const known = existing?.models.filter((model) => model.enabled).map((model) => model.model_id) ?? [];
  const added = enabled.find((id) => !known.includes(id));
  const { current, picked } = home ? withConnectorConnections(home, (store) => ({
    current: existing ? store.list("model-api").find((row) => row.credential_ref === existing.credential_ref) : undefined,
    picked: save.connection_id ? store.require(save.connection_id, "model-api") : undefined,
  })) : { current: undefined, picked: undefined };
  const credentialChanged = Boolean(save.api_key) || (picked !== undefined && picked.connection_id !== current?.connection_id);
  const unchanged = existing?.enabled === true && !credentialChanged && added === undefined
    && existing.base_url === record.base_url && existing.api_format === record.api_format
    && existing.thinking === record.thinking && existing.prompt_cache === record.prompt_cache;
  if (unchanged) return null;
  const connection = picked ?? current;
  let apiKey = save.api_key;
  if (!apiKey && connection && home) {
    apiKey = withConnectorConnections(home, (store) => {
      if (store.state(connection) !== "connected") throw new Error(uiText.text("workbench.model-provider-setup.chosen-connection-unavailable"));
      const pinned = store.targetOrigin(connection.connection_id), origin = new URL(record.base_url).origin;
      if (pinned && pinned !== origin) throw new Error(uiText.text("workbench.model-provider-setup.connection-bound-pinned-reach-origin-create-new-connection", { pinned, origin }));
      return store.resolveToken(connection.connection_id, "model-api");
    });
  }
  // A key is usable only through a connection pinned to the provider's address (the 2026-10-05 decision, 6fabc13e6): a
  // provider whose reference has no connection has no key to check with, and a Run would refuse it as well. The person
  // types the key again, which makes the connection.
  if (!apiKey.trim()) throw new Error(uiText.text("workbench.model-provider-setup.saved-key-could-not-be-read-enter-api"));
  const target = added ?? enabled[0];
  const model = record.models.find((entry) => entry.model_id === target);
  if (!model) throw new Error(uiText.text("workbench.model-provider-setup.no-model-yet-add-model-id-model-name"));
  return { provider: { ...record, credential_ref: existing?.credential_ref || "pending-check" }, model, api_key: apiKey };
}

/** Why a check failed, in words the person can act on: from the error's code only, never its text. Shared by saving and by "test". */
export function modelCheckProblem(raw: string): string {
  const code = /^(MODEL_[A-Z_]+)/.exec(raw)?.[1];
  const status = Number(/\((\d{3})\)/.exec(raw)?.[1] ?? 0);
  const reason = code === "MODEL_HTTP_ERROR" ? httpReason(status)
    : code === "MODEL_NETWORK_FAILED" ? (/resolved|ENOTFOUND/i.test(raw) ? uiText.text("workbench.model-provider-setup.host-address-could-not-be-found-check-base")
      : /ECONNREFUSED/i.test(raw) ? uiText.text("workbench.model-provider-setup.could-not-connect-nothing-listening-there-check-base") : uiText.text("workbench.model-provider-setup.could-not-connect-address-check-base-url-network"))
    : code === "MODEL_RESPONSE_INVALID" || raw === "模型返回了空内容" ? uiText.text("workbench.model-provider-setup.service-answered-but-not-api-format-check-base")
    : /超时/.test(raw) ? uiText.text("workbench.model-provider-setup.no-response-came-back-check-address-network-then")
    : uiText.text("workbench.model-provider-setup.check-did-not-finish-code", { code: code ?? "unknown" });
  return reason;
}

/** What the person reads when the check before a save fails: nothing was saved, and what they typed is still there. */
function modelCheckFailure(raw: string): string {
  return uiText.text("workbench.model-provider-setup.connection-check-did-not-pass-so-nothing-was", { reason: modelCheckProblem(raw) });
}

function httpReason(status: number): string {
  if (status === 401 || status === 403) return uiText.text("workbench.model-provider-setup.service-rejected-api-key-status-check-key-correct", { status });
  if (status === 404) return uiText.text("workbench.model-provider-setup.service-could-not-find-address-model-404-check");
  if (status === 400 || status === 422) return uiText.text("workbench.model-provider-setup.service-did-not-accept-request-status-model-id", { status });
  // The model path hands back the status only, so a throttle and an exhausted account read the same here (`model-provider-checks.ts`).
  if (status === 429) return uiText.text("workbench.model-provider-setup.service-says-there-too-many-requests-quota-used");
  if (status >= 500) return uiText.text("workbench.model-provider-setup.service-had-error-status-try-again-later", { status });
  return uiText.text("workbench.model-provider-setup.service-refused-request-status", { status });
}

/**
 * Run the check through the same Prologue path a Run takes. Throws the message above, coded with the check's reason, so the page
 * can put a refused key under its field and a rate limit with when it checks again; nothing was written by then.
 */
export async function verifyModelConnection(selection: ResolvedModelSelection): Promise<void> {
  try { await testConfiguredModel(selection); }
  catch (error) {
    const raw = error instanceof Error ? error.message : "";
    throw modelProviderCheckErrors[modelCheckReason(raw)](modelCheckFailure(raw));
  }
}

/** Write the provider (and, for a typed key, the connection that holds it). The key is stored, not echoed. */
export function commitModelProvider(catalog: MolisWorkProjectCatalog, home: string | undefined, save: ModelProviderSave) {
  assertSaveable(catalog, save);
  const { provider_id: providerId, input, api_key: apiKey, connection_id: requestedConnection } = save;
  if (!home && (apiKey || requestedConnection)) throw new Error(uiText.text("workbench.model-provider-setup.local-connection-store-unavailable"));
  const hadReady = catalog.models.health().some((entry) => entry.status === "ready");
  // The key lives in a model-api connection: a typed key becomes a new one, otherwise the chosen or current one is used.
  const credentialRef = home ? withConnectorConnections(home, (store) => {
    if (apiKey) {
      const created = store.createToken({ serviceId: "model-api", displayName: input.display_name.trim() || "模型", token: apiKey });
      store.assertTarget(created.connection_id, "model-api", input.base_url);
      return created.credential_ref ?? undefined;
    }
    const current = catalog.models.get(providerId)?.credential_ref;
    const connection = requestedConnection ? store.require(requestedConnection, "model-api")
      : store.list("model-api").find((row) => row.credential_ref === current);
    if (requestedConnection && (!connection?.credential_ref || store.state(connection) !== "connected")) throw new Error(uiText.text("workbench.model-provider-setup.chosen-connection-unavailable"));
    if (connection) store.assertTarget(connection.connection_id, "model-api", input.base_url);
    return connection?.credential_ref ?? undefined;
  }) : undefined;
  const previousRef = catalog.models.get(providerId)?.credential_ref;
  const provider = catalog.models.upsert({ ...input, ...(credentialRef ? { credential_ref: credentialRef } : {}) });
  const health = catalog.models.health().find((entry) => entry.provider_id === providerId);
  const released = provider.credential_ref !== previousRef ? releasedModelKey(catalog, home, previousRef) : undefined;
  // The first provider that can actually run: the page takes the person back to what sent them here.
  return { provider: catalog.models.get(providerId) ?? provider, health, first_model_ready: !hadReady && health?.status === "ready",
    ...(released ? { released_key: released } : {}) };
}

/** Remove a provider; its key stays in its connection, and is named back when nothing uses it any more. */
export function removeModelProvider(catalog: MolisWorkProjectCatalog, home: string | undefined, providerId: string) {
  const previousRef = catalog.models.get(providerId)?.credential_ref;
  const removed = catalog.models.remove(providerId);
  const released = removed ? releasedModelKey(catalog, home, previousRef) : undefined;
  return { removed, ...(released ? { released_key: released } : {}) };
}

/** A key a save or a removal let go of (the model-api connection that held the provider's old key). */
export interface ReleasedModelKey { connection_id: string; revision: string }

/**
 * The connection that held `previousRef`, when no provider and no plugin slot uses it any more. It is not removed here: like
 * an account no longer used (spec assistant-service-connections §13.2, 11-05), it stays usable until the person removes it,
 * and the page offers that right away. Read-only.
 */
export function releasedModelKey(catalog: MolisWorkProjectCatalog, home: string | undefined, previousRef: string | undefined): ReleasedModelKey | undefined {
  if (!home || !previousRef || catalog.models.list().some((provider) => provider.credential_ref === previousRef)) return undefined;
  return withConnectorConnections(home, (store) => {
    const row = store.list("model-api").find((entry) => entry.credential_ref === previousRef);
    if (!row || store.pluginBindings(row.connection_id).length > 0) return undefined;
    return { connection_id: row.connection_id, revision: row.updated_at };
  });
}
