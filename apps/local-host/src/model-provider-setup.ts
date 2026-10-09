import { randomUUID } from "node:crypto";
import type { ResolvedModelSelection } from "@molis-ai/molis-work-service-agent-host";
import {
  modelProviderTemplate,
  type ModelProviderRecord,
} from "@molis-ai/molis-work-contracts/modules/model-providers";
import { withConnectorConnections } from "./connector-connection-store.js";
import type { ModelProviderInput } from "./model-provider-store.js";
import { testConfiguredModel } from "./model-provider-test.js";
import type { MolisWorkProjectCatalog } from "./project-catalog.js";
import { L } from "./web-locale.js";

/**
 * Setting up a model provider from the settings page: the form a template starts, and the one connectivity check a save
 * runs. The key is only ever carried as a value in memory or as a reference: no message here quotes it, and a failed
 * check leaves no connection, no provider and no pinned address behind.
 */

/** The form a provider template starts, or a blank one. A template mints a fresh id: choosing it twice never overwrites. */
export function modelProviderDraft(templateId: string | null | undefined): { provider: ModelProviderRecord; template_id: string | null } {
  const template = modelProviderTemplate(templateId);
  // A template whose model name is not one we can promise still shows the empty row, so what is missing is visible.
  const models = (template?.model_ids ?? []).map((model_id) => ({ model_id, enabled: true }));
  return {
    template_id: template?.template_id ?? null,
    provider: {
      provider_id: template ? `${template.template_id}-${randomUUID().slice(0, 8)}` : `custom-${randomUUID()}`,
      display_name: template?.display_name ?? "新供应商", base_url: template?.base_url ?? "",
      api_format: template?.api_format ?? "anthropic-messages", credential_ref: "", enabled: true, prompt_cache: "off",
      models: template && models.length === 0 ? [{ model_id: "", enabled: true }] : models, created_at: "", updated_at: "",
    },
  };
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
  if (save.api_key && save.connection_id) throw new Error(L("请只选择已有连接，或填写新的 API Key"));
  if (save.api_key && save.api_key.length < 8) throw new Error(L("API Key 太短"));
  const alreadyStored = Boolean(catalog.models.get(save.provider_id) && catalog.models.hasCredential(save.provider_id));
  if (!save.api_key && !save.connection_id && !alreadyStored) throw new Error(L("请填写 API Key，或选择一条已保存的连接"));
  if (save.check_connection && save.input.models?.some((model) => !model.model_id.trim())) {
    throw new Error(L("请填写模型 ID（供应商文档里的模型名），或删掉空的一行。"));
  }
  return catalog.models.check(save.input);
}

/**
 * The selection to check before this save, or null when nothing about reaching the provider changed (a rename, a switch
 * flipped on one model) or the provider would not run anyway (turned off, or its models all off). Read-only: it pins no
 * address and creates nothing. A saved connection is only used for the address it was pinned to, as at the commit.
 */
export function planConnectionCheck(catalog: MolisWorkProjectCatalog, home: string | undefined, save: ModelProviderSave): ResolvedModelSelection | null {
  const record = assertSaveable(catalog, save);
  if (!save.check_connection || !record.enabled) return null;
  const existing = catalog.models.get(save.provider_id);
  const enabled = record.models.filter((model) => model.enabled).map((model) => model.model_id);
  if (enabled.length === 0) {
    if (existing) return null;
    throw new Error(L("还没有可用的模型：先添加一个模型 ID（供应商文档里的模型名）再保存。"));
  }
  if (!home && (save.api_key || save.connection_id)) throw new Error(L("本机连接库不可用"));
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
  if (!apiKey && connection) {
    apiKey = withConnectorConnections(home!, (store) => {
      if (store.state(connection) !== "connected") throw new Error(L("所选连接不可用"));
      const pinned = store.targetOrigin(connection.connection_id), origin = new URL(record.base_url).origin;
      if (pinned && pinned !== origin) throw new Error(L("这条连接已绑定 {pinned}；如需访问 {origin}，请新建连接", { pinned, origin }));
      return store.resolveToken(connection.connection_id, "model-api");
    });
  }
  // A provider saved before connections existed holds its key under its own reference, not in a connection.
  apiKey ||= catalog.models.resolveConfiguration({ provider_id: save.provider_id })?.api_key ?? "";
  if (!apiKey.trim()) throw new Error(L("读不到已保存的密钥，请重新填写 API Key"));
  const target = added ?? enabled[0]!;
  return { provider: { ...record, credential_ref: existing?.credential_ref || "pending-check" }, model: record.models.find((model) => model.model_id === target)!, api_key: apiKey };
}

/** What the person reads when a check fails: a reason they can act on, from the error's code only, never its text. */
export function modelCheckFailure(raw: string): string {
  const code = /^(MODEL_[A-Z_]+)/.exec(raw)?.[1];
  const status = Number(/\((\d{3})\)/.exec(raw)?.[1] ?? 0);
  const reason = code === "MODEL_HTTP_ERROR" ? httpReason(status)
    : code === "MODEL_NETWORK_FAILED" ? (/resolved|ENOTFOUND/i.test(raw) ? L("找不到这个地址的主机。检查 Base URL 有没有拼错，再看网络或代理。")
      : /ECONNREFUSED/i.test(raw) ? L("连不上这个地址：对方没有在监听。检查 Base URL 和端口。") : L("连不上这个地址。检查 Base URL、网络或代理。"))
    : code === "MODEL_RESPONSE_INVALID" || raw === "模型返回了空内容" ? L("服务有回应，但不是这个 API 格式该有的内容。检查 Base URL 和 API 格式有没有选对。")
    : /超时/.test(raw) ? L("一直没有等到回应。检查地址和网络后重试。")
    : L("检查没有完成（{code}）。", { code: code ?? "unknown" });
  return L("连接检查没有通过，所以没有保存。{reason} 填写的内容还在，改好后可以再保存。", { reason });
}

function httpReason(status: number): string {
  if (status === 401 || status === 403) return L("服务拒绝了这个 API Key（{status}）。检查 Key 有没有填对、是不是这个地址的 Key。", { status });
  if (status === 404) return L("服务找不到这个地址或模型（404）。检查 Base URL 和模型 ID 有没有写对。");
  if (status === 400 || status === 422) return L("服务不接受这次请求（{status}）。多半是模型 ID 写错了，也可能是 API 格式选得不对。", { status });
  if (status === 429) return L("服务说请求太多或额度用完了（429）。稍后再试，或看看账户额度。");
  if (status >= 500) return L("服务那边出错了（{status}）。稍后再试。", { status });
  return L("服务拒绝了这次请求（{status}）。", { status });
}

/** Run the check through the same Prologue path a Run takes. Throws the message above; nothing was written by then. */
export async function verifyModelConnection(selection: ResolvedModelSelection): Promise<void> {
  try { await testConfiguredModel(selection); }
  catch (error) { throw new Error(modelCheckFailure(error instanceof Error ? error.message : "")); }
}

/** Write the provider (and, for a typed key, the connection that holds it). The key is stored, not echoed. */
export function commitModelProvider(catalog: MolisWorkProjectCatalog, home: string | undefined, save: ModelProviderSave) {
  assertSaveable(catalog, save);
  const { provider_id: providerId, input, api_key: apiKey, connection_id: requestedConnection } = save;
  if (!home && (apiKey || requestedConnection)) throw new Error(L("本机连接库不可用"));
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
    if (requestedConnection && (!connection?.credential_ref || store.state(connection) !== "connected")) throw new Error(L("所选连接不可用"));
    if (connection) store.assertTarget(connection.connection_id, "model-api", input.base_url);
    return connection?.credential_ref ?? undefined;
  }) : undefined;
  const provider = catalog.models.upsert({ ...input, ...(credentialRef ? { credential_ref: credentialRef } : {}) });
  const health = catalog.models.health().find((entry) => entry.provider_id === providerId);
  // The first provider that can actually run: the page takes the person back to what sent them here.
  return { provider: catalog.models.get(providerId) ?? provider, health, first_model_ready: !hadReady && health?.status === "ready" };
}
