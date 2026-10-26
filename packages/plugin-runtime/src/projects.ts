import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  PLUGIN_PROJECTS_EXIST_LIMITS,
  PLUGIN_PROJECTS_EXIST_PERMISSION,
  type PluginManifest,
  type PluginProjectsClient,
} from "@molis-ai/molis-work-contracts/platform/plugin";

const errors = defineErrorCodes("plugin", { projects_permission_undeclared: "forbidden", projects_input_invalid: "invalid" });

/** What the Host answers with: which of these ids are projects of the Home right now. It is asked nothing else. */
export interface PluginProjectsPort {
  existing(ids: readonly string[], options: { readonly signal?: AbortSignal }): Promise<ReadonlySet<string>>;
}
export interface PluginProjectsGate {
  assertActive(): void;
  requireGrant(permission: string): void;
}

/**
 * `services.projects` (BL-680, S-92): whether project ids the plugin already holds still exist. Every call checks that the instance is
 * still the one running, that the Manifest declared `projects:exist` and that the person's grant stands, before it asks and again before
 * it answers. The answer is built here from the ids that were passed in, one boolean each: what the Host's port returns beyond
 * membership of those ids never reaches the plugin.
 */
export function createPluginProjectsClient(manifest: PluginManifest, port: PluginProjectsPort, gate: PluginProjectsGate): PluginProjectsClient {
  const declared = manifest.permissions.some(entry => entry.permission === PLUGIN_PROJECTS_EXIST_PERMISSION);
  const permit = () => {
    gate.assertActive();
    if (!declared) throw errors.projects_permission_undeclared("清单未声明查询项目是否还在需要的权限");
    gate.requireGrant(PLUGIN_PROJECTS_EXIST_PERMISSION);
  };
  return Object.freeze({
    async exist(ids: readonly string[], options: { readonly signal?: AbortSignal } = {}) {
      permit();
      const asked = projectIdsAsked(ids);
      options.signal?.throwIfAborted();
      const found = await port.existing(asked, options.signal ? { signal: options.signal } : {});
      permit();
      options.signal?.throwIfAborted();
      return Object.freeze(Object.fromEntries(asked.map(id => [id, found.has(id)])));
    },
  });
}

function projectIdsAsked(ids: readonly string[]): readonly string[] {
  const { ids: most, id_length } = PLUGIN_PROJECTS_EXIST_LIMITS;
  if (!Array.isArray(ids) || ids.length > most) throw errors.projects_input_invalid(`一次最多查 ${most} 个项目 id`);
  const unique = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0 || id.length > id_length || id.includes("\0")) throw errors.projects_input_invalid("项目 id 必须是不含空字符的非空字符串");
    unique.add(id);
  }
  return [...unique];
}
