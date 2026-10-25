import type { ProjectPluginId, ProjectPluginRegistry } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.generated.js";
import type { HomePluginEntry } from "./home-plugins.js";

// The platform's facts about the plugins this build ships, derived in this one place from the plugins' own registrations
// (W5-02 PR-B, PG-065 in specs/repository-anti-corruption/privileges.md). scripts/generate-plugin-registry.mjs writes the list
// beside the shell's copy (apps/workbench/src/builtin-plugins.ts); the Host decides from this one, never from the workbench, and
// hands the shell what it needs to draw (S-08, S-15: the start list is one).

export { PLATFORM_PLUGIN_REGISTRATIONS };

/**
 * What makes a catalog unusable (W5-02-REG-02): two entries with one project key, Manifest id or position, or a short id in
 * `companions` or `workbench.clientUses` that names no entry. scripts/generate-plugin-registry.mjs
 * refuses these in the plugins' sources; this holds the built list to the same, and the Host does not start on one.
 */
export function catalogProblems(catalog: readonly PluginRegistration[]): string[] {
  const problems: string[] = [];
  const once = (what: string, values: readonly (string | number)[]) => {
    const seen = new Set<string | number>();
    for (const value of values) {
      if (seen.has(value)) problems.push(`two plugins have ${what} ${value}`);
      seen.add(value);
    }
  };
  once("the project key", catalog.map(entry => entry.project_plugin_id));
  once("the Manifest id", catalog.map(entry => entry.manifest.plugin_id));
  once("the catalog position", catalog.map(entry => entry.catalog_order));
  const listed = new Set(catalog.map(entry => entry.project_plugin_id));
  for (const entry of catalog) {
    const named: Array<readonly [string, string]> = [
      ...(entry.companions ?? []).map(id => ["companions", id] as const),
      ...(entry.workbench.clientUses ?? []).map(id => ["workbench.clientUses", id] as const),
    ];
    for (const [field, id] of named) if (!listed.has(id)) problems.push(`${entry.project_plugin_id} names ${id} in ${field}, which is not in the catalog`);
  }
  return problems;
}

const CATALOG_PROBLEMS = catalogProblems(PLATFORM_PLUGIN_REGISTRATIONS);
if (CATALOG_PROBLEMS.length > 0) throw new Error(`Built-in plugin catalog: ${CATALOG_PROBLEMS.join("; ")}`);

/** Plugins a project can enable. Personal Plugins are always on and not listed. */
export const PROJECT_SCOPED_PLUGIN_IDS: readonly ProjectPluginId[] = PLATFORM_PLUGIN_REGISTRATIONS
  .filter(entry => entry.personal !== true)
  .map(entry => entry.project_plugin_id);

/** Personal Plugins are enabled for every project without being stored per project. */
export const PERSONAL_PLUGIN_IDS: readonly ProjectPluginId[] = PLATFORM_PLUGIN_REGISTRATIONS
  .filter(entry => entry.personal === true)
  .map(entry => entry.project_plugin_id);

/**
 * The plugins a project shows: those enabled there, and the personal ones unless the person hid them from it. The page,
 * its side panel tabs and the side panel's file sources all use this one list. A hidden mark on a 常开 plugin changes nothing: the
 * project's list of hidden plugins (`listHiddenPlugins`) leaves it out.
 */
export function shownProjectPlugins(enabled: readonly string[], hidden: readonly string[] = []): string[] {
  const excluded = new Set(hidden);
  const next = [...enabled];
  for (const personal of PERSONAL_PLUGIN_IDS) {
    if (excluded.has(personal) || next.includes(personal)) continue;
    const artifactsAt = next.indexOf("artifacts");
    if (artifactsAt >= 0) next.splice(artifactsAt, 0, personal);
    else next.push(personal);
  }
  return next;
}

/**
 * The plugins whose actions and routes a project may reach: what it shows (`shownProjectPlugins`: enabled ones, and personal ones
 * the person did not hide there) and the plugins those declare embedded. No installation or grant mutation. A personal plugin the
 * project hides is not reached even when a shown plugin embeds it: hiding is final for actions (PG-013), embedding only brings in
 * plugins the project has not hidden.
 */
export function availableProjectPluginIds(
  shown: readonly string[], catalog: readonly PluginRegistration[] = PLATFORM_PLUGIN_REGISTRATIONS,
): ReadonlySet<string> {
  const byProjectId = new Map(catalog.map(entry => [entry.project_plugin_id, entry]));
  const byManifestId = new Map(catalog.map(entry => [entry.manifest.plugin_id, entry]));
  const available = new Set<string>();
  const pending = [...shown];
  while (pending.length) {
    const id = pending.pop()!;
    const entry = byProjectId.get(id);
    if (!entry || available.has(id)) continue;
    available.add(id);
    for (const dependency of entry.manifest.ui.embedded_plugins ?? []) {
      const embedded = byManifestId.get(dependency);
      if (embedded) pending.push(embedded.project_plugin_id);
    }
  }
  const listed = new Set(shown);
  for (const entry of catalog) if (entry.personal && !listed.has(entry.project_plugin_id)) available.delete(entry.project_plugin_id);
  return available;
}

/**
 * The plugins a page shows before any project's selection is known (the fixture server's one database, a view drawn without a
 * project): the shell's page default and the personal plugins, by the Host's own registry. A project's page replaces it with the
 * project's own (`web-goals-read.ts`).
 */
export function unselectedPagePlugins(): string[] {
  return shownProjectPlugins(["goals", "inbox", "feed", "artifacts"]);
}

/** The Home Runtime's start list: each registration that runs there, under its project key, with what deleting a project clears of it. */
export function homePluginEntries(): HomePluginEntry[] {
  return PLATFORM_PLUGIN_REGISTRATIONS.flatMap(entry => entry.runtime ? [{ ...entry.runtime, key: entry.project_plugin_id, manifest: entry.manifest,
    project_data: { owner_id: entry.project_plugin_id, ...(entry.project_data ? { declaration: entry.project_data } : {}) } }] : []);
}

function entryFor(projectPluginId: ProjectPluginId): PluginRegistration | undefined {
  return PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.project_plugin_id === projectPluginId);
}

/**
 * Plugins that must come along, worked out from the Manifests. A Plugin with a **required** input port needs somebody in this
 * project able to publish that type; enabled on its own it could never be bound. Optional ports pull in nothing. The closure is
 * computed here because the Projects service applies companions one level deep: it enables what this returns, not what that in
 * turn needs.
 */
function requiredCompanions(projectPluginId: ProjectPluginId): ProjectPluginId[] {
  const producers = new Map<string, ProjectPluginId>();
  for (const entry of PLATFORM_PLUGIN_REGISTRATIONS) {
    for (const port of entry.manifest.ports?.outputs ?? []) {
      const key = `${port.artifact_type_id}@${port.schema_version}`;
      if (!producers.has(key)) producers.set(key, entry.project_plugin_id);
    }
  }
  const needed = new Set<ProjectPluginId>();
  const pending = [projectPluginId];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const manifest = entryFor(current)?.manifest;
    if (manifest === undefined) continue;
    for (const port of manifest.ports?.inputs ?? []) {
      if (port.optional === true) continue;
      const producer = producers.get(`${port.artifact_type_id}@${port.schema_version}`);
      // A required port with no producer in this build is left alone: enabling an unrelated Plugin would not help.
      if (producer === undefined || producer === projectPluginId || needed.has(producer)) continue;
      needed.add(producer);
      pending.push(producer);
    }
  }
  return [...needed];
}

/** The registry Projects validates against, derived from what this build ships. */
export const BUILTIN_PLUGIN_REGISTRY: ProjectPluginRegistry = {
  has: pluginId => PROJECT_SCOPED_PLUGIN_IDS.includes(pluginId),
  initial: () => PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => entry.default_enabled).map(entry => entry.project_plugin_id),
  companions: pluginId => [...(entryFor(pluginId)?.companions ?? []), ...requiredCompanions(pluginId)],
  isPersonal: pluginId => PERSONAL_PLUGIN_IDS.includes(pluginId),
};
