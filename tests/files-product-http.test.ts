import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { FILES_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-files";

test("Files formal workspace selection, bounded reads, fixed snapshots, real default graph and restart", async () => {
  new Function("return (" + FILES_CLIENT_FACTORY_SCRIPT + ")");
  const root = await mkdtemp(path.join(tmpdir(), "files-product-"));
  const token = "files-product-control-token-0123456789abcdef";
  let server: ReturnType<typeof createMolisWorkWebServer>, origin = "";
  async function start() {
    server = createMolisWorkWebServer({ homeDirectory: root, controlToken: token });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object"); origin = `http://127.0.0.1:${address.port}`;
  }
  const close = () => new Promise<void>(resolve => server.close(() => resolve()));
  async function request(url: string, method = "GET", body?: unknown, authorized = true) {
    const response = await fetch(origin + url, { method, headers: { origin, "content-type": "application/json",
      "x-molis-work-idempotency-key": randomUUID(), ...(authorized ? { "x-molis-work-control-token": token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  try {
    await start();
    const projects: string[] = [];
    for (const display_name of ["文件 A", "文件 B"]) {
      const created = await request("/api/settings/projects", "POST", { display_name, user_confirmed: true });
      assert.equal(created.status, 201); projects.push(created.body.project.project_id);
      await request(`/api/settings/projects/${projects.at(-1)}/plugins`, "POST", { plugin_id: "coding" });
    }
    const api = (plugin: string, suffix: string, project = projects[0]) => plugin === "workspace" ? `/projects/${project}/api/project-settings/workspaces` : `/projects/${project}/api/plugins/io.molis.work.${plugin}${suffix}`;
    const directories: string[] = [], ids: string[] = [];
    for (const name of ["one", "two"]) {
      const directory = path.join(root, name); await mkdir(directory); directories.push(directory);
      await writeFile(path.join(directory, "note.txt"), "中文🙂\nfirst\n");
      assert.equal((await request(`/projects/${projects[0]}/api/workspaces`, "POST", { workspace_path: directory, user_confirmed: true })).status, 201);
    }
    const state = await request(api("workspace", "/state"));
    assert.equal(state.status, 200); assert.equal(state.body.selected, null);
    for (const name of ["one", "two"]) ids.push(state.body.workspaces.find((item: any) => item.display_name === name).workspace_id);
    assert.ok(state.body.workspaces.every((item: any) => !Object.hasOwn(item, "project_ids")), "settings do not expose other projects");
    assert.equal((await request(api("workspace", "/select"), "POST", { workspace_id: ids[0] }, false)).status, 403);
    assert.equal((await request(api("workspace", "/select", projects[1]), "POST", { workspace_id: ids[0] })).status, 403);
    const noSelection = await request(api("files", "/directory?path=[]&workspace_id=" + ids[0])); assert.equal(noSelection.status, 400, JSON.stringify(noSelection));
    assert.equal((await request(api("workspace", "/select"), "POST", { workspace_id: ids[0] })).status, 200);
    const directory = await request(api("files", "/directory?path=[]&workspace_id=" + ids[0]));
    assert.equal(directory.body.result.outcome, "directory"); assert.equal(directory.body.result.entries[0].name, "note.txt");
    await symlink(directories[1], path.join(directories[0], "escape"));
    const open = (file: string[], id = ids[0]) => request(api("files", "/open"), "POST", { workspace_id: id, path: file });
    assert.equal((await open(["escape", "note.txt"])).body.result.outcome, "denied");
    assert.equal((await open(["..", "two", "note.txt"])).status, 400);
    assert.equal((await open(["note.txt"], ids[1])).status, 400);
    await writeFile(path.join(directories[0], "binary"), Buffer.from([0, 255]));
    await writeFile(path.join(directories[0], "large"), Buffer.alloc(256 * 1024 + 1, 65));
    await writeFile(path.join(directories[0], "empty"), "");
    assert.equal((await open(["binary"])).body.result.outcome, "binary");
    assert.equal((await open(["large"])).body.result.outcome, "too-large");
    assert.equal((await open(["missing"])).body.result.outcome, "missing");
    assert.equal((await open(["empty"])).body.result.text, "");
    const first = await open(["note.txt"]); assert.equal(first.status, 200); assert.equal(first.body.result.text, "中文🙂\nfirst\n");
    const capture = (port: string, fingerprint: string, range = {}) => request(api("files", "/capture"), "POST", {
      workspace_id: ids[0], path: ["note.txt"], port, fingerprint, ...range,
    });
    const before = await capture("before", first.body.result.fingerprint);
    assert.equal(before.status, 200, JSON.stringify(before.body)); assert.equal(before.body.saved.artifact.version, 1);
    const codingSession = (await request(api("coding", "/sessions"), "POST", { title: "固定文件材料" })).body.session.session_id;
    const materialPath = `/sessions/${codingSession}/materials`;
    const candidates = await request(api("coding", materialPath));
    assert.equal(candidates.status, 200, JSON.stringify(candidates));
    assert.equal(candidates.body.materials.length, 1, "Files output reaches the optional Coding input through the real graph");
    const fixed = candidates.body.materials[0].reference;
    assert.equal(candidates.body.materials[0].text, first.body.result.text);
    await request(api("coding", `/sessions/${codingSession}`), "PATCH", { materials: [fixed] });
    const foreign = (await request(api("coding", "/sessions", projects[1]), "POST", { title: "Other project" })).body.session.session_id;
    await request(api("coding", `/sessions/${foreign}`, projects[1]), "PATCH", { materials: [fixed] });
    const denied = await request(api("coding", `/sessions/${foreign}/materials`, projects[1]));
    assert.equal(denied.body.materials[0].text, null); assert.ok(denied.body.materials[0].error);
    const stats = await request(api("text-stats", "/state"));
    assert.equal(stats.status, 200, JSON.stringify(stats.body));
    assert.equal(stats.body.view.characters, Array.from(first.body.result.text).length); assert.equal(stats.body.view.lines, 2);
    assert.ok(stats.body.html.includes("UTF-8"));
    const selection = await capture("selection", first.body.result.fingerprint, { start: 2, end: 4 });
    assert.equal(selection.body.snapshot.text, "🙂");
    assert.equal((await capture("selection", first.body.result.fingerprint, { start: 2, end: 9999 })).status, 400);
    await writeFile(path.join(directories[0], "note.txt"), "中文🙂\nsecond\n");
    assert.equal((await capture("after", first.body.result.fingerprint)).status, 400, "cannot silently capture bytes the user has not read");
    const second = await open(["note.txt"]);
    assert.equal((await capture("after", second.body.result.fingerprint)).status, 200);
    const diff = await request(api("diff", "/state")); assert.equal(diff.body.view.phase, "ready");
    assert.equal(diff.body.view.identical, false); assert.ok(diff.body.html.includes("second"));
    assert.deepEqual((await request(api("text-stats", "/state"))).body, stats.body, "stats still count fixed before, not current disk");
    await close(); await start();
    assert.deepEqual((await request(api("diff", "/state"))).body, diff.body, "same immutable comparison after full server restart");
    assert.equal((await request(api("files", "/state"))).body.position.path[0], "note.txt");
    assert.equal((await request(api("workspace", "/state"))).body.selected, ids[0]);
    assert.deepEqual((await request(api("coding", `/sessions/${codingSession}`))).body.materials, [fixed]);
    const republished = await capture("before", second.body.result.fingerprint);
    assert.equal(republished.body.saved.artifact.version, 2);
    const updatedChoices = (await request(api("coding", materialPath))).body.materials;
    assert.ok(updatedChoices.some((item: any) => item.reference.artifact_id === fixed.artifact_id && item.reference.version === 2));
    const retained = updatedChoices.find((item: any) => item.reference.artifact_id === fixed.artifact_id && item.reference.version === 1);
    assert.equal(retained.text, first.body.result.text); assert.equal(retained.source, "已选固定版本");
    await request(api("workspace", "/select"), "POST", { workspace_id: ids[1] });
    assert.equal((await request(api("diff", "/state"))).body.view.phase, "waiting");
    assert.equal((await request(api("text-stats", "/state"))).body.view.phase, "waiting");
    assert.equal((await capture("after", second.body.result.fingerprint)).status, 400);
    // Revoking the catalog membership is checked on the next Host read, even with a retained graph input.
    const unlinked = await request(`/projects/${projects[0]}/api/workspaces/${ids[1]}/unlink`, "POST", { user_confirmed: true });
    assert.equal(unlinked.status, 200, JSON.stringify(unlinked.body));
    assert.equal((await open(["note.txt"], ids[1])).status, 400);
  } finally { await close(); await rm(root, { recursive: true, force: true }); }
});
