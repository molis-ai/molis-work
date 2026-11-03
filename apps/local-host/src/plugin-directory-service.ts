import { lstat, realpath } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDirectoryGrant, PluginDirectoryReadResult, PluginDirectoryService } from "@molis-ai/molis-work-contracts/platform/plugin-directory";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, inPluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { pickLocalDirectory } from "./directory-picker.js";
import { readGrantedDirectory } from "./plugin-directory-read.js";
import { tellDirectoryRead } from "./plugin-directory-notices.js";
import { directoryGrant, forgetInstallationDirectoryGrants, forgetProjectDirectoryGrants, listDirectoryGrants, matchingDirectoryGrant, recordDirectoryRead,
  revokeDirectoryGrant, revokePluginDirectoryGrants, saveDirectoryGrant, type DirectoryReadOrigin, type StoredDirectoryGrant } from "./plugin-directory-store.js";

export const DIRECTORY_READ_PERMISSION = "directory:read";
type Selection = { plugin_id: string; project_id: string | null; actor_id: string };
type Binding = Selection & { install_id: string; installation_generation: string; name: string; assertCurrent(): void };
export type DirectorySelection = typeof pickLocalDirectory;
export type DirectoryGrantListing = (ReturnType<typeof listDirectoryGrants>[number] & { directory_status: "current" | "changed" })[];

export interface DirectoryGrantService {
  /** Host executor only: each activation gets a separate identity and revocable client. */
  connect(owner: Binding): { client: PluginDirectoryService; dispose(): void };
  /** A trusted system picker supplies the path; a page can only name the plugin requesting it. */
  select(owner: Selection, picker?: DirectorySelection, signal?: AbortSignal): Promise<PluginDirectoryGrant | null>;
  /** Settings › 本机目录: every grant with its recent reads. */
  list(): Promise<DirectoryGrantListing>;
  /** The person takes back one grant, or all of one plugin's; a read under way fails at its next check and delivers nothing. */
  revoke(target: { grant_id: string } | { plugin_id: string }): number;
  /** An uninstall takes its grants: a project's installation those of that project, a Home-level one all of its own. */
  forgetInstallation(install_id: string, project_id: string | null): void;
}

const byHome = new Map<string, DirectoryGrantService>();
/** A kept background job is one call for as long as it runs: its reads are told again in each such window, so the person sees it still reads. */
const JOB_NOTICE_WINDOW_MS = 60 * 60_000;
const denied = () => new ActionError("actions.forbidden", "目录授权已撤回、已失效，或不属于这次插件调用");

/**
 * Who started the call, from the trusted invocation (never the plugin's input): a background job, else the call's audience. Only the
 * sources the person allowed read (user 2026-10-25): the person, an Agent, a scheduled or background job, a workflow, an MCP client.
 * A plugin-audience call is this installation's own (its scheduled wake-up, a job's call, its own action) when the Host stamped it with
 * this installation; another plugin calling this one's action directly is none of the allowed sources (null, refused). A workflow step
 * reads as its workflow or its job.
 */
function originOf(invocation: NonNullable<ReturnType<typeof currentPluginInvocation>>, binding: Binding): DirectoryReadOrigin | null {
  if ("job" in invocation) return "background";
  if (invocation.caller.audience === "plugin") return invocation.caller.plugin_install_id === binding.install_id ? "background" : null;
  return ({ user: "person", agent: "agent", workflow: "workflow", mcp: "mcp" } as const)[invocation.caller.audience];
}

/**
 * The grant serves its installation (upgrades included) in its project. Background callers acting for the person (an Agent, a
 * workflow, an MCP client, a scheduled job) may read with it (user 2026-10-25, B); another person may not.
 */
function holds(grant: StoredDirectoryGrant, binding: Binding, caller: ActionCallContext): boolean {
  return grant.plugin_id === binding.plugin_id && grant.install_id === binding.install_id && grant.project_id === caller.project_id
    && (binding.project_id === null || binding.project_id === grant.project_id) && (caller.actor_id === grant.actor_id || caller.audience !== "user");
}

/** The folder is still the one chosen: same real path, same device and inode, not a link. */
async function sameDirectory(grant: StoredDirectoryGrant): Promise<boolean> {
  try {
    const info = await lstat(grant.root);
    return info.isDirectory() && !info.isSymbolicLink() && String(info.dev) === grant.device && String(info.ino) === grant.inode && await realpath(grant.root) === grant.root;
  } catch { return false; }
}

/** One grant owner per Home; neither pages nor plugin implementations can supply trusted invocation identities. */
export function directoryForHome(homeDirectory: string): DirectoryGrantService {
  const key = resolve(homeDirectory), existing = byHome.get(key);
  if (existing) return existing;
  const bindings = new Set<Binding>(), deleted = new Map<string, number>(), told = new WeakMap<object, Set<string>>();
  // Every way a grant goes away in this process moves this on; a read under way asks the store again only when it moved.
  let revision = 0;
  const removed = (count: number) => { if (count) revision++; return count; };
  projectDeletedHooksFor(key).register({ id: "directory-grants", label: null, survivesRebuild: true, clear: projectId => {
    deleted.set(projectId, (deleted.get(projectId) ?? 0) + 1);
    forgetProjectDirectoryGrants(key, projectId); revision++;
  } });
  const service: DirectoryGrantService = {
    connect(identity) {
      const binding = { ...identity }; bindings.add(binding);
      const assertCurrent = () => { if (!bindings.has(binding)) throw denied(); binding.assertCurrent(); };
      // Stopping an activation (a restart, an upgrade, a disable) ends what it can read; the person's grants stay for the next one.
      return { dispose: () => { bindings.delete(binding); }, client: { read: async (request, signal) => {
        const invocation = currentPluginInvocation();
        if (!invocation || !inPluginInstance(invocation, binding) || typeof request?.grant_id !== "string") return { outcome: "denied" };
        const origin = originOf(invocation, binding), grant = origin ? directoryGrant(key, request.grant_id) : null;
        if (!origin || !grant || !holds(grant, binding, invocation.caller)) return { outcome: "denied" };
        let seen = revision;
        const check = () => {
          signal?.throwIfAborted(); assertCurrent();
          assertCapturedPluginActionCurrent(invocation, binding);
          if (seen !== revision) { if (!directoryGrant(key, grant.grant_id)) throw denied(); seen = revision; }
        };
        check();
        if (!(await sameDirectory(grant))) { check(); removed(revokeDirectoryGrant(key, grant.grant_id)); return { outcome: "changed" }; }
        check();
        const result: PluginDirectoryReadResult = await readGrantedDirectory(grant.root, request, check); check();
        // What is delivered is recorded and told first: a read that cannot be recorded is not delivered.
        const now = Date.now();
        recordDirectoryRead(key, grant.grant_id, { at: new Date(now).toISOString(), origin, caller: invocation.caller.actor_id, outcome: result.outcome });
        // One notice for each call that read; a kept job, one for each window it reads in.
        const shown = told.get(invocation) ?? new Set<string>(), notice = "job" in invocation ? `${grant.grant_id}:${Math.floor(now / JOB_NOTICE_WINDOW_MS)}` : grant.grant_id;
        if (!shown.has(notice)) {
          tellDirectoryRead(key, grant.actor_id, { plugin_name: grant.plugin_name, folder: basename(grant.root) || grant.root, origin, outcome: result.outcome });
          shown.add(notice); told.set(invocation, shown);
        }
        check(); return result;
      } } };
    },
    async select(owner, picker = pickLocalDirectory, signal) {
      const candidates = [...bindings].filter(binding => binding.plugin_id === owner.plugin_id && binding.actor_id === owner.actor_id
        && (binding.project_id === owner.project_id || binding.project_id === null));
      const binding = candidates.find(binding => binding.project_id === owner.project_id) ?? candidates[0];
      if (!binding) throw denied();
      const deletions = owner.project_id ? deleted.get(owner.project_id) : undefined;
      const check = () => {
        signal?.throwIfAborted();
        if (!bindings.has(binding) || (owner.project_id && deleted.get(owner.project_id) !== deletions)) throw denied();
        binding.assertCurrent();
      };
      check();
      const picked = await picker(`允许「${binding.name}」读取所选目录（只读；一直有效，可在设置「本机目录」里撤回）`, signal); check();
      if (picked.status === "cancelled") return null;
      if (picked.status !== "picked") throw new ActionError("actions.unavailable", picked.status === "busy" ? "请先完成已打开的目录选择" : picked.message);
      if (!isAbsolute(picked.path)) throw new ActionError("actions.input_invalid", "请选择一个绝对目录路径");
      const info = await lstat(picked.path); check();
      if (!info.isDirectory() || info.isSymbolicLink()) throw new ActionError("actions.input_invalid", "请选择一个实际目录，不能是文件或符号链接");
      const root = await realpath(picked.path); check();
      const actual = await lstat(root); check();
      const identity = { plugin_id: binding.plugin_id, install_id: binding.install_id, project_id: owner.project_id, actor_id: owner.actor_id,
        device: String(actual.dev), inode: String(actual.ino) };
      const earlier = matchingDirectoryGrant(key, identity);
      if (earlier && earlier.root === root) return { grant_id: earlier.grant_id, root, granted_at: earlier.granted_at };
      if (earlier) removed(revokeDirectoryGrant(key, earlier.grant_id));
      const grant = { ...identity, grant_id: randomUUID(), plugin_name: binding.name, root, granted_at: new Date().toISOString() };
      saveDirectoryGrant(key, grant);
      return { grant_id: grant.grant_id, root, granted_at: grant.granted_at };
    },
    // Settings observes the same identity check as a read, without reading contents or changing the grant/history.
    list: async () => Promise.all(listDirectoryGrants(key).map(async (grant): Promise<DirectoryGrantListing[number]> => ({
      ...grant, directory_status: await sameDirectory(grant) ? "current" : "changed",
    }))),
    revoke: target => removed("grant_id" in target ? revokeDirectoryGrant(key, target.grant_id) : revokePluginDirectoryGrants(key, target.plugin_id)),
    forgetInstallation(installId, projectId) { removed(forgetInstallationDirectoryGrants(key, installId, projectId)); },
  };
  byHome.set(key, service); return service;
}
