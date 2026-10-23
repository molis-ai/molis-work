import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDirectoryGrant, PluginDirectoryService } from "@molis-ai/molis-work-contracts/platform/plugin-directory";
import { assertCapturedPluginActionCurrent, currentPluginInvocation } from "@molis-ai/molis-work-plugin-runtime";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { pickLocalDirectory } from "./directory-picker.js";
import { readGrantedDirectory } from "./plugin-directory-read.js";

export const DIRECTORY_READ_PERMISSION = "directory:read";
const GRANT_MS = 30 * 60_000;
const MAX_GRANTS = 32;
type Selection = { plugin_id: string; project_id: string | null; actor_id: string };
type Binding = Selection & { install_id: string; name: string; assertCurrent(): void };
type Grant = PluginDirectoryGrant & { binding: Binding; project_id: string | null; actor_id: string };
export type DirectorySelection = typeof pickLocalDirectory;

export interface DirectoryGrantService {
  /** Host executor only: each activation gets a separate identity and revocable client. */
  connect(owner: Binding): { client: PluginDirectoryService; dispose(): void };
  /** A trusted system picker supplies the path; a page can only name the plugin requesting it. */
  select(owner: Selection, picker?: DirectorySelection, signal?: AbortSignal): Promise<PluginDirectoryGrant | null>;
}

const byHome = new Map<string, DirectoryGrantService>();
const denied = () => new ActionError("actions.forbidden", "目录授权已失效，或不属于这次插件调用");

/** One grant owner per Home; neither pages nor plugin implementations can supply trusted invocation identities. */
export function directoryForHome(homeDirectory: string): DirectoryGrantService {
  const key = resolve(homeDirectory), existing = byHome.get(key);
  if (existing) return existing;
  const grants = new Map<string, Grant>(), bindings = new Set<Binding>(), deleted = new Map<string, number>();
  const sweep = () => { for (const [id, grant] of grants) if (Date.parse(grant.expires_at) <= Date.now()) grants.delete(id); };
  projectDeletedHooksFor(key).register({ id: "directory-grants", label: null, survivesRebuild: true, clear: projectId => {
    deleted.set(projectId, (deleted.get(projectId) ?? 0) + 1);
    for (const [id, grant] of grants) if (grant.project_id === projectId) grants.delete(id);
  } });
  const service: DirectoryGrantService = {
    connect(identity) {
      const binding = { ...identity }; bindings.add(binding);
      const assertCurrent = () => { if (!bindings.has(binding)) throw denied(); binding.assertCurrent(); };
      return { dispose: () => {
        bindings.delete(binding);
        for (const [id, grant] of grants) if (grant.binding === binding) grants.delete(id);
      }, client: { read: async (request, signal) => {
        const invocation = currentPluginInvocation();
        if (!invocation || invocation.install_id !== binding.install_id) return { outcome: "denied" };
        sweep();
        const grant = grants.get(request.grant_id);
        if (!grant || grant.binding !== binding || grant.actor_id !== invocation.caller.actor_id || grant.project_id !== invocation.caller.project_id) return { outcome: "denied" };
        const check = () => {
          signal?.throwIfAborted(); assertCurrent();
          assertCapturedPluginActionCurrent(invocation, binding.install_id);
          if (grants.get(grant.grant_id) !== grant || Date.parse(grant.expires_at) <= Date.now()) throw denied();
        };
        check(); const result = await readGrantedDirectory(grant.root, request, check); check(); return result;
      } } };
    },
    async select(owner, picker = pickLocalDirectory, signal) {
      const candidates = [...bindings].filter(binding => binding.plugin_id === owner.plugin_id && binding.actor_id === owner.actor_id
        && (binding.project_id === owner.project_id || binding.project_id === null));
      const binding = candidates.find(binding => binding.project_id === owner.project_id) ?? candidates[0];
      if (!binding) throw denied();
      const revision = owner.project_id ? deleted.get(owner.project_id) : undefined;
      const check = () => {
        signal?.throwIfAborted();
        if (!bindings.has(binding) || (owner.project_id && deleted.get(owner.project_id) !== revision)) throw denied();
        binding.assertCurrent();
      };
      check();
      const picked = await picker(`允许「${binding.name}」读取所选目录（30 分钟，只读）`, signal); check();
      if (picked.status === "cancelled") return null;
      if (picked.status !== "picked") throw new ActionError("actions.unavailable", picked.status === "busy" ? "请先完成已打开的目录选择" : picked.message);
      if (!isAbsolute(picked.path)) throw new ActionError("actions.input_invalid", "请选择一个绝对目录路径");
      const info = await lstat(picked.path); check();
      if (!info.isDirectory() || info.isSymbolicLink()) throw new ActionError("actions.input_invalid", "请选择一个实际目录，不能是文件或符号链接");
      const root = await realpath(picked.path); check(); sweep();
      if (grants.size >= MAX_GRANTS) throw new ActionError("actions.unavailable", "一次最多授权 32 个目录，请稍后重试");
      const grant: Grant = { grant_id: randomUUID(), root, expires_at: new Date(Date.now() + GRANT_MS).toISOString(), binding,
        project_id: owner.project_id, actor_id: owner.actor_id };
      grants.set(grant.grant_id, grant);
      return { grant_id: grant.grant_id, root, expires_at: grant.expires_at };
    },
  };
  byHome.set(key, service); return service;
}
