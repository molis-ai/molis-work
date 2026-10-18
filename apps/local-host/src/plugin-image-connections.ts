import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginImageTarget } from "@molis-ai/molis-work-contracts/platform/plugin";
import { isLoopbackHostname } from "@molis-ai/molis-work-contracts/platform/loopback";
import { homeSqlitePath, peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { withConnectorConnections } from "./connector-connection-store.js";

export const imagePortErrors = defineErrorCodes("host", {
  image_target_invalid: "invalid", image_connection_unavailable: "conflict", image_connection_changed: "conflict",
  image_provider_failed: "upstream", image_runtime_unavailable: "unavailable", image_timeout: "timeout", image_not_sent: "conflict",
});
/** Same accepted endpoint boundary as image providers: no userinfo, query or fragment. */
export function imageBaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw imagePortErrors.image_target_invalid("图片服务地址无效"); }
  if (url.username || url.password || url.search || url.hash
    || url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHostname(url.hostname))) {
    throw imagePortErrors.image_target_invalid("图片服务地址必须是 HTTPS 或本机 HTTP，不含凭据、查询参数或片段");
  }
  return url.href.replace(/\/+$/u, "");
}

/** Pure metadata projection: never calls assertTarget (which pins an origin). */
export function imageConnectionSnapshot(home: string, namespace: string, target: PluginImageTarget) {
  const base = imageBaseUrl(target.base_url), origin = new URL(base).origin;
  const bound = existsSync(homeSqlitePath(home, "connectors")) ? withConnectorConnections(home, store => {
    const binding = store.binding("home", namespace, target.slot_id);
    const selected = binding && store.get(binding.connection_id);
    const sealed = selected?.credential_ref ? runWithMolisWorkHome(home, () => peekSealedEntry(selected.credential_ref!)) : null;
    const targetOrigin = selected ? store.targetOrigin(selected.connection_id) : null;
    return { binding, selected, sealed, targetOrigin };
  }) : null;
  const { binding = null, selected = null, sealed = null, targetOrigin = null } = bound ?? {};
  const available = selected ? selected.service_id === "image-api" && selected.enabled && !selected.disconnected_at && !!sealed
    && (!targetOrigin || targetOrigin === origin) : !binding && isLoopbackHostname(new URL(base).hostname);
  const revision = createHash("sha256").update(JSON.stringify([binding?.connection_id ?? null, selected?.updated_at ?? null,
    selected?.enabled ?? null, selected?.disconnected_at ?? null, targetOrigin, sealed])).digest("hex");
  return { connection_id: binding?.connection_id ?? null, available, has_key: available && !!sealed, revision,
    ...(!available ? { reason: "所选图像连接不可用，请检查服务连接" } : {}) };
}
