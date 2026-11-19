import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { ServerResponse } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { workspaceReadActions, writerDirectoryCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { openTestHome } from "./fixtures/test-home.js";
import { setProjectOutputFolder } from "./fixtures/project-directories-http.js";
import { untilSetup } from "./fixtures/connector-assistant-model.js";

type State = { environment_readiness: { status: string; is_git_repo?: boolean; head_commit?: string | null; worktrees?: { active: number } } };
const pathOf = (project: string) => `/projects/${project}/api/plugins/io.molis.work.coding/state`;

for (const action of [workspaceReadActions.git, workspaceReadActions.file, writerDirectoryCapabilities.list]) {
  test(`QEA-55 · actual ${action.capability_id} refusal stays unavailable, and the next permitted read recovers`, { timeout: 60_000 }, async t => {
    let refuse = true;
    const home = await openTestHome(t, { host: { actionAvailability: (_caller, definition) => refuse && definition.capability_id === action.capability_id
      ? { available: false, code: "fixture.offline", reason: "fixture inspection unavailable" } : { available: true } } });
    const project = await home.createProject("Environment refusal", ["coding"]), directory = join(home.home, "work"); await fs.mkdir(directory);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
    git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test");
    await fs.writeFile(join(directory, "note.txt"), "unchanged"); git("add", "."); git("commit", "-m", "fixture");
    await setProjectOutputFolder(home.web, project.project_id, directory);
    const state = await home.web.get<State>(pathOf(project.project_id)); assert.equal(state.environment_readiness.status, "unavailable");
    refuse = false;
    const recovered = await home.web.get<State>(pathOf(project.project_id)); assert.equal(recovered.environment_readiness.status, "ready");
    assert.equal(recovered.environment_readiness.is_git_repo, true); assert.equal(recovered.environment_readiness.worktrees?.active, 0);
  });
}

test("QEA-55 · empty, uncreated and unborn directories remain valid; a genuinely truncated listing is unavailable", { timeout: 60_000 }, async t => {
  // Match the normal Web Host's lazy default-directory owner; the bare fixture does not install this port.
  const home = await openTestHome(t, { host: { prepareDirectory: (project, workspace, mode) => withCatalog({ homeDirectory: home.home }, catalog => catalog.prepareWorkspaceDirectory(project, workspace, mode)) } });
  const withCatalog = home.host.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog);
  const uncreated = await home.createProject("Uncreated output", ["coding"]);
  assert.equal((await home.web.get<State>(pathOf(uncreated.project_id))).environment_readiness.status, "ready");
  const plain = await home.createProject("Plain directory", ["coding"]), plainDir = join(home.home, "plain"); await fs.mkdir(plainDir);
  await setProjectOutputFolder(home.web, plain.project_id, plainDir);
  const empty = (await home.web.get<State>(pathOf(plain.project_id))).environment_readiness;
  assert.equal(empty.status, "ready"); assert.equal(empty.is_git_repo, false);
  const unborn = await home.createProject("Unborn Git", ["coding"]), gitDir = join(home.home, "unborn"); await fs.mkdir(gitDir);
  execFileSync("git", ["init", "-b", "main"], { cwd: gitDir, stdio: "pipe" });
  await setProjectOutputFolder(home.web, unborn.project_id, gitDir);
  const freshGit = (await home.web.get<State>(pathOf(unborn.project_id))).environment_readiness;
  assert.equal(freshGit.status, "ready"); assert.equal(freshGit.is_git_repo, true); assert.equal(freshGit.head_commit, null);
  const large = await home.createProject("Truncated listing", ["coding"]), largeDir = join(home.home, "large"); await fs.mkdir(largeDir);
  for (let batch = 0; batch < 11; batch++) await Promise.all(Array.from({ length: 100 }, (_, i) => fs.writeFile(join(largeDir, `file-${batch}-${i}`), "")));
  await setProjectOutputFolder(home.web, large.project_id, largeDir);
  assert.equal((await home.web.get<State>(pathOf(large.project_id))).environment_readiness.status, "unavailable");
});

test("QEA-55 · a server-observed abandoned inspection cannot leave a successful or null cached result", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Abandoned inspection", ["coding"]);
  const directory = join(home.home, "cancel-read"); await fs.mkdir(directory);
  await setProjectOutputFolder(home.web, project.project_id, directory);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), controller = new AbortController();
  t.after(() => { controller.abort(); release.resolve(); });
  let held = false, reads = 0, closed = false;
  const opendir = fs.opendir;
  t.mock.method(fs, "opendir", async (...args: Parameters<typeof opendir>) => {
    if (String(args[0]) === directory) { reads++; if (!held) { held = true; entered.resolve(); await release.promise; } }
    return opendir(...args);
  });
  const path = pathOf(project.project_id), emit = ServerResponse.prototype.emit;
  t.mock.method(ServerResponse.prototype, "emit", function (this: ServerResponse, event: string | symbol, ...args: unknown[]) {
    const result = emit.call(this, event, ...args);
    if (event === "close" && this.req.url === path && !this.writableEnded) closed = true;
    return result;
  });
  const request = fetch(home.origin + path, { signal: controller.signal });
  const abandoned = assert.rejects(request, { name: "AbortError" });
  await entered.promise; controller.abort(); await abandoned;
  await untilSetup(async () => closed || undefined, "server observes cancellation"); release.resolve();
  await untilSetup(async () => {
    try { return (await home.web.get<State>(path)).environment_readiness?.status === "ready" || undefined; }
    catch { return undefined; }
  }, "a fresh read recovers without a fifteen-second cached failure", 3_000);
  assert.ok(reads >= 2, "the later request reads the directory again");
});

test("QEA-55 · a queued read recovers after an older failed inspection, then reuses only its successful result", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Overlapping inspections", ["coding"]);
  const directory = join(home.home, "overlapping-read"); await fs.mkdir(directory);
  await setProjectOutputFolder(home.web, project.project_id, directory);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  t.after(() => release.resolve());
  let reads = 0;
  const opendir = fs.opendir;
  t.mock.method(fs, "opendir", async (...args: Parameters<typeof opendir>) => {
    if (String(args[0]) === directory && ++reads === 1) {
      entered.resolve(); await release.promise; throw new Error("Fixture first inspection failed late");
    }
    return opendir(...args);
  });
  const path = pathOf(project.project_id), oldRead = home.web.get<State>(path);
  await entered.promise;
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 16_000 });
  // The platform serializes coding.state per project; a later query cannot overtake this one.
  const nextRead = home.web.get<State>(path);
  release.resolve();
  assert.equal((await oldRead).environment_readiness.status, "unavailable");
  assert.equal((await nextRead).environment_readiness.status, "ready");
  assert.equal(reads, 2);
  assert.equal((await home.web.get<State>(path)).environment_readiness.status, "ready");
  assert.equal(reads, 2, "subsequent reads retain the successful inspection");
});
