// R-59 (W5-16 follow-up, user 2026-10-26): a Home reached through a link is resolved to its real path once, where it enters
// (`resolveHomeDirectory`, which `resolveMolisWorkHome` and `resolveConfiguredHome` both use). The Home snapshot and the uninstall
// purge insist that a store path equals its real path (S-11), so they then work for a Home whose parent directory is a link; a link
// inside the Home is still refused. The inside is not relaxed: the refusal is asserted here, with the same Home reached the same way.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { createDesktopUninstallService, openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkWebServiceManager, RuntimeIntegrationService, installMolisWorkHome, homeStores } from "@molis-ai/molis-work-app-local-host";
import { openBaselineHomeSqlite, resolveHomeDirectory, resolveMolisWorkHome, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** `<area>/link` is a link to `<area>/real`; the Home is `<area>/link/home`, whose real path is `<area>/real/home`. */
async function linkedHome(t: TestContext, name = "home") {
  const area = await realpath(await mkdtemp(join(tmpdir(), "molis-home-entry-")));
  t.after(() => rm(area, { recursive: true, force: true }));
  await mkdir(join(area, "real"));
  await symlink(join(area, "real"), join(area, "link"));
  return { area, home: join(area, "link", name), realHome: join(area, "real", name), snapshot: join(area, "snapshot") };
}

async function entry(t: TestContext, kind: "cli" | "web", args: string[], home?: string) {
  const launcher = kind === "cli" ? "cli/main.ts" : "web/server.ts";
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/" + launcher, import.meta.url)), ...args],
    { env: { ...process.env, MOLIS_WORK_TEST: "1", ...(home === undefined ? {} : { MOLIS_WORK_HOME: home }) }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const closed = new Promise<{ code: number | null }>((done, fail) => { child.once("error", fail); child.once("close", code => done({ code })); });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await closed; });
  return { ...await closed, stdout, stderr };
}

test("RAC-710 the Home is resolved to its real path in one function, also when the Home or its parent does not exist yet", async t => {
  const f = await linkedHome(t);
  assert.equal(resolveHomeDirectory(f.home), f.realHome, "a linked parent of a Home that is not there yet");
  await mkdir(f.realHome);
  assert.equal(resolveHomeDirectory(f.home), f.realHome, "a linked parent of an existing Home");
  await symlink(f.realHome, join(f.area, "alias"));
  assert.equal(resolveHomeDirectory(join(f.area, "alias")), f.realHome, "the Home itself named by a link");
  assert.equal(resolveHomeDirectory(join(f.area, "alias", "missing", "deeper")), join(f.realHome, "missing", "deeper"));
  assert.equal(runWithMolisWorkHome(f.home, () => resolveMolisWorkHome()), f.realHome, "the Host's scope hands the resolved Home down");
});

test("RAC-711 the actual CLI snapshots a Home whose parent directory is a link, and names the real Home", async t => {
  const f = await linkedHome(t);
  await mkdir(join(f.realHome, "config"), { recursive: true });
  const body = JSON.stringify({ schema_version: 1, completed: true, display_name: "Retained person" }) + "\n";
  await writeFile(join(f.realHome, "config", "onboarding.json"), body, { mode: 0o640 });
  const result = await entry(t, "cli", ["home", "snapshot", "--home", f.home, "--to", f.snapshot, "--json"]);
  assert.equal(result.code, 0, result.stderr);
  const manifest = JSON.parse(await readFile(join(f.snapshot, "manifest.json"), "utf8"));
  assert.equal(manifest.home_directory, f.realHome);
  assert.equal(await readFile(join(f.realHome, "config", "onboarding.json"), "utf8"), body);
});

test("RAC-712 the uninstall purge works for a Home whose parent directory is a link, with the plugin-library ledger present", async t => {
  const f = await linkedHome(t, ".molis-work");
  const runtimeIntegrationService = new RuntimeIntegrationService({ homeDirectory: f.home, userHomeDirectory: join(f.area, "link"),
    runtimeExecutables: { codex: null, "claude-code": null, opencode: null, "pi-agent": null, "grok-build": null } });
  const webServiceManager = new MolisWorkWebServiceManager({ homeDirectory: f.home, userHomeDirectory: join(f.area, "link"), platform: "linux" });
  await installMolisWorkHome({ homeDirectory: f.home, sourceDirectory: ROOT, version: "0.1.0-home-entry-test" });
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
  await catalog.createProject({ display_name: "用户项目", actor_id: "user" });
  catalog.close();
  // The ledger is what the purge's inventory reads file by file: a store path that is not its real path stops it.
  openBaselineHomeSqlite(f.realHome, "plugin-libraries", homeStores().get("plugin-libraries")!.library!.baseline).close();
  const service = createDesktopUninstallService({ homeDirectory: f.home, runtimeIntegrationService, webServiceManager });
  const plan = await service.prepare({ purge_user_data: true });
  assert.equal(plan.status, "ready", JSON.stringify(plan.conflicts));
  assert.equal(plan.home_directory, f.realHome);
  const result = await service.confirm({ plan_id: plan.plan_id, decision: "confirmed",
    purge_confirmation: { home_directory: plan.home_directory, user_project_count: plan.user_project_count } });
  assert.equal(result.status, "purged");
  assert.deepEqual(await readdir(f.realHome), ["agent-runtime"]);
});

test("RAC-713 a link inside the Home is still refused, with the Home reached through a linked parent", async t => {
  const f = await linkedHome(t);
  const outside = join(f.area, "outside");
  await mkdir(outside); await writeFile(join(outside, "value"), "A different owner's bytes");
  await mkdir(join(f.realHome, "config"), { recursive: true });
  await writeFile(join(f.realHome, "config", "onboarding.json"), "{}\n", { mode: 0o640 });
  await symlink(outside, join(f.realHome, "images"));
  const result = await entry(t, "cli", ["home", "snapshot", "--home", f.home, "--to", f.snapshot, "--json"]);
  assert.equal(result.code, 1, "the snapshot is refused");
  assert.equal(JSON.parse(result.stderr).error.code, "host.home_snapshot.invalid");
  await assert.rejects(stat(f.snapshot), "no snapshot is published");
  assert.equal(await readFile(join(outside, "value"), "utf8"), "A different owner's bytes", "the link's target is untouched");
  assert.equal((await readdir(f.area)).some(name => name.startsWith(".molis-home-snapshot-")), false, "no private staging is left");
});

for (const code of ["EACCES", "ELOOP"] as const) {
  test(`R59-ERROR-01 real ${code} identifies the configured Home and recovery without entering business or writing`, { timeout: 30_000 }, async t => {
    const area = await realpath(await mkdtemp(join(tmpdir(), "molis-home-error-")));
    const parent = join(area, code === "EACCES" ? "blocked" : "loop-a"), home = join(parent, "home"), snapshot = join(area, "snapshot");
    await writeFile(join(area, "retained.txt"), "the original user's bytes\n");
    t.after(async () => {
      if (code === "EACCES") await chmod(parent, 0o700);
      await rm(area, { recursive: true, force: true });
    });
    if (code === "EACCES") { await mkdir(parent); await chmod(parent, 0o000); }
    else { await symlink("loop-b", parent); await symlink("loop-a", join(area, "loop-b")); }
    const originalEntries = (await readdir(area)).sort(), parentInode = (await lstat(parent)).ino;
    let native: NodeJS.ErrnoException | undefined;
    try { realpathSync(home); } catch (error) { native = error as NodeJS.ErrnoException; }
    assert.equal(native?.code, code, "the filesystem itself produces the required refusal");
    const reason = code === "EACCES" ? "权限不足" : "符号链接循环";
    const checkError = (value: unknown): boolean => {
      assert.ok(value instanceof Error);
      const error = value as NodeJS.ErrnoException;
      for (const field of ["code", "path", "syscall", "errno", "cause"] as const) assert.equal(error[field], native![field]);
      assert.ok(error.message.includes(JSON.stringify(home)), "the complete configured Home, not only the failing ancestor");
      assert.ok(error.message.includes(reason));
      assert.ok(error.message.includes("--home") && error.message.includes("MOLIS_WORK_HOME"));
      assert.ok(error.message.endsWith(native!.message), "the original system diagnosis is retained");
      return true;
    };
    assert.throws(() => resolveHomeDirectory(home), checkError);
    let entered = false;
    assert.throws(() => runWithMolisWorkHome(home, () => { entered = true; }), checkError);
    assert.equal(entered, false, "Home resolution refuses before entering the scoped operation");
    const invocations: Array<{ kind: "cli" | "web"; args: string[]; environmentHome?: string }> = [
      { kind: "cli", args: ["home", "snapshot", "--home", home, "--to", snapshot] },
      { kind: "cli", args: ["home", "snapshot", "--to", snapshot, "--json"], environmentHome: home },
      { kind: "web", args: ["--home", home, "--port", "0"] },
      { kind: "web", args: ["--port", "0"], environmentHome: home },
    ];
    for (const invocation of invocations) {
      const result = await entry(t, invocation.kind, invocation.args, invocation.environmentHome);
      assert.equal(result.code, 1, result.stderr);
      assert.equal(result.stdout, "", "neither a snapshot nor a listening Web server is announced");
      for (const text of [JSON.stringify(home), reason, code, "--home", "MOLIS_WORK_HOME"]) assert.ok(result.stderr.includes(text), result.stderr);
      if (invocation.kind === "cli") assert.ok(result.stderr.startsWith("错误: "), "native errors retain the existing CLI text exit, including --json");
      await assert.rejects(lstat(snapshot), { code: "ENOENT" }, "no snapshot is published");
      assert.deepEqual((await readdir(area)).sort(), originalEntries, "no Home, lock, business record or staging is created");
    }
    assert.equal((await lstat(parent)).ino, parentInode, "the original directory or link is not replaced");
    assert.equal(await readFile(join(area, "retained.txt"), "utf8"), "the original user's bytes\n");
    if (code === "EACCES") {
      assert.equal((await stat(parent)).mode & 0o777, 0, "the product does not change permissions");
      await chmod(parent, 0o700);
      assert.deepEqual(await readdir(parent), [], "no Home or business data was created in the blocked parent");
    } else {
      assert.equal(await readlink(parent), "loop-b");
      assert.equal(await readlink(join(area, "loop-b")), "loop-a", "the product does not repair the loop");
    }
  });
}
