import { resolvePrologueInference } from "./prologue-inference-host.js";
import { inferenceServiceUnavailableReason, isDispatchRefusal } from "@molis-ai/molis-work-service-agent-host";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { homeSqlitePath, peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { ImagesService, ImagesError, imagesProjectData, type ImageConnectionInput } from "@molis-ai/molis-work-plugin-images";
import type { ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ConnectorConnectionView } from "@molis-ai/molis-work-contracts/services/connector-host";
import { ConnectorConnectionError, withConnectorConnections } from "./connector-connection-store.js";

interface SharedImages { service: ImagesService; owners: Set<ImagesHostService>; closing?: Promise<void> }
const services = new Map<string, SharedImages>();

/** Owns the original persistent runner, independent of Web requests and pages. */
export class ImagesHostService {
  private readonly home: string;
  private entry?: SharedImages;
  private closed = false;
  constructor(home: string) {
    this.home = resolve(home);
    // Deleting a project stops what is still being generated for it before its jobs and pictures go.
    projectDeletedHooksFor(this.home).register({ id: "images", label: imagesProjectData.label, alive: () => !this.closed,
      clear: projectId => { if (existsSync(homeSqlitePath(this.home, "images"))) this.get().deleteProject(projectId); } });
  }
  get(): ImagesService {
    if (this.closed) throw new ImagesError("images.closed", "图片服务已停止", 503);
    if (this.entry) return this.entry.service;
    let shared = services.get(this.home);
    if (shared?.closing) throw new ImagesError("images.closed", "图片服务正在关闭，请稍后重试", 503);
    if (!shared) {
      const home = this.home;
      const sealed = (ref: string | null) => ref ? runWithMolisWorkHome(home, () => peekSealedEntry(ref)) : null;
      shared = { owners: new Set(), service: new ImagesService({ homeDirectory: home,
        generate: async (input, signal) => {
          const endpoint = input.api_format === "openai-images" ? `${input.base_url}/images/generations`
            : `${input.base_url}/models/${encodeURIComponent(input.model)}:generateContent`;
          try {
            const inference = await resolvePrologueInference(home);
            signal.throwIfAborted();
            return await inference.generateImages({ protocol: input.api_format, endpoint, model: input.model,
              credential_ref: input.credential_ref, resolveCredential: input.resolveCredential,
              prompt: input.prompt, ...(input.size ? { size: input.size } : {}),
              ...(input.aspect_ratio ? { aspect_ratio: input.aspect_ratio } : {}), signal, timeout_ms: 180_000 });
          } catch (error) {
            const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
            const guidance: Record<number, string> = {
              400: "厂商拒绝了生成参数，请检查模型、尺寸和提示词。", 401: "API Key 无效或已过期，请更新服务密钥。",
              403: "此密钥没有所选模型的权限，或请求被厂商策略拒绝。", 404: "找不到接口或模型，请检查 API 基址、模型名称与协议。",
              413: "厂商拒绝了过大的请求，请缩短提示词。", 429: "厂商限流或额度不足，请检查用量与余额，稍后再手动重试。",
            };
            if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599) {
              throw new ImagesError("images.provider_http", `HTTP ${status}：${guidance[status] ?? "厂商服务暂时不可用，请稍后再手动重试。"}`, 502);
            }
            const unavailable = inferenceServiceUnavailableReason(error);
            if (unavailable) throw new ImagesError("images.runtime_unavailable", `${unavailable}。`, 503);
            // A key or service changed while waiting: nothing reached the provider, so no network or billing hint.
            if (isDispatchRefusal(error)) throw new ImagesError("images.not_sent", `${error.message}，请求没有发给厂商。请重新生成。`, 409);
            throw error; // ImagesService publishes only its own typed errors; unknown SDK details stay private.
          }
        },
        resolveConnectionKey: (id, baseUrl) => withConnectorConnections(home, store => {
          const selected = store.binding("home", "images", id);
          if (!selected) return undefined;
          try { store.assertTarget(selected.connection_id, "image-api", baseUrl); return store.resolveToken(selected.connection_id, "image-api"); }
          catch { return null; }
        }),
        selectedConnectionId: id => withConnectorConnections(home, store => store.binding("home", "images", id)?.connection_id ?? null),
        selectConnection: (id, connectionId) => withConnectorConnections(home, store => store.bind({scopeId:"home",pluginId:"images",slotId:id,serviceId:"image-api",connectionId})),
        clearConnection: id => withConnectorConnections(home, store => store.unbind("home", "images", id)),
        connectionStatus: connection => withConnectorConnections(home, store => {
          const binding = store.binding("home", "images", connection.id);
          const selected = binding ? store.get(binding.connection_id) : null;
          const token = selected ? sealed(selected.credential_ref) : null;
          const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(connection.base_url).hostname);
          const target = selected ? store.targetOrigin(selected.connection_id) : null;
          const available = selected
            ? selected.service_id === "image-api" && !selected.disconnected_at && !!token && (!target || target === new URL(connection.base_url).origin)
            : local;
          return { available, has_key: !!token && available, reason: available ? undefined : "所选图像连接不可用，请检查服务连接",
            revision: JSON.stringify([selected?.connection_id ?? null, selected?.updated_at ?? null, selected?.disconnected_at ?? null, token]) };
        }),
      }) };
      services.set(home, shared);
    }
    shared.owners.add(this); this.entry = shared;
    return shared.service;
  }
  /**
   * Whether an image can be generated now: some saved service has what it needs (a local address, or a chosen connection that is
   * still connected). A Home that never saved one has no store yet, and asking must not create it.
   */
  startAvailability(): ActionAvailability {
    const none = (reason: string): ActionAvailability => ({ available: false, code: "actions.connection_required", reason });
    const missing = none("还没有可用的生图服务：请先在图片页添加，并为远程服务选择一条带密钥的服务连接。");
    if (this.closed) return none("图片服务已停止。");
    if (!this.entry && !existsSync(homeSqlitePath(this.home, "images"))) return missing;
    try { return this.get().listConnections().some(connection => connection.available ?? connection.has_key) ? { available: true } : missing; }
    catch (error) { return none(error instanceof Error ? error.message : "图片服务不可用。"); }
  }
  authConnections(): ConnectorConnectionView[] {
    return withConnectorConnections(this.home, store => store.list("image-api").map(row => {
      const target = store.targetOrigin(row.connection_id);
      const present = row.credential_ref && runWithMolisWorkHome(this.home, () => peekSealedEntry(row.credential_ref!));
      return { connection_id: row.connection_id, service_id: row.service_id, display_name: row.display_name, account_label: row.account_label,
        auth_method: row.auth_method, source: row.source, state: row.disconnected_at ? "disconnected" : present ? "connected" : "reauth_required",
        ...(target ? { target_origin: target } : {}) };
    }));
  }
  validateConnection(input: ImageConnectionInput): void {
    if (!input.auth_connection_id) return;
    try { withConnectorConnections(this.home, store => {
      const selected = store.require(input.auth_connection_id!, "image-api");
      if (store.state(selected) !== "connected") throw new ImagesError("images.key_required", "所选图像连接不可用", 409);
      store.assertTarget(selected.connection_id, "image-api", input.base_url);
    }); } catch (error) {
      if (error instanceof ConnectorConnectionError) throw new ImagesError("images.connection_invalid", error.message, 409);
      throw error;
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    const entry = this.entry; this.entry = undefined;
    if (!entry) return;
    entry.owners.delete(this);
    if (entry.owners.size) return;
    entry.closing ??= entry.service.close().finally(() => { if (services.get(this.home) === entry) services.delete(this.home); });
    await entry.closing;
  }
}
