import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  PLUGIN_LOCAL_TOOLS_PERMISSION,
  type PluginLocalToolsClient,
  type PluginLocalToolsDeclaration,
  type PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";

const errors = defineErrorCodes("plugin", {
  local_tools_permission_undeclared: "forbidden", local_tools_custom_undeclared: "forbidden", local_tools_input_invalid: "invalid",
});

/** What the Host answers with: the declared tools' runnable files on this machine, and whether one path is a runnable file. It starts nothing. */
export interface PluginLocalToolsPort {
  find(declaration: PluginLocalToolsDeclaration, options: { readonly signal?: AbortSignal }): Promise<readonly { readonly tool_id: string; readonly executable: string | null }[]>;
  isExecutable(path: string, options: { readonly signal?: AbortSignal }): Promise<boolean>;
  refresh(): void;
}
export interface PluginLocalToolsGate {
  assertActive(): void;
  requireGrant(permission: string): void;
}

const PATH_LIMIT = 4096;

/**
 * Every call checks that the instance is still the one running, that the Manifest declared `local-tools:read` and that the person's grant
 * stands, before it asks and again before it answers: a revoked, stopped or cancelled instance gets nothing back. `isExecutable` is only
 * for a Manifest that declared `custom_executables`, and only for an absolute path.
 */
export function createPluginLocalToolsClient(manifest: PluginManifest, port: PluginLocalToolsPort, gate: PluginLocalToolsGate,
  declaration: PluginLocalToolsDeclaration): PluginLocalToolsClient {
  const declared = manifest.permissions.some(entry => entry.permission === PLUGIN_LOCAL_TOOLS_PERMISSION);
  const permit = () => {
    gate.assertActive();
    if (!declared) throw errors.local_tools_permission_undeclared("清单未声明本机工具服务需要的权限");
    gate.requireGrant(PLUGIN_LOCAL_TOOLS_PERMISSION);
  };
  const frozen = Object.freeze({ ...declaration });
  return Object.freeze({
    async find(options: { readonly signal?: AbortSignal } = {}) {
      permit();
      options.signal?.throwIfAborted();
      const found = await port.find(frozen, options.signal ? { signal: options.signal } : {});
      permit();
      options.signal?.throwIfAborted();
      return found.map(entry => Object.freeze({ tool_id: entry.tool_id, executable: entry.executable }));
    },
    async isExecutable(path: string, options: { readonly signal?: AbortSignal } = {}) {
      permit();
      if (declaration.custom_executables !== true) throw errors.local_tools_custom_undeclared("清单没有声明可以查自己选的路径（custom_executables）");
      if (typeof path !== "string" || path.length === 0 || path.length > PATH_LIMIT || path.includes("\0") || !path.startsWith("/")) {
        throw errors.local_tools_input_invalid("只能查一个绝对路径");
      }
      options.signal?.throwIfAborted();
      const runnable = await port.isExecutable(path, options.signal ? { signal: options.signal } : {});
      permit();
      options.signal?.throwIfAborted();
      return runnable === true;
    },
    refresh() { permit(); port.refresh(); },
  });
}
