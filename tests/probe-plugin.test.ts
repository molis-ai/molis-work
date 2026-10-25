// W4-01 (specs/repository-anti-corruption/slices/w5-02-registry.md §6, RAC-579): the probe in examples/probe-plugin becomes a
// built-in by its own package alone. In a copy of the repository the test puts it at plugins/native/probe, runs the generator and
// `pnpm install`, builds the probe and the two apps, and checks that outside the probe only what the generator and pnpm write has
// changed. A child process in that copy then walks the lifecycle in a one-off Home: enable, discover, invoke (its route and an
// action), undo, search, the side panel's files, methods; and after the probe's version is raised and rebuilt, the upgrade, disable,
// revoke and uninstall. The installed half (the same probe installed, not built in) waits for the install service (ac-trust T2).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROBE = "plugins/native/probe";
const GENERATED = ["apps/local-host/src/plugin-registry.generated.ts", "apps/workbench/src/builtin-plugins.ts"];
const MANIFESTS = ["apps/local-host/package.json", "apps/workbench/package.json", "package.json"];

/** A copy of the checkout without its Git data; on macOS a clone of each file (APFS), elsewhere a copy-on-write copy where the disk can. */
function copyRepository(target: string) {
  mkdirSync(target);
  for (const entry of readdirSync(root).filter(name => name !== ".git")) {
    if (process.platform === "darwin") execFileSync("cp", ["-cR", path.join(root, entry), path.join(target, entry)]);
    else execFileSync("cp", ["-a", "--reflink=auto", path.join(root, entry), path.join(target, entry)]);
  }
}
/** Each tracked path's content (a symbolic link by where it points; a submodule is a directory and is not read). */
function digestOf(file: string) {
  if (!existsSync(file)) return null;
  const stat = lstatSync(file);
  if (stat.isSymbolicLink()) return `link:${readlinkSync(file)}`;
  return stat.isFile() ? createHash("sha256").update(readFileSync(file)).digest("hex") : "directory";
}
const digests = (repository: string, files: readonly string[]) => new Map(files.map(file => [file, digestOf(path.join(repository, file))]));
function run(repository: string, command: string, args: readonly string[]) {
  const result = spawnSync(command, args, { cwd: repository, encoding: "utf8", timeout: 240_000, env: { ...process.env, CI: process.env.CI ?? "" } });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const build = (repository: string, project: string) => run(repository, process.execPath, [path.join(repository, "node_modules/typescript/bin/tsc"), "-p", `${project}/tsconfig.json`]);
function phase(repository: string, home: string, ...args: string[]) {
  const stdout = run(repository, process.execPath, ["--disable-warning=ExperimentalWarning", path.join(repository, "tests/fixtures/probe-lifecycle.mjs"), args[0]!, home, ...args.slice(1)]);
  const seen = JSON.parse(stdout.trim().split("\n").at(-1)!) as Record<string, any>;
  assert.equal(seen.error, undefined, seen.error);
  return seen;
}

test("RAC-579 W4-01 the probe becomes a built-in by its own package and walks the lifecycle in a one-off Home", { timeout: 600_000 }, () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "probe-plugin-")), repository = path.join(scratch, "repo"), home = path.join(scratch, "home");
  try {
    copyRepository(repository);
    const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
    const before = digests(repository, tracked);
    cpSync(path.join(root, "examples/probe-plugin"), path.join(repository, PROBE), { recursive: true });
    run(repository, process.execPath, ["scripts/generate-plugin-registry.mjs"]);
    run(repository, "pnpm", ["install", "--offline", "--frozen-lockfile=false", "--config.confirmModulesPurge=false"]);
    const changed = [...digests(repository, tracked)].filter(([file, digest]) => before.get(file) !== digest).map(([file]) => file).sort();
    assert.deepEqual(changed, [...GENERATED, ...MANIFESTS, "pnpm-lock.yaml"].sort(),
      "outside the probe's package only the generator's two files, the three manifests and the lockfile change");
    run(repository, process.execPath, ["scripts/generate-plugin-registry.mjs", "--check"]);
    for (const project of [PROBE, "apps/workbench", "apps/local-host"]) build(repository, project);

    mkdirSync(home);
    const first = phase(repository, home, "first");
    assert.equal(first.created, 201);
    assert.deepEqual(first.before_enable, { discovered: [], route: 403 }, "not enabled in the project: no actions and the route is refused");
    assert.equal(first.enable, 200);
    assert.deepEqual({ ...first.installation, install_id: undefined }, { install_id: undefined, state: "running", error: null, version: "1.0.0", trust: "host" },
      "each project's supervisor starts it from its registration, with the Host build's trust");
    assert.deepEqual(first.discovered, ["probe.files.entries", "probe.notes.create", "probe.notes.list", "probe.notes.remove", "probe.search.entries"]);
    assert.deepEqual(first.create_route, { status: 200, title: "first probe note" });
    assert.deepEqual(first.list_route, ["first probe note"]);
    assert.deepEqual(first.undo, { result: { ok: true }, left: 0 }, "the undo the create declares takes the note back");
    assert.equal(first.kept, 200);
    assert.equal(first.search_finds_note, true, "the system search lists it through the probe's search source");
    assert.deepEqual(first.file_source, { plugin_id: "io.molis.work.probe", titles: ["kept probe note.txt"] }, "the side panel's files list it");
    assert.deepEqual(first.methods, ["probe-notes@1"], "its method is registered when it starts");

    // The upgrade a built-in gets: a newer build of its package; the Host follows the build's version when the project starts.
    const manifest = path.join(repository, PROBE, "src/manifest.ts");
    writeFileSync(manifest, readFileSync(manifest, "utf8").replace('PROBE_VERSION = "1.0.0"', 'PROBE_VERSION = "1.1.0"'));
    build(repository, PROBE);
    const after = phase(repository, home, "after-upgrade", first.project_id, first.database_path);
    assert.deepEqual(after.notes_after_upgrade, ["kept probe note"], "the upgrade keeps its data");
    assert.deepEqual({ state: after.installation.state, version: after.installation.version, same: after.installation.install_id === first.installation.install_id },
      { state: "running", version: "1.1.0", same: true }, "the same installation, now at the build's version");
    assert.deepEqual(after.methods_after_upgrade, ["probe-notes@1"]);
    assert.equal(after.disable, 200);
    assert.deepEqual(after.disabled, { route: 403, code: "actions.plugin_disabled", discovered: [], methods: [], state: "disabled" },
      "disabled in the project: its route, actions and methods are gone");
    assert.equal(after.reenable, 200);
    assert.deepEqual(after.reenabled, { notes: ["kept probe note"], state: "running" }, "enabled again, the same installation and its data");
    assert.deepEqual(after.revoked, { start: "plugin.grant_denied", route: 503, discovered: [] }, "without a permission it requires, it does not start");
    assert.equal(after.restored, 200);
    assert.deepEqual(after.uninstalled, { state: "uninstalled", route: 404, discovered: [], methods: [] }, "uninstalled: nothing of it is left to call");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
