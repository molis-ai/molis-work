import { projectPluginRevisionAt } from "./fixtures/project-plugin-settings.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";
import { directoriesWebOf, projectDirectoriesPath, readProjectDirectories, setProjectOutputFolder } from "./fixtures/project-directories-http.js";

const exec = promisify(execFile);

// W5-02-REG-06: standalone enablement, real materials→Diff and →Text Stats snapshots (Files retired in batch 06) and Git→fixed Diff
// content through the generated startup list.
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
  const directories = directoriesWebOf(request);
  const api = (project: string, plugin: string, suffix = "/state") => `/projects/${project}/api/plugins/io.molis.work.${plugin}${suffix}`;
  const projects = new Map<string, { id: string; directory: string; workspace: string }>();
  const surfaces = ["coding", "workspace", "git", "diff", "text-stats"];
  const cases: Array<[string, string[]]> = [
    ["none", []],
    ["git", ["git", "diff"]], ["diff", ["diff"]],
    // Text Stats reads the platform's materials and brings nothing along. Coding embeds Git and Diff; its files face is its own and
    // reads through the platform, so Text Stats stays off (WMD-05).
    ["text-stats", ["text-stats"]], ["coding", ["coding", "git", "diff"]],
  ];
  try {
    for (const [plugin, allowed] of cases) {
      const created = await request("/api/settings/projects", "POST", { display_name: `Standalone ${plugin}`, user_confirmed: true });
      assert.equal(created.status, 201); const id = created.body.project.project_id;
      if (plugin !== "none") {
        const enabled = await request(`/api/settings/projects/${id}/plugins`, "POST", { plugin_id: plugin, expected_revision: await projectPluginRevisionAt(origin, id) });
        assert.equal(enabled.status, 200);
        if (plugin !== "coding") assert.equal(enabled.body.plugins.includes("coding"), false);
      }
      const directory = path.join(root, plugin); await mkdir(directory);
      await writeFile(path.join(directory, "note.txt"), "中文🙂\nfirst\n");
      // The folder is the project's output, set in its settings as the person does (projects.directories.set_output).
      const workspace = (await setProjectOutputFolder(directories, id, directory)).workspace_id;
      projects.set(plugin, { id, directory, workspace });
      for (const target of surfaces) {
        const result = await request(api(id, target));
        // W3-02-C: a bundled plugin this project has not enabled answers 403 actions.plugin_disabled (it was 404 plugin_not_enabled);
        // "workspace" is no plugin at all, so nothing answers it and it stays 404.
        assert.equal(result.status, allowed.includes(target) ? 200 : target === "workspace" ? 404 : 403, `${plugin} → ${target}: ${JSON.stringify(result.body)}`);
        if (!allowed.includes(target) && target !== "workspace") assert.equal(result.body.code, "actions.plugin_disabled");
        if (target === "git") {
          const hint = await request(api(id, target, "/view-revision"));
          assert.equal(hint.status, allowed.includes(target) ? 200 : 403, "refresh hints obey the same surface enablement");
          if (hint.status === 200) { assert.deepEqual(Object.keys(hint.body), ["revision"]);assert.equal(typeof hint.body.revision,"string"); }
        }
      }
      const session = await request(api(id, "coding", "/sessions"), "POST", { title: "Must require Coding" });
      assert.equal(session.status, plugin === "coding" ? 200 : 403, "companion access must never imply Coding execution access");
    }

    // Diff's project fixes versions in its own output; Text Stats' project is another one, so a refusal there is about the folder.
    const files = projects.get("diff")!, other = projects.get("text-stats")!;
    // Changing which folder is the output needs the Home's control token, and names only this project's own folders.
    const setOutput = async (project: { id: string }, authorized = true) => request(projectDirectoriesPath(project.id), "POST",
      { change: "set_output", input: { workspace_id: files.workspace, expected_revision: (await readProjectDirectories(directories, project.id)).revision } }, authorized);
    assert.equal((await setOutput(files, false)).status, 403);
    const elsewhere = await setOutput(other);
    assert.deepEqual([elsewhere.status, elsewhere.body.code], [400, "catalog.context.workspace_membership_not_found"], JSON.stringify(elsewhere.body));
    assert.equal((await readProjectDirectories(directories, other.id)).directories.some(item => item.workspace_id === files.workspace), false);
    // Diff and Text Stats read the versions fixed through the platform's materials service, as the reader's 固定快照 menu fixes them
    // (materials-ui-contract §2).
    const fixMaterial = (project: { id: string; workspace: string }, port: string, text: string) => request(`/projects/${project.id}/api/materials/capture`, "POST",
      { workspace_id: project.workspace, path: ["note.txt"], fingerprint: createHash("sha256").update(text).digest("hex"), port });
    const foreign = await fixMaterial({ id: other.id, workspace: files.workspace }, "before", "中文🙂\nfirst\n");
    assert.ok(foreign.status >= 400 && foreign.status < 500, `another project's folder is not this project's material: ${JSON.stringify(foreign.body)}`);
    const fixedBefore = await fixMaterial(files, "before", "中文🙂\nfirst\n"); assert.equal(fixedBefore.status, 200, JSON.stringify(fixedBefore.body));
    await writeFile(path.join(files.directory, "note.txt"), "中文🙂\nsecond\n");
    const fixedAfter = await fixMaterial(files, "after", "中文🙂\nsecond\n"); assert.equal(fixedAfter.status, 200, JSON.stringify(fixedAfter.body));
    const diff = await request(api(files.id, "diff")); assert.equal(diff.body.view.phase, "ready"); assert.equal(diff.body.view.identical, false);
    assert.match(diff.body.html, /first/); assert.match(diff.body.html, /second/, "the default materials→Diff graph carries both fixed texts");
    const counted = await fixMaterial(other, "before", "中文🙂\nfirst\n"); assert.equal(counted.status, 200, JSON.stringify(counted.body));
    const stats = await request(api(other.id, "text-stats")); assert.equal(stats.body.view.characters, 10); assert.equal(stats.body.view.lines, 2);

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
    const fixedDiff = await request(api(gitProject.id, "diff", suffix));
    assert.equal(fixedDiff.body.view.phase, "ready");
    assert.match(fixedDiff.body.html, /first/); assert.match(fixedDiff.body.html, /changed/, "the fixed Git→Diff reader carries the selected change");
    assert.equal((await request(api(files.id, "diff", suffix))).status, 400, "fixed artifacts remain scoped to their project");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
