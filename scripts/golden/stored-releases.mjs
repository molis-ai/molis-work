// A plugin release is kept with its code so that an installed version can go on running when the code of this build cannot take over
// (specs/upgrade-continuity/golden-replay-design.md §6, the fallback in PluginSupervisor's #resolveInstalledEntry). This is why a golden holds the
// code itself and not a checksum, so the replay proves that what it restored still runs.
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { goldenFailure } from "./failure.mjs";

const { nativePluginReleaseArtifact, PLATFORM_PLUGIN_REGISTRATIONS } = await import("@molis-ai/molis-work-app-local-host");
const { pluginManifestDigest, SqlitePluginRuntimeReleaseArtifactRepository } = await import("@molis-ai/molis-work-plugin-runtime");
const { assertInstalledVersionKeepsRunning } = await import(new URL("../../tests/fixtures/stored-release-fallback.mjs", import.meta.url).href);

/**
 * Stored code that does not load through the product's restore (`nativePluginReleaseArtifact(...).restore`, a `data:` URL import): the bundle needs a
 * file URL of its own, or a CommonJS `require`. Harmless only while nothing reaches it, see the note in tests/fixtures/stored-release-fallback.mjs. Exact on purpose: another
 * plugin breaking fails this replay, and so does one of these starting to load, so the table cannot go stale.
 */
const KNOWN_UNLOADABLE = new Map([
  ["createCodingPlugin", 'Dynamic require of "path" is not supported'],
  ["createFeedPlugin", 'Dynamic require of "path" is not supported'],
  ["createGoalsPlugin", "Invalid URL"],
  ["createHomeGoalsPlugin", "Invalid URL"],
]);

/** The plugin whose fallback runs for real: it needs no service from the Host, so nothing but the stored code decides whether it starts. */
const FALLBACK_PACKAGE = "@molis-ai/molis-work-plugin-text-stats";

const declarations = () => PLATFORM_PLUGIN_REGISTRATIONS.flatMap(entry => [entry.project_runtime, entry.runtime].filter(Boolean));
const releaseOf = declaration => nativePluginReleaseArtifact(declaration.package_name, declaration.factory_export, factory => factory());

/** One stored code, against the plugin it was stored as. Undefined if it loaded, or its export name if it is one of the known ones that do not. */
async function loadFailure(release, where) {
  const exportName = JSON.parse(release.module_source).export_name, declaration = declarations().find(item => item.factory_export === exportName);
  if (!declaration) throw goldenFailure("golden.stored_release_undeclared", where);
  const known = KNOWN_UNLOADABLE.get(exportName);
  let definition;
  try { definition = await releaseOf(declaration).restore(release.module_source); } catch (error) {
    if (error?.message !== known) throw goldenFailure("golden.stored_release_unloadable", where);
    return exportName;
  }
  if (known) throw goldenFailure("golden.stored_release_loads_now", where);
  if (pluginManifestDigest(definition.manifest) !== release.manifest_digest) throw goldenFailure("golden.stored_release_changed", where);
  return undefined;
}

/** Every stored release in a library, each different code once: rows repeat across libraries. */
async function checkEveryRelease(file, seen) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const stored = new SqlitePluginRuntimeReleaseArtifactRepository(db);
    for (const declaration of declarations()) {
      const { manifest } = declaration.create();
      for (const release of stored.list(manifest.plugin_id, manifest.publisher.signature)) {
        if (seen.has(release.module_source)) continue;
        seen.set(release.module_source, await loadFailure(release, `${path.basename(file)}#${release.plugin_id}@${release.version}`));
      }
    }
  } finally { db.close(); }
}

/** Over the libraries of a restored golden Home. Returns how many different stored codes loaded, and which are the known ones that do not. */
export async function assertStoredReleasesRun(manifest, homes, home) {
  const seen = new Map();
  for (const entry of manifest.stores) if (entry.tables.plugin_runtime_release_artifacts) await checkEveryRelease(path.join(home, entry.path), seen);
  const failures = [...seen.values()].filter(Boolean);
  if (seen.size === failures.length) throw goldenFailure("golden.stored_release_missing", "plugin_runtime_release_artifacts");
  const declaration = declarations().find(item => item.package_name === FALLBACK_PACKAGE);
  await assertInstalledVersionKeepsRunning(homes[0].projects[0].database_path, declaration.create(), releaseOf(declaration));
  return { loaded: seen.size - failures.length, known_unloadable: [...new Set(failures)].sort() };
}
