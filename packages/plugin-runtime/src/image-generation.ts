import { ActionError, defineErrorCodes, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginImageConnectionState, PluginImageGenerationClient, PluginImageGenerationDeclaration, PluginImageGenerationRequest, PluginImageTarget, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ConnectorConnectionView } from "@molis-ai/molis-work-contracts/services/connector-host";
import { currentPluginAction } from "./action-scope.js";

const errors = defineErrorCodes("plugin", {
  image_action_required: "forbidden", image_permission_undeclared: "forbidden", image_concurrent_required: "forbidden", image_input_invalid: "invalid",
});
export interface PluginImageGenerationDispatch {
  readonly signal: AbortSignal;
  beforeEffect(): Promise<void>;
  assertCurrent(): void;
}
export interface PluginImageGenerationPort {
  connections(): readonly ConnectorConnectionView[];
  inspect(target: PluginImageTarget): PluginImageConnectionState;
  bind(target: PluginImageTarget, connectionId: string): void;
  unbind(slotId: string): void;
  generate(request: PluginImageGenerationRequest, dispatch: PluginImageGenerationDispatch): ReturnType<PluginImageGenerationClient["generate"]>;
}
export interface PluginImageGenerationGate {
  readonly install_id: string;
  assertActive(): void;
  requireGrant(permission: string): void;
}

/** The actual action scope supplies authority; request fields never supply identity. */
export function createPluginImageGenerationClient(manifest: PluginManifest, port: PluginImageGenerationPort,
  gate: PluginImageGenerationGate, declaration: PluginImageGenerationDeclaration): PluginImageGenerationClient {
  const declared = new Set(manifest.permissions.map(entry => entry.permission));
  const permissions = Object.freeze({ read: declaration.read_permission, write: declaration.write_permission, generate: declaration.generate_permission });
  const permit = (permission: string) => {
    gate.assertActive();
    if (!declared.has(permission)) throw errors.image_permission_undeclared("清单未声明图片服务需要的权限");
    gate.requireGrant(permission);
  };
  const action = (required: readonly string[], command = false) => {
    const scope = currentPluginAction();
    if (!scope || scope.install_id !== gate.install_id) throw errors.image_action_required("图片服务只接受本安装正在执行的动作");
    for (const permission of required) {
      permit(permission);
      if (!scope.definition.action.permissions.includes(permission)) throw errors.image_permission_undeclared("当前动作未声明图片服务需要的权限");
      if (!scope.caller.permissions.includes(permission)) throw new ActionError("actions.forbidden", "当前调用未获图片服务授权");
    }
    if (command && scope.definition.operation !== "command") throw errors.image_action_required("连接变更只能由 command 动作执行");
    scope.caller.signal?.throwIfAborted();
    scope.caller.assert_authority_current?.();
    return scope;
  };
  const read = (generationAllowed = false) => {
    const scope = currentPluginAction();
    const permission = generationAllowed && scope?.definition.action.permissions.includes(permissions.generate) ? permissions.generate : permissions.read;
    if (scope) action([permission]);
    else permit(permission); // Discovery sees metadata; it cannot dispatch or mutate a binding.
  };
  const current = (caller: ActionExecutionContext, required: readonly string[]) => {
    caller.signal?.throwIfAborted();
    for (const permission of required) permit(permission);
    caller.assert_authority_current?.();
  };
  return Object.freeze({
    connections() { read(); return port.connections(); },
    inspect(target: PluginImageTarget) { read(true); return port.inspect(copyTarget(target)); },
    async bind(target: PluginImageTarget, connectionId: string) {
      const copied = copyTarget(target), id = text(connectionId, 160);
      const { caller } = action([permissions.write], true);
      await caller.beforeEffect(); current(caller, [permissions.write]);
      port.bind(copied, id);
    },
    async unbind(slotId: string) {
      const id = text(slotId, 128), { caller } = action([permissions.write], true);
      await caller.beforeEffect(); current(caller, [permissions.write]);
      port.unbind(id);
    },
    async generate(request: PluginImageGenerationRequest, options: { readonly signal?: AbortSignal } = {}) {
      const copied = copyRequest(request), required = [permissions.generate, "model:invoke"];
      const { caller, definition } = action(required);
      if (definition.action.scheduling !== "concurrent") throw errors.image_concurrent_required("图片生成需要并发动作");
      const signal = AbortSignal.any([caller.signal, options.signal].filter(value => value !== undefined));
      const assertCurrent = () => { signal.throwIfAborted(); current(caller, required); };
      const beforeEffect = async () => { assertCurrent(); await caller.beforeEffect(); assertCurrent(); };
      await beforeEffect();
      const result = await port.generate(copied, { signal, beforeEffect, assertCurrent });
      await beforeEffect();
      return result;
    },
  });
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.image_input_invalid("图片服务参数无效");
  return value.trim();
}
function copyTarget(target: PluginImageTarget): PluginImageTarget {
  if (!target || typeof target !== "object") throw errors.image_input_invalid("缺少图片服务目标");
  return { slot_id: text(target.slot_id, 128), base_url: text(target.base_url, 2048) };
}
function copyRequest(request: PluginImageGenerationRequest): PluginImageGenerationRequest {
  if (request?.protocol !== "openai-images" && request?.protocol !== "gemini") throw errors.image_input_invalid("不支持这个图片协议");
  if (request.protocol === "gemini" && request.size || request.protocol === "openai-images" && request.aspect_ratio) throw errors.image_input_invalid("尺寸与图片协议不匹配");
  return { ...copyTarget(request), expected_revision: text(request.expected_revision, 128), protocol: request.protocol,
    model: text(request.model, 200), prompt: text(request.prompt, 32_000),
    ...(request.size ? { size: text(request.size, 64) } : {}), ...(request.aspect_ratio ? { aspect_ratio: text(request.aspect_ratio, 32) } : {}) };
}
