import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { MolisWorkUninstallService, MolisWorkWebServiceManager, RuntimeIntegrationService } from "@molis-ai/molis-work-app-local-host";

async function fixture(t: TestContext) {
  const directory = await fs.mkdtemp(join(tmpdir(), "molis-work-uninstall-inspection-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const home = join(directory, "home");
  await fs.mkdir(home);
  const kept = join(home, "kept.txt");
  await fs.writeFile(kept, "keep this content\n");
  const service = new MolisWorkUninstallService({
    homeDirectory: home,
    projects: {
      inspect: async () => ({ projects: [], conflict: null }),
      removeDemos: async () => { assert.fail("a preview must not delete projects"); },
    },
    runtimeIntegrationService: new RuntimeIntegrationService({
      homeDirectory: home, userHomeDirectory: directory,
      runtimeExecutables: { codex: null, "claude-code": null, opencode: null, "pi-agent": null, "grok-build": null },
    }),
    webServiceManager: new MolisWorkWebServiceManager({ homeDirectory: home, userHomeDirectory: directory, platform: "linux" }),
  });
  const unchanged = async () => {
    assert.equal(await fs.readFile(kept, "utf8"), "keep this content\n");
    await assert.rejects(fs.stat(service.receiptPath), { code: "ENOENT" });
  };
  return { home, service, unchanged };
}

test("RAC-113: missing releases and registered data still produce read-only uninstall previews", async t => {
  const { home, service, unchanged } = await fixture(t);
  for (const purge_user_data of [false, true]) {
    const plan = await service.prepare({ purge_user_data });
    assert.equal(plan.status, "no_change");
    assert.deepEqual(plan.changes, []);
    assert.deepEqual(plan.conflicts, []);
    assert.deepEqual(plan.preserved_paths, purge_user_data ? [] : [join(home, "projects"), join(home, "backups"), join(home, "logs")]);
  }
  await unchanged();
});

test("RAC-113: a file occupying releases rejects the preview without removing it, then permits recovery", async t => {
  const { home, service, unchanged } = await fixture(t);
  const releases = join(home, "releases");
  await fs.writeFile(releases, "not a directory\n");
  await assert.rejects(service.prepare(), { code: "ENOTDIR" });
  assert.equal(await fs.readFile(releases, "utf8"), "not a directory\n");
  await unchanged();
  await fs.rm(releases);
  const release = join(releases, "owned");
  await fs.mkdir(release, { recursive: true });
  const manifest = '{"installer":"molis-work-home-install-v1"}\n';
  await fs.writeFile(join(release, "release.json"), manifest);
  const plan = await service.prepare();
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.changes.map(change => [change.kind, change.target]), [["release", release]]);
  assert.equal(await fs.readFile(join(release, "release.json"), "utf8"), manifest);
  await unchanged();
});

test("RAC-113: a releases permission failure propagates unchanged and a later preview reads again", async t => {
  const { home, service, unchanged } = await fixture(t);
  const releases = join(home, "releases");
  await fs.mkdir(releases);
  const failure = Object.assign(new Error("injected releases read failure"), { code: "EACCES" });
  const readdir = fs.readdir;
  const mock = t.mock.method(fs, "readdir", (...args: Parameters<typeof fs.readdir>) => {
    if (args[0] === releases) return Promise.reject(failure);
    return readdir(...args);
  });
  await assert.rejects(service.prepare(), error => error === failure);
  await unchanged();
  mock.mock.restore();
  assert.equal((await service.prepare()).status, "no_change");
  await unchanged();
});

test("RAC-113: purge refuses an unreadable registered path and includes it after recovery", async t => {
  const { home, service, unchanged } = await fixture(t);
  const logs = join(home, "logs");
  await fs.mkdir(logs);
  const saved = join(logs, "saved.log");
  await fs.writeFile(saved, "preserve existing log\n");
  const failure = Object.assign(new Error("injected registered path read failure"), { code: "EACCES" });
  const stat = fs.stat;
  const mock = t.mock.method(fs, "stat", (...args: Parameters<typeof fs.stat>) => {
    if (args[0] === logs) return Promise.reject(failure);
    return stat(...args);
  });
  await assert.rejects(service.prepare({ purge_user_data: true }), error => error === failure);
  assert.equal(await fs.readFile(saved, "utf8"), "preserve existing log\n");
  await unchanged();
  mock.mock.restore();
  const plan = await service.prepare({ purge_user_data: true });
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.changes.filter(change => change.kind === "user_data").map(change => change.target), [logs]);
  assert.equal(await fs.readFile(saved, "utf8"), "preserve existing log\n");
  await unchanged();
});
