import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { PluginHostEvents } from "@molis-ai/molis-work-plugin-runtime";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const TOKEN = "molis-work-workspace-settings-events-0123456789";
const FILES = "io.molis.work.files";

// BL-521, S-54: the project's folder settings (a folder linked, repaired or unlinked, the browsing folder chosen) are announced as
// `host.workspace.changed@1` with `cause: "workspace-settings"`, from the project platform's own `hostEvents`, so a plugin holding
// the old folder's files reads again. Observed on `PluginHostEvents.broadcast`, which every platform sends through.
interface Heard { workspace_id: string; cause: string; queued: number }

async function fixture(t: TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-workspace-events-"));
  const home = path.join(directory, ".molis-work");
  const folders = await Promise.all(["alpha", "beta", "gamma"].map(async name => { const folder = path.join(directory, name); await mkdir(folder, { recursive: true }); return folder; }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const first = await catalog.createProject({ display_name: "设置事件一", actor_id: "user" });
  const second = await catalog.createProject({ display_name: "设置事件二", actor_id: "user" });
  // Files and Git subscribe to workspace changes; a project that runs neither has nobody to tell.
  for (const project of [first, second]) for (const plugin_id of ["files", "git"] as const) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "user" });
  catalog.close();
  const heard: Heard[] = [];
  const original = PluginHostEvents.prototype.broadcast;
  t.mock.method(PluginHostEvents.prototype, "broadcast", function (this: PluginHostEvents, input: Parameters<typeof original>[0]) {
    const queued = original.call(this, input);
    const payload = input.payload as { workspace_id: string; cause: string };
    heard.push({ workspace_id: payload.workspace_id, cause: payload.cause, queued });
    return queued;
  });
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: TOKEN });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  let key = 0;
  const call = (project: string, pathname: string, method: string, body?: Record<string, unknown>) => fetch(`${origin}/projects/${encodeURIComponent(project)}${pathname}`, {
    method, headers: { origin, "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": `settings-events-${key++}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  /** Opening a plugin's own route starts the project's plugin platform, with the plugins the project enables. */
  const startPlatform = async (project: string) => {
    // Files answers for itself (it has no folder to browse yet), which is what shows the project's plugins are running.
    const response = await call(project, `/api/plugins/${FILES}/state`, "GET"), body = await response.text();
    assert.ok(response.status === 200 || response.status === 400 && body.includes("files.invalid"), body);
  };
  const settings = () => heard.filter(item => item.cause === "workspace-settings");
  return { folders, first: first.project_id, second: second.project_id, call, startPlatform, heard, settings };
}

test("RAC-461 BL-521 S-54 linking, repairing and unlinking a folder, and choosing the browsing folder, are announced once each as a workspace-settings change", async t => {
  const f = await fixture(t);
  await f.startPlatform(f.first); await f.startPlatform(f.second);
  const added = await f.call(f.first, "/api/workspaces", "POST", { workspace_path: f.folders[0], user_confirmed: true });
  assert.equal(added.status, 201, await added.clone().text());
  const { workspace: alpha } = await added.json() as { workspace: { workspace_id: string } };
  assert.deepEqual(f.settings().map(item => item.workspace_id), [alpha.workspace_id], "the folder just linked");
  assert.ok(f.settings().every(item => item.queued > 0), "a subscriber of the project (Files, Git) was queued the event");

  const second = await f.call(f.first, "/api/workspaces", "POST", { workspace_path: f.folders[1], user_confirmed: true });
  const { workspace: beta } = await second.json() as { workspace: { workspace_id: string } };
  const repaired = await f.call(f.first, `/api/workspaces/${encodeURIComponent(beta.workspace_id)}/path`, "PATCH", { workspace_path: f.folders[2], user_confirmed: true });
  assert.equal(repaired.status, 200, await repaired.clone().text());
  const { workspace: gamma } = await repaired.json() as { workspace: { workspace_id: string } };
  assert.notEqual(gamma.workspace_id, beta.workspace_id, "a repaired folder is the one at its new path");

  const chosen = await f.call(f.first, "/api/project-settings/workspaces", "POST", { workspace_id: alpha.workspace_id });
  assert.equal(chosen.status, 200, await chosen.clone().text());
  const unlinked = await f.call(f.first, `/api/workspaces/${encodeURIComponent(gamma.workspace_id)}/unlink`, "POST", { user_confirmed: true });
  assert.deepEqual(await unlinked.json(), { changed: true });

  // One announcement per change, each naming its folder, and the other project's platform heard none of them.
  assert.deepEqual(f.settings().map(item => item.workspace_id), [alpha.workspace_id, beta.workspace_id, gamma.workspace_id, alpha.workspace_id, gamma.workspace_id]);
  assert.deepEqual(f.heard.filter(item => item.cause !== "workspace-settings"), [], "nothing else was announced");
});

test("RAC-462 BL-521 S-54 a refused or unchanged settings change sends no workspace change", async t => {
  const f = await fixture(t);
  await f.startPlatform(f.first);
  const early = await f.call(f.first, "/api/workspaces", "POST", { workspace_path: f.folders[0], user_confirmed: true });
  assert.equal(early.status, 201, await early.clone().text());
  const { workspace } = await early.json() as { workspace: { workspace_id: string } };
  assert.deepEqual(f.settings().map(item => item.workspace_id), [workspace.workspace_id]);

  const before = f.heard.length;
  assert.equal((await f.call(f.first, "/api/workspaces", "POST", { workspace_path: f.folders[1] })).status, 400, "an unconfirmed link is refused");
  assert.equal((await f.call(f.first, "/api/project-settings/workspaces", "POST", { workspace_id: "workspace-of-another-project" })).status, 403, "another project's folder is not chosen");
  assert.equal((await f.call(f.first, "/api/workspaces/workspace-unknown/unlink", "POST", { user_confirmed: true })).status, 404);
  assert.equal((await f.call(f.first, `/api/workspaces/${encodeURIComponent(workspace.workspace_id)}/path`, "PATCH", { workspace_path: f.folders[2] })).status, 400, "an unconfirmed repair is refused");
  assert.equal(f.heard.length, before, "a refused change is not announced");

  // Unlinked once, announced once; a folder the project no longer lists, or never linked, changes nothing and is not announced.
  assert.deepEqual(await (await f.call(f.first, `/api/workspaces/${encodeURIComponent(workspace.workspace_id)}/unlink`, "POST", { user_confirmed: true })).json(), { changed: true });
  assert.equal(f.settings().length, 2);
  assert.equal((await f.call(f.first, `/api/workspaces/${encodeURIComponent(workspace.workspace_id)}/unlink`, "POST", { user_confirmed: true })).status, 404);
  const other = await f.call(f.second, "/api/workspaces", "POST", { workspace_path: f.folders[1], user_confirmed: true });
  const { workspace: foreign } = await other.json() as { workspace: { workspace_id: string } };
  const settled = f.settings().length;
  const never = await f.call(f.first, `/api/workspaces/${encodeURIComponent(foreign.workspace_id)}/unlink`, "POST", { user_confirmed: true });
  assert.ok(never.status === 404 || (await never.json() as { changed?: boolean }).changed === false, "another project's folder is not unlinked by this project");
  assert.equal(f.settings().length, settled, "a folder this project never linked is not announced");
});
