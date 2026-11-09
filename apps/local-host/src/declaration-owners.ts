import { pluginErrors, type PluginInstanceRecord, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { holdsInstalledEdition, pluginManifestDigest, readPluginReleaseManifest, type DeclarationOwner, type DeclarationOwners } from "@molis-ai/molis-work-plugin-runtime";
import { HOST_ARTIFACT_PRODUCERS } from "./artifact-type-registry.js";
import { heldInstalls, sameInstallScope, type InstallScope } from "./plugin-holders.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

const settingKeys = (manifest: PluginManifest): string[] => manifest.settings_entries?.entries.map(entry => entry.key) ?? [];

function exactDefinition(manifest: PluginManifest | undefined, record: PluginInstanceRecord): PluginManifest | undefined {
  return manifest?.plugin_id === record.plugin_id && manifest.version === record.version
    && manifest.publisher.publisher_id === record.publisher_id && manifest.publisher.signature === record.publisher_signature
    && pluginManifestDigest(manifest) === record.manifest_digest ? manifest : undefined;
}

/** Old keys still needed if a candidate version in this Home fails to start. Each change releases its own entry after commit or restoration. */
export function createSettingsVersionClaims() {
  const claims = new Set<{ scope: InstallScope; candidate: PluginInstanceRecord; keys: readonly string[] }>();
  return {
    hold(scope: InstallScope, candidate: PluginInstanceRecord, keys: readonly string[]) {
      const claim = { scope, candidate, keys };
      claims.add(claim);
      return () => { claims.delete(claim); };
    },
    keysFor(scope: InstallScope, record: PluginInstanceRecord): readonly string[] {
      if (record.state === "uninstalled") return [];
      for (const claim of claims) {
        if (sameInstallScope(claim.scope, scope) && holdsInstalledEdition(record, claim.candidate)) return claim.keys;
      }
      return [];
    },
  };
}
export type SettingsVersionClaims = ReturnType<typeof createSettingsVersionClaims>;

/** The plugins this build ships and the Host's own producers: their artifact names are reserved on every Home. */
const shippedOwners = (): DeclarationOwner[] => [...PLATFORM_PLUGIN_REGISTRATIONS.map(entry => ({ plugin_id: entry.manifest.plugin_id, artifacts: entry.manifest.artifacts })),
  ...HOST_ARTIFACT_PRODUCERS.map(host => ({ plugin_id: host.plugin_id, artifacts: { produces: host.produces, consumes: [] } }))];

/** A development run has only its own installation and the artifact names the build reserves (S-82). */
export function developmentDeclarationOwners() {
  const shipped = shippedOwners();
  return (): readonly DeclarationOwner[] => shipped;
}

/** Artifacts keep one owner across the Home (S-82). Settings compare the current project and Home, or all scopes when checking Home. */
export function declarationOwnersFor(home: string | null, current: NonNullable<Parameters<typeof heldInstalls>[1]>,
  running: (pluginId: string) => PluginManifest | undefined = () => undefined, versions = createSettingsVersionClaims()): DeclarationOwners {
  const shipped = shippedOwners();
  const shippedIds = new Set(shipped.map(owner => owner.plugin_id));
  const projectSettings = current.scope.kind === "project" ? { home: true, projects: new Set([current.scope.project_id]) } : undefined;
  const unreadable = (record: PluginInstanceRecord) => new Error(`读不到已装插件 ${record.plugin_id} 的 Manifest`);

  const owners: DeclarationOwners = (manifest, installId, onlySettings) => {
    const artifacts = !onlySettings && !shippedIds.has(manifest.plugin_id) && (manifest.artifacts.produces.length > 0 || !!manifest.artifacts.links?.length);
    const settings = settingKeys(manifest).length > 0;
    const artifactOwner = (record: PluginInstanceRecord) => artifacts && !shippedIds.has(record.plugin_id) && record.plugin_id !== manifest.plugin_id;
    const settingOwner = (record: PluginInstanceRecord, scope: InstallScope) => settings && record.state !== "uninstalled"
      && (scope.kind === "home" || current.scope.kind === "home" || sameInstallScope(scope, current.scope))
      && !(record.install_id === installId && sameInstallScope(scope, current.scope));
    try {
      const held = artifacts || settings ? heldInstalls(home, current, artifacts ? undefined : projectSettings,
        (record, scope) => artifactOwner(record) || settingOwner(record, scope)) : [];
      return [...onlySettings ? [] : shipped, ...held.map(item => {
        const readable = item.manifest ?? (sameInstallScope(item.scope, current.scope) ? exactDefinition(running(item.record.plugin_id), item.record) : undefined);
        if (!readable) throw unreadable(item.record);
        return { plugin_id: item.record.plugin_id,
          ...(artifactOwner(item.record) ? { artifacts: readable.artifacts } : {}),
          ...(settingOwner(item.record, item.scope) ? { settings: [...settingKeys(readable), ...versions.keysFor(item.scope, item.record)] } : {}),
        };
      })];
    } catch (error) {
      const declarations = artifacts && settings ? "成果类型、链接种类和设置键" : artifacts ? "成果类型和链接种类" : "设置键";
      throw pluginErrors.definition_conflict(`${manifest.plugin_id} 声明的${declarations}，现在核不了有没有被别的插件占着（${error instanceof Error ? error.message : String(error)}）`);
    }
  };
  owners.retainSettings = (previous, candidate, target, oldDefinition) => {
    try {
      const old = exactDefinition(oldDefinition, previous) ?? readPluginReleaseManifest(current.db, previous);
      if (!old) throw unreadable(previous);
      const next = new Set(settingKeys(target));
      const lost = settingKeys(old).filter(key => !next.has(key));
      return lost.length ? versions.hold(current.scope, candidate, lost) : undefined;
    } catch (error) {
      throw pluginErrors.definition_conflict(`换版前核不了旧设置声明（${error instanceof Error ? error.message : String(error)}）`);
    }
  };
  return owners;
}
