import { AsyncLocalStorage } from "node:async_hooks";
import { ActionError, type ActionReference, type ActionRegistryPort } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors, type PluginInstanceRecord, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginManifestDigest, readPluginReleaseManifest, type PluginRuntimeDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { sandboxOperationActions } from "@molis-ai/molis-work-plugin-sdk";
import { presentationCatalog, validatePresentationDeclaration } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { HomeLine } from "./home-line.js";
import { fixtureDeclarationsFor } from "./home-side.js";
import { installedPluginEntries } from "./plugin-installation-directory.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { SandboxPackageStore } from "./sandbox-package-store.js";

/** Composition-only read of the system registry. No caller, availability test, or plugin startup. */
export interface SurfaceInstallRegistry extends ActionRegistryPort {
  presentationSystemActions?(): readonly ActionReference[];
}

export interface SurfaceInstallCatalog {
  projectId: string | null;
  home?: string;
  db?: PluginRuntimeDatabase;
  pending?: readonly PluginManifest[];
  registry?: SurfaceInstallRegistry;
}

/** One Home owns this scope through the last Runtime effect, whichever project requested the change. */
export function createHomeInstallationScope(options: {
  ready(): Promise<unknown>;
  current(): boolean;
  catalog(): SurfaceInstallCatalog;
}) {
  const line = new HomeLine();
  const assertOpen = () => {
    if (!options.current()) throw new ActionError("actions.plugin_unavailable", "Home 插件宿主已关闭");
  };
  return {
    catalog: options.catalog,
    async run<Result>(operation: (assertOpen: () => void) => Promise<Result>): Promise<Result> {
      await options.ready();
      assertOpen();
      return line.run(async () => { assertOpen(); return operation(assertOpen); });
    },
    settled: () => line.settled(),
  };
}

const releaseIdentity = (manifest: PluginManifest) =>
  JSON.stringify([manifest.plugin_id, manifest.publisher.publisher_id, manifest.publisher.signature, manifest.version, pluginManifestDigest(manifest)]);
const hasRelease = (manifest: PluginManifest, record: PluginInstanceRecord) => manifest.plugin_id === record.plugin_id
  && manifest.publisher.publisher_id === record.publisher_id && manifest.publisher.signature === record.publisher_signature
  && manifest.version === record.version && pluginManifestDigest(manifest) === record.manifest_digest;

type ScopedCheck = { active: boolean; projectId: string | null; identity: string } & (
  { system: readonly ActionReference[] }
  | { runtime: object; ownsMoved(): boolean; ownsRestored(): boolean }
);
const checks = new AsyncLocalStorage<ScopedCheck>();

async function scopedCheck<Result>(check: ScopedCheck, operation: () => Promise<Result>): Promise<Result> {
  try { return await checks.run(check, operation); }
  finally { check.active = false; }
}

function startingManifests(catalog: SurfaceInstallCatalog, scope: "home" | "project"): readonly PluginManifest[] {
  return catalog.pending ?? [
    ...PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => scope === "home" ? entry.runtime : entry.project_runtime).map(entry => entry.manifest),
    ...fixtureDeclarationsFor(catalog.home, scope).map(entry => entry.definition.manifest),
  ];
}

function installedActions(catalog: SurfaceInstallCatalog, candidate: PluginManifest, scope: "home" | "project", pending: Map<string, PluginManifest>): ActionReference[] {
  const db = catalog.db;
  if (!db) return [];
  const packages = catalog.home ? new SandboxPackageStore(catalog.home) : undefined;
  return installedPluginEntries(db).flatMap(({ record, manifest }) => {
    const planned = pending.get(record.plugin_id);
    pending.delete(record.plugin_id);
    if (record.plugin_id === candidate.plugin_id) return [];
    const archived = manifest && hasRelease(manifest, record) ? manifest : readPluginReleaseManifest(db, record);
    // A plugin of the Host's build runs over its record at the build's Manifest whatever release the record holds (followHostBuild,
    // docs/releases/POLICY.md §7), so its declared actions are the build's; a built-in release left by an earlier build is not refused.
    const followed = record.publisher_trust === "host" && planned?.publisher.signature === record.publisher_signature ? planned : undefined;
    const source = followed ?? (archived && hasRelease(archived, record) ? archived : planned && hasRelease(planned, record) ? planned : undefined);
    if (source && (source.kind !== "app" || source.actions?.length || record.publisher_trust !== "pinned")) {
      return (source.actions ?? []).filter(action => action.action.scope === scope);
    }
    const kept = record.publisher_trust === "pinned" && packages?.load(record.plugin_id, record.publisher_signature, record.version);
    if (!kept || !kept.packaged || !hasRelease(kept.packaged.manifest, record)) {
      throw pluginErrors.declaration_invalid(`读不到已装插件 ${record.plugin_id} 的呈现动作声明`);
    }
    if (kept.packaged.manifest.kind !== "app") return [];
    return sandboxOperationActions({ contract: kept.design.contract, buildId: kept.buildId, version: kept.version, title: kept.design.title, scope });
  });
}

/** Runtime and signed-package confirmation ask the same complete declaration directory. */
export function assertSurfacePresentation(candidate: PluginManifest, catalog: SurfaceInstallCatalog, runtime?: object, rollback = false) {
  if (candidate.presentation === undefined) return;
  const seen = checks.getStore();
  const current = seen?.active && seen.projectId === catalog.projectId && seen.identity === releaseIdentity(candidate) ? seen : undefined;
  if (rollback && current && "runtime" in current && current.runtime === runtime) {
    const check = (owned: () => boolean) => {
      if (!current.active || !owned()) throw new ActionError("actions.provider_replaced", "原安装已变化，不能恢复旧发行物");
    };
    check(current.ownsMoved);
    return { beforeCommit: () => check(current.ownsMoved), assertRestored: () => check(current.ownsRestored) };
  }
  const system = current && "system" in current ? current.system : catalog.registry?.presentationSystemActions?.() ?? [];
  const scope = catalog.projectId === null ? "home" : "project";
  const pending = new Map(startingManifests(catalog, scope).map(manifest => [manifest.plugin_id, manifest]));
  const installed = installedActions(catalog, candidate, scope, pending);
  pending.delete(candidate.plugin_id);
  const declared = [...pending.values()].flatMap(manifest => (manifest.actions ?? []).filter(action => action.action.scope === scope));
  const problems = validatePresentationDeclaration(candidate, presentationCatalog([...system, ...installed, ...declared, ...(candidate.actions ?? [])], true));
  if (problems.length) throw pluginErrors.declaration_invalid(problems.join("\n"));
}

export function withSurfacePresentationCheck<Result>(candidate: PluginManifest, catalog: SurfaceInstallCatalog, operation: () => Promise<Result>): Promise<Result> {
  const system = catalog.registry?.presentationSystemActions?.() ?? [];
  return scopedCheck({ active: true, projectId: catalog.projectId, identity: releaseIdentity(candidate), system }, async () => {
    assertSurfacePresentation(candidate, catalog);
    return operation();
  });
}

/** Only the exact edition captured before this failed version switch, while that switch still owns the installation. */
export function withSurfaceRestoration<Result>(candidate: PluginManifest, original: PluginInstanceRecord, projectId: string | null,
  runtime: object, ownership: { ownsMoved(): boolean; ownsRestored(): boolean }, operation: () => Promise<Result>): Promise<Result> {
  if (candidate.presentation === undefined) return operation();
  if (!hasRelease(candidate, original) || !ownership.ownsMoved()) throw new ActionError("actions.provider_replaced", "原安装已变化，不能恢复旧发行物");
  return scopedCheck({ active: true, projectId, identity: releaseIdentity(candidate), runtime, ...ownership }, operation);
}
