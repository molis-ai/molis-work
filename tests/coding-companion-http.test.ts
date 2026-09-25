import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const exec = promisify(execFile);

test("Standalone companion HTTP routes admit only enabled surfaces and their embedded readers", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "coding-companion-http-"));
  const token = "coding-companion-control-token-0123456789abcdef";
  const server = createMolisWorkWebServer({ homeDirectory: root, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  async function request(url: string, method = "GET", body?: unknown, authorized = true) {
    const response = await fetch(origin + url, { method, headers: { origin, "content-type": "application/json",
      "x-molis-work-idempotency-key": randomUUID(), ...(authorized ? { "x-molis-work-control-token": token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  const api = (project: string, plugin: string, suffix = "/state") => `/projects/${project}/api/plugins/io.molis.work.${plugin}${suffix}`;
  const projects = new Map<string, { id: string; directory: string; workspace: string }>();
  const surfaces = ["coding", "workspace", "files", "git", "diff", "text-stats"];
  const cases: Array<[string, string[]]> = [
    ["none", []],
    ["files", ["files", "diff", "text-stats"]],
    ["git", ["git", "diff"]], ["diff", ["diff"]],
    ["text-stats", ["files", "diff", "text-stats"]], ["coding", surfaces.filter(id => id !== "workspace")],
  ];
  try {
    for (const [plugin, allowed] of cases) {
      const created = await request("/api/settings/projects", "POST", { display_name: `Standalone ${plugin}`, user_confirmed: true });
      assert.equal(created.status, 201); const id = created.body.project.project_id;
      if (plugin !== "none") {
        const enabled = await request(`/api/settings/projects/${id}/plugins`, "POST", { plugin_id: plugin });
        assert.equal(enabled.status, 200);
        if (plugin !== "coding") assert.equal(enabled.body.plugins.includes("coding"), false);
      }
      const directory = path.join(root, plugin); await mkdir(directory);
      await writeFile(path.join(directory, "note.txt"), "中文🙂\nfirst\n");
      assert.equal((await request(`/projects/${id}/api/workspaces`, "POST", { workspace_path: directory, user_confirmed: true })).status, 201);
      let workspace = "";
      workspace = (await request(`/projects/${id}/api/project-settings/workspaces`)).body.workspaces[0].workspace_id;
      projects.set(plugin, { id, directory, workspace });
      for (const target of surfaces) {
        const result = await request(api(id, target));
        assert.equal(result.status, allowed.includes(target) ? 200 : 404, `${plugin} → ${target}: ${JSON.stringify(result.body)}`);
      }
      const session = await request(api(id, "coding", "/sessions"), "POST", { title: "Must require Coding" });
      assert.equal(session.status, plugin === "coding" ? 200 : 404, "companion access must never imply Coding execution access");
    }

    const files = projects.get("files")!, other = projects.get("coding")!;
    assert.equal((await request(`/projects/${files.id}/api/project-settings/workspaces`, "POST", { workspace_id: files.workspace }, false)).status, 403);
    assert.equal((await request(`/projects/${other.id}/api/project-settings/workspaces`, "POST", { workspace_id: files.workspace })).status, 403);
    assert.equal((await request(api(other.id, "files", "/open"), "POST", { workspace_id: files.workspace, path: ["note.txt"] })).status, 400);
    const open = () => request(api(files.id, "files", "/open"), "POST", { workspace_id: files.workspace, path: ["note.txt"] });
    const first = await open(); assert.equal(first.status, 200); assert.equal(first.body.result.text, "中文🙂\nfirst\n");
    const capture = (port: string, fingerprint: string) => request(api(files.id, "files", "/capture"), "POST", { workspace_id: files.workspace, path: ["note.txt"], port, fingerprint });
    assert.equal((await capture("before", first.body.result.fingerprint)).status, 200);
    await writeFile(path.join(files.directory, "note.txt"), "中文🙂\nsecond\n");
    const second = await open(); assert.equal(second.status, 200);
    assert.equal((await capture("after", second.body.result.fingerprint)).status, 200);
    const diff = await request(api(files.id, "diff")); assert.equal(diff.body.view.phase, "ready"); assert.equal(diff.body.view.identical, false);
    const stats = await request(api(files.id, "text-stats")); assert.equal(stats.body.view.characters, 10); assert.equal(stats.body.view.lines, 2);

    const gitProject = projects.get("git")!;
    const git = (...args: string[]) => exec("git", args, { cwd: gitProject.directory });
    await git("init", "-b", "main"); await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@example.invalid");
    await git("add", "."); await git("commit", "-m", "base");
    await writeFile(path.join(gitProject.directory, "note.txt"), "changed\n");
    const state = await request(api(gitProject.id, "git")); assert.equal(state.body.view.phase, "ready"); assert.equal(state.body.view.changes.length, 1);
    const selected = await request(api(gitProject.id, "git", "/diff"), "POST", { workspace_id: gitProject.workspace, path: ["note.txt"], side: "worktree" });
    assert.equal(selected.status, 200); assert.equal(selected.body.result.after, "changed\n");
    const fixed = selected.body.selected.reference;
    const suffix = `/state?artifact_id=${encodeURIComponent(fixed.artifact_id)}&version=${fixed.version}`;
    assert.equal((await request(api(gitProject.id, "diff", suffix))).body.view.phase, "ready");
    assert.equal((await request(api(files.id, "diff", suffix))).status, 400, "fixed artifacts remain scoped to their project");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
