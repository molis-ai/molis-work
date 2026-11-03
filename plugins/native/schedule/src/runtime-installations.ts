import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstallationClient, PluginInstallationView } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { OperationRecoveryInstallation } from "./operation-management.js";
import type { ReminderRecoveryInstallation } from "./reminder-management.js";

/** The public Runtime directory owns identity; the public action directory owns callable functions. */
export function scheduleInstallations(installations: PluginInstallationClient, observed: readonly PluginInstallationView[], views: readonly ActionView[]) {
  const current = (pluginId: string) => {
    const matches = installations.list().filter(item => item.plugin_id === pluginId && item.state === "running");
    return matches.length === 1 ? matches[0]! : null;
  };
  const reminder = (pluginId: string): ReminderRecoveryInstallation | null => {
    const record = current(pluginId);
    return record ? { installation_id: record.install_id, generation: record.installation_generation, title: record.name,
      version: record.version, publisher: record.publisher_id } : null;
  };
  const operations = (pluginId: string): Map<string, ActionView> => {
    const record = current(pluginId), before = observed.find(item => item.install_id === record?.install_id);
    if (!record || !before || before.installation_generation !== record.installation_generation || before.version !== record.version) return new Map();
    const groups = new Map<string, ActionView[]>();
    for (const view of views) {
      if (view.provider.plugin_id !== pluginId || view.provider.plugin_install_id !== record.install_id || !view.availability.available) continue;
      const name = view.action.local_id ?? view.capability_id;
      const versions = groups.get(name) ?? []; versions.push(view); groups.set(name, versions);
    }
    const selected = new Map<string, ActionView>();
    for (const [name, versions] of groups) {
      // A name cannot silently choose between separate public functions/providers.
      if (new Set(versions.map(item => JSON.stringify([item.capability_id, item.provider.provider_id]))).size !== 1) continue;
      selected.set(name, versions.reduce((latest, item) => latest.version > item.version ? latest : item));
    }
    return selected;
  };
  const operation = (pluginId: string): OperationRecoveryInstallation | null => {
    const record = current(pluginId), available = operations(pluginId);
    return record && available.size ? { installationId: record.install_id, generation: record.installation_generation,
      title: record.name, version: record.version, publisher: record.publisher_id,
      operations: [...available].map(([id, view]) => ({ id, description: view.action.title })) } : null;
  };
  const matches = (pluginId: string, installId: string | null, generation: string | null | undefined) => {
    const record = installId ? installations.get(installId) : null;
    return !!record && record.state !== "uninstalled" && record.plugin_id === pluginId && record.installation_generation === generation;
  };
  return { current, reminder, operation, operations, matches };
}
