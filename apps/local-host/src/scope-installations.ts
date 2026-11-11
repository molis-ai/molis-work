import { isDeepStrictEqual } from "node:util";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { skillErrors } from "@molis-ai/molis-work-contracts/services/skills";
import { installedHomePlugins, installedPluginsInProject, type ProjectPluginHost } from "./project-plugin-ports.js";
import { pluginInstallRecords } from "./plugin-install-records.js";
import type { InstalledPluginEntry } from "./plugin-installed-view.js";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { KitSource } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { PluginPublisherPin } from "@molis-ai/molis-work-contracts/platform/plugin-trust";

/** One installation a call's scope reaches: the Home's, or the calling project's, with a check that it is still the one read. */
export interface ScopeInstallation extends InstalledPluginEntry {
  scope: "home" | "project";
  /** The captured installation still holds (its identity and state); throws `not_current` otherwise. */
  assertCurrent(): void;
}

/** Installation identity, including its current state, is rechecked after any asynchronous permission check. */
function currentInstallation(record: PluginInstanceRecord, current: () => PluginInstanceRecord | null): () => void {
  const identity = (value: PluginInstanceRecord) => [value.install_id, value.installation_generation, value.plugin_id, value.version,
    value.publisher_signature, value.manifest_digest, value.state];
  const expected = identity(record);
  return () => {
    const now = current();
    if (!now || !isDeepStrictEqual(identity(now), expected)) throw skillErrors.read_refused("技能所在的安装已变化，请重新选择", { reason: "not_current" });
  };
}

/**
 * The installations a call reaches, read once: the Home's and, with a project, the project's. A project installation shadows the same
 * identity's Home installation; two publishers remain distinct. The Skill catalog and the AI kit's reporters read the same list.
 */
export async function scopeInstallations(source: ProjectPluginHost, caller: ActionCallContext): Promise<{ reference?: LocalHostProjectReference; installations: ScopeInstallation[] }> {
  const reference = caller.project_id ? source.host.projects().find(project => project.project_id === caller.project_id) : undefined;
  if (caller.project_id && !reference) throw new ActionError("actions.scope_mismatch", "需要当前项目");
  const homeRows = await installedHomePlugins(source.homePlugins());
  const projectRows = reference ? await installedPluginsInProject(source, reference.project_id) : [];
  const projectChecks = reference ? await source.host.withRuntime(reference, runtime => {
    const records = pluginInstallRecords(runtime.store.db);
    return new Map(projectRows.map(({ record }) => [record.install_id, currentInstallation(record, () => records.get(record.install_id))]));
  }) : new Map<string, () => void>();
  const installations = new Map<string, ScopeInstallation>([
    ...homeRows.map(row => [row.record.install_id, { ...row, scope: "home" as const,
      assertCurrent: currentInstallation(row.record, () => source.homePlugins()?.installation(row.record.install_id) ?? null) }] as const),
    ...projectRows.map(row => [row.record.install_id, { ...row, scope: "project" as const, assertCurrent: projectChecks.get(row.record.install_id)! }] as const),
  ]);
  return { reference, installations: [...installations.values()] };
}

/**
 * Installations taken off with their data kept, in the call's scope: the AI kit shows each as a header with the way back (§4.4).
 * Read from the install records, which keep them; nothing of what they held is read.
 */
export async function keptUninstalled(source: ProjectPluginHost, reference: LocalHostProjectReference | undefined): Promise<PluginInstanceRecord[]> {
  const kept = (records: readonly PluginInstanceRecord[]) => records.filter(record => record.state === "uninstalled" && record.retain_private_data);
  const home = kept(source.homePlugins()?.installations() ?? []);
  const project = reference ? await source.host.withRuntime(reference, runtime => kept(pluginInstallRecords(runtime.store.db).list())) : [];
  return [...home, ...project];
}

/**
 * Who an installation is, as the AI kit names a plugin source (§4.5): from the install record and its verified Manifest, never from what
 * a plugin says. `localKey` is this Home's own publisher key, `pins` the ledger's publisher pins read once for the call.
 */
export function kitPluginSource(record: PluginInstanceRecord, manifest: PluginManifest | undefined, context: { localKey: string | null; pins: ReadonlyMap<string, PluginPublisherPin>; locale?: string }): Extract<KitSource, { kind: "plugin" }> {
  const words = context.locale === "en" ? manifest?.ui?.translations ?? {} : {}, name = manifest?.name ?? record.plugin_id;
  return { kind: "plugin", plugin_id: record.plugin_id, title: words[name] ?? name, version: record.version, install_id: record.install_id,
    publisher_label: context.pins.get(record.publisher_signature)?.label ?? manifest?.publisher.publisher_id ?? record.publisher_id,
    trust: record.publisher_trust === "host" ? "host" : record.publisher_signature === context.localKey ? "home_local" : "pinned" };
}
