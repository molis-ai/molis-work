import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

function fixtureCleanup(t: TestContext) {
  let callback: (() => void | Promise<void>) | undefined;
  const context = new Proxy(t, { get(target, key) {
    if (key === "after") return (hook: () => void | Promise<void>) => { callback = hook; };
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { context, async close() { assert.ok(callback); await callback(); } };
}

// PR1775-CLEANUP-01: a failed Chrome start still releases the initialized Host owned by an unlistening server.
test("browser startup failure closes the initialized Host before removing its temporary Home", { timeout: 60_000 }, async t => {
  const cleanup = fixtureCleanup(t);
  const originalChrome = process.env.MOLIS_WORK_TEST_CHROME;
  // start() is replaced below; no browser executable is launched by this failure-path test.
  process.env.MOLIS_WORK_TEST_CHROME = process.execPath;
  let configuredHost: MolisWorkLocalHost | undefined;
  let servingHost: MolisWorkLocalHost | undefined;
  let homeDirectory: string | undefined;
  let homeExistedAtClose: boolean | undefined;
  let cleaned = false;
  const closeFixture = async () => { if (!cleaned) { cleaned = true; await cleanup.close(); } };
  t.after(async () => {
    try { await closeFixture(); }
    finally {
      try { await servingHost?.close(); }
      finally {
        if (originalChrome === undefined) delete process.env.MOLIS_WORK_TEST_CHROME;
        else process.env.MOLIS_WORK_TEST_CHROME = originalChrome;
      }
    }
  });
  const configure = MolisWorkLocalHost.prototype.configurePersonalPlanning;
  t.mock.method(MolisWorkLocalHost.prototype, "configurePersonalPlanning", function (this: MolisWorkLocalHost, ...args: Parameters<typeof configure>) {
    configuredHost = this;
    return configure.apply(this, args);
  });
  const failure = new Error("forced Chrome startup failure");
  t.mock.method(ChromeHarness, "start", async (directory: string) => {
    assert.ok(configuredHost);
    servingHost = configuredHost;
    homeDirectory = directory;
    const close = servingHost.close.bind(servingHost);
    t.mock.method(servingHost, "close", () => {
      homeExistedAtClose ??= existsSync(directory);
      return close();
    });
    const catalog = servingHost.ensureWebCatalog(directory, () => { throw new Error("the serving Host must already own its catalog"); });
    const projects = await catalog.withCatalog({ homeDirectory: directory }, current => current.listProjects());
    assert.equal(projects.length, 1);
    const [project] = projects;
    assert.ok(project);
    // Exercise the same initialization that the first scheduler tick can finish while Chrome is starting.
    await servingHost.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user", permissions: [] },
      molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }));
    throw failure;
  });
  await assert.rejects(openGoalBrowser(cleanup.context, "seeded"), error => error === failure);
  assert.ok(servingHost);
  await closeFixture();
  assert.equal(servingHost.lifecycle(), "closed", "the fixture must close its owning Host even before server.listen()");
  assert.equal(homeExistedAtClose, true, "Host resources must stop before the fixture removes their Home");
  assert.ok(homeDirectory);
  assert.equal(existsSync(homeDirectory), false, "the failed startup must still remove its own Home");
});
