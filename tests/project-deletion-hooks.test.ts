import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_PROJECT_ID, EN, createMolisWorkLocalHost, projectDeletedHooksFor, type ProjectDeletedOwner } from "@molis-ai/molis-work-app-local-host";
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

test("an owner that is not registered where a receipt is finished keeps its step pending, with its last error, until a process that has it runs it", async () => {
  await withHome(async ({ home, catalog, gone }) => {
    const away = recorder("test-away");
    away.state.broken = true;
    const dispose = projectDeletedHooksFor(home).register(away.owner);
    const first = await catalog.deleteProject(deletion(gone));
    assert.equal(first.deletion.cleanup_state, "pending");
    dispose();

    // Another process finishes the receipt without that owner: it neither skips the step nor erases why it is pending.
    const elsewhere = await catalog.deleteProject(deletion(gone));
    assert.equal(elsewhere.deletion.cleanup_state, "pending", "the receipt is not complete while an owner's step is");
    assert.match(elsewhere.deletion.cleanup_error ?? "", /test-away/);
    assert.deepEqual(elsewhere.deletion.owner_steps.filter(step => step.state !== "complete").map(step => [step.owner_id, step.state, step.error]), [["test-away", "pending", "暂时清不掉"]]);

    // A process that has the owner runs it, and only then the receipt is complete.
    away.state.broken = false;
    const disposeAgain = projectDeletedHooksFor(home).register(away.owner);
    try {
      const finished = await catalog.deleteProject(deletion(gone));
      assert.equal(finished.deletion.cleanup_state, "complete");
      assert.equal(finished.deletion.cleanup_error, null);
      assert.deepEqual(finished.deletion.owner_steps.filter(step => step.owner_id === "test-away").map(step => [step.state, step.error]), [["complete", null]]);
      assert.deepEqual(away.calls, [gone, gone]);
    } finally { disposeAgain(); }
  });
});

test("a Host finishes the pending deletions of every project from the catalog once the owners that were missing are there", async () => {
  await withHome(async ({ home, catalog, gone, kept }) => {
    const away = recorder("test-sweep");
    away.state.broken = true;
    const dispose = projectDeletedHooksFor(home).register(away.owner);
    await catalog.deleteProject(deletion(gone));
    await catalog.deleteProject(deletion(kept));
    dispose();
    assert.equal(await catalog.projectDeletion.finishAll(), 2, "neither receipt can finish where the owner is missing");
    assert.ok(catalog.listProjectDeletions().every(item => item.cleanup_state === "pending"));

    away.state.broken = false;
    const disposeAgain = projectDeletedHooksFor(home).register(away.owner);
    try {
      assert.equal(await catalog.projectDeletion.finishAll(), 0);
      assert.ok(catalog.listProjectDeletions().every(item => item.cleanup_state === "complete" && item.cleanup_error === null));
      assert.deepEqual(away.calls.slice(-2).sort(), [gone, kept].sort());
    } finally { disposeAgain(); }
  });
});

test("callers that finish the same receipt at the same time share one run: an owner step never runs twice at once", async () => {
  await withHome(async ({ home, catalog, gone }) => {
    const slow = recorder("test-slow");
    slow.state.broken = true;
    const dispose = projectDeletedHooksFor(home).register(slow.owner);
    try {
      assert.equal((await catalog.deleteProject(deletion(gone))).deletion.cleanup_state, "pending");
      slow.state.broken = false;
      const clear = slow.owner.clear;
      let running = 0, overlapped = false;
      slow.owner.clear = async projectId => {
        running += 1; overlapped ||= running > 1;
        try { await new Promise(resolve => setTimeout(resolve, 150)); await clear.call(slow.owner, projectId); } finally { running -= 1; }
      };

      // The Web server's sweep and a person's retry arrive together.
      const [stillPending, replay] = await Promise.all([catalog.projectDeletion.finishAll(), catalog.deleteProject(deletion(gone))]);

      assert.equal(overlapped, false, "the owner was never asked twice at once");
      assert.deepEqual(slow.calls, [gone, gone], "the first failed run, then one shared retry");
      assert.equal(stillPending, 0);
      assert.equal(replay.deletion.cleanup_state, "complete");
    } finally { dispose(); }
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

test("the fixed-id demo is cleared by every owner when it is made again after a deletion, rebuilt or removed, and refuses to start over a clean-up that failed", async () => {
  await withHome(async ({ home, catalog }) => {
    const input = { actor_id: "test-user", user_confirmed: true };
    const owner = recorder("test-demo");
    const dispose = projectDeletedHooksFor(home).register(owner.owner);
    try {
      await catalog.ensureDemoProject(input);
      assert.deepEqual(owner.calls, [], "a demo made for the first time has no earlier one: nothing is cleared, and no owner has to be reachable");
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
      assert.deepEqual(owner.calls, [DEMO_PROJECT_ID], "an earlier demo was deleted, so every owner clears again before the new one starts");

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

test("a fixed-id demo whose earlier deletion has no owner steps (a receipt from before them) is cleared by every owner before it is made again", async () => {
  await withHome(async ({ home, catalog }) => {
    const input = { actor_id: "test-user", user_confirmed: true };
    const owner = recorder("test-legacy");
    const dispose = projectDeletedHooksFor(home).register(owner.owner);
    try {
      await catalog.ensureDemoProject(input);
      await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: "test-user", delete_confirmed: true, idempotency_key: "demo-remove-legacy" });
      const db = new DatabaseSync(join(home, "projects", "catalog.db"));
      try { db.exec("PRAGMA busy_timeout = 5000; DELETE FROM project_deletion_steps"); } finally { db.close(); }
      assert.deepEqual(catalog.listProjectDeletions()[0]?.owner_steps, []);
      owner.calls.length = 0;
      await catalog.ensureDemoProject(input);
      assert.deepEqual(owner.calls, [DEMO_PROJECT_ID], "what that older deletion left is cleared before the demo is made again");
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
  const result = await deleted.json() as { deletion: { cleanup_state: string; owner_steps: Array<{ owner_id: string; state: string; updated_at: string }> } };
  assert.equal(result.deletion.cleanup_state, "complete");
  assert.deepEqual(result.deletion.owner_steps.filter(step => step.owner_id === "test-web"), [{ owner_id: "test-web", state: "complete", error: null, updated_at: result.deletion.owner_steps.find(step => step.owner_id === "test-web")!.updated_at }]);
  assert.deepEqual(owner.calls, [project.project_id]);
  assert.equal(existsSync(project.database_path), false);
});

test("an English request gets the dialog's sentence and every plugin's data label in English, from the owners' own tables", async t => {
  const { project, origin } = await webFixture(t);
  const scopePath = `/api/settings/projects/${project.project_id}/delete-scope`;
  const english = { headers: { cookie: "molis_work_locale=en" } };
  type Scope = { owners: Array<{ owner_id: string; label: string }> };
  const zh = await (await fetch(origin + scopePath)).json() as Scope;
  const en = await (await fetch(origin + scopePath, english)).json() as Scope;

  // The labels are the owners' Chinese words: the person's language is picked at this route, with the served catalog.
  assert.ok(zh.owners.length >= 9, "the plugins of this Home name the data they keep");
  assert.deepEqual(en.owners.map(owner => owner.owner_id), zh.owners.map(owner => owner.owner_id));
  for (const [index, owner] of zh.owners.entries()) {
    assert.ok(EN[owner.label], `${owner.label} has an English text`);
    assert.equal(en.owners[index]!.label, EN[owner.label]);
    assert.notEqual(en.owners[index]!.label, owner.label, `${owner.owner_id} is shown in English`);
  }
  // Each of the owners' own tables reaches the dialog (not a copy kept by the Host).
  const labels = new Map(en.owners.map(owner => [owner.owner_id, owner.label]));
  assert.equal(labels.get("pages"), "Pages documents and folders");
  assert.equal(labels.get("form"), "Forms and every answer they received");
  assert.equal(labels.get("dataset"), "Dataset tables");
  assert.equal(labels.get("ppt"), "PPT presentations");
  assert.equal(labels.get("workflows"), "Workflows and their runs");
  assert.equal(labels.get("todo"), "Todos placed in this project");
  assert.equal(labels.get("functions"), "Function bindings and judgments made in this project");
  assert.equal(labels.get("images"), "Image jobs and the pictures they made");

  const dialog = (response: string) => response.slice(response.indexOf("data-project-delete-scope"));
  const chinese = dialog(await (await fetch(`${origin}/projects/${project.project_id}/settings/general?embed=1`)).text());
  const englishDialog = dialog(await (await fetch(`${origin}/projects/${project.project_id}/settings/general?embed=1`, english)).text());
  assert.match(chinese, /各插件里属于这个项目的数据也会一起删除。/);
  assert.match(englishDialog, /Data that plugins keep for this project is deleted with it\./);
  assert.doesNotMatch(englishDialog.slice(0, englishDialog.indexOf("</p>")), /各插件里属于这个项目的数据也会一起删除。/);
});
