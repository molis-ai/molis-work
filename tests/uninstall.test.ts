import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { installMolisWorkHome } from "@molis-ai/molis-work-app-local-host";
import { RuntimeIntegrationService } from "@molis-ai/molis-work-app-local-host";

import { createDesktopUninstallService as createLocalUninstallService } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkWebServiceManager } from "@molis-ai/molis-work-app-local-host";


const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-uninstall-"));
  const userHome = join(directory, "user");
  const home = join(userHome, ".molis-work");
  await installMolisWorkHome({ homeDirectory: home, sourceDirectory: ROOT, version: "0.1.0-uninstall-test" });
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const userProject = await catalog.createProject({ display_name: "用户项目", actor_id: "user" });
  const demo = await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true });
  catalog.close();
  const runtimeIntegrationService = new RuntimeIntegrationService({
    homeDirectory: home,
    userHomeDirectory: userHome,
    runtimeExecutables: { codex: null, "claude-code": null, opencode: null, "pi-agent": null, "grok-build": null },
  });
  const webServiceManager = new MolisWorkWebServiceManager({
    homeDirectory: home,
    userHomeDirectory: userHome,
    platform: "linux",
  });
  const service = createLocalUninstallService({ homeDirectory: home, runtimeIntegrationService, webServiceManager });
  return { directory, userHome, home, userProject, demo: demo.project, service };
}

// INSERR-01 / INSERR-02: installer refusal and recovery assertions keep the current owner codes and persisted state.
test("safe uninstall preview is read-only and confirmation preserves every user project", async () => {
  const item = await fixture();
  try {
    const installManifest = join(item.home, "config", "installation.json");
    const before = await readFile(installManifest, "utf8");
    // The discussion tab's database is user content (group chats and threads): like the projects, an ordinary uninstall keeps it.
    const discussionDatabase = join(item.home, "server", "server.sqlite");
    await mkdir(dirname(discussionDatabase), { recursive: true });
    await writeFile(discussionDatabase, "discussion-store\n");
    const plan = await item.service.prepare();
    assert.equal(plan.status, "ready");
    assert.equal(plan.user_project_count, 1);
    assert.equal(plan.demo_project_count, 1);
    assert.equal(await readFile(installManifest, "utf8"), before);
    assert.ok(plan.preserved_paths.includes(join(item.home, "projects")));
    assert.ok(!plan.changes.some((change) => change.target === join(item.home, "server")), "an ordinary uninstall does not remove server/");

    const result = await item.service.confirm({ plan_id: plan.plan_id, decision: "confirmed" });
    assert.equal(result.status, "uninstalled");
    await assert.rejects(stat(installManifest));
    assert.equal((await stat(item.userProject.database_path)).isFile(), true);
    assert.equal((await stat(discussionDatabase)).isFile(), true);
    await assert.rejects(stat(item.demo.database_path));
    assert.ok(result.receipt_path);
    assert.equal((await stat(result.receipt_path!)).isFile(), true);

    await installMolisWorkHome({
      homeDirectory: item.home,
      sourceDirectory: ROOT,
      version: "0.1.0-uninstall-test-reinstalled",
    });
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: item.home });
    try {
      assert.deepEqual(catalog.listProjects().map((project) => [project.display_name, project.data_class]), [
        ["用户项目", "user"],
      ]);
    } finally {
      catalog.close();
    }
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("public CLI exposes read-only demo and uninstall previews", async () => {
  const item = await fixture();
  try {
    const environment = { ...process.env, HOME: item.userHome };
    const uninstall = spawnSync(
      process.execPath,
      [join(ROOT, "dist", "cli", "main.js"), "uninstall", "--home", item.home, "--json"],
      { cwd: ROOT, env: environment, encoding: "utf8" },
    );
    assert.equal(uninstall.status, 0, uninstall.stderr);
    const uninstallPlan = JSON.parse(uninstall.stdout) as { status: string; user_project_count: number; demo_project_count: number };
    assert.equal(uninstallPlan.status, "ready");
    assert.equal(uninstallPlan.user_project_count, 1);
    assert.equal(uninstallPlan.demo_project_count, 1);

    const demo = spawnSync(
      process.execPath,
      [join(ROOT, "dist", "cli", "main.js"), "demo", "create", "--home", item.home, "--json"],
      { cwd: ROOT, env: environment, encoding: "utf8" },
    );
    assert.equal(demo.status, 0, demo.stderr);
    assert.equal((JSON.parse(demo.stdout) as { status: string }).status, "no_change");
    assert.equal((await stat(join(item.home, "config", "installation.json"))).isFile(), true);
    assert.equal((await stat(item.userProject.database_path)).isFile(), true);
    assert.equal((await stat(item.demo.database_path)).isFile(), true);
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("purge needs a second exact home and user-project-count confirmation", async () => {
  const item = await fixture();
  try {
    const runtimeBackup = join(item.home, "runtime-config-backups", "codex", "before-molis-work.bak");
    await mkdir(dirname(runtimeBackup), { recursive: true });
    await writeFile(runtimeBackup, "runtime config backup\n");
    for (const storeName of ["images", "jelly", "pages", "form", "dataset", "ppt", "lingguang", "todo", "alchemist", "functions"]) {
      await mkdir(join(item.home, storeName), { recursive: true });
      await writeFile(join(item.home, storeName, `${storeName}.db`), "personal-store\n");
    }
    // The discussion tab's database, with the WAL files a running host leaves beside it, is registered with the purge too.
    const discussionDatabase = join(item.home, "server", "server.sqlite");
    await mkdir(dirname(discussionDatabase), { recursive: true });
    for (const file of [discussionDatabase, `${discussionDatabase}-wal`, `${discussionDatabase}-shm`]) await writeFile(file, "discussion-store\n");
    // C-05 (anti-corruption code audit 2026-10-15): everything else docs/system/HOME-DATA.md registers in the Home goes too —
    // the Host's own libraries, Agent run records and their key, encrypted credentials, the side browser, Plugin Studio work,
    // caches, folder bookmarks, Git review details and the person's settings in config/. Only the original lock skeleton remains.
    const registered = ["assistant/assistant.db", "placement/placement.db", "agent-definitions/agent-definitions.db", "characters/characters.sqlite",
      "agent-runtime/storage.key", "agent-runtime/records/run/one.json", "feed/secrets.json", "feed/evidence/blobs/one", "browser/sites.json",
      "browser/profile/Cookies", "plugin-builder/project/design/one.json", "cache/research-library/one/HEAD", "directory-access/bookmarks.json",
      "git-operation-details.json", "runtime-integration-attempts/plan-one.json", "config/onboarding.json", "config/project-arrival.json",
      "config/mcp-tools.json", "config/external-mcp-tools.json", "config/connector-mcp-tools.json"];
    for (const file of registered) {
      await mkdir(dirname(join(item.home, file)), { recursive: true });
      await writeFile(join(item.home, file), "user data\n");
    }
    const plan = await item.service.prepare({ purge_user_data: true });
    for (const file of registered) {
      const top = file.startsWith("config/") ? file : file.split("/")[0]!;
      assert.ok(plan.changes.some((change) => change.target === join(item.home, top)), `purge 要删 ${top}`);
    }
    assert.ok(plan.changes.some((change) => change.target === join(item.home, "runtime-config-backups")));
    assert.ok(plan.changes.some((change) => change.target === join(item.home, "server")), "purge 要删讨论库 server/");
    for (const storeName of ["images", "jelly", "pages", "form", "dataset", "ppt", "lingguang", "todo", "alchemist", "functions"]) {
      assert.ok(
        plan.changes.some((change) => change.target === join(item.home, storeName)),
        `purge 要删 ${storeName} 个人库`,
      );
    }
    await assert.rejects(
      () => item.service.confirm({
        plan_id: plan.plan_id,
        decision: "confirmed",
        purge_confirmation: { home_directory: item.home, user_project_count: 0 },
      }),
      (error: unknown) => (error instanceof ActionError && ["installer.uninstall.plan_missing","installer.uninstall.plan_stale","installer.uninstall.conflict","installer.uninstall.purge_confirmation_required","installer.uninstall.step_failed"].includes(error.code))
        && error.code === "installer.uninstall.purge_confirmation_required",
    );
    assert.equal((await stat(item.userProject.database_path)).isFile(), true);
    assert.equal((await stat(discussionDatabase)).isFile(), true, "a refused purge keeps the discussion database");

    const confirmedPlan = await item.service.prepare({ purge_user_data: true });
    const result = await item.service.confirm({
      plan_id: confirmedPlan.plan_id,
      decision: "confirmed",
      purge_confirmation: {
        home_directory: confirmedPlan.home_directory,
        user_project_count: confirmedPlan.user_project_count,
      },
    });
    assert.equal(result.status, "purged");
    await assert.rejects(stat(discussionDatabase));
    // RAC-105-S-11: the approved purge contract keeps this exact empty owner skeleton, never SDK data or keys.
    assert.deepEqual(await readdir(item.home), ["agent-runtime"]);
    assert.deepEqual(await readdir(join(item.home, "agent-runtime")), [".molis-runtime-owner.db"]);
    for (const file of registered) await assert.rejects(stat(join(item.home, file)));
    assert.equal(result.receipt_path, null);
  } finally {
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("changed owned files block uninstall and a failed service step leaves a recovery receipt", async () => {
  const conflict = await fixture();
  try {
    const launcher = join(conflict.home, "bin", "molis-work-web");
    await writeFile(launcher, "user replacement\n");
    const plan = await conflict.service.prepare();
    assert.equal(plan.status, "conflict");
    await assert.rejects(
      () => conflict.service.confirm({ plan_id: plan.plan_id, decision: "confirmed" }),
      (error: unknown) => (error instanceof ActionError && ["installer.uninstall.plan_missing","installer.uninstall.plan_stale","installer.uninstall.conflict","installer.uninstall.purge_confirmation_required","installer.uninstall.step_failed"].includes(error.code)) && error.code === "installer.uninstall.conflict",
    );
    assert.equal(await readFile(launcher, "utf8"), "user replacement\n");
    assert.equal((await stat(conflict.userProject.database_path)).isFile(), true);
  } finally {
    await rm(conflict.directory, { recursive: true, force: true });
  }

  const failed = await fixture();
  try {
    let loaded = false;
    let failStop = false;
    const webServiceManager = new MolisWorkWebServiceManager({
      homeDirectory: failed.home,
      userHomeDirectory: failed.userHome,
      platform: "darwin",
      uid: 501,
      async portCheck() { return false; },
      async healthCheck() { return true; },
      async runCommand(_file, args) {
        if (args[0] === "print") return { code: loaded ? 0 : 113, stdout: loaded ? "state = running\npid = 4242\n" : "", stderr: loaded ? "" : "not found" };
        if (args[0] === "bootstrap") { loaded = true; return { code: 0, stdout: "", stderr: "" }; }
        if (args[0] === "kickstart") return { code: 0, stdout: "", stderr: "" };
        if (args[0] === "bootout") {
          if (failStop) return { code: 5, stdout: "", stderr: "injected stop failure" };
          loaded = false;
          return { code: 0, stdout: "", stderr: "" };
        }
        return { code: 1, stdout: "", stderr: "unexpected" };
      },
    });
    const install = await webServiceManager.prepare("install");
    await webServiceManager.confirm({ plan_id: install.plan_id, decision: "confirmed" });
    failStop = true;
    const runtimeIntegrationService = new RuntimeIntegrationService({
      homeDirectory: failed.home,
      userHomeDirectory: failed.userHome,
      runtimeExecutables: { codex: null, "claude-code": null, opencode: null, "pi-agent": null, "grok-build": null },
    });
    const service = createLocalUninstallService({
      homeDirectory: failed.home,
      runtimeIntegrationService,
      webServiceManager,
    });
    const plan = await service.prepare();
    await assert.rejects(
      () => service.confirm({ plan_id: plan.plan_id, decision: "confirmed" }),
      (error: unknown) => (error instanceof ActionError && ["installer.uninstall.plan_missing","installer.uninstall.plan_stale","installer.uninstall.conflict","installer.uninstall.purge_confirmation_required","installer.uninstall.step_failed"].includes(error.code)) && error.code === "installer.uninstall.step_failed",
    );
    const receipt = JSON.parse(await readFile(service.receiptPath, "utf8")) as { state: string; error: string };
    assert.equal(receipt.state, "failed");
    assert.match(receipt.error, /injected stop failure/);
    assert.equal((await stat(failed.userProject.database_path)).isFile(), true);
  } finally {
    await rm(failed.directory, { recursive: true, force: true });
  }
});
