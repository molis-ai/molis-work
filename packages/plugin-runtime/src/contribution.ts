import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import { declaresOwner } from "@molis-ai/molis-work-contracts/platform/ui";
import type {
  PluginAppContribution,
  PluginContribution,
  PluginManifest,
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
  const problems = assertActions(manifest, contribution, scope);
  if (contribution.kind === "app") problems.push(
    ...assertViews(manifest, contribution, scope),
    ...assertRoutes(manifest, contribution, scope),
    ...assertHandlers(manifest, contribution, scope),
  );
  if (problems.length > 0) {
    throw pluginErrors.contribution_unredeemed(problems.join("；"));
  }
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
