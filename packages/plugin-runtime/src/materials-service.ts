import { ActionError, defineErrorCodes, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MaterialSourceContent, PluginLocalPageRequest, PluginManifest, PluginMaterialDocumentsRequest, PluginMaterialRequest, PluginMaterialsClient, PluginOriginalContent, PluginOriginalRangeContent, PluginOriginalRangeRequest, PluginOriginalRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MaterialDocumentBatch, MaterialExtraction, MaterialSource, MaterialUpload } from "@molis-ai/molis-work-contracts/services/materials";
import { currentPluginAction, inPluginInstance, type PluginInstance } from "./action-scope.js";

const errors = defineErrorCodes("plugin", {
  materials_action_required: "forbidden", materials_permission_undeclared: "forbidden", materials_action_not_concurrent: "forbidden",
  materials_original_key_invalid: "invalid", materials_original_not_offered: "forbidden",
});

export interface PluginMaterialsDispatch extends PluginMaterialRequest {
  readonly signal: AbortSignal;
  readonly allowModelDownload: boolean;
  /** Recheck immediately before a network request, download or native extraction effect. */
  beforeEffect(): Promise<void>;
}
/**
 * Whose registration an original file belongs to: the plugin, its installation, the project its activation runs in, and the key the
 * plugin chose for its own record. An installation's id is the same in every project, so the project is what keeps one project's
 * registrations from another's; a Home-level activation has none (`null`), and its registrations are the same in every project.
 */
export interface PluginOriginalFileKey {
  readonly plugin_id: string;
  readonly install_id: string;
  readonly project_id: string | null;
  readonly record_key: string;
}
/**
 * Host-owned extraction and bounded public transport; no plugin code chooses the implementation or cache directory.
 * A member the Host does not provide is a method the client does not have, whatever the Manifest declares.
 */
export interface PluginMaterialsPort {
  extract(source: MaterialSource, options: PluginMaterialsDispatch): Promise<MaterialExtraction>;
  readSource(url: string, options: PluginMaterialsDispatch): Promise<MaterialSourceContent>;
  readDocuments(files: readonly MaterialUpload[], options: PluginMaterialsDispatch): Promise<MaterialDocumentBatch>;
  /** Whether `extract` can read an image's text now. Reads nothing; asked outside any action. */
  imageTextAvailable?(): boolean;
  readLocalPage?(url: string, options: PluginMaterialsDispatch): Promise<MaterialExtraction>;
  /** `path` is what the Host's entry offered this request; the port stores its real path under `key`. */
  claimOriginal?(key: PluginOriginalFileKey, path: string, options: PluginMaterialsDispatch): Promise<void>;
  readOriginal?(key: PluginOriginalFileKey, options: PluginMaterialsDispatch & { readonly maxBytes?: number }): Promise<Uint8Array>;
  releaseOriginal?(key: PluginOriginalFileKey, options: PluginMaterialsDispatch): Promise<void>;
  /** One part of the registered file, with the file's size and an opaque revision (PluginOriginalRangeRequest); the Host checks the bounds. */
  readOriginalRange?(key: PluginOriginalFileKey, options: PluginMaterialsDispatch & Pick<PluginOriginalRangeRequest, "offset" | "length" | "revision">): Promise<PluginOriginalRangeContent>;
}
export interface PluginMaterialsGate extends PluginInstance {
  /** The project this activation runs in, from the Host's start list; `null` for a Home-level activation. */
  readonly project_id: string | null;
  assertActive(): void;
  requireGrant(permission: string): void;
}

/** A plugin's own record key: a short, printable name. The Host stores it as given, so its shape is settled here, once. */
function originalRecordKey(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 200 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw errors.materials_original_key_invalid("原始文件的记录键必须是 200 个字符以内的可见文字");
  }
  return value;
}

/** Bind authority from the actual running action, never a caller-shaped business argument. */
export function createPluginMaterialsClient(manifest: PluginManifest, port: PluginMaterialsPort, gate: PluginMaterialsGate): PluginMaterialsClient {
  const declared = (permission: string) => manifest.permissions.some(item => item.permission === permission);
  async function run<T>(permission: string, request: PluginMaterialRequest, invoke: (options: PluginMaterialsDispatch, caller: ActionExecutionContext) => Promise<T>): Promise<T> {
    const scope = currentPluginAction();
    if (!scope || !inPluginInstance(scope, gate)) throw errors.materials_action_required("材料只能在本插件自己的动作里读取");
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
    }, caller);
    await beforeEffect();
    return result;
  }
  const originalKey = (record_key: unknown): PluginOriginalFileKey => ({ plugin_id: manifest.plugin_id, install_id: gate.install_id, project_id: gate.project_id, record_key: originalRecordKey(record_key) });
  const original = declared("materials:original") ? port : undefined;
  return Object.freeze({
    ...(declared("materials:read") ? { extract: (source: MaterialSource, request: PluginMaterialRequest = {}) =>
      run("materials:read", request, options => port.extract(source, options)),
      readDocuments: (files: readonly MaterialUpload[], request: PluginMaterialDocumentsRequest = {}) =>
        run("materials:read", request, options => port.readDocuments(files, options)) } : {}),
    // A fact about the machine, not about a material: no action, nothing read, nothing written. The declaration and the grant still apply.
    ...(declared("materials:read") && port.imageTextAvailable ? { imageTextAvailable: () => {
      gate.assertActive(); gate.requireGrant("materials:read");
      return port.imageTextAvailable!();
    } } : {}),
    ...(declared("materials:fetch") ? { readSource: (url: string, request: PluginMaterialRequest = {}) =>
      run("materials:fetch", request, options => port.readSource(url, options)) } : {}),
    ...(declared("materials:fetch_local") && port.readLocalPage ? { readLocalPage: (url: string, request: PluginLocalPageRequest = {}) =>
      run("materials:fetch_local", { signal: request.signal }, options => port.readLocalPage!(url, options)) } : {}),
    ...(original?.claimOriginal ? { claimOriginal: async (record_key: string) => {
      const key = originalKey(record_key);
      await run("materials:original", {}, async (options, caller) => {
        // Only the person's own operation, through the Host's entry of this installation, can have offered a file: a call a plugin made
        // itself (a dependency call, a timer, another installation's route) carries none, and no argument can supply one.
        const offered = caller.original_file;
        if (caller.audience !== "user" || !offered || offered.install_id !== gate.install_id) {
          throw errors.materials_original_not_offered("这次操作没有经宿主入口交给本插件的原始文件");
        }
        await original.claimOriginal!(key, offered.path, options);
      });
    } } : {}),
    ...(original?.readOriginal ? { readOriginal: async (record_key: string, request: PluginOriginalRequest = {}): Promise<PluginOriginalContent> => {
      const key = originalKey(record_key);
      return { bytes: await run("materials:original", { signal: request.signal }, options => original.readOriginal!(key, { ...options, maxBytes: request.maxBytes })) };
    } } : {}),
    ...(original?.readOriginalRange ? { readOriginalRange: async (record_key: string, request: PluginOriginalRangeRequest): Promise<PluginOriginalRangeContent> => {
      const key = originalKey(record_key), { offset, length, revision } = request;
      return run("materials:original", { signal: request.signal }, options => original.readOriginalRange!(key, { ...options, offset, length, revision }));
    } } : {}),
    ...(original?.releaseOriginal ? { releaseOriginal: async (record_key: string) => {
      const key = originalKey(record_key);
      await run("materials:original", {}, options => original.releaseOriginal!(key, options));
    } } : {}),
  });
}
