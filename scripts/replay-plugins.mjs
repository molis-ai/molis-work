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
// A directory sample is imported where it is. A signed-package source names `path` (v1) and `upgrade_path` (v2), relative to the
// corpus. Its action names the installed operation_id, not a fabricated generated capability id. An optional `write` runs once,
// after action.initial_expect and before action.expect (or the brief's fixed expect_texts projection of { items: [...] }). The
// package is installed/upgraded by the resident Host's CLI and read again after a real Host restart; it never uses pluginFixtures.
// Nothing reads or writes a real Home: every sample gets its own temporary one.
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual, promisify } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const corpusFile = path.resolve(root, args.includes("--corpus") ? args[args.indexOf("--corpus") + 1] : "tests/fixtures/replay-plugins/corpus.json");
const json = args.includes("--json");

const { parsePluginManifest } = await import("@molis-ai/molis-work-plugin-sdk");
const { HomeConsentLedger, MolisWorkLocalHost, molisWorkHostProjectReference, runningProjectPlatform } = await import("@molis-ai/molis-work-app-local-host");
const { createDesktopWebHost, withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
const { verifyPluginPackageSignature } = await import("@molis-ai/molis-work-plugin-runtime");
const runFile = promisify(execFile);

/** The same resident web/CLI entry used by package installation; closing it releases this sample's Host before reopening. */
async function resident(home) {
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const server = createDesktopWebHost({ ptyClientFilePath: () => path.join(root, "dist/web/pty-client.js") })({ homeDirectory: home, localHost: host });
  const close = async () => {
    try {
      server.closeAllConnections();
      if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    } finally { await host.close(); }
  };
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const cli = async (file, projectId, ...flags) => {
      const result = await runFile(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(root, "dist/cli/main.js"), "plugin", "install", file, projectId, ...flags],
        { env: { ...process.env, MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin, MOLIS_WORK_SECRET_BACKEND: "file", MOLIS_WORK_ENCRYPTION_KEY: "" }, timeout: 60_000 }).then(
        ok => ({ code: 0, text: ok.stdout }), error => ({ code: error.code, text: error.stderr }));
      return { code: result.code, out: JSON.parse(result.text.trim().split("\n").at(-1)) };
    };
    return { host, cli, close };
  } catch (error) { await close(); throw error; }
}

function expectAnswer(action, result) {
  if (action.expect === undefined && action.expect_texts === undefined) throw new Error(`${action.operation_id} needs a fixed expected answer`);
  if (action.expect !== undefined && !isDeepStrictEqual(result, action.expect)) {
    throw new Error(`${action.operation_id} returned ${JSON.stringify(result)}, expected ${JSON.stringify(action.expect)}`);
  }
  if (action.expect_texts !== undefined) {
    // The list brief excludes only the random id/time values from its fixed oracle, never fields, count, order or text.
    const rows = result?.items;
    if (!result || !isDeepStrictEqual(Object.keys(result), ["items"]) || !Array.isArray(rows)
      || rows.some(row => !row || !isDeepStrictEqual(Object.keys(row).sort(), ["created_at", "id", "text"])
        || typeof row.id !== "string" || !row.id || typeof row.text !== "string" || typeof row.created_at !== "string"
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(row.created_at) || !Number.isFinite(Date.parse(row.created_at)))) {
      throw new Error(`${action.operation_id} returned invalid items, expected { items: [{ id, text, created_at }] }`);
    }
    if (!isDeepStrictEqual(rows.map(row => row.text), action.expect_texts)) throw new Error(`${action.operation_id} returned ${JSON.stringify(rows.map(row => row.text))}, expected ${JSON.stringify(action.expect_texts)}`);
  }
}

async function replayPackage(sample) {
  const steps = { load: null, uninstalled: null, preview: null, install: null, before: null, run: null, upgrade: null, run_after_upgrade: null, restart: null, restarted_read: null };
  if (process.platform !== "darwin") return { id: sample.id, ok: false, status: "unsupported", steps, error: "signed-package replay requires the macOS sandbox" };
  const scratch = mkdtempSync(path.join(tmpdir(), "replay-signed-package-")), home = path.join(scratch, "home");
  const isolated = { MOLIS_WORK_HOME: home, MOLIS_WORK_SECRET_BACKEND: "file", MOLIS_WORK_ENCRYPTION_KEY: "" };
  const earlier = Object.fromEntries(Object.keys(isolated).map(key => [key, process.env[key]]));
  Object.assign(process.env, isolated);
  let env;
  try {
    const file = path.resolve(path.dirname(corpusFile), sample.source.path), upgradedFile = path.resolve(path.dirname(corpusFile), sample.source.upgrade_path);
    const { bundle } = verifyPluginPackageSignature(JSON.parse(readFileSync(file, "utf8")));
    const manifest = bundle.payload.manifest, pluginId = manifest.plugin_id, publisher = manifest.publisher.signature;
    steps.load = { plugin_id: pluginId, version: manifest.version, publisher };
    mkdirSync(home);
    const project = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: `Replay ${sample.id}`, actor_id: "owner" }));
    const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    env = await resident(home);
    const discovered = async () => {
      const owner = await env.host.localPersonContext(ref);
      await env.host.inspectActions(owner, ref);
      return (await env.host.actionClient(ref).discover(owner)).filter(view => view.provider.plugin_id === pluginId);
    };
    const records = () => env.host.withProject(ref, runtime => runningProjectPlatform(runtime.store, project.project_id).runtime.list().filter(record => record.plugin_id === pluginId));
    const pins = () => new HomeConsentLedger(home).publishers();
    const installed = async (version, installId) => {
      await discovered();
      const [record, ...extra] = await records();
      if (!record || extra.length || record.version !== version || record.state !== "running" || record.publisher_trust !== "pinned"
        || record.publisher_signature !== publisher || (installId !== undefined && record.install_id !== installId)
        || !pins().some(pin => pin.key_id === publisher && !pin.revoked_at)) throw new Error(`expected the same pinned running ${pluginId}@${version}, got ${JSON.stringify(record)}`);
      return { install_id: record.install_id, plugin_id: record.plugin_id, version: record.version, state: record.state, trust: record.publisher_trust, publisher: record.publisher_signature };
    };
    const invoke = async action => {
      const offered = (await discovered()).filter(view => view.action.local_id === action.operation_id && view.version === action.version);
      if (offered.length !== 1) throw new Error(`${action.operation_id}@${action.version} is not uniquely in the installed plugin's action directory`);
      const view = offered[0], owner = await env.host.localPersonContext(ref);
      return env.host.actionClient(ref).invoke(owner, { capability_id: view.capability_id, version: view.version, provider_id: view.provider_id }, action.input);
    };
    steps.uninstalled = { actions: (await discovered()).map(view => view.capability_id), installations: await records(), publishers: pins() };
    if (steps.uninstalled.actions.length || steps.uninstalled.installations.length || steps.uninstalled.publishers.length) throw new Error("the package is already present before installation");
    const preview = await env.cli(file, project.project_id);
    steps.preview = { result: preview, actions: (await discovered()).map(view => view.capability_id), installations: await records(), publishers: pins() };
    if (preview.code !== 0) throw new Error(`package preview failed: ${JSON.stringify(preview.out)}`);
    if (preview.out.installed !== false || steps.preview.actions.length || steps.preview.installations.length || steps.preview.publishers.length) throw new Error("the package preview changed installation or publisher trust");
    const confirmation = await env.cli(file, project.project_id, "--confirm", "--pin-as", "Replay test publisher");
    steps.install = { result: confirmation, record: null };
    if (confirmation.code !== 0) throw new Error(`package install failed: ${JSON.stringify(confirmation.out)}`);
    steps.install.record = await installed(manifest.version);
    if (sample.write) {
      steps.before = { initial: await invoke(sample.action), write: null };
      expectAnswer({ ...sample.action, expect: sample.action.initial_expect, expect_texts: undefined }, steps.before.initial);
      steps.before.write = await invoke(sample.write);
      expectAnswer(sample.write, steps.before.write);
    }
    steps.run = await invoke(sample.action);
    expectAnswer(sample.action, steps.run);
    const { bundle: upgradeBundle } = verifyPluginPackageSignature(JSON.parse(readFileSync(upgradedFile, "utf8")));
    const next = upgradeBundle.payload.manifest;
    if (next.plugin_id !== pluginId || next.publisher.signature !== publisher) throw new Error("the upgrade package changes plugin or publisher");
    const upgradePreview = await env.cli(upgradedFile, project.project_id);
    steps.upgrade = { from: manifest.version, to: next.version, preview: upgradePreview, preview_read: null, result: null, record: null };
    if (upgradePreview.code !== 0) throw new Error(`package upgrade preview failed: ${JSON.stringify(upgradePreview.out)}`);
    if (upgradePreview.out.installed !== false) throw new Error("the upgrade preview installed a package");
    await installed(manifest.version, steps.install.record.install_id);
    steps.upgrade.preview_read = await invoke(sample.action);
    if (!isDeepStrictEqual(steps.upgrade.preview_read, steps.run)) throw new Error("the upgrade preview changed the retained business value");
    steps.upgrade.result = await env.cli(upgradedFile, project.project_id, "--confirm");
    if (steps.upgrade.result.code !== 0) {
      steps.upgrade.record = await installed(manifest.version, steps.install.record.install_id);
      throw new Error(`package upgrade failed: ${JSON.stringify(steps.upgrade.result.out)}`);
    }
    steps.upgrade.record = await installed(next.version, steps.install.record.install_id);
    steps.run_after_upgrade = await invoke(sample.action);
    expectAnswer(sample.action, steps.run_after_upgrade);
    if (!isDeepStrictEqual(steps.run_after_upgrade, steps.run)) throw new Error("the upgrade changed the retained business value");
    await env.close(); env = undefined;
    env = await resident(home);
    steps.restart = await installed(next.version, steps.install.record.install_id);
    steps.restarted_read = await invoke(sample.action);
    expectAnswer(sample.action, steps.restarted_read);
    if (!isDeepStrictEqual(steps.restarted_read, steps.run)) throw new Error("the restart changed the retained business value");
    return { id: sample.id, ok: true, steps };
  } catch (error) {
    return { id: sample.id, ok: false, steps, error: error?.code ? `${error.code}: ${error.message}` : String(error?.message ?? error) };
  } finally {
    try { await env?.close(); } finally {
      for (const [key, value] of Object.entries(earlier)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}

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
for (const sample of corpus.samples) results.push(await (sample.source.kind === "signed-package" ? replayPackage(sample) : replay(sample)));
if (json) process.stdout.write(`${JSON.stringify({ corpus: path.relative(root, corpusFile), results })}\n`);
else for (const result of results) process.stdout.write(`${result.ok ? "ok  " : "FAIL"} ${result.id}${result.ok ? ` (${result.steps.upgrade.from} → ${result.steps.upgrade.to})` : `: ${result.error}`}\n`);
process.exitCode = results.every(result => result.ok) ? 0 : 1;
