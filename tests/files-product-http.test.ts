import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";
import { FILES_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-files";
import { addProjectInputFolder, changeProjectDirectories, directoriesWebOf, projectDirectoriesPath, projectOutputOf, readProjectDirectories, setProjectOutputFolder } from "./fixtures/project-directories-http.js";

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
  // A request the current state cannot honour is the caller's mistake: 400, and the body names the owner's code (the route answers by kind, not by message).
  const refused = (response: { status: number; body: { code?: string } }, code: string, message?: string) => assert.deepEqual([response.status, response.body.code], [400, code], message ?? JSON.stringify(response.body));
  try {
    await start();
    const projects: string[] = [];
    for (const display_name of ["文件 A", "文件 B"]) {
      const created = await request("/api/settings/projects", "POST", { display_name, user_confirmed: true });
      assert.equal(created.status, 201); projects.push(created.body.project.project_id);
      // Files is enabled for itself: Coding no longer embeds it (WMD-05; its files face reads through the platform).
      await request(`/api/settings/projects/${projects.at(-1)}/plugins`, "POST", { plugin_id: "files" });
    }
    const api = (plugin: string, suffix: string, project = projects[0]) => `/projects/${project}/api/plugins/io.molis.work.${plugin}${suffix}`;
    const web = directoriesWebOf(request);
    const directories: string[] = [];
    for (const name of ["one", "two"]) {
      const directory = path.join(root, name); await mkdir(directory); directories.push(directory);
      await writeFile(path.join(directory, "note.txt"), "中文🙂\nfirst\n");
    }
    // The project's folders are set in its settings as the person sets them: "one" is its output, "two" an input it only reads.
    const ids = [(await setProjectOutputFolder(web, projects[0], directories[0]!)).workspace_id, (await addProjectInputFolder(web, projects[0], directories[1]!)).workspace_id];
    const settings = await readProjectDirectories(web, projects[0]);
    assert.deepEqual(settings.directories.map(item => [item.workspace_id, item.roles]), [[ids[0], ["output"]], [ids[1], ["input"]]]);
    assert.ok(settings.directories.every(item => !Object.hasOwn(item, "project_ids")), "settings do not expose other projects");
    // Choosing the output needs the Home's control token, and names only this project's own folders.
    const setOutput = async (workspace_id: string, project = projects[0], authorized = true) => request(projectDirectoriesPath(project), "POST",
      { change: "set_output", input: { workspace_id, expected_revision: (await readProjectDirectories(web, project)).revision } }, authorized);
    assert.equal((await setOutput(ids[0]!, projects[0], false)).status, 403);
    const elsewhere = await setOutput(ids[0]!, projects[1]);
    assert.deepEqual([elsewhere.status, elsewhere.body.code], [400, "catalog.context.workspace_membership_not_found"], JSON.stringify(elsewhere.body));
    // RAC-2532 (BL-616): which folder Files browses is the page's to name (page state); naming none, it is the project's output
    // (SSC-17), and a folder of another project is never read. That the Files this Host runs is its registration's project_runtime,
    // with nothing from the Host, is RAC-571 and RAC-2530's (tests/builtin-plugin-assembly-gate.test.ts).
    const browsed = await request(api("files", "/state")); assert.equal(browsed.status, 200, JSON.stringify(browsed.body));
    assert.deepEqual([browsed.body.workspace.workspace_id, browsed.body.resolved], [ids[0], null]);
    const named = await request(api("files", "/state?workspace_id=" + ids[1]));
    assert.deepEqual([named.body.workspace.workspace_id, named.body.resolved], [ids[1], ids[1]]);
    const otherFolder = projectOutputOf(await readProjectDirectories(web, projects[1])).workspace_id;
    refused(await request(api("files", "/directory?path=[]&workspace_id=" + otherFolder)), "files.invalid");
    const directory = await request(api("files", "/directory?path=[]&workspace_id=" + ids[0]));
    assert.equal(directory.body.result.outcome, "directory"); assert.equal(directory.body.result.entries[0].name, "note.txt");
    await symlink(directories[1], path.join(directories[0], "escape"));
    const open = (file: string[], id = ids[0]) => request(api("files", "/open"), "POST", { workspace_id: id, path: file });
    assert.equal((await open(["escape", "note.txt"])).body.result.outcome, "denied");
    // R4A3-01: the production Files route still refuses traversal under the Work contract code.
    refused(await open(["..", "two", "note.txt"]), "work.workspace.invalid_path");
    refused(await open(["note.txt"], otherFolder), "files.invalid");
    await writeFile(path.join(directories[0], "binary"), Buffer.from([0, 255]));
    await writeFile(path.join(directories[0], "large"), Buffer.alloc(256 * 1024 + 1, 65));
    await writeFile(path.join(directories[0], "empty"), "");
    const binary = await open(["binary"]); assert.equal(binary.body.result?.outcome, "binary", JSON.stringify(binary.body));
    assert.equal((await open(["large"])).body.result.outcome, "too-large");
    assert.equal((await open(["missing"])).body.result.outcome, "missing");
    assert.equal((await open(["empty"])).body.result.text, "");
    const first = await open(["note.txt"]); assert.equal(first.status, 200); assert.equal(first.body.result.text, "中文🙂\nfirst\n");
    const capture = (port: string, fingerprint: string, range = {}) => request(api("files", "/capture"), "POST", {
      workspace_id: ids[0], path: ["note.txt"], port, fingerprint, ...range,
    });
    const before = await capture("before", first.body.result.fingerprint);
    assert.equal(before.status, 200, JSON.stringify(before.body)); assert.equal(before.body.saved.artifact.version, 1);
    // Since S1 Diff and Text Stats read the versions fixed through the platform's materials service (the reader's 固定快照 menu);
    // Files' own captures above still answer until Files is removed, and the default graph below is the materials one.
    const materials = (route: string, body: Record<string, unknown>) => request(`/projects/${projects[0]}/api/materials/${route}`, "POST", body);
    const fixMaterial = async (port: string, text: string) => {
      const fixed = await materials("capture", { workspace_id: ids[0], path: ["note.txt"], fingerprint: createHash("sha256").update(text).digest("hex"), port });
      assert.equal(fixed.status, 200, JSON.stringify(fixed.body));
    };
    await fixMaterial("before", first.body.result.text);
    const stats = await request(api("text-stats", "/state"));
    assert.equal(stats.status, 200, JSON.stringify(stats.body));
    assert.equal(stats.body.view.characters, Array.from(first.body.result.text).length); assert.equal(stats.body.view.lines, 2);
    assert.ok(stats.body.html.includes("UTF-8"));
    const selection = await capture("selection", first.body.result.fingerprint, { start: 2, end: 4 });
    assert.equal(selection.body.snapshot.text, "🙂");
    refused(await capture("selection", first.body.result.fingerprint, { start: 2, end: 9999 }), "files.invalid");
    await writeFile(path.join(directories[0], "note.txt"), "中文🙂\nsecond\n");
    refused(await capture("after", first.body.result.fingerprint), "files.invalid", "cannot silently capture bytes the user has not read");
    const second = await open(["note.txt"]);
    assert.equal((await capture("after", second.body.result.fingerprint)).status, 200);
    await fixMaterial("after", second.body.result.text);
    const diff = await request(api("diff", "/state")); assert.equal(diff.body.view.phase, "ready");
    assert.equal(diff.body.view.identical, false); assert.ok(diff.body.html.includes("second"));
    assert.deepEqual((await request(api("text-stats", "/state"))).body, stats.body, "stats still count fixed before, not current disk");
    await close(); await start();
    assert.deepEqual((await request(api("diff", "/state"))).body, diff.body, "same immutable comparison after full server restart");
    assert.equal((await request(api("files", "/state"))).body.position.path[0], "note.txt");
    assert.equal((await request(api("files", "/state"))).body.position.workspace_id, ids[0], "the folder last read survives the restart");
    const republished = await capture("before", second.body.result.fingerprint);
    assert.equal(republished.body.saved.artifact.version, 2);
    // Reading the input instead: the snapshots handed on came from the output, so they are withdrawn.
    const input = await open(["note.txt"], ids[1]); assert.equal(input.status, 200, JSON.stringify(input.body)); assert.equal(input.body.result.text, "中文🙂\nfirst\n");
    const opened = await materials("open", { workspace_id: ids[1], path: ["note.txt"] }); assert.equal(opened.status, 200, JSON.stringify(opened.body));
    assert.equal((await request(api("diff", "/state"))).body.view.phase, "waiting");
    assert.equal((await request(api("text-stats", "/state"))).body.view.phase, "waiting");
    refused(await request(api("files", "/capture"), "POST", { workspace_id: otherFolder, path: ["note.txt"], port: "after", fingerprint: second.body.result.fingerprint }), "files.invalid",
      "a snapshot never comes from another project's folder");
    // Removing the input is checked on the next Host read, even with a retained graph input.
    await changeProjectDirectories(web, projects[0], "remove_input", { workspace_id: ids[1] });
    refused(await open(["note.txt"], ids[1]), "files.invalid");
  } finally { await close(); await rm(root, { recursive: true, force: true }); }
});
