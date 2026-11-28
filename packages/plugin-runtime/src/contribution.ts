import { pluginErrors, STATE_MACHINE_DECLARATION_LIMITS } from "@molis-ai/molis-work-contracts/platform/plugin";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { inspectStateMachineDeclarations } from "@molis-ai/molis-work-plugin-sdk/state-machine";
import { syncContributionProblems } from './sync-contribution.js';
import { declaresOwner } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  type PluginAppContribution,
  type PluginContribution,
  type PluginManifest,
  type StateMachineDeclaration,
} from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * Redemption check: what a Plugin returned at start must match what its
 * Manifest declared, in both directions. An undelivered view, route, or MCP
 * tool is a failed start, and an undeclared handler never runs — the Manifest
 * stays the whole contract.
 */

/**
 * Which redemption a start owes. A Plugin that runs both in the Home and in a project (S0-2) starts once in each, and
 * each half is `partial`: what it returns is still checked against the Manifest in full, but a declared view, route,
 * action or scene it leaves out belongs to the other half. Ports and events reach only project instances, so a
 * partial half still answers them unless the Host says no project reaches it (`outside_project`). Without a scope every
 * declared item is owed.
 */
export interface RedemptionScope {
  readonly partial?: boolean;
  readonly outside_project?: boolean;
  /**
   * Whether the code owes the Manifest's state machines (specs/state-machine-platform §4.3). A plugin shipped with the Host
   * writes both sides, so every declared machine must come back from `start()`. Elsewhere (a development plugin, a sandboxed one
   * whose Manifest the Host wrote) code that returns machines is checked, and code that returns none owes none.
   */
  readonly state_machines_owed?: boolean;
}

/** A Runtime that serves a project (its own `actions.project_id`) is never outside one, whatever its Host says of a definition. */
export function redemptionIn(scope: RedemptionScope | undefined, projectId: string | undefined): RedemptionScope {
  return projectId ? { ...scope, outside_project: false } : scope ?? {};
}

export function viewContributionId(manifest: PluginManifest, viewId: string): string {
  const declared = (manifest.ui.views ?? []).find((view) => view.view_id === viewId);
  return declared?.contribution_id ?? `${manifest.plugin_id}.${viewId}`;
}

function assertKind(manifest: PluginManifest, contribution: PluginContribution): void {
  if (manifest.kind === "integration" && contribution.kind !== "integration") {
    throw pluginErrors.contribution_kind_invalid("Integration Plugin 必须返回 Integration contribution");
  }
  if (contribution.kind === "integration" && typeof contribution.bind !== "function") {
    throw pluginErrors.contribution_kind_invalid("Integration contribution 必须提供 bind(binding)");
  }
  if (manifest.kind === "app" && contribution.kind !== "app") {
    throw pluginErrors.contribution_kind_invalid("app Plugin 必须返回 app contribution");
  }
}

function assertViews(manifest: PluginManifest, contribution: PluginAppContribution, scope: RedemptionScope): string[] {
  const problems: string[] = [];
  const declared = manifest.ui.views ?? [];
  const expected = new Map(declared.map((view) => [viewContributionId(manifest, view.view_id), view.view_id]));
  const delivered = new Map<string, true>();
  for (const view of contribution.views ?? []) {
    const contributionId = view.descriptor.contribution_id;
    if (declaresOwner(view.descriptor)) {
      problems.push(`视图 ${contributionId} 自己写了插件身份，插件身份由平台按 Manifest 填写`);
      continue;
    }
    if (!expected.has(contributionId)) {
      problems.push(`视图 ${contributionId} 没有在 Manifest 里声明`);
      continue;
    }
    if (delivered.has(contributionId)) {
      problems.push(`视图 ${contributionId} 重复提供`);
      continue;
    }
    delivered.set(contributionId, true);
  }
  for (const [contributionId, viewId] of expected) {
    if (!delivered.has(contributionId) && !scope.partial) {
      problems.push(`声明的视图 ${viewId} 没有兑现`);
    }
  }
  return problems;
}

function assertRoutes(manifest: PluginManifest, contribution: PluginAppContribution, scope: RedemptionScope): string[] {
  const problems: string[] = [];
  const declared = new Set((manifest.routes ?? []).map((route) => route.route_id));
  const delivered = new Set<string>();
  for (const binding of contribution.routes ?? []) {
    if (!declared.has(binding.route_id)) {
      problems.push(`路由 ${binding.route_id} 没有在 Manifest 里声明`);
      continue;
    }
    if (delivered.has(binding.route_id)) {
      problems.push(`路由 ${binding.route_id} 重复提供`);
      continue;
    }
    delivered.add(binding.route_id);
  }
  for (const routeId of declared) {
    if (!delivered.has(routeId) && !scope.partial) problems.push(`声明的路由 ${routeId} 没有兑现`);
  }
  return problems;
}

function assertHandlers(manifest: PluginManifest, contribution: PluginAppContribution, scope: RedemptionScope): string[] {
  const problems: string[] = [];
  const projectInputsOwed = !(scope.partial && scope.outside_project);
  const subscribes = manifest.events?.subscribes ?? [];
  if (contribution.onEvent && subscribes.length === 0) {
    problems.push("提供了 onEvent 但 Manifest 没有声明任何订阅");
  }
  if (!contribution.onEvent && subscribes.length > 0 && projectInputsOwed) {
    problems.push("声明了事件订阅但没有提供 onEvent");
  }
  // Due entries only reach a plugin the per-partition assembly runs (batch 108).
  if (contribution.onDue && !manifest.databases?.partition) problems.push("提供了 onDue 但 Manifest 没有声明 databases.partition");

  const inputs = manifest.ports?.inputs ?? [];
  if ((contribution.onUpstreamReady || contribution.onUpstreamUnavailable) && inputs.length === 0) {
    problems.push("提供了上游输入回调但 Manifest 没有声明输入端口");
  }
  if (inputs.length > 0 && !contribution.onUpstreamReady && projectInputsOwed) {
    problems.push("声明了输入端口但没有提供 onUpstreamReady");
  }
  return problems;
}

export function assertContributionMatchesManifest(
  manifest: PluginManifest,
  contribution: PluginContribution,
  scope: RedemptionScope = {},
): void {
  assertKind(manifest, contribution);
  const problems = [...assertActions(manifest, contribution, scope), ...assertStateMachines(manifest, contribution, scope)];
  if (manifest.overview_projection?.rolling_window && !(scope.partial && scope.outside_project)
    && (contribution.kind !== "app" || typeof contribution.onDue !== "function")) {
    problems.push("声明了滚动总览窗口但没有提供 onDue");
  }
  if (contribution.kind === "app") {
    const owesSource = Boolean(manifest.integrations?.length) && scope.outside_project === true;
    const source = contribution.home_source;
    if (owesSource !== Boolean(source) || source && (source.kind !== "integration" || typeof source.bind !== "function"
      || Boolean(manifest.source_presentations?.length) !== (typeof source.presentSource === "function"))) {
      problems.push("个人来源须由声明它的应用在 Home 实例兑现");
    }
  }
  if (contribution.kind === "integration" && Boolean(manifest.source_presentations?.length) !== (typeof contribution.presentSource === "function")) {
    problems.push("source_presentations 声明与 presentSource 必须一同兑现");
  }
  if (contribution.kind === "app") problems.push(
    ...assertViews(manifest, contribution, scope),
    ...assertRoutes(manifest, contribution, scope),
    ...assertHandlers(manifest, contribution, scope),
    ...syncContributionProblems(manifest, contribution),
  );
  if (problems.length > 0) {
    throw pluginErrors.contribution_unredeemed(problems.join("；"));
  }
}

/** The same machine on both sides: same version, same states with the same families, same initial and terminal states. */
function sameMachine(declared: StateMachineDeclaration, delivered: StateMachineDeclaration): boolean {
  const states = Object.entries(declared.states), terminal = new Set(declared.terminal);
  return declared.version === delivered.version && declared.initial === delivered.initial
    && Object.keys(delivered.states).length === states.length && states.every(([state, family]) => delivered.states[state] === family)
    && delivered.terminal.length === terminal.size && delivered.terminal.every(state => terminal.has(state));
}

/**
 * State machines are redeemed like everything else the Manifest declares: a machine the code runs but the Manifest does not
 * declare, or declares differently, fails the start and names the machine. Triggers are not part of the declaration and are
 * never looked up (SMP-15).
 */
function assertStateMachines(manifest: PluginManifest, contribution: PluginContribution, scope: RedemptionScope): string[] {
  const declared = new Map((manifest.state_machines ?? []).map(machine => [machine.machine_id, machine]));
  const delivered = contribution.state_machines;
  if (delivered === undefined) {
    return scope.state_machines_owed && !scope.partial ? [...declared.keys()].map(id => `声明的状态机 ${id} 没有兑现`) : [];
  }
  if (!Array.isArray(delivered) || delivered.length > STATE_MACHINE_DECLARATION_LIMITS.machines) return ["运行时的 state_machines 不是有效清单"];
  const problems: string[] = [], seen = new Set<string>();
  for (const [index, machine] of delivered.entries()) {
    const id = isRecord(machine) && typeof machine.machine_id === "string" ? machine.machine_id : undefined;
    try { inspectStateMachineDeclarations([machine], manifest.plugin_id); }
    catch (error) {
      problems.push(`状态机 ${id?.slice(0, STATE_MACHINE_DECLARATION_LIMITS.id) ?? index}：${error instanceof Error ? error.message : "声明无效"}`);
      continue;
    }
    const expected = declared.get(machine.machine_id);
    if (seen.has(machine.machine_id)) problems.push(`状态机 ${id} 重复兑现`);
    else if (!expected) problems.push(`状态机 ${id} 未声明`);
    else if (!sameMachine(expected, machine)) problems.push(`状态机 ${id} 与 Manifest 声明的版本、状态或家族不一致`);
    seen.add(machine.machine_id);
  }
  if (!scope.partial) for (const id of declared.keys()) if (!seen.has(id)) problems.push(`声明的状态机 ${id} 没有兑现`);
  return problems;
}

function assertActions(manifest: PluginManifest, contribution: PluginContribution, scope: RedemptionScope): string[] {
  const problems: string[] = [];
  const expectedActions = new Set((manifest.actions ?? []).map(d => `${d.capability_id}@${d.version}`));
  const actions = new Set<string>();
  for (const h of contribution.actions ?? []) {
    const key = `${h.capability_id}@${h.version}`;
    if (!expectedActions.has(key) || actions.has(key) || typeof h.handle !== "function") problems.push(`能力 ${key} 未声明、重复或缺少处理器`);
    actions.add(key);
  }
  for (const key of expectedActions) if (!actions.has(key) && !scope.partial) problems.push(`声明的能力 ${key} 没有兑现`);
  const expectedScenes = new Set((manifest.action_scenes ?? []).map(d => `${d.scene_id}@${d.version}`));
  const scenes = new Set<string>();
  for (const h of contribution.action_scenes ?? []) {
    const key = `${h.scene_id}@${h.version}`;
    if (!expectedScenes.has(key) || scenes.has(key) || [h.bindings, h.bind, h.consume].some(f => typeof f !== "function")) {
      problems.push(`消费场景 ${key} 未声明、重复或缺少绑定/消费实现`);
    }
    scenes.add(key);
  }
  for (const key of expectedScenes) if (!scenes.has(key) && !scope.partial) problems.push(`声明的消费场景 ${key} 没有兑现`);
  return problems;
}

/**
 * The Manifest as far as a redeemed contribution delivers it: the declared actions and scenes it offers, in declared
 * order. For a full redemption that is every declared one; a partial half registers only its own.
 */
export function offeredManifest(manifest: PluginManifest, contribution: PluginContribution): PluginManifest {
  const actions = new Set((contribution.actions ?? []).map(h => `${h.capability_id}@${h.version}`));
  const scenes = new Set((contribution.action_scenes ?? []).map(h => `${h.scene_id}@${h.version}`));
  return {
    ...manifest,
    ...(manifest.actions ? { actions: manifest.actions.filter(d => actions.has(`${d.capability_id}@${d.version}`)) } : {}),
    ...(manifest.action_scenes ? { action_scenes: manifest.action_scenes.filter(d => scenes.has(`${d.scene_id}@${d.version}`)) } : {}),
  };
}
