import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  PluginManifest, PluginOwnerFilesClient, PluginStartContext, PluginTerminalClient, PluginTerminalDirectory, PluginTerminalPanel,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, inPluginInstance, pluginInvocationReadOnly } from "@molis-ai/molis-work-plugin-runtime";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import { pluginCatalogFor } from "./home-side.js";
import { TERMINAL_RUN_PERMISSION } from "./plugin-service-permissions.js";
import type { PluginTerminalPanelRecord, TerminalOwner } from "./plugin-terminal-panels.js";
import { isTerminalCommand, isTerminalRuntime, terminalCommandPath, terminalRuntimeRecipe, terminalSearchPath, type TerminalRuntime } from "./plugin-terminal-runtimes.js";

interface TerminalHostBinding { readonly host: MolisWorkPtyHost; readonly webUrl: () => string }
const hosts = new Map<string, TerminalHostBinding>();
const WORKSPACE_READ_PERMISSION = "workspace:read";
const INPUT_KEYS = new Set(["key", "title", "program", "subject", "directory"]);
const TEXT_LIMIT = 4096, ARGS_LIMIT = 32, SUBJECT_LIMIT = 200;
/** The runtime id a terminal running a program the plugin chose is recorded and bound under. */
const COMMAND_RUNTIME = "command";

/** The same PTY host that serves page attachments; a second process is never created here. `webUrl` is the server's own origin. */
export function bindPluginTerminalHost(home: string, host: MolisWorkPtyHost, options: { webUrl: () => string }): () => void {
  const key = resolve(home);
  if (hosts.has(key)) throw new ActionError("actions.unavailable", "此 Home 已连接终端宿主");
  const binding = { host, webUrl: options.webUrl };
  hosts.set(key, binding);
  return () => { if (hosts.get(key) === binding) hosts.delete(key); };
}

type TerminalProgram = { readonly runtime: TerminalRuntime } | { readonly command: string; readonly args: readonly string[] };
interface TerminalRequest {
  readonly key: string; readonly title: string | undefined; readonly program: TerminalProgram; readonly subject: string | null;
  readonly directory: PluginTerminalDirectory;
}

/**
 * `services.terminal` (S-103) for a plugin the Host runs itself, Home instance or project instance, when its Manifest declares terminal:run.
 * The backend chooses the program (a platform runtime recipe, or a command); the running action is the only authority: the installation,
 * project and person are the call's, and the folder is inside the project's linked workspace or the plugin's owner files. A project
 * instance has no owner files of its own. Each terminal is recorded in the catalog under those four and its key, so the same key reopens
 * it (attached while it runs, started again with the same program when it does not) and nobody else lists or closes it.
 */
export function pluginTerminalFor(options: { home: string; manifest: PluginManifest; context: PluginStartContext; ownerFiles: PluginOwnerFilesClient | undefined; assertActive: () => void }) {
  const { home, manifest, context, ownerFiles, assertActive } = options;
  if (!manifest.permissions.some(item => item.permission === TERMINAL_RUN_PERMISSION)) return undefined;
  const panels = new Map<string, MolisWorkPtyHost>();
  /** The running call, if it may use terminals: this instance's own user action that declares terminal:run; a change only from a command. */
  const invocation = (change: boolean) => {
    const scope = currentPluginInvocation();
    if (!scope || !inPluginInstance(scope, context) || !("definition" in scope) || scope.caller.audience !== "user"
      || !scope.definition.action.permissions.includes(TERMINAL_RUN_PERMISSION)
      || (change && (scope.definition.operation !== "command" || pluginInvocationReadOnly(scope))))
      throw new ActionError("actions.forbidden", "交互终端只能由当前页面的授权动作启动");
    const check = () => { assertActive(); context.requireGrant(TERMINAL_RUN_PERMISSION); assertCapturedPluginActionCurrent(scope, context); };
    const owner: TerminalOwner = { install_id: context.install_id, project_id: scope.caller.project_id ?? null, actor_id: scope.caller.actor_id };
    return { scope, check, owner };
  };
  const client = Object.freeze<PluginTerminalClient>({
    async open(input) {
      const { scope, check, owner } = invocation(true);
      const request = terminalRequest(input);
      check(); await scope.caller.beforeEffect(); check();
      const cwd = await terminalDirectory(home, request.directory, owner.project_id, ownerFiles, request.directory.root === "workspace"
        ? () => { check(); context.requireGrant(WORKSPACE_READ_PERMISSION); } : check);
      const { host, webUrl } = terminalHost(home);
      const catalog = catalogFor(home);
      const panelId = terminalPanelId(owner, request.key);
      const searchPath = terminalSearchPath();
      check();
      const started = await catalog({ homeDirectory: home }, projects => projects.commit(() => {
        // Everything below is one transaction: a call stopped here (revoked, cancelled, stopped) leaves no record and starts nothing.
        check();
        const existing = projects.terminalPanels.get(panelId);
        // A key stays with what it was opened for, running or not: another subject neither starts nor attaches it.
        if (existing && existing.subject !== request.subject) throw new ActionError("actions.conflict", "这个终端属于另一个对象，请换一个 key");
        // A running terminal is attached as it is; one started again keeps the program it was recorded with.
        if (existing && host.alive(panelId)) return false;
        if (existing && !sameProgram(existing, request.program)) throw new ActionError("actions.conflict", "这个终端记录的是另一个程序，请先关掉它");
        const launch = terminalLaunch(request.program, existing, searchPath);
        const record = existing ?? projects.terminalPanels.insert({
          ...owner, panel_id: panelId, key: request.key, subject: request.subject, runtime: launch.runtime, launch_command: launch.stored,
          launch_args: [...launch.storedArgs], title: request.title ?? launch.title,
        }, cwd);
        check();
        host.spawn({ panelId, command: launch.path, args: [...launch.args], cwd, env: terminalEnvironment({ home, record, webUrl: webUrl() }) });
        return true;
      }));
      panels.set(panelId, host);
      return { panelId, started };
    },
    async list(input) {
      const { check, owner } = invocation(false);
      const subject = terminalListSubject(input);
      check();
      const { host } = terminalHost(home);
      const rows = await catalogFor(home)({ homeDirectory: home }, projects => projects.terminalPanels.list(owner, subject));
      check();
      return Object.freeze(rows.map(row => Object.freeze<PluginTerminalPanel>({
        key: row.key, panelId: row.panel_id, title: row.title, runtime: row.runtime, subject: row.subject, running: host.alive(row.panel_id),
        created_at: row.created_at,
      })));
    },
    async close(input) {
      const { scope, check, owner } = invocation(true);
      if (!plain(input) || Object.keys(input).some(name => name !== "key") || !terminalKey(input.key)) throw invalid();
      const panelId = terminalPanelId(owner, input.key);
      check(); await scope.caller.beforeEffect(); check();
      const { host } = terminalHost(home);
      await catalogFor(home)({ homeDirectory: home }, projects => projects.commit(() => {
        check();
        const record = projects.terminalPanels.get(panelId);
        if (!record) throw new ActionError("actions.missing", "找不到这个终端");
        host.kill(panelId);
        projects.terminalPanels.remove(record);
      }));
      panels.delete(panelId);
    },
  });
  return { client, dispose() { for (const [id, host] of panels) host.kill(id); panels.clear(); } };
}

/** The panel id: derived from whose terminal it is and its key, so one plugin's key never names another's terminal. */
function terminalPanelId(owner: TerminalOwner, key: string): string {
  const identity = [owner.install_id, owner.project_id, owner.actor_id, key];
  return "plugin-" + createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 32);
}

function terminalHost(home: string): TerminalHostBinding {
  const binding = hosts.get(resolve(home));
  if (!binding) throw new ActionError("actions.unavailable", "终端宿主尚未连接");
  return binding;
}

function catalogFor(home: string) {
  const catalog = pluginCatalogFor(home);
  if (!catalog) throw new ActionError("actions.unavailable", "项目目录暂时读不到");
  return catalog;
}

/** The program recorded for a terminal is the one it keeps: a different one under the same key is a conflict, not a replacement. */
function sameProgram(record: PluginTerminalPanelRecord, program: TerminalProgram): boolean {
  if ("runtime" in program) return record.runtime === program.runtime;
  return record.runtime === COMMAND_RUNTIME && record.launch_command === program.command
    && record.launch_args.length === program.args.length && record.launch_args.every((arg, index) => arg === program.args[index]);
}

/**
 * What starts: a recipe's command on the platform's PATH (with the recipe's resume arguments once the runtime reported its session), or
 * the plugin's command and arguments. What is recorded is the program as named, resolved again on every start.
 */
function terminalLaunch(program: TerminalProgram, existing: PluginTerminalPanelRecord | null, searchPath: string) {
  if ("runtime" in program) {
    const recipe = terminalRuntimeRecipe(program.runtime);
    const session = existing?.host_session_id;
    return { runtime: program.runtime as string, stored: recipe.command, storedArgs: [] as readonly string[], title: recipe.title,
      path: terminalCommandPath(recipe.command, searchPath), args: session ? recipe.resumeArgs(session) : [] };
  }
  return { runtime: COMMAND_RUNTIME, stored: program.command, storedArgs: program.args, title: basename(program.command),
    path: terminalCommandPath(program.command, searchPath), args: program.args };
}

/** The platform's variables for a terminal: the runtime in it reaches this Home's MCP as this terminal's work context. */
function terminalEnvironment(input: { home: string; record: PluginTerminalPanelRecord; webUrl: string }): Record<string, string> {
  const { record } = input;
  return {
    MOLIS_WORK_HOME: resolve(input.home),
    MOLIS_WORK_MCP_AUDIENCE: "runtime",
    MOLIS_WORK_RUNTIME_ID: record.runtime,
    MOLIS_WORK_WORK_CONTEXT_ID: record.panel_id,
    MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
    MOLIS_WORK_PANEL_ID: record.panel_id,
    ...(record.subject === null ? {} : { MOLIS_WORK_FOCUS_ID: record.subject }),
    MOLIS_WORK_WEB_URL: input.webUrl,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  };
}

const invalid = () => new ActionError("actions.input_invalid", "终端启动参数无效");
const text = (value: unknown, limit = TEXT_LIMIT): value is string => typeof value === "string" && value.length <= limit && !value.includes("\0");
const terminalKey = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/u.test(value);
const subjectText = (value: unknown): value is string => text(value, SUBJECT_LIMIT) && value.length > 0;

function terminalListSubject(input: unknown): string | undefined {
  if (input === undefined) return undefined;
  if (!plain(input) || Object.keys(input).some(name => name !== "subject")) throw invalid();
  if (input.subject !== undefined && !subjectText(input.subject)) throw invalid();
  return input.subject as string | undefined;
}

/** The input is these five keys and nothing else, bounded; what follows reads only this copy. */
function terminalRequest(input: unknown): TerminalRequest {
  if (!plain(input) || Object.keys(input).some(key => !INPUT_KEYS.has(key))) throw invalid();
  const { key, title, program, subject, directory } = input as Record<string, unknown>;
  if (!terminalKey(key) || (title !== undefined && (!text(title, 120) || !title.trim()))
    || (subject !== undefined && !subjectText(subject))) throw invalid();
  return Object.freeze({ key, title: title as string | undefined, program: terminalProgram(program), subject: subject === undefined ? null : subject as string,
    directory: terminalFolder(directory) });
}

/** A recipe id, or a command with bounded arguments. */
function terminalProgram(program: unknown): TerminalProgram {
  if (!plain(program)) throw invalid();
  const keys = Object.keys(program);
  if ("runtime" in program) {
    if (keys.length !== 1 || typeof program.runtime !== "string" || !isTerminalRuntime(program.runtime)) throw invalid();
    return Object.freeze({ runtime: program.runtime });
  }
  const { command, args = [] } = program;
  // The terminal host trims the program it is given, so one that changes when trimmed is not the program checked here.
  if (keys.some(name => name !== "command" && name !== "args") || !text(command) || command !== command.trim() || !isTerminalCommand(command)) throw invalid();
  // Read once, by index, into a plain array: that copy is what is checked and what starts (a hole, an iterator or a getter changes nothing).
  // `length` is read once too and must be a small integer: a Proxy passes Array.isArray and could answer differently on each read.
  if (!Array.isArray(args)) throw invalid();
  const length: unknown = args.length;
  if (typeof length !== "number" || !Number.isInteger(length) || length < 0 || length > ARGS_LIMIT) throw invalid();
  const list: unknown[] = [];
  for (let index = 0; index < length; index++) list.push(args[index]);
  if (!list.every(arg => text(arg))) throw invalid();
  return Object.freeze({ command, args: Object.freeze(list as string[]) });
}

/** The folder: the plugin's owner files, or a linked workspace of the call's project (its preferred one when none is named). */
function terminalFolder(directory: unknown): PluginTerminalDirectory {
  if (!plain(directory)) throw invalid();
  const { root, workspace_id, path } = directory;
  const keys = root === "workspace" ? ["root", "workspace_id", "path"] : root === "owner_files" ? ["root", "path"] : [];
  if (!keys.length || Object.keys(directory).some(name => !keys.includes(name))) throw invalid();
  if (workspace_id !== undefined && (typeof workspace_id !== "string" || !workspace_id || workspace_id.length > 200)) throw invalid();
  if (path !== undefined && (!text(path) || !path || path.startsWith("/") || path.includes("\\")
    || path.split("/").some(segment => segment === "" || segment === "." || segment === ".."))) throw invalid();
  const tail = path === undefined ? {} : { path };
  if (root === "owner_files") return Object.freeze({ root, ...tail });
  return Object.freeze({ root: "workspace" as const, ...(workspace_id === undefined ? {} : { workspace_id: workspace_id as string }), ...tail });
}

const plain = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/**
 * The folder, resolved: its root is the project's linked workspace named by the call, or its preferred one (from the catalog, read now), or the plugin's owner
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
    const named = directory.workspace_id;
    const linked = await catalog({ homeDirectory: home }, projects => named === undefined ? projects.preferredWorkspacePath(projectId)
      : projects.listWorkspaceDirectory(projectId).find(record => record.workspace_id === named)?.canonical_path);
    check();
    if (!linked) throw named === undefined ? new ActionError("actions.unavailable", "这个项目还没有关联工作目录")
      : new ActionError("actions.forbidden", "不是本项目已关联的工作目录");
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
  // The terminal host trims the folder it is given: `<root>/sub ` would run in `<root>/sub`, which may be a link out of the root.
  if (target !== target.trim()) throw new ActionError("actions.input_invalid", "终端工作目录的名字不能以空白开头或结尾");
  const folder = await stat(target).catch(missing); check();
  if (!folder.isDirectory()) throw new ActionError("actions.input_invalid", "终端工作目录不是目录");
  return target;
}
