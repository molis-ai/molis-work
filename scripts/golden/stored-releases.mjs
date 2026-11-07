// A plugin release is kept with its code so that an installed version can go on running when the code of this build cannot take over
// (specs/upgrade-continuity/golden-replay-design.md §6, the fallback in PluginSupervisor's #resolveInstalledEntry). This is why a golden holds the
// code itself and not a checksum, so the replay proves that what it restored still runs.
import { copyFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { goldenFailure } from "./failure.mjs";

const { nativePluginReleaseArtifact, PLATFORM_PLUGIN_REGISTRATIONS } = await import("@molis-ai/molis-work-app-local-host");
const { NativePluginExecutor, PluginRuntime, PluginSupervisor, pluginManifestDigest, SqlitePluginRuntimeReleaseArtifactRepository, SqlitePluginRuntimeRepository } = await import("@molis-ai/molis-work-plugin-runtime");

/** The plugin whose fallback runs for real: it needs no service from the Host, so nothing but the stored code decides whether it starts. */
const FALLBACK_PACKAGE = "@molis-ai/molis-work-plugin-text-stats";
const FALLBACK_ACTION = "text-stats.count";
const FALLBACK_INPUT = { text: "一行\nline" }, FALLBACK_ANSWER = '{"characters":7,"utf8_bytes":11,"lines":2}';

/**
 * Stored code that does not load through the product's restore (`nativePluginReleaseArtifact(...).restore`, a `data:` URL import): the bundle needs a
 * file URL of its own, or a CommonJS `require`. Harmless only while nothing reaches it, see the note on the fallback below. Exact on purpose: another
 * plugin breaking fails this replay, and so does one of these starting to load, so the table cannot go stale.
 */
const KNOWN_UNLOADABLE = new Map([
  ["createCodingPlugin", 'Dynamic require of "path" is not supported'],
  ["createFeedPlugin", 'Dynamic require of "path" is not supported'],
  ["createGoalsPlugin", "Invalid URL"],
  ["createHomeGoalsPlugin", "Invalid URL"],
]);

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

/**
 * The fallback itself, on a copy of a restored library. A build whose version does not read the installed one, and whose own code would refuse to
 * start, is offered over the installation: only the stored code can be what comes up, at the installed version, and it answers.
 * Neither the candidate nor, on this copy, the installation has `host` trust, and that is the only way to reach this branch today: a build of the
 * Host always takes over (`directlyUsable`), and a candidate without `host` trust may not start over an installation that has it. So every release
 * a golden holds is one the product would not fall back to as things stand. What this proves is that the branch brings up the restored bytes and they answer.
 */
async function assertInstalledVersionKeepsRunning(library) {
  const declaration = declarations().find(item => item.package_name === FALLBACK_PACKAGE), current = declaration.create();
  const pluginId = current.manifest.plugin_id, scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "golden-fallback-")));
  const where = `stored-release/${pluginId}`;
  const refusesToStart = async () => { throw goldenFailure("golden.incompatible_build_started", where); };
  const newer = { ...current, start: refusesToStart, manifest: { ...current.manifest, version: "999.0.0" } };
  const copy = path.join(scratch, "molis-work.db");
  copyFileSync(library, copy);
  const db = new DatabaseSync(copy, { defensive: false });
  try {
    const records = new SqlitePluginRuntimeRepository(db);
    const installed = records.list().find(record => record.plugin_id === pluginId && record.state !== "uninstalled");
    if (!installed) throw goldenFailure("golden.stored_release_missing", where);
    records.save({ ...installed, publisher_trust: "unsigned" });
    let offered;
    const registry = { registerProvider(registration) { offered = registration; return () => undefined; } };
    const runtime = new PluginRuntime(records, new NativePluginExecutor(), { hostIds: new Set(), actions: { registry } });
    const supervisor = new PluginSupervisor(runtime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
    const report = await supervisor.start([{ definition: newer, releaseArtifact: releaseOf(declaration) }]);
    if (!report.running.includes(pluginId) || supervisor.manifest(pluginId)?.version !== installed.version) throw goldenFailure("golden.stored_release_not_running", where);
    const handler = offered?.handlers.find(action => action.capability_id === FALLBACK_ACTION);
    const answer = handler && await handler.handle({ actor_id: "golden", project_id: null, audience: "user", permissions: [], beforeEffect: async () => undefined }, FALLBACK_INPUT);
    if (JSON.stringify(answer) !== FALLBACK_ANSWER) throw goldenFailure("golden.stored_release_wrong_answer", where);
    await runtime.stop(installed.install_id);
  } finally {
    db.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Over the libraries of a restored golden Home. Returns how many different stored codes loaded, and which are the known ones that do not. */
export async function assertStoredReleasesRun(manifest, homes, home) {
  const seen = new Map();
  for (const entry of manifest.stores) if (entry.tables.plugin_runtime_release_artifacts) await checkEveryRelease(path.join(home, entry.path), seen);
  const failures = [...seen.values()].filter(Boolean);
  if (seen.size === failures.length) throw goldenFailure("golden.stored_release_missing", "plugin_runtime_release_artifacts");
  await assertInstalledVersionKeepsRunning(homes[0].projects[0].database_path);
  return { loaded: seen.size - failures.length, known_unloadable: [...new Set(failures)].sort() };
}
