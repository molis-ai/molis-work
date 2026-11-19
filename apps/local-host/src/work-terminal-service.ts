import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { ActionError, bindActionHandler, defineErrorCodes, isWorkTerminalPromptAction, WORK_TERMINAL_ACTIONS, WORK_TERMINAL_PROVIDER_ID, workTerminalActions, type ActionCallContext, type ActionClient, type ActionExecutionContext, type ActionProviderRegistration, type ActionSubject, type ActionView, type WorkTerminalCloseInput, type WorkTerminalListInput, type WorkTerminalListResult, type WorkTerminalOpenInput, type WorkTerminalOpenResult, type WorkTerminalPanelRow, type WorkTerminalPromptActionInput, type WorkTerminalPromptActionResult, type WorkTerminalPromptView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { projectGuidanceActions, type ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/project-guidance";
import { assembleWorkTerminalPrompt, workTerminalDeclarationFor } from "@molis-ai/molis-work-plugin-sdk";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import { assertPassiveProjectAvailable } from "./passive-sync-execution.js";
import { installedPluginManifest, installedPluginManifestFor } from "./plugin-installation-directory.js";
import type { TerminalOwner } from "./plugin-terminal-panels.js";
import { terminalSearchPath } from "./plugin-terminal-runtimes.js";
import { sameProgram, terminalDirectory, terminalEnvironment, terminalHost, terminalLaunch, terminalPanelId, terminalProgram, withTerminalCatalog, type TerminalProgram } from "./plugin-terminal-service.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { withTerminalPageOwner } from "./pty-page-access.js";

const workTerminalErrors = defineErrorCodes("host", { work_terminal_read_only: "conflict" });

/** Live platform work-terminal panels, keyed by `(resolvedHome, install_id, project_id)` so plugin stop/disable/uninstall ends them. */
const livePanels = new Map<string, Map<string, MolisWorkPtyHost>>();
const ownerBucket = (home: string, installId: string, projectId: string | null) => JSON.stringify([resolve(home), installId, projectId]);

/** Kill any running platform work terminals started for this plugin installation (called on plugin stop/revoke/project close). */
export function disposeWorkTerminalsForOwner(input: { home: string; install_id: string; project_id?: string | null }): void {
  const home = resolve(input.home);
  if (input.project_id !== undefined) {
    const key = ownerBucket(home, input.install_id, input.project_id);
    const bucket = livePanels.get(key);
    if (!bucket) return;
    livePanels.delete(key);
    for (const [panelId, host] of bucket) host.kill(panelId);
    return;
  }
  const prefix = JSON.stringify([home, input.install_id]).slice(0, -1) + ",";
  for (const [key, bucket] of [...livePanels.entries()]) {
    if (!key.startsWith(prefix)) continue;
    livePanels.delete(key);
    for (const [panelId, host] of bucket) host.kill(panelId);
  }
}

function trackLivePanel(home: string, owner: TerminalOwner, panelId: string, host: MolisWorkPtyHost): void {
  const key = ownerBucket(home, owner.install_id, owner.project_id);
  let bucket = livePanels.get(key);
  if (!bucket) livePanels.set(key, bucket = new Map());
  bucket.set(panelId, host);
}

function untrackLivePanel(home: string, owner: TerminalOwner, panelId: string): void {
  const key = ownerBucket(home, owner.install_id, owner.project_id);
  const bucket = livePanels.get(key);
  if (!bucket) return;
  bucket.delete(panelId);
  if (!bucket.size) livePanels.delete(key);
}

/** Stable subject key stored in `plugin_terminal_panels.subject`: separates multiple kinds owned by the same plugin. */
const subjectStorageKey = (subject: ActionSubject): string => `${subject.kind}:${subject.id}`;

/** Only the person at their own page may drive object work terminals; an Agent, workflow, MCP client or plugin is refused. */
function assertPersonCaller(caller: ActionCallContext): string {
  if (caller.audience !== "user" || caller.host_plugin || caller.delegated_by || caller.calling_plugin_id) {
    throw new ActionError("actions.forbidden", "工作终端只能由本人在页面里操作");
  }
  if (!caller.project_id) throw new ActionError("actions.scope_mismatch", "工作终端只在项目里可用");
  return caller.project_id;
}

interface ResolvedTarget {
  readonly view: ActionView;
  readonly install_id: string;
}

export interface WorkTerminalProviderPorts {
  readonly homeDirectory: string;
  readonly clientFor: (caller: ActionCallContext) => ActionClient;
  readonly localHost: MolisWorkLocalHost;
  readonly resolveProject: (projectId: string) => Promise<LocalHostProjectReference | null>;
}

const callerCheck = (caller: ActionCallContext) => () => { caller.signal?.throwIfAborted(); };

async function resolveWorkTerminalTarget(
  ports: WorkTerminalProviderPorts,
  caller: ActionCallContext,
  client: ActionClient,
  projectId: string,
  pluginId: string,
  subject: ActionSubject,
): Promise<ResolvedTarget> {
  const project = await ports.resolveProject(projectId);
  if (!project) throw new ActionError("actions.scope_mismatch", "找不到当前项目");
  const discovered = await client.discover(caller);
  const view = discovered.find(item => item.provider.plugin_id === pluginId && isWorkTerminalPromptAction(item.action)
    && item.action.subject_kinds.includes(subject.kind));
  if (!view) {
    const inspected = (await ports.localHost.inspectActions(caller, project)).find(item => item.provider.plugin_id === pluginId
      && isWorkTerminalPromptAction(item.action) && item.action.subject_kinds.includes(subject.kind));
    if (inspected && !inspected.availability.available) {
      throw new ActionError(inspected.availability.code ?? "actions.plugin_disabled", inspected.availability.reason ?? "该插件在当前项目不可用");
    }
    throw new ActionError("actions.missing", "该插件未声明这类对象的工作终端");
  }
  if (!view.availability.available) {
    throw new ActionError(view.availability.code ?? "actions.plugin_disabled", view.availability.reason ?? "该插件在当前项目不可用");
  }
  const installId = view.provider.plugin_install_id;
  if (!installId) throw new ActionError("actions.unavailable", "该插件缺少运行中的安装身份");
  const manifest = await installedPluginManifestFor(installId, pluginId, ports.localHost.homePlugins,
    reference => ports.localHost.withProject(reference, runtime => installedPluginManifest(runtime.store.db, installId)), project);
  const declared = manifest ? workTerminalDeclarationFor(manifest, subject.kind) : undefined;
  if (!declared || declared.action.capability_id !== view.capability_id || declared.action.version !== view.version) {
    throw new ActionError("actions.missing", "该插件未在 Manifest 中声明这类对象的工作终端");
  }
  return { view, install_id: installId };
}

async function readWorkTerminalSubjectPrompt(
  caller: ActionCallContext,
  client: ActionClient,
  target: ResolvedTarget,
  subject: ActionSubject,
  onboarding?: boolean,
): Promise<WorkTerminalPromptView> {
  const answer = await client.invoke(caller, {
    capability_id: target.view.capability_id,
    version: target.view.version,
    provider_id: target.view.provider.provider_id,
  }, { subject_id: subject.id, ...(onboarding ? { onboarding: true } : {}) }) as WorkTerminalPromptView;
  if (answer.subject.kind !== subject.kind || answer.subject.id !== subject.id) {
    throw new ActionError("actions.execution_failed", "插件返回的对象与请求不一致");
  }
  return answer;
}

async function listWorkTerminals(ports: WorkTerminalProviderPorts, input: WorkTerminalListInput, caller: ActionCallContext): Promise<WorkTerminalListResult> {
  const projectId = assertPersonCaller(caller), check = callerCheck(caller), client = ports.clientFor(caller);
  const target = await resolveWorkTerminalTarget(ports, caller, client, projectId, input.plugin_id, input.subject);
  const info = await readWorkTerminalSubjectPrompt(caller, client, target, input.subject);
  check();
  const owner: TerminalOwner = { install_id: target.install_id, project_id: projectId, actor_id: caller.actor_id };
  const { host } = terminalHost(ports.homeDirectory);
  const rows = await withTerminalCatalog(ports.homeDirectory, check, projects => projects.terminalPanels.list(owner, subjectStorageKey(input.subject)));
  check();
  return {
    panels: rows.map((row): WorkTerminalPanelRow => ({
      key: row.key, panel_id: row.panel_id, title: row.title, runtime: row.runtime,
      program: row.runtime === "command" ? { command: row.launch_command, args: [...row.launch_args] } : { runtime: row.runtime },
      running: host.alive(row.panel_id), created_at: row.created_at,
    })),
    read_only: info.read_only,
    ...(info.read_only_reason ? { read_only_reason: info.read_only_reason } : {}),
  };
}

async function openWorkTerminal(ports: WorkTerminalProviderPorts, input: WorkTerminalOpenInput, caller: ActionExecutionContext): Promise<WorkTerminalOpenResult> {
  const projectId = assertPersonCaller(caller), check = callerCheck(caller), client = ports.clientFor(caller);
  const target = await resolveWorkTerminalTarget(ports, caller, client, projectId, input.plugin_id, input.subject);
  const info = await readWorkTerminalSubjectPrompt(caller, client, target, input.subject);
  if (info.read_only) throw workTerminalErrors.work_terminal_read_only(info.read_only_reason ?? "当前对象为只读，不能直接打开终端。");
  if ((input.runtime === undefined) === (input.command === undefined) || (input.runtime !== undefined && input.args !== undefined)) {
    throw new ActionError("actions.input_invalid", "请给出 runtime，或者给出 command 与参数，二选一");
  }
  if (input.command !== undefined && input.resume_session_id !== undefined) {
    throw new ActionError("actions.input_invalid", "只有 runtime 能接着原来的会话");
  }
  const program: TerminalProgram = terminalProgram(input.runtime !== undefined
    ? { runtime: input.runtime, ...(input.resume_session_id === undefined ? {} : { session: input.resume_session_id }) }
    : { command: input.command!, ...(input.args === undefined ? {} : { args: input.args }) });
  const tab = input.key ?? `t${randomBytes(6).toString("hex")}`;
  const owner: TerminalOwner = { install_id: target.install_id, project_id: projectId, actor_id: caller.actor_id };
  const panelId = terminalPanelId(owner, tab), subjectKey = subjectStorageKey(input.subject);
  check();
  await caller.beforeEffect();
  check();
  const cwd = await terminalDirectory(ports.homeDirectory, { root: "workspace", ...(input.workspace_id === undefined ? {} : { workspace_id: input.workspace_id }) },
    projectId, undefined, check);
  const { host, webUrl } = terminalHost(ports.homeDirectory);
  const searchPath = terminalSearchPath();
  check();
  const started = await withTerminalCatalog(ports.homeDirectory, check, projects => projects.commit(() => {
    check();
    projects.getProject(projectId);
    assertPassiveProjectAvailable(ports.homeDirectory, projectId);
    const existing = projects.terminalPanels.get(panelId);
    if (existing && existing.subject !== subjectKey) throw new ActionError("actions.conflict", "这个终端属于另一个对象，请换一个 key");
    if (existing && host.alive(panelId)) return false;
    if (existing && !sameProgram(existing, program)) throw new ActionError("actions.conflict", "这个终端记录的是另一个程序，请先关掉它");
    const launch = terminalLaunch(program, existing, searchPath);
    const record = existing ?? projects.terminalPanels.insert({
      ...owner, panel_id: panelId, key: tab, subject: subjectKey, runtime: launch.runtime, launch_command: launch.stored,
      launch_args: [...launch.storedArgs], title: launch.title, host_session_id: launch.session,
    }, cwd);
    check();
    projects.getProject(projectId);
    assertPassiveProjectAvailable(ports.homeDirectory, projectId);
    withTerminalPageOwner(owner, () => host.spawn({
      panelId, command: launch.path, args: [...launch.args], cwd,
      env: terminalEnvironment({ home: ports.homeDirectory, record, webUrl: webUrl(), focusKind: input.subject.kind, focusId: input.subject.id }),
    }));
    return true;
  }));
  trackLivePanel(ports.homeDirectory, owner, panelId, host);
  return { panel_id: panelId, key: tab, started };
}

async function closeWorkTerminal(ports: WorkTerminalProviderPorts, input: WorkTerminalCloseInput, caller: ActionExecutionContext): Promise<{ closed: true }> {
  const projectId = assertPersonCaller(caller), check = callerCheck(caller), client = ports.clientFor(caller);
  const target = await resolveWorkTerminalTarget(ports, caller, client, projectId, input.plugin_id, input.subject);
  await readWorkTerminalSubjectPrompt(caller, client, target, input.subject);
  const owner: TerminalOwner = { install_id: target.install_id, project_id: projectId, actor_id: caller.actor_id };
  const panelId = terminalPanelId(owner, input.key), subjectKey = subjectStorageKey(input.subject);
  check();
  await caller.beforeEffect();
  check();
  const { host } = terminalHost(ports.homeDirectory);
  await withTerminalCatalog(ports.homeDirectory, check, projects => projects.commit(() => {
    check();
    const record = projects.terminalPanels.get(panelId);
    if (!record || record.subject !== subjectKey) throw new ActionError("actions.missing", "找不到这个终端");
    host.kill(panelId);
    projects.terminalPanels.remove(record);
  }));
  untrackLivePanel(ports.homeDirectory, owner, panelId);
  return { closed: true };
}

async function buildWorkTerminalPrompt(ports: WorkTerminalProviderPorts, input: WorkTerminalPromptActionInput, caller: ActionCallContext): Promise<WorkTerminalPromptActionResult> {
  const projectId = assertPersonCaller(caller), check = callerCheck(caller), client = ports.clientFor(caller);
  const target = await resolveWorkTerminalTarget(ports, caller, client, projectId, input.plugin_id, input.subject);
  const info = await readWorkTerminalSubjectPrompt(caller, client, target, input.subject, input.onboarding);
  if (info.read_only) throw workTerminalErrors.work_terminal_read_only(info.read_only_reason ?? "当前对象为只读，不能直接推进。");
  check();
  const guidance = await client.invoke(caller, projectGuidanceActions.read, {}) as ProjectGuidanceView;
  check();
  return {
    plugin_id: input.plugin_id,
    subject: input.subject,
    title: info.title,
    prompt: assembleWorkTerminalPrompt({
      subject: input.subject,
      title: info.title,
      instruction: info.instruction,
      instruction_with_untrusted_source: info.instruction_with_untrusted_source,
      current_facts: info.current_facts,
      project_guidance_prefix: guidance.runtime_prompt_prefix,
      source_contexts: input.source_contexts,
    }),
  };
}

/**
 * Platform object work-terminal service (`system.work-terminal`, batch 44 item 4, PEQ-17).
 * Any plugin (built-in or sandboxed) declares `manifest.work_terminals` with a read-only user prompt query; it needs no
 * `terminal:run`, `workspace:read` or `projects:guidance-read` permission. The platform validates the declaration against the
 * running installation's trusted Manifest, runs the prompt query as the person, reads project guidance, binds untrusted source
 * contexts, and opens/lists/closes panels in the project's workspace under that plugin installation's isolated owner key.
 */
export function workTerminalActionProvider(ports: WorkTerminalProviderPorts): ActionProviderRegistration {
  return {
    provider: { provider_id: WORK_TERMINAL_PROVIDER_ID, title: "工作终端", kind: "system" },
    definitions: WORK_TERMINAL_ACTIONS,
    handlers: [
      bindActionHandler(workTerminalActions.list, (input, caller) => listWorkTerminals(ports, input, caller)),
      bindActionHandler(workTerminalActions.open, (input, caller) => openWorkTerminal(ports, input, caller)),
      bindActionHandler(workTerminalActions.close, (input, caller) => closeWorkTerminal(ports, input, caller)),
      bindActionHandler(workTerminalActions.prompt, (input, caller) => buildWorkTerminalPrompt(ports, input, caller)),
    ],
  };
}
