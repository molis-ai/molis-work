import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { escapeHtml } from "@molis-ai/molis-work-design-system";
import type { PluginPlatform } from "./plugin-platform.js";
import type { MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import { installedPluginStages, type AgentStudioOptions } from "./plugin-builder/agent-surface.js";
import { runningProjectPlatform } from "./project-plugins.js";

export async function withAdditionalPluginStages(view: MolisWorkWebView, options: AgentStudioOptions): Promise<MolisWorkWebView> {
  const installed = await installedPluginStages(options).catch(() => []);
  const platform = await runningProjectPlatform(options.store, options.projectId);
  const stages = [...installed, ...(platform ? runtimePluginStages(platform, view.route_prefix, view.project?.project_id, view.enabled_plugins) : [])];
  return stages.length ? { ...view, plugin_stages: [...(view.plugin_stages ?? []), ...stages.map(item => item.stage)],
    plugin_rail: [...(view.plugin_rail ?? []), ...stages.filter(item => !BUILTIN_PLUGIN_CATALOG.some(entry => entry.project_plugin_id === item.surface)).map(({ surface, label }) => ({ surface, label }))] } : view;
}

/** Project-native extensions reuse the shell's existing stages and rail. Generated
 * sandbox plugins retain their iframe path; this does not load untrusted code. */
export function runtimePluginStages(platform: PluginPlatform, routePrefix = "", projectId?: string, enabled: readonly string[] = []) {
  const builtins = new Map(BUILTIN_PLUGIN_CATALOG.map(entry => [entry.manifest.plugin_id, entry.project_plugin_id]));
  return platform.supervisor.enabledPluginIds().flatMap(pluginId => {
    const builtin = builtins.get(pluginId);
    if (builtin && !enabled.includes(builtin)) return [];
    const manifest = platform.supervisor.manifest(pluginId);
    const contribution = platform.supervisor.contribution(pluginId);
    if (!manifest || contribution?.kind !== "app") return [];
    const stages = (manifest.ui.views ?? []).filter(view => view.slot === "stage");
    return stages.flatMap((view, index) => {
      const base = builtins.get(pluginId) ?? `runtime-${pluginId.replaceAll(".", "-")}`;
      const surface = index === 0 ? base : `${base}-${view.view_id}`;
      const contributionId = view.contribution_id ?? `${pluginId}.${view.view_id}`;
      const renderer = contribution.views?.find(item => item.descriptor.contribution_id === contributionId);
      if (!renderer) throw new Error(`未兑现的插件视图：${contributionId}`);
      const prefix = `${routePrefix}/api/plugins/${encodeURIComponent(pluginId)}`;
      const asset = (routeId: string) => {
        const route = manifest.routes!.find(item => item.route_id === routeId)!;
        return escapeHtml(`${prefix}${route.path}?v=${encodeURIComponent(manifest.version)}&activation=${platform.viewRevision(pluginId)}`);
      };
      const client = renderer.client;
      if (builtins.has(pluginId) && !client) return [];
      const attributes = client ? ` data-deferred-surface data-runtime-client="${asset(client.module_route)}"${client.stylesheet_route ? ` data-runtime-style="${asset(client.stylesheet_route)}"` : ""}` : "";
      const content = renderer.render({ contribution_id: contributionId, surface: "main", model: {
        project_id: projectId, route_prefix: routePrefix, plugin_api_prefix: prefix, view_id: view.view_id,
      } });
      return { surface, label: view.title,
        stage: `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="${escapeHtml(surface)}" data-work-surface-label="${escapeHtml(view.title)}" data-installed-plugin="${escapeHtml(pluginId)}" data-runtime-api-prefix="${escapeHtml(prefix)}"${view.accepts_objects ? ' data-runtime-accepts-objects' : ''}${attributes} hidden>${client ? `<template data-deferred-content>${content}</template>` : content}</section>` };
    });
  });
}
