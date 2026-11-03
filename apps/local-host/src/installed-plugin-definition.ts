import type { PluginDefinition, PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxEffects, SandboxIdentity } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import { sandboxedPluginDefinition } from './plugin-builder/installed.js';
import type { CatalogCapability } from './plugin-builder/catalog.js';
import type { InstalledRelease } from './installed-release.js';
import { covered } from './installed-plugin-lifecycle.js';

/** What a project's installed plugins and the Home's both build their sandboxed definitions from (BL-628). */
export interface InstalledDefinitionPorts {
  catalog(): Promise<CatalogCapability[]>;
  capabilityFor(live: (identity: Readonly<SandboxIdentity>) => boolean): NonNullable<SandboxServices['capability']>;
  network: NonNullable<SandboxServices['network']>;
  /** Throws when the installation this identity names is no longer the running one. */
  assertInstalled(identity: Readonly<SandboxIdentity>): void;
  /** The earlier versions of a studio release a later one is compatible with; none for a package. */
  earlier(release: InstalledRelease): readonly number[];
  /** A project package's executor has no Home services; hold only its verified Agent declarations while this definition runs. */
  holdAgentDefinitions?(definition: PluginDefinition, installId: string): (() => void) | undefined;
  /** An integration package's definition (BL-530): only the Home's instance runs them, so only the Home gives this. */
  integration?(release: InstalledRelease, approved: SandboxEffects, assertLive: (identity: Readonly<SandboxIdentity>) => void): PluginDefinition;
}

const keyOf = (release: InstalledRelease) => JSON.stringify([release.pluginId, release.buildId, release.version, release.packaged?.manifest.version ?? null]);

/**
 * The sandboxed definition of each release, built once: Plugin Runtime keeps the implementation of a release across version switches, so
 * a rollback must hand it the same object. Every Host call the sandbox makes first checks that its installation is still the running one.
 */
export function installedDefinitions(ports: InstalledDefinitionPorts) {
  const definitions = new Map<string, { pluginId: string; value: PluginDefinition }>();
  return {
    definition(release: InstalledRelease, approved: SandboxEffects): PluginDefinition {
      if (!covered(release.permissions, approved)) throw new Error('此版本的安装批准不足，请重新确认权限');
      const prior = definitions.get(keyOf(release));
      if (prior) return prior.value;
      if (release.packaged?.manifest.kind === 'integration') {
        if (!ports.integration) throw new Error('集成包只装进 Home');
        const value = ports.integration(release, release.permissions, ports.assertInstalled);
        definitions.set(keyOf(release), { pluginId: release.pluginId, value });
        return value;
      }
      const capability = ports.capabilityFor(() => true);
      const guard = <Context extends { identity: Readonly<SandboxIdentity>; signal: AbortSignal; beforeEffect?(): Promise<void> | void }>(context: Context): Context & { beforeEffect(): Promise<void> } => ({ ...context, beforeEffect: async () => {
        await context.beforeEffect?.(); context.signal.throwIfAborted(); ports.assertInstalled(context.identity);
      } });
      const sandbox = sandboxedPluginDefinition(release, release.permissions, [...ports.earlier(release)], {
        capabilities: ports.catalog, assertLive: ports.assertInstalled,
        capability: { async call(context, id, input) { const guarded = guard(context); await guarded.beforeEffect(); return capability.call(guarded, id, input); } },
        network: { async request(context, input, authorization) { const guarded = guard(context); await guarded.beforeEffect(); return ports.network.request(guarded, input, authorization); } },
      }, release.packaged?.manifest);
      let withdraw: (() => void) | undefined;
      const value: PluginDefinition = release.packaged && ports.holdAgentDefinitions ? { ...sandbox,
        async start(context) {
          const held = ports.holdAgentDefinitions!(value, context.install_id); withdraw = held;
          try { return await sandbox.start(context); }
          catch (error) { if (withdraw === held) withdraw = undefined; held?.(); throw error; }
        },
        async stop(context) {
          const held = withdraw; withdraw = undefined;
          try { await sandbox.stop?.(context); } finally { held?.(); }
        },
      } : sandbox;
      definitions.set(keyOf(release), { pluginId: release.pluginId, value });
      return value;
    },
    /** The Manifest a release was started with, for the declaration its capability calls run under (S-15). */
    manifestOf(release: InstalledRelease): PluginManifest | undefined { return definitions.get(keyOf(release))?.value.manifest; },
    /** An uninstalled plugin's code is not kept. */
    forget(pluginId: string): void { for (const [key, entry] of definitions) if (entry.pluginId === pluginId) definitions.delete(key); },
  };
}
