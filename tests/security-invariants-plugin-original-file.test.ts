import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, truncateSync, unlinkSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ORIGINAL_FILE_MAX_BYTES, projectDeletedHooksFor, readOriginalFile, registerOriginalFile, releaseOriginalFile } from "@molis-ai/molis-work-app-local-host";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { grantLocalOriginal, localOriginalProbe } from "./fixtures/materials-local-original.js";

const HEADER = "sec-molis-work-original-path", NOT_OFFERED = "plugin.materials_original_not_offered";
type Probe = ReturnType<typeof localOriginalProbe>;

/** The Host's entry as the desktop shell or a local client without Fetch Metadata sends it: Node's `http`, so no `Sec-Fetch-*` is added. */
function send(env: { origin: string; token: string }, path: string, input: { method?: string; body?: unknown; headers?: Record<string, string | string[]> }) {
  return new Promise<{ status: number; body: { code?: string; claimed?: string } }>((resolve, reject) => {
    const url = new URL(env.origin + path), data = JSON.stringify(input.body ?? {});
    const request = httpRequest({ host: url.hostname, port: url.port, path: url.pathname + url.search, method: input.method ?? "POST",
      headers: { origin: env.origin, host: url.host, "content-type": "application/json", "content-length": Buffer.byteLength(data),
        "x-molis-work-control-token": env.token, "x-molis-work-idempotency-key": randomUUID(), ...input.headers } }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => { try { resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") }); } catch (error) { reject(error); } });
    });
    request.once("error", reject);
    if ((input.method ?? "POST") === "POST") request.write(data);
    request.end();
  });
}

/** An import through the plugin's own route, with the file the person chose put where the Host's entry reads it. */
const importFile = (env: { origin: string; token: string }, probe: Probe, key: string, file: string, headers: Record<string, string | string[]> = { [HEADER]: encodeURIComponent(file) }) =>
  send(env, `/api/plugins/${probe.id}/claim`, { body: { key }, headers });

async function serve(t: TestContext, probes: Probe[]) {
  const env = await serveHomeRuntime(t, { pluginFixtures: { home: probes.map(probe => probe.definition) } });
  for (const probe of probes) await grantLocalOriginal(env.host, probe);
  const files = realpathSync(mkdtempSync(join(tmpdir(), "originals-")));
  t.after(() => rmSync(files, { recursive: true, force: true }));
  const file = (name: string, content: string) => { const target = join(files, name); mkdirSync(join(target, ".."), { recursive: true }); writeFileSync(target, content); return target; };
  const read = (probe: Probe, key: string, max?: number) => env.host.homeActionClient().invoke(person(probe.permissions), probe.original, max === undefined ? { key } : { key, max }) as Promise<{ text: string; length: number }>;
  return { ...env, files, file, read, installId: (probe: Probe) => env.host.homePlugins!.installation(probe.id)!.install_id };
}

test("S-43 a plugin that did not declare materials:original has no original-file methods, and one that declared it but was not granted it is refused", { timeout: 60_000 }, async t => {
  const none = localOriginalProbe("origonone", { permissions: [] }), fetchOnly = localOriginalProbe("origfetchonly", { permissions: ["materials:fetch"] }), probe = localOriginalProbe("origungranted");
  const env = await serve(t, [none, fetchOnly, probe]), file = env.file("a.txt", "granted bytes");
  assert.equal(none.contexts.at(-1)!.services!.materials, undefined);
  const service = fetchOnly.contexts.at(-1)!.services!.materials!;
  assert.deepEqual(Object.keys(service), ["readSource"]);
  for (const method of ["claimOriginal", "readOriginal", "releaseOriginal"]) assert.equal(Reflect.get(service, method), undefined, method);
  assert.deepEqual(await importFile(env, probe, "doc", file), { status: 200, body: { claimed: "doc" } });
  assert.equal((await env.read(probe, "doc")).text, "granted bytes");
  const platform = await env.host.homePlugins!.ready(), id = env.installId(probe);
  await platform.runtime.stop(id);
  platform.runtime.grant(id, ["storage:private", "materials:fetch"]);
  await platform.supervisor.restart(probe.id);
  await assert.rejects(env.read(probe, "doc"), { code: "actions.plugin_permission" });
  const refused = await importFile(env, probe, "other", file);
  // Through the route the person's own permissions are what the installation holds, so the refusal is the caller's: either way, refused.
  assert.equal(refused.status, 403); assert.equal(refused.body.code, "actions.forbidden");
  await platform.runtime.stop(id); platform.runtime.grant(id, probe.permissions); await platform.supervisor.restart(probe.id);
  await assert.rejects(env.read(probe, "other"), { code: "material.original.not_registered" }, "the refused import registered nothing");
});

test("S-43 only the Host's entry can offer a file: nothing a plugin, an input or another audience names becomes a path", { timeout: 60_000 }, async t => {
  const probe = localOriginalProbe("origforge"), env = await serve(t, [probe]), file = env.file("secret.txt", "not offered"), encoded = encodeURIComponent(file);
  const notRegistered = async (key: string) => assert.rejects(env.read(probe, key), { code: "material.original.not_registered" }, key);
  const refusals: Array<[string, Promise<{ body: { code?: string } }>]> = [
    ["no header", importFile(env, probe, "no-header", file, {})],
    ["the path in the body", send(env, `/api/plugins/${probe.id}/claim`, { body: { key: "in-body", origin_realpath: file, path: file, original_file: { path: file, install_id: env.installId(probe) } } })],
    ["the path in the query", send(env, `/api/plugins/${probe.id}/claim?key=in-query&path=${encoded}&origin_realpath=${encoded}`, { body: {} })],
    ["a header on a request that carries Fetch Metadata, which a page always sends", importFile(env, probe, "fetch-metadata", file, { [HEADER]: encoded, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" })],
    ["a header on a request with only one Fetch Metadata field", importFile(env, probe, "fetch-dest", file, { [HEADER]: encoded, "sec-fetch-dest": "empty" })],
    ["the header twice", importFile(env, probe, "twice", file, { [HEADER]: [encoded, encodeURIComponent(env.file("other.txt", "x"))] })],
    ["a read, not an import", send(env, `/api/plugins/${probe.id}/claim-get?key=by-get`, { method: "GET", headers: { [HEADER]: encoded } })],
    ["a relative path", importFile(env, probe, "relative", file, { [HEADER]: encodeURIComponent("secret.txt") })],
    ["a path with a NUL", importFile(env, probe, "nul", file, { [HEADER]: `${encoded}%00.txt` })],
    ["a path that is not percent-encoded text", importFile(env, probe, "bad-encoding", file, { [HEADER]: "%E0%A4%A" })],
    ["a path past 4096 characters", importFile(env, probe, "long", file, { [HEADER]: encodeURIComponent(`/${"a".repeat(5000)}`) })],
    ["a plugin that hands the Host a control it made, with a file on it", send(env, `/api/plugins/${probe.id}/forge`, { body: { key: "forged", path: file } })],
  ];
  for (const [name, answer] of refusals) assert.equal((await answer).body.code, NOT_OFFERED, name);
  for (const key of ["no-header", "in-body", "in-query", "fetch-metadata", "fetch-dest", "twice", "by-get", "relative", "nul", "bad-encoding", "long", "forged"]) await notRegistered(key);
  // The same refusal for a call that never came through the Host's entry, however its context is dressed.
  const direct = (caller: Record<string, unknown>) => env.host.homeActionClient().invoke({ ...person(probe.permissions), ...caller } as never, probe.claim, { key: "direct" });
  await assert.rejects(direct({}), { code: NOT_OFFERED });
  await assert.rejects(direct({ original_file: { path: file, install_id: "an-other-installation" } }), { code: NOT_OFFERED });
  await assert.rejects(direct({ audience: "agent", original_file: { path: file, install_id: env.installId(probe) } }), { code: NOT_OFFERED });
  await assert.rejects(direct({ audience: "mcp", original_file: { path: file, install_id: env.installId(probe) } }), { code: NOT_OFFERED });
  await notRegistered("direct");
});

test("S-43 the file the Host's entry was given is kept for this installation and the plugin's own key, and read back as the same bytes", { timeout: 60_000 }, async t => {
  const one = localOriginalProbe("origone"), two = localOriginalProbe("origtwo"), env = await serve(t, [one, two]);
  const mine = env.file("mine.txt", "第一份原始文件"), theirs = env.file("theirs.txt", "second plugin's file");
  assert.deepEqual(await importFile(env, one, "doc", mine), { status: 200, body: { claimed: "doc" } });
  assert.deepEqual(await importFile(env, two, "doc", theirs), { status: 200, body: { claimed: "doc" } });
  assert.deepEqual(await env.read(one, "doc"), { text: "第一份原始文件", length: Buffer.byteLength("第一份原始文件") });
  assert.equal((await env.read(two, "doc")).text, "second plugin's file", "the same key is another record for another plugin");
  await assert.rejects(env.read(one, "other-key"), { code: "material.original.not_registered" });
  // A plugin names a record key, never a path: a path or a path-like key is only an unknown record.
  for (const key of [mine, "/etc/passwd", "../../etc/passwd", "doc/../doc"]) await assert.rejects(env.read(one, key), { code: "material.original.not_registered" }, key);
  for (const key of ["", "bad\nkey", "k".repeat(201)]) await assert.rejects(env.read(one, key), { code: "plugin.materials_original_key_invalid" }, JSON.stringify(key));
  // Below the plugin layer: another plugin, another installation, a project, another key are other rows.
  const key = { plugin_id: one.id, install_id: env.installId(one), project_id: null, record_key: "doc" };
  assert.equal((await readOriginalFile(env.home, key)).toString("utf8"), "第一份原始文件");
  for (const other of [{ ...key, plugin_id: two.id }, { ...key, install_id: env.installId(two) }, { ...key, install_id: "install-from-before" }, { ...key, project_id: "project-1" }, { ...key, record_key: "Doc" }]) {
    await assert.rejects(readOriginalFile(env.home, other), { code: "material.original.not_registered" }, JSON.stringify(other));
  }
  await assert.rejects(importFile(env, one, "gone", env.file("keep.txt", "x")).then(async () => { await env.host.homeActionClient().invoke(person(one.permissions), one.release, { key: "gone" }); return env.read(one, "gone"); }), { code: "material.original.not_registered" }, "release removes it");
  assert.equal((await env.read(one, "doc")).text, "第一份原始文件", "releasing one record leaves the others");
  assert.equal((await env.read(two, "doc")).text, "second plugin's file");
});

test("S-43 a project-level plugin's registrations stay in their project: the same installation and key in another project read nothing, and deleting the project forgets them, not the file", { timeout: 60_000 }, async t => {
  const probe = localOriginalProbe("origprojects", { required: true }), env = await serveHomeRuntime(t, { pluginFixtures: { project: [probe.definition] } });
  const a = await env.project("原始文件 A"), b = await env.project("原始文件 B");
  const files = realpathSync(mkdtempSync(join(tmpdir(), "originals-")));
  t.after(() => rmSync(files, { recursive: true, force: true }));
  const inA = join(files, "a.txt"), inB = join(files, "b.txt");
  writeFileSync(inA, "A 项目导入的文件"); writeFileSync(inB, "B 项目导入的文件");
  type Project = typeof a;
  const importInto = (project: Project, key: string, file: string) =>
    send(env, `/projects/${project.project_id}/api/plugins/${probe.id}/claim`, { body: { key }, headers: { [HEADER]: encodeURIComponent(file) } });
  const as = (project: Project) => person(probe.permissions, project.project_id);
  const read = async (project: Project, key: string) => ((await env.host.actionClient(project.reference).invoke(as(project), probe.original, { key })) as { text: string }).text;
  const unregistered = { code: "material.original.not_registered" };

  assert.deepEqual(await importInto(a, "item-1", inA), { status: 200, body: { claimed: "item-1" } });
  assert.equal(await read(a, "item-1"), "A 项目导入的文件");
  await assert.rejects(read(b, "item-1"), unregistered, "the same plugin, installation and record key in another project");
  // The installation's id is the same in both projects: the project is what keeps the rows apart.
  const installs = [...new Set(probe.contexts.map(context => context.install_id))];
  assert.equal(installs.length, 1);
  assert.deepEqual(new Set(probe.contexts.map(context => context.project_id)), new Set([a.project_id, b.project_id]));
  const key = { plugin_id: probe.id, install_id: installs[0]!, project_id: a.project_id, record_key: "item-1" };
  for (const other of [{ ...key, project_id: b.project_id }, { ...key, project_id: null }]) await assert.rejects(readOriginalFile(env.home, other), unregistered, JSON.stringify(other));

  assert.deepEqual(await importInto(b, "item-1", inB), { status: 200, body: { claimed: "item-1" } });
  assert.equal(await read(b, "item-1"), "B 项目导入的文件");
  assert.equal(await read(a, "item-1"), "A 项目导入的文件", "B's import under the same key replaced nothing in A");
  await env.host.actionClient(b.reference).invoke(as(b), probe.release, { key: "item-1" });
  await assert.rejects(read(b, "item-1"), unregistered);
  assert.equal(await read(a, "item-1"), "A 项目导入的文件", "releasing in B leaves A's");

  // Deleting a project forgets its registrations; the file is the person's and stays, and the other project keeps its own.
  await importInto(b, "item-1", inB);
  assert.equal(await projectDeletedHooksFor(env.home).clear("plugin-originals", a.project_id), true);
  await assert.rejects(readOriginalFile(env.home, key), unregistered);
  assert.equal(await read(b, "item-1"), "B 项目导入的文件");
  assert.equal(readFileSync(inA, "utf8"), "A 项目导入的文件");
});

test("S-43 reading re-resolves the path first: a symlink put in its place, a moved folder, a removed file and a folder are all refused, and nothing is listed or written", { timeout: 60_000 }, async t => {
  const probe = localOriginalProbe("origswap"), env = await serve(t, [probe]);
  const secret = env.file("secret/secret.txt", "someone else's secret"), lookalike = env.file("secret/inner.txt", "a file of the same name elsewhere");
  const cases: Array<[string, string, () => void, string]> = [];
  const original = (name: string) => env.file(name, `original ${name}`);
  const swapped = original("swapped.txt"), parent = original("parent/inner.txt"), removed = original("removed.txt"), folder = original("folder.txt"), grown = original("grown.txt");
  for (const [key, file] of [["swapped", swapped], ["parent", parent], ["removed", removed], ["folder", folder], ["grown", grown]] as const) {
    assert.equal((await importFile(env, probe, key, file)).status, 200, key);
    assert.equal((await env.read(probe, key)).text, `original ${file.slice(env.files.length + 1)}`);
  }
  cases.push(["swapped", "material.original.path_changed", () => { unlinkSync(swapped); symlinkSync(secret, swapped); }, "a symlink put where the file was"]);
  cases.push(["parent", "material.original.path_changed", () => { renameSync(join(env.files, "parent"), join(env.files, "parent-moved")); symlinkSync(join(env.files, "secret"), join(env.files, "parent")); }, "a symlink put where a folder on the way was"]);
  cases.push(["removed", "material.original.missing", () => unlinkSync(removed), "the file removed"]);
  cases.push(["folder", "material.original.not_file", () => { unlinkSync(folder); mkdirSync(folder); writeFileSync(join(folder, "x"), "listed?"); }, "a folder at the same path"]);
  cases.push(["grown", "material.original.too_large", () => truncateSync(grown, ORIGINAL_FILE_MAX_BYTES + 1), "a file past the cap"]);
  const before = (path: string) => readdirSync(path).sort().join(",");
  const listing = before(env.files);
  for (const [key, code, change, name] of cases) {
    change();
    await assert.rejects(env.read(probe, key), { code }, name);
    await assert.rejects(env.read(probe, key), (error: Error) => !error.message.includes(env.files) && !error.message.includes("secret"), `${name}: nothing of the path or the other file is in the message`);
  }
  assert.equal(readFileSync(secret, "utf8"), "someone else's secret", "the file the link points to was never written");
  assert.equal(readFileSync(lookalike, "utf8"), "a file of the same name elsewhere");
  assert.equal(statSync(grown).size, ORIGINAL_FILE_MAX_BYTES + 1);
  assert.equal(before(join(env.files, "parent-moved")), "inner.txt");
  assert.notEqual(before(env.files), listing, "(the test changed the folder itself)");
  // The request may lower the cap, never raise it; a limit that is not a whole number of bytes is not a limit.
  const small = env.file("small.txt", "0123456789");
  await importFile(env, probe, "small", small);
  await assert.rejects(env.read(probe, "small", 4), { code: "material.original.too_large" });
  await assert.rejects(env.read(probe, "small", ORIGINAL_FILE_MAX_BYTES + 1), { code: "material.original.invalid_limit" });
  for (const max of [0, -1]) await assert.rejects(env.read(probe, "small", max), { code: "material.original.invalid_limit" }, String(max));
  assert.equal((await env.read(probe, "small", 10)).text, "0123456789");
});

test("S-43 a file offered through a symlink is kept as the real file it leads to, so moving the link later changes nothing", { timeout: 60_000 }, async t => {
  const probe = localOriginalProbe("origlink"), env = await serve(t, [probe]);
  const target = env.file("real/target.txt", "the real file"), elsewhere = env.file("real/elsewhere.txt", "somewhere else"), link = join(env.files, "link.txt");
  symlinkSync(target, link);
  assert.equal((await importFile(env, probe, "doc", link)).status, 200);
  unlinkSync(link); symlinkSync(elsewhere, link);
  assert.equal((await env.read(probe, "doc")).text, "the real file");
  assert.equal((await importFile(env, probe, "missing", join(env.files, "no-such-file.txt"))).body.code, "material.original.missing");
  assert.equal((await importFile(env, probe, "folder", join(env.files, "real"))).body.code, "material.original.not_file");
  for (const key of ["missing", "folder"]) await assert.rejects(env.read(probe, key), { code: "material.original.not_registered" }, key);
});

test("S-43 a call the Runtime cancels, revokes or stops before the write registers or releases nothing", { timeout: 60_000 }, async t => {
  const probe = localOriginalProbe("origcancel"), env = await serve(t, [probe]), file = env.file("a.txt", "kept");
  const key = { plugin_id: probe.id, install_id: env.installId(probe), project_id: null, record_key: "doc" };
  const stopped = () => Promise.reject(Object.assign(new Error("revoked"), { code: "actions.forbidden" }));
  await assert.rejects(registerOriginalFile(env.home, key, file, stopped), { code: "actions.forbidden" });
  await assert.rejects(readOriginalFile(env.home, key), { code: "material.original.not_registered" }, "a refused registration wrote nothing");
  await registerOriginalFile(env.home, key, file, async () => undefined);
  await assert.rejects(releaseOriginalFile(env.home, key, stopped), { code: "actions.forbidden" });
  assert.equal((await readOriginalFile(env.home, key)).toString("utf8"), "kept", "a refused release removed nothing");
  await releaseOriginalFile(env.home, key, async () => undefined);
  await assert.rejects(readOriginalFile(env.home, key), { code: "material.original.not_registered" });
  await assert.rejects(registerOriginalFile(env.home, key, "relative/path.txt", async () => undefined), { code: "material.original.invalid_path" });
});
