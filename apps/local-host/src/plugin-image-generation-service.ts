import type { PluginDefinition, PluginImageGenerationClient, PluginImageGenerationDeclaration, PluginImageGenerationRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginImageGenerationClient, type PluginImageGenerationDispatch, type PluginImageGenerationPort } from "@molis-ai/molis-work-plugin-runtime";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";
import { inferenceServiceUnavailableReason, isDispatchRefusal } from "@molis-ai/molis-work-service-agent-host";
import { existsSync } from "node:fs";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import type { PluginPlatformHome } from "./home-side.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorRequest } from "./connector-lifecycle.js";
import { resolvePrologueInference } from "./prologue-inference-host.js";
import { imageBaseUrl, imageConnectionSnapshot, imageConnectionViews, imagePortErrors } from "./plugin-image-connections.js";

export function pluginImageGenerationFor(home: PluginPlatformHome | null | undefined, definition: PluginDefinition, context: PluginStartContext,
  declaration: PluginImageGenerationDeclaration | undefined, assertActive: () => void): PluginImageGenerationClient | undefined {
  if (!home || !declaration || definition.execution === "sandbox") return undefined;
  return createPluginImageGenerationClient(definition.manifest, createPluginImageGenerationPort(home.directory, declaration.store_name),
    { install_id: context.install_id, installation_generation: context.installation_generation, assertActive, requireGrant: permission => context.requireGrant(permission) }, declaration);
}

/** Connector owner manages bindings; agent-host owns every actual model dispatch. */
export function createPluginImageGenerationPort(home: string, namespace: string): PluginImageGenerationPort {
  return {
    connections: () => imageConnectionViews(home),
    inspect: target => imageConnectionSnapshot(home, namespace, target),
    bind: (target, connectionId) => withConnectorConnections(home, store => {
      const base = imageBaseUrl(target.base_url), selected = store.require(connectionId, "image-api");
      if (store.state(selected) !== "connected") throw imagePortErrors.image_connection_unavailable("所选图像连接不可用");
      store.assertTarget(connectionId, "image-api", base);
      store.bind({ scopeId: "home", pluginId: namespace, slotId: target.slot_id, serviceId: "image-api", connectionId });
    }),
    unbind: slotId => { if (existsSync(homeSqlitePath(home, "connectors"))) withConnectorConnections(home, store => store.unbind("home", namespace, slotId)); },
    generate: (request, dispatch) => generate(home, namespace, request, dispatch),
  };
}

async function generate(home: string, namespace: string, request: PluginImageGenerationRequest, dispatch: PluginImageGenerationDispatch) {
  const target = { slot_id: request.slot_id, base_url: imageBaseUrl(request.base_url) };
  const snapshot = imageConnectionSnapshot(home, namespace, target);
  if (!snapshot.available || snapshot.revision !== request.expected_revision) throw imagePortErrors.image_connection_changed("生图连接已改变或不可用，请重新提交");
  const checkRevision = (revision: string) => {
    dispatch.assertCurrent();
    const current = imageConnectionSnapshot(home, namespace, target);
    if (!current.available || current.revision !== revision) throw imagePortErrors.image_connection_changed("生图连接已改变，结果未交付");
  };
  await dispatch.beforeEffect(); checkRevision(snapshot.revision);
  // Pin only in this authorized effect. Accept our own first pin before capturing the dispatch snapshot.
  if (snapshot.connection_id) withConnectorConnections(home, store => store.assertTarget(snapshot.connection_id!, "image-api", target.base_url));
  const pinned = imageConnectionSnapshot(home, namespace, target);
  const current = () => checkRevision(pinned.revision);
  const run = async (signal: AbortSignal) => {
    const lifetime = createExecutionLifetime({ signal, timeout: { milliseconds: 180_000, reason: imagePortErrors.image_timeout("等待厂商已超过 180 秒，请检查用量后再手动重试") },
      monitor: { intervalMs: 200, check: current } });
    const beforeDispatch = async () => { lifetime.assertActive(); await dispatch.beforeEffect(); lifetime.assertActive(); current(); };
    try {
      const pending = (async () => {
        await beforeDispatch();
        const inference = await resolvePrologueInference(home);
        await beforeDispatch();
        const endpoint = request.protocol === "openai-images" ? `${target.base_url}/images/generations`
          : `${target.base_url}/models/${encodeURIComponent(request.model)}:generateContent`;
        return inference.generateImages({ protocol: request.protocol, endpoint, model: request.model, prompt: request.prompt,
          ...(request.size ? { size: request.size } : {}), ...(request.aspect_ratio ? { aspect_ratio: request.aspect_ratio } : {}),
          signal: lifetime.signal, beforeDispatch, timeout_ms: 180_000, credential_ref: `image-generation:${target.slot_id}`,
          resolveCredential: () => { lifetime.assertActive(); current(); return pinned.connection_id
            ? withConnectorConnections(home, store => store.resolveToken(pinned.connection_id!, "image-api")) : ""; } });
      })();
      const result = await lifetime.wait(pending);
      await beforeDispatch();
      return { images: result, revision: pinned.revision };
    } catch (error) {
      lifetime.assertActive(); current();
      throw providerFailure(error);
    } finally { lifetime.dispose(); }
  };
  return snapshot.connection_id ? withConnectorRequest(home, snapshot.connection_id, dispatch.signal, run) : run(dispatch.signal);
}

function providerFailure(error: unknown): Error {
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599) {
    return imagePortErrors.image_provider_failed(`厂商返回 HTTP ${status}，请检查参数、账号权限与用量后再手动重试`);
  }
  const reason = inferenceServiceUnavailableReason(error);
  if (reason) return imagePortErrors.image_runtime_unavailable(reason);
  if (isDispatchRefusal(error)) return imagePortErrors.image_not_sent("连接或授权已改变，请求没有发给厂商");
  return imagePortErrors.image_provider_failed("无法完成图片生成，请检查网络、服务地址和厂商状态后再手动重试");
}
