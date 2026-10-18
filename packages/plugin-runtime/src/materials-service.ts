import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MaterialSourceContent, PluginManifest, PluginMaterialRequest, PluginMaterialsClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MaterialExtraction, MaterialSource } from "@molis-ai/molis-work-contracts/services/materials";
import { currentPluginAction } from "./action-scope.js";

const errors = defineErrorCodes("plugin", {
  materials_action_required: "forbidden", materials_permission_undeclared: "forbidden", materials_action_not_concurrent: "forbidden",
});

export interface PluginMaterialsDispatch extends PluginMaterialRequest {
  readonly signal: AbortSignal;
  readonly allowModelDownload: boolean;
  /** Recheck immediately before a network request, download or native extraction effect. */
  beforeEffect(): Promise<void>;
}
/** Host-owned extraction and bounded public transport; no plugin code chooses the implementation or cache directory. */
export interface PluginMaterialsPort {
  extract(source: MaterialSource, options: PluginMaterialsDispatch): Promise<MaterialExtraction>;
  readSource(url: string, options: PluginMaterialsDispatch): Promise<MaterialSourceContent>;
}
export interface PluginMaterialsGate {
  readonly install_id: string;
  assertActive(): void;
  requireGrant(permission: string): void;
}

/** Bind authority from the actual running action, never a caller-shaped business argument. */
export function createPluginMaterialsClient(manifest: PluginManifest, port: PluginMaterialsPort, gate: PluginMaterialsGate): PluginMaterialsClient {
  const declared = (permission: string) => manifest.permissions.some(item => item.permission === permission);
  async function run<T>(permission: string, request: PluginMaterialRequest, invoke: (options: PluginMaterialsDispatch) => Promise<T>): Promise<T> {
    const scope = currentPluginAction();
    if (!scope || scope.install_id !== gate.install_id) throw errors.materials_action_required("材料只能在本插件自己的动作里读取");
    const { definition, caller } = scope;
    if (!definition.action.permissions.includes(permission)) throw errors.materials_permission_undeclared(`动作 ${definition.capability_id} 没有声明 ${permission}`);
    if (definition.action.scheduling !== "concurrent") throw errors.materials_action_not_concurrent("读取材料的动作必须声明 scheduling: concurrent");
    if (!caller.permissions.includes(permission)) throw new ActionError("actions.forbidden", "这次调用没有材料读取权限");
    const signal = AbortSignal.any([caller.signal, request.signal].filter(item => item !== undefined));
    const current = () => { signal.throwIfAborted(); gate.assertActive(); gate.requireGrant(permission); };
    const beforeEffect = async () => { current(); await caller.beforeEffect(); current(); };
    await beforeEffect();
    const { limits, timeoutMs, textFormat, pdfMode, ocrLanguages } = request;
    const result = await invoke({ signal, beforeEffect, limits, timeoutMs, textFormat, pdfMode, ocrLanguages,
      allowModelDownload: caller.audience === "user" && request.allowModelDownload === true,
      onProgress: progress => { current(); caller.on_progress?.(progress); request.onProgress?.(progress); },
    });
    await beforeEffect();
    return result;
  }
  return Object.freeze({
    ...(declared("materials:read") ? { extract: (source: MaterialSource, request: PluginMaterialRequest = {}) =>
      run("materials:read", request, options => port.extract(source, options)) } : {}),
    ...(declared("materials:fetch") ? { readSource: (url: string, request: PluginMaterialRequest = {}) =>
      run("materials:fetch", request, options => port.readSource(url, options)) } : {}),
  });
}
