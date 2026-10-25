/**
 * The Manifest of a plugin that runs in the Host's sandbox. Every sandbox plugin has the same shape of Manifest: one local
 * entrypoint, one call route, the private storage grant, one `stage` view. The plugin studio builds it for what it generates and the
 * Host rebuilds it from a sandbox package to check the package's own Manifest against it; this is the one place that writes it.
 */
import type { PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import { PLUGIN_PRESENTATION_CAPABILITY } from '@molis-ai/molis-work-design-system';

export const sandboxUiContribution = (pluginId: string) => pluginId + '.ui.v1';

export interface SandboxManifestInput {
  pluginId: string;
  version: string;
  /** What the person sees as the plugin's name (and its page title). */
  name: string;
  publisher: PluginManifest['publisher'];
  /** Whether the plugin lays its pages out with the Host's page-composition renderer. */
  presentation: boolean;
  /** Versions this one upgrades from; empty or absent for a first release. */
  compatibleFrom?: readonly string[];
}

export function sandboxPluginManifest(input: SandboxManifestInput): PluginManifest {
  const uiId = sandboxUiContribution(input.pluginId);
  return {
    schema_version: 2, host_api_version: 2, plugin_id: input.pluginId, version: input.version, name: input.name, kind: 'app',
    publisher: input.publisher,
    entrypoints: [{ deployment: 'local', entrypoint: './plugin.mjs' }],
    ...(input.compatibleFrom?.length ? { upgrade_compatibility: { compatible_from_versions: [...input.compatibleFrom] } } : {}),
    permissions: [{ permission: 'storage:private', required: true, reason: '保存这个插件自己的数据' }],
    capabilities: { provides: [], consumes: input.presentation ? [PLUGIN_PRESENTATION_CAPABILITY.capability_id] : [] }, artifacts: { produces: [], consumes: [] },
    ...(input.presentation ? { requires: [{ ...PLUGIN_PRESENTATION_CAPABILITY, reason: '此插件需要整页组合与详情渲染器 v1' }] } : {}),
    routes: [{ route_id: 'studio.call', method: 'POST', path: '/call' }],
    ui: { contributions: [uiId], views: [{ view_id: 'app', slot: 'stage', title: input.name, contribution_id: uiId }] },
  };
}
