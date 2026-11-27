import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { ActionError, bindActionHandler, defineErrorCodes, isWorkTerminalPromptAction, requireSynchronous, WORK_TERMINAL_ACTIONS, WORK_TERMINAL_PROVIDER_ID, workTerminalActions, type ActionCallContext, type ActionClient, type ActionExecutionContext, type ActionProviderRegistration, type ActionSubject, type ActionView, type WorkTerminalCloseInput, type WorkTerminalListInput, type WorkTerminalListResult, type WorkTerminalOpenInput, type WorkTerminalOpenResult, type WorkTerminalPanelRow, type WorkTerminalPromptActionInput, type WorkTerminalPromptActionResult, type WorkTerminalPromptView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/project-guidance";
import { assembleWorkTerminalPrompt, workTerminalDeclarationFor } from "@molis-ai/molis-work-plugin-sdk";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import { assertPassiveProjectAvailable } from "./passive-sync-execution.js";
import { installedPluginManifest, installedPluginManifestFor } from "./plugin-installation-directory.js";
import type { TerminalOwner } from "./plugin-terminal-panels.js";
import { terminalSearchPath } from "./plugin-terminal-runtimes.js";
import { sameProgram, terminalDirectory, terminalEnvironment, terminalHost, terminalLaunch, terminalPanelId, terminalProgram, withTerminalCatalog, type TerminalProgram } from "./plugin-terminal-service.js";
import { projectPluginJudge } from "./project-action-availability.js";
import type { MolisWorkProjectCatalog } from "./project-catalog.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { withTerminalPageOwner } from "./pty-page-access.js";
import { pinnedProjectGuidanceRead } from "./project-guidance-actions.js";

const workTerminalErrors = defineErrorCodes("host", { work_terminal_read_only: "conflict" });

/** Live platform work-terminal panels, keyed by `(resolvedHome, install_id, project_id)` so plugin stop/disable/uninstall ends them. */
const livePanels = new Map<string, Map<string, MolisWorkPtyHost>>();
interface ActiveWorkTerminalOwner {
  readonly installation_generation: string;
  readonly plugin_id: string;
  readonly publisher_key_id?: string | null;
  readonly assertActive: () => void;
  readonly requireGrant: (permission: string) => void;
}
/** Live plugin instances authorized to back platform work terminals; cleared synchronously on revoke/dispose before killing live panels. */
const activeOwners = new Map<string, ActiveWorkTerminalOwner>();
const ownerBucket = (home: string, installId: string, projectId: string | null) => JSON.stringify([resolve(home), installId, projectId]);

/** Whether a work terminal of this installation in this project is still running: closing the project would end it. */
export function hasLiveWorkTerminals(input: { home: string; install_id: string; project_id: string }): boolean {
  const bucket = livePanels.get(ownerBucket(input.home, input.install_id, input.project_id));
  return !!bucket && [...bucket].some(([panelId, host]) => host.alive(panelId));
}

/** Register a running plugin installation's synchronous active fence for platform work-terminal TOCTOU checks. */
export function registerWorkTerminalOwner(input: {
  home: string;
  install_id: string;
  project_id: string | null;
  installation_generation: string;
  plugin_id: string;
  publisher_key_id?: string | null;
  assertActive: () => void;
  requireGrant: (permission: string) => void;
}): void {
  activeOwners.set(ownerBucket(input.home, input.install_id, input.project_id), {
    installation_generation: input.installation_generation,
    plugin_id: input.plugin_id,
    ...(input.publisher_key_id !== undefined ? { publisher_key_id: input.publisher_key_id } : {}),
    assertActive: input.assertActive,
    requireGrant: input.requireGrant,
  });
}

/** Kill live platform work terminals for a Home-scoped plugin removed from one project, leaving other projects running. */
export function disposeWorkTerminalsForHomePluginInProject(homeDirectory: string, pluginId: string, projectId: string): void {
  const home = resolve(homeDirectory);
  for (const [key, entry] of activeOwners) {
    if (entry.plugin_id !== pluginId) continue;
    const [entryHome, installId, entryProject] = JSON.parse(key) as [string, string, string | null];
    if (entryHome !== home || entryProject !== null) continue;
    const panelKey = ownerBucket(home, installId, projectId);
    const bucket = livePanels.get(panelKey);
    if (!bucket) continue;
    livePanels.delete(panelKey);
    for (const [panelId, host] of bucket) host.kill(panelId);
  }
}

/** Synchronously kill live platform work terminals and revoke active fences for all installations signed by a revoked publisher (S-87). */
export function disposeWorkTerminalsForPublisher(homeDirectory: string, publisherKeyId: string): void {
  const home = resolve(homeDirectory);
  const revokedInstalls = new Set<string>();
  for (const [key, entry] of [...activeOwners.entries()]) {
    const [entryHome, installId] = JSON.parse(key) as [string, string, string | null];
    if (entryHome !== home || entry.publisher_key_id !== publisherKeyId) continue;
    revokedInstalls.add(installId);
    activeOwners.delete(key);
  }
  for (const installId of revokedInstalls) {
    disposeWorkTerminalsForOwner({ home, install_id: installId });
  }
}

/** Kill any running platform work terminals started for this plugin installation (called on plugin stop/revoke/project close). */
export function disposeWorkTerminalsForOwner(input: { home: string; install_id: string; project_id?: string | null }): void {
  const home = resolve(input.home);
  if (input.project_id !== undefined) {
    const key = ownerBucket(home, input.install_id, input.project_id);
    activeOwners.delete(key);
    const bucket = livePanels.get(key);
    if (!bucket) return;
    livePanels.delete(key);
    for (const [panelId, host] of bucket) host.kill(panelId);
    return;
  }
  const prefix = JSON.stringify([home, input.install_id]).slice(0, -1) + ",";
  for (const key of [...activeOwners.keys()]) {
    if (key.startsWith(prefix)) activeOwners.delete(key);
  }
  for (const [key, bucket] of [...livePanels.entries()]) {
    if (!key.startsWith(prefix)) continue;
    livePanels.delete(key);
    for (const [panelId, host] of bucket) host.kill(panelId);
  }
}

function pruneDeadPanels(): void {
  for (const [bucketKey, existingBucket] of livePanels) {
    for (const [existingId, existingHost] of existingBucket) {
      if (!existingHost.alive(existingId)) existingBucket.delete(existingId);
    }
    if (!existingBucket.size) livePanels.delete(bucketKey);
  }
}

function trackLivePanel(home: string, owner: TerminalOwner, panelId: string, host: MolisWorkPtyHost): void {
  pruneDeadPanels();
  const key = ownerBucket(home, owner.install_id, owner.project_id);
  let bucket = livePanels.get(key);
  if (!bucket) {
    bucket = new Map();
    livePanels.set(key, bucket);
  }
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
  readonly installation_generation: string;
  readonly permissions: readonly string[];
}

export interface WorkTerminalProviderPorts {
  readonly homeDirectory: string;
  readonly clientFor: (caller: ActionCallContext) => ActionClient;
  readonly localHost: MolisWorkLocalHost;
  readonly resolveProject: (projectId: string) => Promise<LocalHostProjectReference | null>;
}

const callerCheck = (caller: ActionCallContext) => () => {
  caller.signal?.throwIfAborted();
  requireSynchronous(caller.assert_authority_current?.(), "工作终端最终授权检查必须同步完成");
};

function assertTargetOwnerActive(homeDirectory: string, target: ResolvedTarget, projectId: string): void {
  const owner = activeOwners.get(ownerBucket(homeDirectory, target.install_id, projectId))
    ?? activeOwners.get(ownerBucket(homeDirectory, target.install_id, null));
  if (!owner || owner.installation_generation !== target.installation_generation) {
    throw new ActionError("actions.forbidden", "此插件实例已停止或权限已变更，请重新打开");
  }
  owner.assertActive();
  for (const permission of target.permissions) {
    owner.requireGrant(permission);
  }
}

function assertTargetCurrent(
  homeDirectory: string,
  projects: Pick<MolisWorkProjectCatalog, "projectPluginMembership">,
  projectId: string,
  pluginId: string,
  target: ResolvedTarget,
): void {
  assertTargetOwnerActive(homeDirectory, target, projectId);
  if (projectPluginJudge(projects, projectId, homeDirectory)(pluginId) === false) {
    throw new ActionError("actions.plugin_disabled", "此项目未启用该插件");
  }
}

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
  const owner = activeOwners.get(ownerBucket(ports.homeDirectory, installId, projectId))
    ?? activeOwners.get(ownerBucket(ports.homeDirectory, installId, null));
  if (!owner) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开");
  const target: ResolvedTarget = { view, install_id: installId, installation_generation: owner.installation_generation, permissions: view.action.permissions };
  assertTargetOwnerActive(ports.homeDirectory, target, projectId);
  return target;
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
  check();
  const target = await resolveWorkTerminalTarget(ports, caller, client, projectId, input.plugin_id, input.subject);
  const assertLive = () => { check(); assertTargetOwnerActive(ports.homeDirectory, target, projectId); };
  assertLive();
  const info = await readWorkTerminalSubjectPrompt(caller, client, target, input.subject);
  assertLive();
  const owner: TerminalOwner = { install_id: target.install_id, project_id: projectId, actor_id: caller.actor_id };
  const { host } = terminalHost(ports.homeDirectory);
  const rows = await withTerminalCatalog(ports.homeDirectory, assertLive, projects => {
    assertTargetCurrent(ports.homeDirectory, projects, projectId, input.plugin_id, target);
    return projects.terminalPanels.list(owner, subjectStorageKey(input.subject));
  });
  assertLive();
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
  check();
  const target = await resolveWorkTerminalTarget(ports, caller, client, projectId, input.plugin_id, input.subject);
  const assertLive = () => { check(); assertTargetOwnerActive(ports.homeDirectory, target, projectId); };
  assertLive();
  const info = await readWorkTerminalSubjectPrompt(caller, client, target, input.subject);
  assertLive();
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
  assertLive();
  await caller.beforeEffect();
  assertLive();
  const cwd = await terminalDirectory(ports.homeDirectory, { root: "workspace", ...(input.workspace_id === undefined ? {} : { workspace_id: input.workspace_id }) },
    projectId, undefined, assertLive);
  const { host, webUrl } = terminalHost(ports.homeDirectory);
  const searchPath = terminalSearchPath();
  await caller.beforeEffect();
  assertLive();
  const started = await withTerminalCatalog(ports.homeDirectory, assertLive, projects => {
    let spawned = false;
    try {
      return projects.commit(() => {
        check();
        assertTargetCurrent(ports.homeDirectory, projects, projectId, input.plugin_id, target);
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
        assertTargetCurrent(ports.homeDirectory, projects, projectId, input.plugin_id, target);
        projects.getProject(projectId);
        assertPassiveProjectAvailable(ports.homeDirectory, projectId);
        withTerminalPageOwner(owner, () => host.spawn({
          panelId, command: launch.path, args: [...launch.args], cwd,
          env: terminalEnvironment({ home: ports.homeDirectory, record, webUrl: webUrl(), focusKind: input.subject.kind, focusId: input.subject.id }),
        }));
        spawned = true;
        trackLivePanel(ports.homeDirectory, owner, panelId, host);
        return true;
      });
    } catch (error) {
      if (spawned) {
        host.kill(panelId);
        untrackLivePanel(ports.homeDirectory, owner, panelId);
      }
      throw error;
    }
  });
  return { panel_id: panelId, key: tab, started };
}

async function closeWorkTerminal(ports: WorkTerminalProviderPorts, input: WorkTerminalCloseInput, caller: ActionExecutionContext): Promise<{ closed: true }> {
  const projectId = assertPersonCaller(caller), check = callerCheck(caller), client = ports.clientFor(caller);
  check();
  const target = await resolveWorkTerminalTarget(ports, caller, client, projectId, input.plugin_id, input.subject);
  const assertLive = () => { check(); assertTargetOwnerActive(ports.homeDirectory, target, projectId); };
  assertLive();
  // Allow closing a lingering panel even after its underlying object was deleted (`actions.missing`).
  try {
    await readWorkTerminalSubjectPrompt(caller, client, target, input.subject);
  } catch (error) {
    if (!(error instanceof ActionError && error.code === "actions.missing")) throw error;
  }
  assertLive();
  const owner: TerminalOwner = { install_id: target.install_id, project_id: projectId, actor_id: caller.actor_id };
  const panelId = terminalPanelId(owner, input.key), subjectKey = subjectStorageKey(input.subject);
  await caller.beforeEffect();
  assertLive();
  const { host } = terminalHost(ports.homeDirectory);
  await withTerminalCatalog(ports.homeDirectory, assertLive, projects => projects.commit(() => {
    check();
    assertTargetCurrent(ports.homeDirectory, projects, projectId, input.plugin_id, target);
    const record = projects.terminalPanels.get(panelId);
    if (!record || record.subject !== subjectKey) throw new ActionError("actions.missing", "找不到这个终端");
    host.kill(panelId);
    untrackLivePanel(ports.homeDirectory, owner, panelId);
    projects.terminalPanels.remove(record);
  }));
  return { closed: true };
}

async function buildWorkTerminalPrompt(ports: WorkTerminalProviderPorts, input: WorkTerminalPromptActionInput, caller: ActionCallContext): Promise<WorkTerminalPromptActionResult> {
  const projectId = assertPersonCaller(caller), check = callerCheck(caller), client = ports.clientFor(caller);
  check();
  const target = await resolveWorkTerminalTarget(ports, caller, client, projectId, input.plugin_id, input.subject);
  const assertLive = () => { check(); assertTargetOwnerActive(ports.homeDirectory, target, projectId); };
  assertLive();
  const info = await readWorkTerminalSubjectPrompt(caller, client, target, input.subject, input.onboarding);
  assertLive();
  if (info.read_only) throw workTerminalErrors.work_terminal_read_only(info.read_only_reason ?? "当前对象为只读，不能直接推进。");
  const guidance = await client.invoke(caller, pinnedProjectGuidanceRead, {}) as ProjectGuidanceView;
  assertLive();
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
