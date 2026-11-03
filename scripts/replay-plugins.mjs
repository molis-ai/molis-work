#!/usr/bin/env node
// Plugin replay (docs/system/CONTRACT-CHANGES.md §4 item 7, W4-01): after a change to a contract or the runtime, the plugins
// already out there must still load, upgrade and run. Each sample of the corpus (tests/fixtures/replay-plugins/corpus.json) is
// loaded and its Manifest checked as every plugin's is, then started in a one-off Home as a plugin the Host does not ship
// (unsigned, the same entry as an installed one), one declared action is invoked, the plugin is upgraded to a next version that
// names the current one in `upgrade_compatibility`, and the action is invoked again. Run it on the built workspace (`pnpm build`).
//
//   node scripts/replay-plugins.mjs                 replay the corpus, one line per sample; exit 1 if any sample fails
//   node scripts/replay-plugins.mjs --json          the same as one JSON report on stdout
//   node scripts/replay-plugins.mjs --corpus <file> another corpus (the tests' broken samples)
//
// A packed sample is the package as `pnpm pack` ships it, unpacked next to a link to the workspace's dependencies; a built-in one
// (`built_in`) is enabled in the project, checked to be the version the Host ships, and its packed code comes in as the upgrade.
// A directory sample is imported where it is. Nothing reads or writes a real Home: every sample gets its own temporary one.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const corpusFile = path.resolve(root, args.includes("--corpus") ? args[args.indexOf("--corpus") + 1] : "tests/fixtures/replay-plugins/corpus.json");
const json = args.includes("--json");

const { parsePluginManifest } = await import("@molis-ai/molis-work-plugin-sdk");
const { MolisWorkLocalHost, molisWorkHostProjectReference, runningProjectPlatform } = await import("@molis-ai/molis-work-app-local-host");
const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");

/** The sample's definition factory, from the directory or from the packed package; `scratch` holds what unpacking writes. */
async function loadFactory(sample, scratch) {
  if (sample.source.kind === "directory") {
    const module = await import(pathToFileURL(path.resolve(path.dirname(corpusFile), sample.source.path, sample.source.entry)).href);
    const exported = module[sample.source.export];
    return typeof exported === "function" ? exported : () => exported;
  }
  if (sample.source.kind === "packed") {
    const packed = path.join(scratch, "packed");
    mkdirSync(packed);
    const tarball = execFileSync("pnpm", ["pack", "--pack-destination", packed], { cwd: path.join(root, sample.source.package), encoding: "utf8" }).trim().split("\n").at(-1);
    execFileSync("tar", ["-xzf", path.resolve(packed, path.basename(tarball)), "-C", packed]);
    // The unpacked package resolves its dependencies where an installed one would find them: a node_modules beside it.
    symlinkSync(path.join(root, "node_modules"), path.join(packed, "node_modules"));
    const module = await import(pathToFileURL(path.join(packed, "package", sample.source.entry)).href);
    return module[sample.source.export];
  }
  throw new Error(`unknown source kind ${sample.source.kind}`);
}

/** The next patch version, which declares the current one compatible: the upgrade an author ships without a migration. */
function nextVersion(definition) {
  const [major, minor, patch] = definition.manifest.version.split(".").map(Number);
  const version = `${major}.${minor}.${patch + 1}`;
  return { ...definition, manifest: { ...definition.manifest, version, upgrade_compatibility: { compatible_from_versions: [definition.manifest.version] } } };
}

async function replay(sample) {
  const scratch = mkdtempSync(path.join(tmpdir(), "replay-plugins-")), home = path.join(scratch, "home");
  const steps = { load: null, run: null, upgrade: null, run_after_upgrade: null };
  let host;
  try {
    mkdirSync(home);
    const factory = await loadFactory(sample, scratch), definition = factory();
    parsePluginManifest(JSON.parse(JSON.stringify(definition.manifest)));
    steps.load = { plugin_id: definition.manifest.plugin_id, version: definition.manifest.version };

    // A built-in is replayed in its own slot: the Host already runs the shipped copy under the plugin's id (one id is one plugin, and
    // its actions are registered once), so the packed copy must be that same plugin, and it comes in as the installation's upgrade.
    const builtIn = sample.built_in === true, installed = new Set();
    host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, ...(builtIn ? {} : { pluginFixtures: { project: [definition], installed } }) });
    const project = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => {
      const created = await catalog.createProject({ display_name: `Replay ${sample.id}`, actor_id: "owner" });
      if (builtIn) await catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: sample.project_plugin_id, actor_id: "owner" });
      return created;
    });
    const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    const invoke = async () => {
      const owner = await host.localPersonContext(ref), client = host.actionClient(ref);
      const offered = (await client.discover(owner)).find(view => view.capability_id === sample.action.capability_id && view.version === sample.action.version);
      if (!offered) {
        const platform = await host.withProject(ref, runtime => runningProjectPlatform(runtime.store, project.project_id));
        const record = platform?.runtime.list().find(item => item.plugin_id === definition.manifest.plugin_id);
        const state = platform?.supervisor.state(definition.manifest.plugin_id);
        throw new Error(`${sample.action.capability_id}@${sample.action.version} is not in the project's action directory (installation ${record ? `${record.state}${record.last_error_code ? `, ${record.last_error_code}` : ""}` : "missing"}; supervisor ${state ? `${state.status}${state.code ? `, ${state.code}` : ""}${state.message ? `: ${state.message}` : ""}` : "has no state"})`);
      }
      const result = await client.invoke(owner, sample.action, sample.action.input);
      if (sample.action.expect !== undefined && JSON.stringify(result) !== JSON.stringify(sample.action.expect)) {
        throw new Error(`${sample.action.capability_id} returned ${JSON.stringify(result)}, expected ${JSON.stringify(sample.action.expect)}`);
      }
      return result;
    };
    steps.run = await invoke();
    const platform = await host.withProject(ref, runtime => runningProjectPlatform(runtime.store, project.project_id));
    if (builtIn) {
      const shipped = platform.runtime.list().find(item => item.plugin_id === definition.manifest.plugin_id);
      if (shipped?.version !== definition.manifest.version) throw new Error(`the packed ${definition.manifest.plugin_id} is ${definition.manifest.version}, the Host ships ${shipped?.version}`);
    }
    const upgraded = nextVersion(definition);
    if (!builtIn) installed.add(upgraded);
    await platform.upgrade(definition.manifest.plugin_id, upgraded);
    const record = platform.runtime.list().find(item => item.plugin_id === definition.manifest.plugin_id);
    if (record?.version !== upgraded.manifest.version || record.state !== "running") throw new Error(`after the upgrade the installation is ${record?.state} at ${record?.version}${record?.last_error_code ? ` (${record.last_error_code})` : ""}`);
    steps.upgrade = { from: definition.manifest.version, to: record.version };
    steps.run_after_upgrade = await invoke();
    return { id: sample.id, ok: true, steps };
  } catch (error) {
    return { id: sample.id, ok: false, steps, error: error?.code ? `${error.code}: ${error.message}` : String(error?.message ?? error) };
  } finally {
    await host?.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}

const corpus = JSON.parse(readFileSync(corpusFile, "utf8"));
const results = [];
for (const sample of corpus.samples) results.push(await replay(sample));
if (json) process.stdout.write(`${JSON.stringify({ corpus: path.relative(root, corpusFile), results })}\n`);
else for (const result of results) process.stdout.write(`${result.ok ? "ok  " : "FAIL"} ${result.id}${result.ok ? ` (${result.steps.upgrade.from} → ${result.steps.upgrade.to})` : `: ${result.error}`}\n`);
process.exitCode = results.every(result => result.ok) ? 0 : 1;
