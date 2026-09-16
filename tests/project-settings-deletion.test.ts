import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync, promises as fs } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { WebSocket } from "ws";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const TOKEN = "project-settings-deletion-test-0123456789";

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-project-delete-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const project = await catalog.createProject({ display_name: "可删除的项目", actor_id: "test-user" });
  const other = await catalog.createProject({ display_name: "保留的项目", actor_id: "test-user" });
  const localHost = createMolisWorkLocalHost();
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: TOKEN, localHost });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  let sequence = 0;
  const post = (path: string, body: Record<string, unknown>, headers: Record<string, string> = {}) => fetch(origin + path, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-molis-work-control-token": TOKEN,
      "x-molis-work-idempotency-key": `project-delete-http-${++sequence}`, ...headers },
    body: JSON.stringify(body),
  });
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await localHost.close();
    catalog.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, homeDirectory, catalog, project, other, localHost, origin, post };
}

test("project settings deletion requires authorization and confirmation, closes the open project, preserves workspace files, and replays its receipt", async t => {
  const { directory, homeDirectory, catalog, project, other, localHost, origin, post } = await fixture(t);
  const prefix = `/projects/${project.project_id}`;
  const deletePath = `/api/settings/projects/${project.project_id}/delete`;
  const workspace = join(directory, "repository");
  await mkdir(workspace);
  await writeFile(join(workspace, "source.ts"), "export const keep = true;\n");
  const linkedWorkspace = catalog.addWorkspaceProject({ canonical_path: workspace, project_id: project.project_id, actor_id: "test-user", user_confirmed: true });
  catalog.addWorkspaceProject({ canonical_path: workspace, project_id: other.project_id, actor_id: "test-user", user_confirmed: true });
  const context = { runtime_id: "codex", stable_work_context_id: "project-delete-session", host_declares_stable: true };
  catalog.bindRuntimeContext({ context, project_id: project.project_id, actor_id: "test-user", user_confirmed: true });
  const initial = await fetch(origin + prefix + "/settings/general");
  assert.equal(initial.status, 200);
  const workbench = await initial.text();
  assert.match(workbench, /project-preferences-page/);
  assert.doesNotMatch(workbench, /data-work-surface="project-settings"/);
  assert.match(workbench, /project-settings-navigation/);
  assert.doesNotMatch(workbench, /project-settings-hub-page/);
  const englishPage = await (await fetch(origin + prefix + "/settings/general?embed=1", { headers: { "accept-language": "en" } })).text();
  assert.match(englishPage, /data-project-rename=/);
  assert.match(englishPage, />Project name</);
  assert.match(englishPage, />Confirm project deletion<\/button>/);
  assert.doesNotMatch(englishPage, /<!doctype/i);
  const hub = await fetch(origin + prefix + "/settings");
  assert.equal(hub.status, 200);
  const hubPage = await hub.text();
  assert.match(hubPage, /project-preferences-page/);
  assert.match(hubPage, /href="[^"]*\/settings\/planning"/);
  assert.doesNotMatch(hubPage, /project-settings-hub-page/);
  const embed = await fetch(origin + prefix + "/settings/guidance?embed=1");
  assert.equal(embed.status, 200);
  const embedHtml = await embed.text();
  assert.doesNotMatch(embedHtml, /<!doctype/i);
  assert.match(embedHtml, /guidance-document|data-guidance-new/);
  const generalEmbed = await (await fetch(origin + prefix + "/settings/general?embed=1")).text();
  assert.match(generalEmbed, /data-project-delete-dialog/);
  assert.match(generalEmbed, /settings-data-disclosure/);
  assert.equal(localHost.status().projects.some(item => item.project_id === project.project_id), true);

  const renamed = await post(`/api/settings/projects/${project.project_id}/rename`, { display_name: "已经改名的项目" });
  assert.equal(renamed.status, 200);
  assert.equal(catalog.getProject(project.project_id).display_name, "已经改名的项目");
  assert.match(await (await fetch(origin + prefix + "/settings/general?embed=1")).text(), /value="已经改名的项目"/);
  const body = { delete_confirmed: true, idempotency_key: "delete-project-once" };
  assert.equal((await post(deletePath, body, { "x-molis-work-control-token": "invalid" })).status, 403);
  assert.equal((await post(deletePath, body, { origin: "http://example.com" })).status, 403);
  assert.equal((await post(deletePath, { ...body, delete_confirmed: false })).status, 400);
  assert.equal((await post(deletePath, { delete_confirmed: true })).status, 400);
  assert.equal(existsSync(project.database_path), true);
  assert.equal(catalog.resolveRuntimeContext(context).status, "bound");

  const deleted = await post(deletePath, body);
  assert.equal(deleted.status, 200);
  const result = await deleted.json() as { replayed: boolean; deletion: { deletion_id: string; cleanup_state: string; deleted_binding_count: number; actor_id: string } };
  assert.equal(result.replayed, false);
  assert.equal(result.deletion.cleanup_state, "complete");
  assert.equal(result.deletion.deleted_binding_count, 2);
  assert.equal(result.deletion.actor_id, "web-user");
  assert.equal(existsSync(dirname(project.database_path)), false);
  assert.equal(localHost.status().projects.some(item => item.project_id === project.project_id), false);
  assert.equal(catalog.resolveRuntimeContext(context).status, "unbound");
  assert.deepEqual(catalog.listWorkspaceDirectory().find(item => item.workspace_id === linkedWorkspace.workspace_id)?.project_ids, [other.project_id]);
  assert.equal(await readFile(join(workspace, "source.ts"), "utf8"), "export const keep = true;\n");
  assert.deepEqual(catalog.listProjects().map(item => item.project_id), [other.project_id]);
  assert.equal(existsSync(other.database_path), true);
  assert.equal((await fetch(origin + prefix + "/api/board")).status, 404);
  assert.equal((await fetch(origin + prefix + "/settings/general")).status, 404);
  const replay = await post(deletePath, body);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { ...result, replayed: true });
  const conflict = await post(`/api/settings/projects/${other.project_id}/delete`, body);
  assert.equal(conflict.status, 400);
  assert.equal(existsSync(other.database_path), true);
  const reopened = await openMolisWorkProjectCatalog({ homeDirectory });
  try {
    assert.deepEqual(reopened.listProjects().map(item => item.project_id), [other.project_id]);
    assert.deepEqual(reopened.listProjectDeletions().map(item => item.deletion_id), [result.deletion.deletion_id]);
  } finally { reopened.close(); }
});

test("project deletion reports incomplete physical cleanup and retries the same persisted receipt", async t => {
  const { catalog, project, post } = await fixture(t);
  const originalRm = fs.rm;
  const cleanup = t.mock.method(fs, "rm", async (...args: Parameters<typeof fs.rm>) => {
    if (String(args[0]).includes(".deleting-")) throw new Error("Temporary cleanup failure");
    return originalRm(...args);
  });
  const deletePath = `/api/settings/projects/${project.project_id}/delete`;
  const body = { delete_confirmed: true, idempotency_key: "retry-project-physical-cleanup" };
  const response = await post(deletePath, body);
  assert.equal(response.status, 200);
  const pending = await response.json() as { deletion: { cleanup_state: string; deletion_id: string } };
  assert.equal(pending.deletion.cleanup_state, "pending");
  assert.equal(catalog.listProjects().some(item => item.project_id === project.project_id), false);
  const staged = (await fs.readdir(dirname(dirname(project.database_path)))).filter(name => name.startsWith(".deleting-"));
  assert.equal(staged.length, 1);
  cleanup.mock.restore();
  const retry = await post(deletePath, body);
  assert.equal(retry.status, 200);
  const completed = await retry.json() as { replayed: boolean; deletion: { cleanup_state: string; deletion_id: string } };
  assert.equal(completed.deletion.deletion_id, pending.deletion.deletion_id);
  assert.equal(completed.deletion.cleanup_state, "complete");
  assert.equal(completed.replayed, true);
  assert.equal(existsSync(join(dirname(dirname(project.database_path)), staged[0])), false);
});

test("project deletion refuses a live terminal and succeeds after the user closes it", { timeout: 20_000 }, async t => {
  const { directory, catalog, project, origin, post } = await fixture(t);
  const panel = catalog.openDesktopPanel({ project_id: project.project_id, goal_id: "test-terminal-goal", runtime_kind: "generic",
    launch_command: "/bin/cat", cwd: directory, actor_id: "test-user", user_confirmed: true });
  const socket = new WebSocket(origin.replace("http:", "ws:") + "/pty");
  t.after(() => socket.close());
  await once(socket, "open");
  async function message(value: Record<string, unknown>, type: string) {
    const received = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => { socket.off("message", listener); reject(new Error(`Missing PTY ${type}`)); }, 5_000);
      const listener = (raw: unknown) => {
        const result = JSON.parse(String(raw));
        if (result.type !== type && result.type !== "error") return;
        clearTimeout(timeout);
        socket.off("message", listener);
        result.type === "error" ? reject(new Error(JSON.stringify(result))) : resolve(result);
      };
      socket.on("message", listener);
    });
    socket.send(JSON.stringify(value));
    return received;
  }
  try {
    await message({ type: "auth", token: TOKEN }, "ready");
    await message({ type: "spawn", panelId: panel.panel_id, command: "/bin/cat", cwd: directory }, "spawned");
    const deletePath = `/api/settings/projects/${project.project_id}/delete`;
    const body = { delete_confirmed: true, idempotency_key: "live-terminal-delete" };
    const blocked = await post(deletePath, body);
    assert.equal(blocked.status, 409);
    assert.match((await blocked.json() as { error: string }).error, /关闭.*终端/);
    assert.equal(existsSync(project.database_path), true);
    socket.send(JSON.stringify({ type: "kill", panelId: panel.panel_id }));
    const detached = await message({ type: "spawn", panelId: panel.panel_id, attachOnly: true }, "spawned");
    assert.equal(detached.attached, false);
    assert.equal((await post(deletePath, body)).status, 200);
    assert.equal(existsSync(project.database_path), false);
    assert.deepEqual(catalog.listDesktopPanels(project.project_id), []);
  } finally { socket.terminate(); }
});
