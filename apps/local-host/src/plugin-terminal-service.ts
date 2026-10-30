import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest, PluginOwnerFilesClient, PluginStartContext, PluginTerminalClient, PluginTerminalDirectory } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, inPluginInstance, pluginInvocationReadOnly } from "@molis-ai/molis-work-plugin-runtime";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import { pluginCatalogFor } from "./home-side.js";
import { TERMINAL_RUN_PERMISSION } from "./plugin-service-permissions.js";

const hosts = new Map<string, MolisWorkPtyHost>();
const WORKSPACE_READ_PERMISSION = "workspace:read";
const INPUT_KEYS = new Set(["key", "title", "command", "args", "directory"]);
const TEXT_LIMIT = 4096, ARGS_LIMIT = 32;

/** The same PTY host that serves page attachments; a second process is never created here. */
export function bindPluginTerminalHost(home: string, host: MolisWorkPtyHost): () => void {
  const key = resolve(home);
  if (hosts.has(key)) throw new ActionError("actions.unavailable", "此 Home 已连接终端宿主");
  hosts.set(key, host);
  return () => { if (hosts.get(key) === host) hosts.delete(key); };
}

interface TerminalRequest { readonly key: string; readonly title: string; readonly command: string; readonly args: readonly string[]; readonly directory: PluginTerminalDirectory }

/**
 * `services.terminal` (S-103) for a plugin the Host runs itself, Home instance or project instance, when its Manifest declares terminal:run.
 * The backend chooses the program; the running action is the only authority: the installation, project and person are the call's, and the
 * folder is inside the project's linked workspace or the plugin's owner files. A project instance has no owner files of its own.
 */
export function pluginTerminalFor(options: { home: string; manifest: PluginManifest; context: PluginStartContext; ownerFiles: PluginOwnerFilesClient | undefined; assertActive: () => void }) {
  const { home, manifest, context, ownerFiles, assertActive } = options;
  if (!manifest.permissions.some(item => item.permission === TERMINAL_RUN_PERMISSION)) return undefined;
  const panels = new Map<string, MolisWorkPtyHost>();
  const client = Object.freeze<PluginTerminalClient>({ async open(input) {
    const scope = currentPluginInvocation();
    if (!scope || !inPluginInstance(scope, context) || !("definition" in scope) || scope.definition.operation !== "command"
      || pluginInvocationReadOnly(scope) || scope.caller.audience !== "user" || !scope.definition.action.permissions.includes(TERMINAL_RUN_PERMISSION))
      throw new ActionError("actions.forbidden", "交互终端只能由当前页面的授权动作启动");
    const request = terminalRequest(input);
    const check = () => { assertActive(); context.requireGrant(TERMINAL_RUN_PERMISSION); assertCapturedPluginActionCurrent(scope, context); };
    check(); await scope.caller.beforeEffect(); check();
    const cwd = await terminalDirectory(home, request.directory, scope.caller.project_id, ownerFiles, request.directory.root === "workspace"
      ? () => { check(); context.requireGrant(WORKSPACE_READ_PERMISSION); } : check);
    const host = hosts.get(resolve(home));
    if (!host) throw new ActionError("actions.unavailable", "终端宿主尚未连接");
    const identity = [context.install_id, scope.caller.project_id, scope.caller.actor_id, request.key];
    const panelId = "plugin-" + createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 32);
    check();
    host.spawn({ panelId, command: request.command, args: [...request.args], cwd });
    panels.set(panelId, host);
    return { panelId };
  } });
  return { client, dispose() { for (const [id, host] of panels) host.kill(id); panels.clear(); } };
}

/** The input is these five keys and nothing else, bounded; what follows reads only this copy. */
function terminalRequest(input: unknown): TerminalRequest {
  const invalid = () => new ActionError("actions.input_invalid", "终端启动参数无效");
  const text = (value: unknown, limit = TEXT_LIMIT): value is string => typeof value === "string" && value.length <= limit && !value.includes("\0");
  if (!plain(input) || Object.keys(input).some(key => !INPUT_KEYS.has(key))) throw invalid();
  const { key, title, command, args = [], directory } = input as Record<string, unknown>;
  if (typeof key !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(key) || !text(title, 120) || !title.trim()
    || !text(command) || !isAbsolute(command)) throw invalid();
  if (!Array.isArray(args) || args.length > ARGS_LIMIT || !args.every(arg => text(arg))) throw invalid();
  if (!plain(directory)) throw invalid();
  const { root, workspace_id, path } = directory as Record<string, unknown>;
  const keys = root === "workspace" ? ["root", "workspace_id", "path"] : root === "owner_files" ? ["root", "path"] : [];
  if (!keys.length || Object.keys(directory).some(name => !keys.includes(name))) throw invalid();
  if (root === "workspace" && (typeof workspace_id !== "string" || !workspace_id || workspace_id.length > 200)) throw invalid();
  if (path !== undefined && (!text(path) || !path || path.startsWith("/") || path.includes("\\")
    || path.split("/").some(segment => segment === "" || segment === "." || segment === ".."))) throw invalid();
  const folder: PluginTerminalDirectory = root === "workspace"
    ? { root, workspace_id: workspace_id as string, ...(path === undefined ? {} : { path }) } : { root: "owner_files", ...(path === undefined ? {} : { path }) };
  return Object.freeze({ key, title, command, args: Object.freeze([...args] as string[]), directory: Object.freeze(folder) });
}

const plain = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/**
 * The folder, resolved: its root is the project's linked workspace named by the call (from the catalog, read now) or the plugin's owner
 * files; the real path must stay inside the root's real path and be a directory. Authority is checked again after every wait. A link
 * swapped into the path between this check and the spawn is not caught (S-103 does not cover it); the spawn uses the resolved `target`.
 */
async function terminalDirectory(home: string, directory: PluginTerminalDirectory, projectId: string | null | undefined, ownerFiles: PluginOwnerFilesClient | undefined,
  check: () => void): Promise<string> {
  let rootPath: string;
  if (directory.root === "owner_files") {
    if (!ownerFiles) throw new ActionError("actions.forbidden", "这个插件没有声明主人文件目录");
    rootPath = ownerFiles.rootPath();
  } else {
    if (!projectId) throw new ActionError("actions.forbidden", "工作目录只在项目里的调用中可用");
    check();
    const catalog = pluginCatalogFor(home);
    if (!catalog) throw new ActionError("actions.unavailable", "项目目录暂时读不到");
    const linked = await catalog({ homeDirectory: home }, projects => projects.listWorkspaceDirectory(projectId)
      .find(record => record.workspace_id === directory.workspace_id)?.canonical_path);
    check();
    if (!linked) throw new ActionError("actions.forbidden", "不是本项目已关联的工作目录");
    rootPath = linked;
  }
  const missing = (error: unknown) => {
    if (error instanceof ActionError) throw error;
    throw new ActionError("actions.input_invalid", "终端工作目录不存在");
  };
  const root = await realpath(rootPath).catch(missing); check();
  const target = await realpath(join(root, directory.path ?? ".")).catch(missing); check();
  const inside = relative(root, target);
  if (inside === ".." || inside.startsWith("../") || isAbsolute(inside)) throw new ActionError("actions.forbidden", "工作目录不在允许的根里");
  const folder = await stat(target).catch(missing); check();
  if (!folder.isDirectory()) throw new ActionError("actions.input_invalid", "终端工作目录不是目录");
  return target;
}
