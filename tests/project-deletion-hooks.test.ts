import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_PROJECT_ID, createMolisWorkLocalHost, projectDeletedHooksFor, type ProjectDeletedOwner } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

type Catalog = Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>;

/** A Home with a catalog and two projects: `gone` is deleted by the tests, `kept` must come through untouched. */
async function withHome<T>(run: (env: { home: string; catalog: Catalog; gone: string; kept: string }) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-hooks-"));
  const home = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const gone = (await catalog.createProject({ display_name: "要删除的项目", actor_id: "test-user" })).project_id;
    const kept = (await catalog.createProject({ display_name: "留下的项目", actor_id: "test-user" })).project_id;
    return await run({ home, catalog, gone, kept });
  } finally {
    catalog.close();
    await rm(directory, { recursive: true, force: true });
  }
}
const deletion = (id: string) => ({ project_id: id, actor_id: "test-user", delete_confirmed: true, idempotency_key: `delete-${id}` });
/** An owner that records what it was asked to clear, and fails while `broken` says so. */
function recorder(id: string, label: string | null = null) {
  const calls: string[] = [];
  const state = { broken: false };
  const owner: ProjectDeletedOwner = { id, label, clear(projectId) { calls.push(projectId); if (state.broken) throw new Error("暂时清不掉"); } };
  return { owner, calls, state };
}

test("every owner registered for the Home gets a step in the receipt and clears the project after the catalog committed", async () => {
  await withHome(async ({ home, catalog, gone, kept }) => {
    const first = recorder("test-first", "第一个所有者"), second = recorder("test-second");
    let listedWhenCleared: string[] | null = null;
    second.owner.clear = () => { listedWhenCleared = catalog.listProjects().map(project => project.project_id); };
    const disposers = [projectDeletedHooksFor(home).register(first.owner), projectDeletedHooksFor(home).register(second.owner)];
    try {
      const result = await catalog.deleteProject(deletion(gone));
      assert.equal(result.deletion.cleanup_state, "complete");
      assert.deepEqual(first.calls, [gone]);
      assert.deepEqual(listedWhenCleared, [kept], "an owner runs once the catalog no longer has the project");
      assert.deepEqual(result.deletion.owner_steps.filter(step => step.owner_id.startsWith("test-")).map(step => [step.owner_id, step.state]), [["test-first", "complete"], ["test-second", "complete"]]);
      assert.deepEqual(catalog.listProjectDeletions()[0]?.owner_steps, result.deletion.owner_steps, "the receipt keeps the steps");
    } finally { for (const dispose of disposers) dispose(); }
  });
});

test("a failed owner step stays pending in the receipt and a replay of the same deletion finishes it", async () => {
  await withHome(async ({ home, catalog, gone }) => {
    const flaky = recorder("test-flaky"), steady = recorder("test-steady");
    flaky.state.broken = true;
    const disposers = [projectDeletedHooksFor(home).register(flaky.owner), projectDeletedHooksFor(home).register(steady.owner)];
    try {
      const first = await catalog.deleteProject(deletion(gone));
      assert.equal(first.deletion.cleanup_state, "pending");
      assert.match(first.deletion.cleanup_error ?? "", /test-flaky/);
      assert.deepEqual(first.deletion.owner_steps.filter(step => step.state === "pending").map(step => [step.owner_id, step.error]), [["test-flaky", "暂时清不掉"]]);
      assert.equal(first.deletion.owner_steps.find(step => step.owner_id === "test-steady")?.state, "complete", "one owner failing does not stop the others");
      assert.equal(catalog.listProjects().some(project => project.project_id === gone), false, "the project is already gone from the catalog");

      flaky.state.broken = false;
      const replay = await catalog.deleteProject(deletion(gone));
      assert.equal(replay.replayed, true);
      assert.equal(replay.deletion.cleanup_state, "complete");
      assert.equal(replay.deletion.cleanup_error, null);
      assert.ok(replay.deletion.owner_steps.every(step => step.state === "complete"));
      assert.deepEqual(flaky.calls, [gone, gone]);
      assert.deepEqual(steady.calls, [gone], "only the step that failed ran again");
    } finally { for (const dispose of disposers) dispose(); }
  });
});

test("an owner that is no longer registered where a receipt is finished is skipped, not retried forever", async () => {
  await withHome(async ({ home, catalog, gone }) => {
    const gone_ = recorder("test-vanishing");
    gone_.state.broken = true;
    const dispose = projectDeletedHooksFor(home).register(gone_.owner);
    const first = await catalog.deleteProject(deletion(gone));
    assert.equal(first.deletion.cleanup_state, "pending");
    dispose();
    const replay = await catalog.deleteProject(deletion(gone));
    assert.equal(replay.deletion.cleanup_state, "complete");
    assert.equal(replay.deletion.owner_steps.find(step => step.owner_id === "test-vanishing")?.state, "skipped");
  });
});

test("an owner registered again takes the place of the earlier one, and disposing it brings the earlier one back", async () => {
  await withHome(async ({ home, catalog, gone }) => {
    const files = recorder("test-twin"), live = recorder("test-twin");
    const hooks = projectDeletedHooksFor(home);
    const disposeFiles = hooks.register(files.owner), disposeLive = hooks.register(live.owner);
    await catalog.deleteProject(deletion(gone));
    assert.deepEqual([files.calls, live.calls], [[], [gone]]);
    disposeLive();
    const other = (await catalog.createProject({ display_name: "另一个", actor_id: "test-user" })).project_id;
    await catalog.deleteProject(deletion(other));
    assert.deepEqual([files.calls, live.calls], [[other], [gone]]);
    disposeFiles();
    assert.equal(hooks.owners().some(owner => owner.id === "test-twin"), false);
  });
});

test("the fixed-id demo is cleared by every owner when it is made again or rebuilt, and refuses to start over a clean-up that failed", async () => {
  await withHome(async ({ home, catalog }) => {
    const input = { actor_id: "test-user", user_confirmed: true };
    const owner = recorder("test-demo");
    const dispose = projectDeletedHooksFor(home).register(owner.owner);
    try {
      await catalog.ensureDemoProject(input);
      assert.deepEqual(owner.calls, [DEMO_PROJECT_ID], "a demo made for the first time is cleared of anything an older one left");
      owner.calls.length = 0;
      await catalog.ensureDemoProject(input);
      assert.deepEqual(owner.calls, [], "opening the demo that exists clears nothing");

      await catalog.resetDemoProject(input);
      assert.deepEqual(owner.calls, [DEMO_PROJECT_ID], "rebuilding the demo clears what the owners kept for it");
      owner.calls.length = 0;

      await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove-1" });
      assert.deepEqual(owner.calls, [DEMO_PROJECT_ID], "removing it runs the owners through the receipt");
      owner.calls.length = 0;
      await catalog.ensureDemoProject(input);
      assert.deepEqual(owner.calls, [DEMO_PROJECT_ID]);

      owner.state.broken = true;
      const removed = await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove-2" });
      assert.equal(removed.deletion.cleanup_state, "pending");
      await assert.rejects(() => catalog.ensureDemoProject(input), /清理/);
      assert.equal(catalog.listProjects().some(project => project.project_id === DEMO_PROJECT_ID), false, "no new demo is made while the old one's data is still there");
      owner.state.broken = false;
      await catalog.ensureDemoProject(input);
      assert.equal(catalog.listProjectDeletions().find(item => item.deletion_id === removed.deletion.deletion_id)?.cleanup_state, "complete", "making the demo again finished the receipt");
    } finally { dispose(); }
  });
});

const TOKEN = "project-deletion-hooks-test-0123456789";

async function webFixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-web-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const project = await catalog.createProject({ display_name: "可删除的项目", actor_id: "test-user" });
  const localHost = createMolisWorkLocalHost({ homeDirectory });
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: TOKEN, localHost });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await localHost.close();
    catalog.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { homeDirectory, catalog, project, origin };
}

test("the delete dialog lists what goes with the project, and the web deletion returns the owners' steps", async t => {
  const { homeDirectory, project, origin } = await webFixture(t);
  const owner = recorder("test-web", "测试用的插件数据");
  const dispose = projectDeletedHooksFor(homeDirectory).register(owner.owner);
  t.after(dispose);
  const scopePath = `/api/settings/projects/${project.project_id}/delete-scope`;

  const dialog = await (await fetch(`${origin}/projects/${project.project_id}/settings/general?embed=1`)).text();
  assert.match(dialog, /data-project-delete-scope/, "the dialog has a place for the list");
  const scope = await (await fetch(origin + scopePath)).json() as { owners: Array<{ owner_id: string; label: string }> };
  assert.ok(scope.owners.some(item => item.owner_id === "test-web" && item.label === "测试用的插件数据"));

  const deleted = await fetch(`${origin}/api/settings/projects/${project.project_id}/delete`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": "project-delete-hooks-1" },
    body: JSON.stringify({ delete_confirmed: true, idempotency_key: "delete-project-with-owners" }),
  });
  assert.equal(deleted.status, 200);
  const result = await deleted.json() as { deletion: { cleanup_state: string; owner_steps: Array<{ owner_id: string; state: string }> } };
  assert.equal(result.deletion.cleanup_state, "complete");
  assert.deepEqual(result.deletion.owner_steps.filter(step => step.owner_id === "test-web"), [{ owner_id: "test-web", state: "complete", error: null, updated_at: result.deletion.owner_steps.find(step => step.owner_id === "test-web")!.updated_at }]);
  assert.deepEqual(owner.calls, [project.project_id]);
  assert.equal(existsSync(project.database_path), false);
});
