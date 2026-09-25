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

export class PluginContributionError extends Error {
  constructor(
    readonly code: "plugin_contribution_kind_invalid" | "plugin_contribution_unredeemed",
    message: string,
  ) {
    super(message);
    this.name = "PluginContributionError";
  }
}

export function viewContributionId(manifest: PluginManifest, viewId: string): string {
  const declared = (manifest.ui.views ?? []).find((view) => view.view_id === viewId);
  return declared?.contribution_id ?? `${manifest.plugin_id}.${viewId}`;
}

function assertKind(manifest: PluginManifest, contribution: PluginContribution): void {
  if (manifest.kind === "integration" && contribution.kind !== "integration") {
    throw new PluginContributionError(
      "plugin_contribution_kind_invalid",
      "Integration Plugin 必须返回 Integration contribution",
    );
  }
  if (manifest.kind === "app" && contribution.kind !== "app") {
    throw new PluginContributionError(
      "plugin_contribution_kind_invalid",
      "app Plugin 必须返回 app contribution",
    );
  }
}

function assertViews(manifest: PluginManifest, contribution: PluginAppContribution): string[] {
  const problems: string[] = [];
  const declared = manifest.ui.views ?? [];
  const expected = new Map(declared.map((view) => [viewContributionId(manifest, view.view_id), view.view_id]));
  const delivered = new Map<string, true>();
  for (const view of contribution.views ?? []) {
    const contributionId = view.descriptor.contribution_id;
    if (view.descriptor.plugin_id !== manifest.plugin_id) {
      problems.push(`视图 ${contributionId} 声明了别的插件身份`);
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
    if (!delivered.has(contributionId)) {
      problems.push(`声明的视图 ${viewId} 没有兑现`);
    }
  }
  return problems;
}

function assertRoutes(manifest: PluginManifest, contribution: PluginAppContribution): string[] {
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
    if (!delivered.has(routeId)) problems.push(`声明的路由 ${routeId} 没有兑现`);
  }
  return problems;
}

function assertMcp(manifest: PluginManifest, contribution: PluginAppContribution): string[] {
  const problems: string[] = [];
  const declared = new Set((manifest.mcp_exports ?? []).map((entry) => entry.tool_id));
  const delivered = new Set<string>();
  for (const binding of contribution.mcp ?? []) {
    if (!declared.has(binding.tool_id)) {
      problems.push(`MCP ${binding.tool_id} 没有在 Manifest 里声明`);
      continue;
    }
    if (delivered.has(binding.tool_id)) {
      problems.push(`MCP ${binding.tool_id} 重复提供`);
      continue;
    }
    delivered.add(binding.tool_id);
  }
  for (const toolId of declared) {
    if (!delivered.has(toolId)) problems.push(`声明的 MCP ${toolId} 没有兑现`);
  }
  return problems;
}

function assertBehaviors(manifest: PluginManifest, contribution: PluginAppContribution): string[] {
  const problems: string[] = [];
  const declared = new Set((manifest.behaviors ?? []).map((entry) => entry.behavior_id));
  const delivered = new Set<string>();
  for (const binding of contribution.behaviors ?? []) {
    if (!declared.has(binding.behavior_id)) {
      problems.push(`行为 ${binding.behavior_id} 没有在 Manifest 里声明`);
      continue;
    }
    if (delivered.has(binding.behavior_id)) {
      problems.push(`行为 ${binding.behavior_id} 重复提供`);
      continue;
    }
    delivered.add(binding.behavior_id);
  }
  if (manifest.kind === "app") {
    for (const behaviorId of declared) {
      if (!delivered.has(behaviorId)) problems.push(`声明的行为 ${behaviorId} 没有兑现`);
    }
  }
  return problems;
}

function assertHandlers(manifest: PluginManifest, contribution: PluginAppContribution): string[] {
  const problems: string[] = [];
  const subscribes = manifest.events?.subscribes ?? [];
  if (contribution.onEvent && subscribes.length === 0) {
    problems.push("提供了 onEvent 但 Manifest 没有声明任何订阅");
  }
  if (!contribution.onEvent && subscribes.length > 0) {
    problems.push("声明了事件订阅但没有提供 onEvent");
  }

  const inputs = manifest.ports?.inputs ?? [];
  if ((contribution.onUpstreamReady || contribution.onUpstreamUnavailable) && inputs.length === 0) {
    problems.push("提供了上游输入回调但 Manifest 没有声明输入端口");
  }
  if (inputs.length > 0 && !contribution.onUpstreamReady) {
    problems.push("声明了输入端口但没有提供 onUpstreamReady");
  }

  const commands = manifest.ui.commands ?? [];
  if (contribution.executeCommand && commands.length === 0) {
    problems.push("提供了 executeCommand 但 Manifest 没有声明命令");
  }
  if (commands.length > 0 && !contribution.executeCommand) {
    problems.push("声明了命令但没有提供 executeCommand");
  }
  return problems;
}

export function assertContributionMatchesManifest(
  manifest: PluginManifest,
  contribution: PluginContribution,
): void {
  assertKind(manifest, contribution);
  const problems = assertActions(manifest, contribution);
  if (contribution.kind === "app") problems.push(
    ...assertViews(manifest, contribution),
    ...assertRoutes(manifest, contribution),
    ...assertMcp(manifest, contribution),
    ...assertBehaviors(manifest, contribution),
    ...assertHandlers(manifest, contribution),
  );
  if (problems.length > 0) {
    throw new PluginContributionError("plugin_contribution_unredeemed", problems.join("；"));
  }
}

function assertActions(manifest: PluginManifest, contribution: PluginContribution): string[] {
  const problems: string[] = [];
  const expectedActions = new Set((manifest.actions ?? []).map(d => `${d.capability_id}@${d.version}`));
  const actions = new Set<string>();
  for (const h of contribution.actions ?? []) {
    const key = `${h.capability_id}@${h.version}`;
    if (!expectedActions.has(key) || actions.has(key) || typeof h.handle !== "function") problems.push(`能力 ${key} 未声明、重复或缺少处理器`);
    actions.add(key);
  }
  for (const key of expectedActions) if (!actions.has(key)) problems.push(`声明的能力 ${key} 没有兑现`);
  const expectedScenes = new Set((manifest.action_scenes ?? []).map(d => `${d.scene_id}@${d.version}`));
  const scenes = new Set<string>();
  for (const h of contribution.action_scenes ?? []) {
    const key = `${h.scene_id}@${h.version}`;
    if (!expectedScenes.has(key) || scenes.has(key) || [h.bindings, h.bind, h.consume].some(f => typeof f !== "function")) {
      problems.push(`消费场景 ${key} 未声明、重复或缺少绑定/消费实现`);
    }
    scenes.add(key);
  }
  for (const key of expectedScenes) if (!scenes.has(key)) problems.push(`声明的消费场景 ${key} 没有兑现`);
  return problems;
}
