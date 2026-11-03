import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ORIGINAL_FILE_MAX_BYTES, readMaterialLocalPage, readOriginalFile, readOriginalRange, registerOriginalFile, releaseOriginalFile, trackHostPort } from "@molis-ai/molis-work-app-local-host";
import { ActionError, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxEffects, SandboxIdentity, SandboxJson, SandboxOperationContract, SandboxPluginContract, SandboxSdkMethod } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { createPluginMaterialsClient, runInPluginAction, type PluginMaterialsPort } from "@molis-ai/molis-work-plugin-runtime";
import { assertContract, DEFAULT_SANDBOX_LIMITS, SandboxBroker, sandboxServicesFor } from "@molis-ai/molis-work-plugin-sandbox";

// S-65 for `services.materials`, the two reads that reach outside the sandbox's own bytes (PG-017 P2d): a page on this machine (`fetch_local`) and the
// file the person handed the Host's entry (`original`). The sandbox gets no socket, no address and no path: the plugin names an address as data and the
// Host decides and fetches (its loopback rule, its own ports, every redirect), and only extracted text comes back; the plugin names a file by its own
// key and the Host's registry holds the path, and the bytes come back in parts of at most 256 KiB, each part a Host read with all of its checks.
// Three gates in series, as in S-60: the broker (the operation's declared and approved effect, the shape of the request), the Host's client (the
// Manifest's permission, the grant, the running concurrent action and, for a claim, the file the Host's entry offered to this installation) and the
// Host's readers (the address, the registered file). The client and the readers here are the Host's own, over a temporary Home and a local server.
// RAC-360 to RAC-369 are this slice's.

const PLUGIN_ID = "io.molis.work.example.sbxlocaloriginal";
const IDENTITY: SandboxIdentity = { projectId: "p", installationId: "install-sbx", pluginId: PLUGIN_ID, namespace: "installed" };
const LOCAL: SandboxEffects = { materials: ["fetch_local"] }, ORIGINAL: SandboxEffects = { materials: ["original"] }, BOTH: SandboxEffects = { materials: ["fetch_local", "original"] }, EVERY: SandboxEffects = { materials: ["read", "fetch_local", "original"] };
const PART = 256 * 1024;
const PERMISSIONS = ["storage:private", "materials:read", "materials:fetch_local", "materials:original"];
const manifest: PluginManifest = {
  schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version: "1.0.0", name: "Sandbox local and original probe", kind: "app",
  publisher: { publisher_id: "example", signature: "probe-sbxlocaloriginal" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: PERMISSIONS.map(permission => ({ permission, required: true, reason: "probe" })),
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
};
const operation = (kind: "query" | "command", effects: SandboxEffects): SandboxOperationContract =>
  ({ id: "read", kind, input: { type: "null" }, output: { type: "null" }, errors: [], effects, examples: [] });

type Outcome = { ok: SandboxJson } | { error: string };
interface Server_ { readonly origin: string; readonly port: number; readonly hits: string[]; readonly server: Server }

/** A page on this machine: an ordinary one, a redirect to a private address, a body larger than the channel, and a slow one that waits for the client to go. */
async function pageServer(t: TestContext): Promise<Server_> {
  const hits: string[] = [];
  const server = createServer((request, response) => {
    hits.push(`${request.method} ${request.url} cookie=${request.headers.cookie ?? ""} auth=${request.headers.authorization ?? ""}`);
    if (request.url === "/redirect") { response.writeHead(302, { location: "http://10.0.0.1/inside", connection: "close" }); response.end(); return; }
    if (request.url === "/big") { response.writeHead(200, { "content-type": "text/plain; charset=utf-8", connection: "close" }); response.end("字".repeat(300_000)); return; }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "set-cookie": "secret=1", connection: "close" });
    response.end("<html><head><title>本机页面</title></head><body><p>local page 正文</p></body></html>");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const port = (server.address() as { port: number }).port;
  return { origin: `http://127.0.0.1:${port}`, port, hits, server };
}

async function rig(t: TestContext, options: { install?: string; home?: string; project?: string | null } = {}) {
  const home = options.home ?? realpathSync(mkdtempSync(join(tmpdir(), "sandbox-local-original-")));
  if (!options.home) t.after(() => rmSync(home, { recursive: true, force: true }));
  const files = realpathSync(mkdtempSync(join(tmpdir(), "sandbox-local-original-files-")));
  t.after(() => rmSync(files, { recursive: true, force: true }));
  const install = options.install ?? "install-sbx", project = options.project === undefined ? "p" : options.project;
  const state = { granted: true, active: true, abort: new AbortController(), offered: undefined as string | undefined, audience: "user" as "user" | "agent", offeredFor: install };
  const calls: string[] = [];
  const port: PluginMaterialsPort = {
    async extract() { calls.push("extract"); throw new Error("unused"); },
    async readDocuments() { calls.push("readDocuments"); throw new Error("unused"); },
    async readSource() { calls.push("readSource"); throw new Error("the sandbox reached the network reader"); },
    readLocalPage: (url, options) => { calls.push(`readLocalPage ${url}`); return readMaterialLocalPage(url, { signal: options.signal, beforeDispatch: options.beforeEffect }); },
    claimOriginal: (key, offered, options) => { calls.push(`claimOriginal ${key.record_key}`); return registerOriginalFile(home, key, offered, options.beforeEffect); },
    readOriginal: (key, options) => { calls.push(`readOriginal ${key.record_key}`); return readOriginalFile(home, key, { maxBytes: options.maxBytes, signal: options.signal }); },
    readOriginalRange: (key, options) => { calls.push(`readOriginalRange ${key.record_key} ${options.offset}+${options.length}`);
      return readOriginalRange(home, key, { offset: options.offset, length: options.length, revision: options.revision, signal: options.signal }); },
    releaseOriginal: (key, options) => { calls.push(`releaseOriginal ${key.record_key}`); return releaseOriginalFile(home, key, options.beforeEffect); },
  };
  const client = createPluginMaterialsClient(manifest, port, { install_id: install, installation_generation: "g1", project_id: project,
    assertActive: () => { if (!state.active) throw new ActionError("actions.forbidden", "实例已停止"); },
    requireGrant: permission => { if (!state.granted) throw new ActionError("actions.forbidden", `没有 ${permission}`); } });
  const storage = { get: () => null, set: () => {}, delete: () => false, compareAndSet: () => true };
  const action: ActionDefinition = { capability_id: "example.sbx.local", version: 1, operation: "command", action: {
    title: "read", description: "probe", scope: "project", kind: "operation", subject_kinds: [], audiences: ["user", "agent", "workflow", "mcp", "plugin"],
    permissions: ["materials:fetch_local", "materials:original"], scheduling: "concurrent", input_schema: { type: "object", additionalProperties: false } } };
  const caller = () => ({ permissions: ["materials:fetch_local", "materials:original"], audience: state.audience, signal: state.abort.signal, beforeEffect: async () => {},
    ...(state.offered ? { original_file: { path: state.offered, install_id: state.offeredFor } } : {}) }) as ActionExecutionContext;
  async function call(op: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[], settings: { grants?: SandboxEffects; guard?: () => Promise<void>; where?: "action" | "outside" } = {}): Promise<Outcome> {
    const broker = new SandboxBroker({ ...IDENTITY, installationId: install }, settings.grants ?? BOTH, sandboxServicesFor({ storage, materials: client }), DEFAULT_SANDBOX_LIMITS);
    const run = () => broker.invoke(op, state.abort.signal, method, args, settings.guard);
    try {
      return { ok: await (settings.where === "outside" ? run() : runInPluginAction({ install_id: install, installation_generation: "g1", definition: action, caller: caller() }, run)) };
    } catch (error) { const raw = (error as { code?: unknown }).code; return { error: typeof raw === "string" ? raw : (error as Error).name }; }
  }
  const ok = async (op: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[], settings = {}) => {
    const result = await call(op, method, args, settings);
    assert.ok("ok" in result, `${method} ${JSON.stringify(args).slice(0, 100)} was refused: ${JSON.stringify(result)}`);
    return result.ok;
  };
  const refused = async (what: string, expected: string, op: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[], settings = {}) =>
    assert.deepEqual(await call(op, method, args, settings), { error: expected }, what);
  const file = (name: string, content: string | Buffer) => { const target = join(files, name); writeFileSync(target, content); return target; };
  /** The whole file in parts, the way the SDK reads it; the revision of the first part is passed back with every later one. */
  async function readAll(key: string): Promise<{ bytes: Buffer; parts: number }> {
    const chunks: Buffer[] = []; let offset = 0, revision: string | null = null, size = 0, parts = 0;
    do {
      const part = await ok(operation("command", ORIGINAL), "materials.readOriginalRange", [key, offset, PART, revision]) as { data_base64: string; byte_length: number; size: number; revision: string };
      parts++; size = part.size; revision = part.revision; chunks.push(Buffer.from(part.data_base64, "base64")); offset += part.byte_length;
      if (!part.byte_length) break;
    } while (offset < size);
    return { bytes: Buffer.concat(chunks), parts };
  }
  return { home, files, state, calls, client, call, ok, refused, file, readAll, install };
}

const LOCAL_OP = operation("command", LOCAL), ORIGINAL_OP = operation("command", ORIGINAL), BOTH_OP = operation("command", BOTH);

test("S-65 RAC-360 a page on this machine is fetched by the Host and only its extracted text comes back: no address, no header, no cookie, no socket for the plugin", { timeout: 60_000 }, async t => {
  const r = await rig(t), page = await pageServer(t);
  const answer = await r.ok(LOCAL_OP, "materials.readLocalPage", [`${page.origin}/page`]) as { text: string; title?: string };
  assert.match(answer.text, /local page 正文/u);
  assert.equal(page.hits.length, 1);
  assert.equal(page.hits[0], "GET /page cookie= auth=", "the Host sent no cookie and no credential");
  const wire = JSON.stringify(answer);
  for (const leak of [String(page.port), "127.0.0.1", "secret=1", "set-cookie", "content-type"]) assert.equal(wire.includes(leak), false, `the answer does not carry ${leak}`);
  // The address is the plugin's data; the same page through `localhost` is the Host's own resolution, which the plugin never sees.
  assert.match(((await r.ok(LOCAL_OP, "materials.readLocalPage", [`http://localhost:${page.port}/page`])) as { text: string }).text, /local page 正文/u);
  assert.deepEqual(r.calls, [`readLocalPage ${page.origin}/page`, `readLocalPage http://localhost:${page.port}/page`]);
});

test("S-65 RAC-361 the Host's address rule decides, and a refused address is never connected to: only a loopback name over plain HTTP, never the Host's own ports, never through a redirect", { timeout: 90_000 }, async t => {
  const r = await rig(t), page = await pageServer(t), own = await pageServer(t), release = trackHostPort(own.port);
  t.after(release);
  const NOT_LOCAL = "material.local_page.not_local";
  const refusals: Array<[string, string]> = [["http://93.184.216.34/", NOT_LOCAL], ["http://10.0.0.1/", NOT_LOCAL], ["http://192.168.1.1/", NOT_LOCAL], ["http://172.16.0.1/", NOT_LOCAL],
    ["http://169.254.169.254/latest/meta-data/", NOT_LOCAL], ["http://198.18.0.5/", NOT_LOCAL], ["http://0.0.0.0/", NOT_LOCAL], ["http://[fe80::1]/", NOT_LOCAL], ["http://[::ffff:10.0.0.1]/", NOT_LOCAL],
    [`https://127.0.0.1:${page.port}/page`, NOT_LOCAL], [`ftp://127.0.0.1:${page.port}/page`, NOT_LOCAL], ["file:///etc/hosts", NOT_LOCAL], [`http://user:pw@127.0.0.1:${page.port}/page`, NOT_LOCAL],
    ["http://localhost.evil.test/", NOT_LOCAL], [`http://127.0.0.1.evil.test:${page.port}/`, NOT_LOCAL], ["http://example.com/", NOT_LOCAL],
    [`${own.origin}/page`, "material.local_page.own_endpoint"], [`http://localhost:${own.port}/page`, "material.local_page.own_endpoint"], [`http://[::1]:${own.port}/page`, "material.local_page.own_endpoint"],
    ["not a url", "material.url"], ["", "sandbox.invalid_request"]];
  for (const [url, expected] of refusals) await r.refused(url || "(empty)", expected, LOCAL_OP, "materials.readLocalPage", [url]);
  assert.deepEqual(own.hits, [], "the Host's own port was never connected to");
  assert.deepEqual(page.hits, [], "nor was a page refused by its scheme or its credentials");
  // A redirect is held to the same rule: the page answers with a private address and the Host stops there.
  await r.refused("a redirect to a private address", NOT_LOCAL, LOCAL_OP, "materials.readLocalPage", [`${page.origin}/redirect`]);
  assert.deepEqual(page.hits.map(hit => hit.split(" cookie=")[0]), ["GET /redirect"], "the redirect was fetched once and not followed");
});

test("S-65 RAC-362 a page larger than the channel is refused, not cut; a request of the wrong shape never reaches the Host", { timeout: 60_000 }, async t => {
  const r = await rig(t), page = await pageServer(t);
  await r.refused("a page that does not fit the channel", "sandbox.response_too_large", LOCAL_OP, "materials.readLocalPage", [`${page.origin}/big`]);
  const before = r.calls.length;
  const bad: Array<[string, SandboxJson[]]> = [["no argument", []], ["two arguments", [`${page.origin}/page`, {}]], ["a number", [7]], ["an object", [{ url: `${page.origin}/page` }]], ["null", [null]],
    ["a long address", [`http://127.0.0.1/${"a".repeat(2048)}`]], ["a control character", [`${page.origin}/pa\nge`]], ["a nul", [`${page.origin}/pa\u0000ge`]]];
  for (const [what, args] of bad) await r.refused(what, "sandbox.invalid_request", LOCAL_OP, "materials.readLocalPage", args);
  assert.equal(r.calls.length, before, "none reached the Host's client");
});

test("S-65 RAC-363 the file the person handed the Host's entry is kept under the plugin's own key and read back in parts of at most 256 KiB; the whole file comes back equal", { timeout: 90_000 }, async t => {
  const r = await rig(t), content = Buffer.alloc(PART * 2 + 12_345); for (let index = 0; index < content.length; index++) content[index] = (index * 7 + 3) & 0xff;
  r.state.offered = r.file("import.bin", content);
  assert.equal(await r.ok(ORIGINAL_OP, "materials.claimOriginal", ["import-1"]), null);
  const first = await r.ok(ORIGINAL_OP, "materials.readOriginalRange", ["import-1", 0, PART, null]) as { data_base64: string; byte_length: number; size: number; revision: string };
  assert.deepEqual([first.byte_length, first.size, /^[0-9a-f]{32}$/u.test(first.revision)], [PART, content.length, true]);
  const { bytes, parts } = await r.readAll("import-1");
  assert.equal(parts, 3);
  assert.ok(bytes.equals(content), "the parts add up to the file");
  // The end of the file is an answer with no bytes and the size, not an error; a part may start anywhere inside the file.
  const end = await r.ok(ORIGINAL_OP, "materials.readOriginalRange", ["import-1", content.length, 10, first.revision]) as { byte_length: number; size: number };
  assert.deepEqual([end.byte_length, end.size], [0, content.length]);
  const middle = await r.ok(ORIGINAL_OP, "materials.readOriginalRange", ["import-1", 1000, 5, null]) as { data_base64: string };
  assert.ok(Buffer.from(middle.data_base64, "base64").equals(content.subarray(1000, 1005)));
  // Forgetting it: the registration is gone, the file is the person's and stays.
  assert.equal(await r.ok(ORIGINAL_OP, "materials.releaseOriginal", ["import-1"]), null);
  await r.refused("after release", "material.original.not_registered", ORIGINAL_OP, "materials.readOriginalRange", ["import-1", 0, 10, null]);
  assert.ok(content.equals(readFileSync(r.state.offered!)), "the person's file is untouched");
});

test("S-65 RAC-364 a claim needs a file the Host's entry offered to this installation, in a call of the person's: nothing else registers a file", { timeout: 60_000 }, async t => {
  const r = await rig(t);
  const NOT_OFFERED = "plugin.materials_original_not_offered";
  await r.refused("no file was offered", NOT_OFFERED, ORIGINAL_OP, "materials.claimOriginal", ["k"]);
  r.state.offered = r.file("a.txt", "a");
  r.state.offeredFor = "install-other";
  await r.refused("a file offered to another installation", NOT_OFFERED, ORIGINAL_OP, "materials.claimOriginal", ["k"]);
  r.state.offeredFor = r.install; r.state.audience = "agent";
  await r.refused("a call that is not the person's", NOT_OFFERED, ORIGINAL_OP, "materials.claimOriginal", ["k"]);
  r.state.audience = "user";
  await r.refused("a read of what was never claimed", "material.original.not_registered", ORIGINAL_OP, "materials.readOriginalRange", ["k", 0, 10, null]);
  // The plugin's argument is a key and nothing else: it cannot name a path or hand the Host a second argument.
  await r.refused("a path as a second argument", "sandbox.invalid_request", ORIGINAL_OP, "materials.claimOriginal", ["k", "/etc/hosts"]);
  for (const key of ["", "k\nk", "k\u0000k", "k".repeat(201)]) await r.refused(`key ${JSON.stringify(key).slice(0, 20)}`, "sandbox.invalid_request", ORIGINAL_OP, "materials.claimOriginal", [key]);
  await r.refused("a key that is not a string", "sandbox.invalid_request", ORIGINAL_OP, "materials.claimOriginal", [1]);
  assert.deepEqual(r.calls.filter(call => call.startsWith("claimOriginal")), [], "no claim got as far as the Host's registry");
  await r.refused("still not registered", "material.original.not_registered", ORIGINAL_OP, "materials.readOriginalRange", ["k", 0, 10, null]);
  // A key that looks like a path is only a key: it names nothing on disk.
  await r.refused("a path as a key", "material.original.not_registered", ORIGINAL_OP, "materials.readOriginalRange", ["/etc/hosts", 0, 10, null]);
});

test("S-65 RAC-365 a registration belongs to its installation and its project: another installation or project reads nothing under the same key", { timeout: 60_000 }, async t => {
  const one = await rig(t);
  one.state.offered = one.file("a.txt", "mine");
  await one.ok(ORIGINAL_OP, "materials.claimOriginal", ["shared-key"]);
  assert.equal(Buffer.from((await one.ok(ORIGINAL_OP, "materials.readOriginalRange", ["shared-key", 0, 10, null]) as { data_base64: string }).data_base64, "base64").toString(), "mine");
  const otherInstall = await rig(t, { home: one.home, install: "install-other" });
  await otherInstall.refused("another installation", "material.original.not_registered", ORIGINAL_OP, "materials.readOriginalRange", ["shared-key", 0, 10, null]);
  const otherProject = await rig(t, { home: one.home, project: "q" });
  await otherProject.refused("another project", "material.original.not_registered", ORIGINAL_OP, "materials.readOriginalRange", ["shared-key", 0, 10, null]);
  await otherInstall.refused("another installation cannot release it either, and it stays", "sandbox.invalid_request", ORIGINAL_OP, "materials.releaseOriginal", [""]);
  await otherInstall.ok(ORIGINAL_OP, "materials.releaseOriginal", ["shared-key"]);
  assert.equal(Buffer.from((await one.ok(ORIGINAL_OP, "materials.readOriginalRange", ["shared-key", 0, 10, null]) as { data_base64: string }).data_base64, "base64").toString(), "mine", "the release of another's key forgot nothing of ours");
});

test("S-65 RAC-366 the Host re-checks the file on every part: a path that now leads somewhere else, a changed file, a folder, a pipe or a file past 32 MiB is refused", { timeout: 90_000 }, async t => {
  const r = await rig(t), content = Buffer.alloc(PART + 100, 9);
  const claim = async (key: string, path: string) => { r.state.offered = path; await r.ok(ORIGINAL_OP, "materials.claimOriginal", [key]); };
  // The file changes between two parts of one read: the revision of the first part no longer matches.
  const changing = r.file("changing.bin", content);
  await claim("changing", changing);
  const first = await r.ok(ORIGINAL_OP, "materials.readOriginalRange", ["changing", 0, PART, null]) as { revision: string };
  writeFileSync(changing, Buffer.alloc(PART + 101, 8));
  await r.refused("changed between parts", "material.original.path_changed", ORIGINAL_OP, "materials.readOriginalRange", ["changing", PART, 100, first.revision]);
  // The registered path is replaced by a link to another file, and by another file.
  const swapped = r.file("swapped.bin", content), elsewhere = r.file("elsewhere.bin", "somewhere else");
  await claim("link", swapped);
  rmSync(swapped); symlinkSync(elsewhere, swapped);
  await r.refused("a link put in its place", "material.original.path_changed", ORIGINAL_OP, "materials.readOriginalRange", ["link", 0, 10, null]);
  const moved = r.file("moved.bin", content);
  await claim("moved", moved);
  renameSync(moved, `${moved}.old`);
  await r.refused("moved away", "material.original.missing", ORIGINAL_OP, "materials.readOriginalRange", ["moved", 0, 10, null]);
  // A folder or a pipe at the registered path is not a file.
  await claim("folder", r.file("was-file.bin", "x"));
  rmSync(join(r.files, "was-file.bin")); mkdirSync(join(r.files, "was-file.bin"));
  await r.refused("a folder at the path", "material.original.not_file", ORIGINAL_OP, "materials.readOriginalRange", ["folder", 0, 10, null]);
  const pipe = r.file("was-pipe.bin", "x");
  await claim("pipe", pipe);
  rmSync(pipe); execFileSync("mkfifo", [pipe]);
  await r.refused("a pipe at the path", "material.original.not_file", ORIGINAL_OP, "materials.readOriginalRange", ["pipe", 0, 10, null]);
  // A file past the Host's cap is not read in parts either.
  const huge = r.file("huge.bin", ""); truncateSync(huge, ORIGINAL_FILE_MAX_BYTES + 1);
  await claim("huge", huge);
  await r.refused("past 32 MiB", "material.original.too_large", ORIGINAL_OP, "materials.readOriginalRange", ["huge", 0, 10, null]);
  // A hard link is the same file: the Host reads what was registered and the registration is by real path.
  const hard = r.file("hard.bin", "hard"); linkSync(hard, join(r.files, "hard-too.bin"));
  await claim("hard", join(r.files, "hard-too.bin"));
  assert.equal(Buffer.from((await r.ok(ORIGINAL_OP, "materials.readOriginalRange", ["hard", 0, 10, null]) as { data_base64: string }).data_base64, "base64").toString(), "hard");
});

test("S-65 RAC-367 a part is bounded: 256 KiB at most, a start inside the Host's cap, a revision only the Host gave", { timeout: 60_000 }, async t => {
  const r = await rig(t);
  r.state.offered = r.file("secret-place.bin", "bytes");
  await r.ok(ORIGINAL_OP, "materials.claimOriginal", ["k"]);
  const part = (...args: SandboxJson[]) => r.refused(JSON.stringify(args).slice(0, 60), "sandbox.invalid_request", ORIGINAL_OP, "materials.readOriginalRange", args);
  await part("k"); await part("k", 0, 10); await part("k", 0, 10, null, 1); await part("k", -1, 10, null); await part("k", 1.5, 10, null); await part("k", "0", 10, null);
  await part("k", ORIGINAL_FILE_MAX_BYTES + 1, 10, null); await part("k", 0, 0, null); await part("k", 0, PART + 1, null); await part("k", 0, 1.5, null); await part("k", 0, "10", null);
  await part("k", 0, 10, ""); await part("k", 0, 10, "not-a-revision"); await part("k", 0, 10, "A".repeat(32)); await part("k", 0, 10, 7);
  await part(7, 0, 10, null); await part("", 0, 10, null);
  assert.equal(r.calls.filter(call => call.startsWith("readOriginalRange")).length, 0, "none reached the Host's client");
  // The longest part crosses.
  r.state.offered = r.file("long.bin", Buffer.alloc(PART * 2, 1)); await r.ok(ORIGINAL_OP, "materials.claimOriginal", ["long"]);
  const longest = await r.ok(ORIGINAL_OP, "materials.readOriginalRange", ["long", 0, PART, null]) as { byte_length: number };
  assert.equal(longest.byte_length, PART);
});

test("S-65 RAC-368 the operation's declared effect and the person's approval decide for every method, a query declares neither, and the two effects are separate", { timeout: 60_000 }, async t => {
  const r = await rig(t), page = await pageServer(t);
  r.state.offered = r.file("a.txt", "a");
  const methods: Array<[SandboxSdkMethod, SandboxJson[], "fetch_local" | "original"]> = [["materials.readLocalPage", [`${page.origin}/page`], "fetch_local"], ["materials.claimOriginal", ["k"], "original"],
    ["materials.readOriginalRange", ["k", 0, 10, null], "original"], ["materials.releaseOriginal", ["k"], "original"]];
  for (const [method, args, effect] of methods) {
    const other = effect === "original" ? "fetch_local" : "original", declared: SandboxEffects = { materials: [effect] };
    await r.refused(`${method}: not declared`, "sandbox.not_authorized", operation("command", {}), method, args);
    await r.refused(`${method}: declared read only`, "sandbox.not_authorized", operation("command", { materials: ["read"] }), method, args, { grants: { materials: ["read", effect] } });
    await r.refused(`${method}: declared the other effect`, "sandbox.not_authorized", operation("command", { materials: [other] }), method, args, { grants: BOTH });
    await r.refused(`${method}: not approved`, "sandbox.not_authorized", operation("command", declared), method, args, { grants: {} });
    await r.refused(`${method}: approved for read only`, "sandbox.not_authorized", operation("command", declared), method, args, { grants: { materials: ["read"] } });
    await r.refused(`${method}: approved the other effect`, "sandbox.not_authorized", operation("command", declared), method, args, { grants: { materials: [other] } });
    await r.refused(`${method}: approved something else`, "sandbox.not_authorized", operation("command", declared), method, args, { grants: { storage: ["read", "write"] } });
  }
  assert.deepEqual(r.calls, [], "none of them reached the Host's client");
  assert.deepEqual(page.hits, []);
  // A query cannot declare either effect: a package with such a contract does not load.
  const contract = (effects: SandboxEffects): SandboxPluginContract => ({ version: 1, pluginId: PLUGIN_ID, revision: "one", entities: [], pages: [], acceptance: [],
    operations: [{ id: "run", kind: "query", input: { type: "string" }, output: { type: "string" }, effects, errors: [], examples: [{ input: "", output: "" }] }] });
  for (const effects of [LOCAL, ORIGINAL, BOTH]) assert.throws(() => assertContract(contract(effects)), { code: "sandbox.invalid_contract" }, JSON.stringify(effects));
  assert.doesNotThrow(() => assertContract(contract({ materials: ["read"] })));
  // A method the broker does not have: the whole-file read is the SDK's loop over parts, and nothing names a path.
  for (const method of ["materials.readOriginal", "materials.original", "materials.originalPath", "materials.fetch", "materials.fetch_local"]) {
    await r.refused(method, "sandbox.invalid_request", operation("command", EVERY), method as SandboxSdkMethod, ["k"], { grants: EVERY });
  }
});

test("S-65 RAC-369 a service the Host did not build answers service_unavailable, and the Host's own client refuses a read outside the plugin's concurrent action", { timeout: 60_000 }, async t => {
  const r = await rig(t), page = await pageServer(t);
  r.state.offered = r.file("a.txt", "a");
  await r.refused("a page outside any action", "plugin.materials_action_required", LOCAL_OP, "materials.readLocalPage", [`${page.origin}/page`], { where: "outside" });
  await r.refused("a claim outside any action", "plugin.materials_action_required", ORIGINAL_OP, "materials.claimOriginal", ["k"], { where: "outside" });
  await r.refused("a part outside any action", "plugin.materials_action_required", ORIGINAL_OP, "materials.readOriginalRange", ["k", 0, 1, null], { where: "outside" });
  assert.deepEqual(page.hits, [], "nothing was fetched");
  const broker = new SandboxBroker(IDENTITY, BOTH, sandboxServicesFor({ storage: { get: () => null, set: () => {}, delete: () => false, compareAndSet: () => true } }), DEFAULT_SANDBOX_LIMITS);
  for (const [method, args] of [["materials.readLocalPage", [`${page.origin}/page`]], ["materials.claimOriginal", ["k"]], ["materials.readOriginalRange", ["k", 0, 1, null]], ["materials.releaseOriginal", ["k"]]] as Array<[SandboxSdkMethod, SandboxJson[]]>) {
    await assert.rejects(broker.invoke(BOTH_OP, new AbortController().signal, method, args), { code: "sandbox.service_unavailable" }, method);
  }
});

test("S-65 RAC-369 a stopped installation, a taken-back grant, a cancelled call and a refused guard fetch nothing and register nothing", { timeout: 60_000 }, async t => {
  const r = await rig(t), page = await pageServer(t);
  r.state.offered = r.file("a.txt", "a");
  await r.ok(ORIGINAL_OP, "materials.claimOriginal", ["kept"]);
  const asks = (): Array<[SandboxOperationContract, SandboxSdkMethod, SandboxJson[]]> => [[LOCAL_OP, "materials.readLocalPage", [`${page.origin}/page`]], [ORIGINAL_OP, "materials.claimOriginal", ["new"]],
    [ORIGINAL_OP, "materials.readOriginalRange", ["kept", 0, 1, null]], [ORIGINAL_OP, "materials.releaseOriginal", ["kept"]]];
  r.state.granted = false;
  for (const [op, method, args] of asks()) await r.refused(`${method}: grant taken back`, "actions.forbidden", op, method, args);
  r.state.granted = true; r.state.active = false;
  for (const [op, method, args] of asks()) await r.refused(`${method}: stopped`, "actions.forbidden", op, method, args);
  r.state.active = true;
  for (const [op, method, args] of asks()) {
    await r.refused(`${method}: the call no longer allows it`, "actions.forbidden", op, method, args, { guard: async () => { throw new ActionError("actions.forbidden", "这次调用已被撤销"); } });
  }
  assert.deepEqual(page.hits, [], "nothing was fetched");
  r.state.abort.abort();
  for (const [op, method, args] of asks()) assert.equal("error" in await r.call(op, method, args), true, `${method}: cancelled`);
  assert.deepEqual(page.hits, []);
  // After all of that: the key that was kept is still there, nothing was released, and the one refused as new was never registered.
  const again = await rig(t, { home: r.home });
  assert.equal(Buffer.from((await again.ok(ORIGINAL_OP, "materials.readOriginalRange", ["kept", 0, 10, null]) as { data_base64: string }).data_base64, "base64").toString(), "a");
  await again.refused("never registered", "material.original.not_registered", ORIGINAL_OP, "materials.readOriginalRange", ["new", 0, 10, null]);
});
