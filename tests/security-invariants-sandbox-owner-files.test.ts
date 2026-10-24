import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors, type PluginOwnerFilesClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxEffects, SandboxJson, SandboxOperationContract, SandboxSdkMethod } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { HomePluginHost, homeStores } from "@molis-ai/molis-work-app-local-host";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { DEFAULT_SANDBOX_LIMITS, SandboxBroker, sandboxServicesFor } from "@molis-ai/molis-work-plugin-sandbox";
import { ownerFilesProbe, ownerFilesProject } from "./fixtures/plugin-owner-files.js";

// S-64 for `services.ownerFiles` (PG-017 P2c): a sandboxed plugin reads and writes the files its Manifest declares (`owner_files`), over the broker.
// The Host gives a sandboxed installation its own root (in a project: <Home>/projects/<project>/plugin-files/<installation>/<store_name>; on the Home
// Runtime: <Home>/plugin-files/<installation>/<store_name>), builds the same client the Host's own plugins get, and the broker passes it relative paths
// and bounded base64 only: no location (`rootPath`), no writer callback. Three gates in series: the broker (the operation's declared and approved
// `ownerFiles` effect, the shape and the size of every request), the Host's client (the Manifest's permissions, the grant, the running action and its
// original caller, a query never writes) and the Host's port (a strict relative path inside a declared entry, no link, no special node). Everything
// runs behind the real project platform or the real Home Runtime and its real action scope. RAC-350 to RAC-359 are this slice's.

const code = (expected: string) => (error: unknown) => (error as { code?: string } | undefined)?.code === expected;
const READ: SandboxEffects = { ownerFiles: ["read"] }, WRITE: SandboxEffects = { ownerFiles: ["read", "write"] };
const b64 = (text: string | Buffer) => Buffer.from(text).toString("base64");
const IDENTITY = { projectId: "p", installationId: "install-sbx", pluginId: "io.molis.work.example.sbxfiles", namespace: "installed" } as const;

const operation = (kind: "query" | "command", effects: SandboxEffects): SandboxOperationContract =>
  ({ id: "files", kind, input: { type: "null" }, output: { type: "null" }, errors: [], effects, examples: [] });

type Outcome = { ok: SandboxJson } | { error: string };

/** A sandboxed package installed into a project's platform (the folder is the project's) or the Home Runtime (the folder is the Home's). */
async function platformFor(t: test.TestContext, home: string, probe: ReturnType<typeof ownerFilesProbe>, scope: "project" | "home") {
  if (scope === "project") {
    const project = ownerFilesProject(home, probe);
    t.after(async () => { await project.close(); rmSync(home, { recursive: true, force: true }); });
    return { runtime: project.platform.runtime, client: project.client, projectId: project.projectId as string | null,
      base: (installId: string) => join(realpathSync(home), "projects", project.projectId, "plugin-files", installId) };
  }
  const actions = new ActionService(), host = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [], fixtures: [] });
  t.after(async () => { try { await host.close(); } finally { rmSync(home, { recursive: true, force: true }); } });
  return { runtime: (await host.ready()).runtime, client: actions, projectId: null as string | null, base: (installId: string) => join(realpathSync(home), "plugin-files", installId) };
}

async function rig(t: test.TestContext, options: { name?: string; granted?: string[]; scope?: "project" | "home" } = {}) {
  const home = mkdtempSync(join(tmpdir(), "sandbox-owner-files-")), scope = options.scope ?? "project";
  const probe = ownerFilesProbe(options.name ?? "sbxfiles", scope);
  probe.definition.execution = "sandbox";
  const project = await platformFor(t, home, probe, scope);
  // A sandboxed package is installed with the person's grants; it is never a start-list entry.
  const runtime = project.runtime, install = runtime.install({ definition: probe.definition, deployment: "local", grants: options.granted ?? probe.permissions }).install;
  await runtime.start(install.install_id);
  const root = join(project.base(install.install_id), probe.owner_files.store_name);
  const tally = { reads: 0, writes: 0 }, abort = { current: new AbortController() };
  /** One broker call, run inside the real action `action` (so the Host's client sees a real scope), answered as data. */
  async function call(op: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[], settings: {
    grants?: SandboxEffects; action?: ActionDefinition<Record<string, never>, unknown>; guard?: (caller: ActionExecutionContext) => Promise<void>; between?: () => Promise<void>;
  } = {}): Promise<Outcome> {
    const action = settings.action ?? (method === "ownerFiles.write" ? probe.writeAction : probe.readAction);
    let outcome: Outcome = { error: "never ran" };
    const run = async (client: PluginOwnerFilesClient, caller: ActionExecutionContext) => {
      const spy: PluginOwnerFilesClient = { ...client, read: relative => { tally.reads++; return client.read(relative); }, write: run => { tally.writes++; return client.write(run); } };
      const broker = new SandboxBroker(IDENTITY, settings.grants ?? WRITE, sandboxServicesFor({ storage: { get: () => null, set: () => {}, delete: () => false, compareAndSet: () => true }, ownerFiles: spy }), DEFAULT_SANDBOX_LIMITS);
      await settings.between?.();
      try { outcome = { ok: await broker.invoke(op, abort.current.signal, method, args, settings.guard ? () => settings.guard!(caller) : () => caller.beforeEffect()) }; }
      catch (error) { const raw = (error as { code?: unknown }).code; outcome = { error: typeof raw === "string" ? raw : (error as Error).name }; }
      return null;
    };
    probe.behavior.read = run; probe.behavior.write = run;
    await project.client.invoke(probe.caller(project.projectId), action, {});
    return outcome;
  }
  const ok = async (op: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[], settings = {}) => {
    const result = await call(op, method, args, settings);
    assert.ok("ok" in result, `${method} ${JSON.stringify(args).slice(0, 120)} was refused: ${JSON.stringify(result)}`);
    return result.ok;
  };
  const refused = async (what: string, expected: string, op: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[], settings = {}) => {
    const result = await call(op, method, args, settings);
    assert.deepEqual(result, { error: expected }, what);
  };
  const tree = (dir = root): string[] => !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? [`${entry.name}/`, ...tree(join(dir, entry.name)).map(item => `${entry.name}/${item}`)] : [entry.name]).sort();
  return { home, probe, project, install, root, tally, abort, call, ok, refused, tree, scope };
}

const write = (...steps: SandboxJson[]): SandboxJson[] => [steps];

test("S-64 RAC-350 a sandboxed plugin writes, reads, lists, copies and removes its own declared files, in its installation's folder of the project and nowhere else", { timeout: 60_000 }, async t => {
  const r = await rig(t), command = operation("command", WRITE), query = operation("query", READ);
  assert.equal(r.project.runtime.get(r.install.install_id).state, "running");
  await r.ok(command, "ownerFiles.write", write(
    { op: "mkdir", path: "documents/sub" },
    { op: "write", path: "documents/sub/a.txt", data_base64: b64("中文 a"), mode: "create" },
    { op: "replace_atomic", path: "catalog.json", data_base64: b64("{\"n\":1}") },
    { op: "copy", from: "documents/sub/a.txt", to: "documents/b.txt" },
    { op: "set_access", path: "documents/b.txt", access: "readonly" },
  ), { action: r.probe.writeAction });
  assert.equal(readFileSync(join(r.root, "documents/sub/a.txt"), "utf8"), "中文 a");
  assert.equal(readFileSync(join(r.root, "catalog.json"), "utf8"), "{\"n\":1}");
  assert.deepEqual(r.tree(), ["catalog.json", "documents/", "documents/b.txt", "documents/sub/", "documents/sub/a.txt"]);
  assert.deepEqual(await r.ok(query, "ownerFiles.stat", ["documents/sub/a.txt"], { grants: READ }), { kind: "file", byte_length: Buffer.byteLength("中文 a") });
  assert.deepEqual(await r.ok(query, "ownerFiles.stat", ["documents"], { grants: READ }), { kind: "directory" });
  assert.equal(await r.ok(query, "ownerFiles.stat", ["documents/none.txt"], { grants: READ }), null);
  assert.deepEqual(await r.ok(query, "ownerFiles.list", ["documents"], { grants: READ }), [{ name: "b.txt", kind: "file" }, { name: "sub", kind: "directory" }]);
  assert.deepEqual(await r.ok(query, "ownerFiles.read", ["catalog.json"], { grants: READ }), { data_base64: b64("{\"n\":1}"), byte_length: 7 });
  assert.equal(await r.ok(query, "ownerFiles.read", ["documents/none.txt"], { grants: READ }), null);
  await r.ok(command, "ownerFiles.write", write({ op: "remove", path: "documents/sub" }), { action: r.probe.writeAction });
  assert.deepEqual(r.tree(), ["catalog.json", "documents/", "documents/b.txt"]);
  // The root is this installation's in this project: the Home's own folder of that name, and any other installation's, do not exist.
  assert.equal(existsSync(join(r.home, r.probe.owner_files.store_name)), false);
});

test("S-64 RAC-351 the operation's declared effect and the person's approval decide, a query only reads, and the Host's own gates still apply", { timeout: 60_000 }, async t => {
  const r = await rig(t), steps = write({ op: "mkdir", path: "documents/x" });
  const methods: Array<[SandboxSdkMethod, SandboxJson[]]> = [["ownerFiles.stat", ["documents"]], ["ownerFiles.list", ["documents"]], ["ownerFiles.read", ["catalog.json"]], ["ownerFiles.write", steps]];
  for (const [method, args] of methods) {
    const write = method === "ownerFiles.write", needed: SandboxEffects = write ? WRITE : READ;
    await r.refused(`${method}: not declared`, "sandbox.not_authorized", operation("command", {}), method, args);
    await r.refused(`${method}: declared for something else`, "sandbox.not_authorized", operation("command", { storage: ["read"] }), method, args, { grants: { ownerFiles: ["read", "write"] } });
    await r.refused(`${method}: not approved`, "sandbox.not_authorized", operation("command", needed), method, args, { grants: {} });
    await r.refused(`${method}: approved for something else`, "sandbox.not_authorized", operation("command", needed), method, args, { grants: { storage: ["read", "write"] } });
  }
  // Writing needs the write effect in both places; a read effect is not enough, and a query cannot have it at all.
  await r.refused("write declared but only read approved", "sandbox.not_authorized", operation("command", WRITE), "ownerFiles.write", steps, { grants: READ });
  await r.refused("write approved but only read declared", "sandbox.not_authorized", operation("command", READ), "ownerFiles.write", steps);
  await r.refused("a query", "sandbox.not_authorized", operation("query", WRITE), "ownerFiles.write", steps);
  assert.equal(r.tally.writes, 0, "none of them reached the Host's client");
  assert.deepEqual(r.tree(), []);
  // The Host's client is a gate of its own, with its own code (the runner reports it to the plugin as `sandbox.host_service_error`): the same request
  // from a read-only action (a query) or from an action that did not declare the write permission.
  await r.refused("a query action", "actions.forbidden", operation("command", WRITE), "ownerFiles.write", steps, { action: r.probe.queryWrite });
  await r.refused("an action without the write permission", "actions.forbidden", operation("command", WRITE), "ownerFiles.write", steps, { action: r.probe.undeclared });
  assert.deepEqual(r.tree(), []);
  // Stopping the installation between two calls of one invocation: the second writes nothing.
  await r.ok(operation("command", WRITE), "ownerFiles.write", write({ op: "mkdir", path: "documents/first" }));
  const stopping: Promise<unknown>[] = [];
  await r.refused("stopped", "actions.provider_changed", operation("command", WRITE), "ownerFiles.write", write({ op: "mkdir", path: "documents/second" }),
    { between: async () => { stopping.push(r.project.runtime.stop(r.install.install_id)); await new Promise(resolve => setTimeout(resolve, 100)); } });
  await Promise.all(stopping);
  assert.deepEqual(r.tree(), ["documents/", "documents/first/"]);
});

test("S-64 RAC-352 a request of the wrong shape is refused at the broker and never reaches the Host's client", { timeout: 60_000 }, async t => {
  const r = await rig(t), command = operation("command", WRITE), data = b64("x");
  const bad: Array<[string, SandboxSdkMethod, SandboxJson[], string]> = [
    ["no argument", "ownerFiles.stat", [], "sandbox.invalid_request"], ["two arguments", "ownerFiles.read", ["catalog.json", 1], "sandbox.invalid_request"],
    ["a path that is not a string", "ownerFiles.list", [7], "sandbox.invalid_request"], ["an empty path", "ownerFiles.stat", [""], "sandbox.invalid_request"],
    ["a path of 513 characters", "ownerFiles.read", [`documents/${"a".repeat(504)}`], "sandbox.invalid_request"], ["a control character in a path", "ownerFiles.read", ["documents/a\nb"], "sandbox.invalid_request"],
    ["a nul in a path", "ownerFiles.stat", ["documents/a\u0000b"], "sandbox.invalid_request"],
    ["steps that are not a list", "ownerFiles.write", [{ op: "mkdir", path: "documents/x" }], "sandbox.invalid_request"], ["no step", "ownerFiles.write", [[]], "sandbox.invalid_request"],
    ["17 steps", "ownerFiles.write", [Array.from({ length: 17 }, (_, index) => ({ op: "mkdir", path: `documents/d${index}` }))], "sandbox.invalid_request"],
    ["a step that is not an object", "ownerFiles.write", [["mkdir"]], "sandbox.invalid_request"], ["an unknown operation", "ownerFiles.write", write({ op: "chmod", path: "documents" }), "sandbox.invalid_request"],
    ["a field the step does not have", "ownerFiles.write", write({ op: "mkdir", path: "documents/x", mode: "create" }), "sandbox.invalid_request"],
    ["a field missing", "ownerFiles.write", write({ op: "write", path: "documents/a.txt", data_base64: data }), "sandbox.invalid_request"],
    ["a mode that is not create or replace", "ownerFiles.write", write({ op: "write", path: "documents/a.txt", data_base64: data, mode: "append" }), "sandbox.invalid_request"],
    ["an access that is not readonly or readwrite", "ownerFiles.write", write({ op: "set_access", path: "documents", access: "777" }), "sandbox.invalid_request"],
    ["bytes that are not a string", "ownerFiles.write", write({ op: "replace_atomic", path: "catalog.json", data_base64: [1, 2] }), "sandbox.invalid_request"],
    ["bytes that are not base64", "ownerFiles.write", write({ op: "replace_atomic", path: "catalog.json", data_base64: "not base64!" }), "sandbox.invalid_request"],
    ["base64 that does not round-trip", "ownerFiles.write", write({ op: "replace_atomic", path: "catalog.json", data_base64: "YR==" }), "sandbox.invalid_request"],
    ["a function", "ownerFiles.write", [() => {}] as never, "sandbox.invalid_json"], ["the folder's location", "ownerFiles.rootPath" as SandboxSdkMethod, [], "sandbox.invalid_request"],
    ["a writer callback", "ownerFiles.writer" as SandboxSdkMethod, [], "sandbox.invalid_request"],
    ["one file of 256 KiB and one byte", "ownerFiles.write", write({ op: "replace_atomic", path: "catalog.json", data_base64: b64(Buffer.alloc(256 * 1024 + 1)) }), "sandbox.owner_file_too_large"],
    ["three files of 200 KiB (past 512 KiB for the call)", "ownerFiles.write", write(...[1, 2, 3].map(index => ({ op: "write", path: `documents/f${index}.bin`, data_base64: b64(Buffer.alloc(200 * 1024, index)), mode: "create" }))), "sandbox.owner_file_too_large"],
  ];
  for (const [what, method, args, expected] of bad) await r.refused(what, expected, command, method, args);
  assert.deepEqual([r.tally.reads, r.tally.writes], [0, 0], "none reached the Host's client");
  assert.deepEqual(r.tree(), []);
  // Exactly at the bounds is fine: one file of 256 KiB, two of 256 KiB for 512 KiB, 16 steps.
  await r.ok(command, "ownerFiles.write", write({ op: "write", path: "documents/two-fifty-six.bin", data_base64: b64(Buffer.alloc(256 * 1024, 1)), mode: "create" },
    { op: "write", path: "documents/two-fifty-six-b.bin", data_base64: b64(Buffer.alloc(256 * 1024, 2)), mode: "create" }));
  await r.ok(command, "ownerFiles.write", [Array.from({ length: 16 }, (_, index) => ({ op: "mkdir", path: `documents/d${index}` }))]);
  assert.equal(r.tree().filter(item => item.startsWith("documents/d")).length, 16);
});

test("S-64 RAC-353 the Host's port refuses a path outside the declared entries, a link, a special node and a hard link; nothing outside the root is touched", { timeout: 90_000 }, async t => {
  const r = await rig(t), command = operation("command", WRITE);
  mkdirSync(join(r.root, "documents"), { recursive: true });
  const outside = join(r.home, "outside.txt");
  writeFileSync(outside, "secret");
  symlinkSync(outside, join(r.root, "documents", "link-to-file"));
  symlinkSync(r.home, join(r.root, "documents", "link-to-dir"));
  symlinkSync(outside, join(r.root, "catalog.json"));
  linkSync(outside, join(r.root, "documents", "hard"));
  execFileSync("mkfifo", [join(r.root, "documents", "pipe")]);
  const before = r.tree();
  // The Host's port names what it refused: a path that is not a strict relative path inside a declared entry, or a node that is not a plain file or directory.
  const INVALID = "host.owner_file_invalid", UNSAFE = "host.owner_file_unsafe";
  const reads: Array<[string, string]> = [["../outside.txt", INVALID], ["/etc/hosts", INVALID], ["documents/../../outside.txt", INVALID], ["documents//a", INVALID], ["documents/./a", INVALID],
    ["documents\\a", INVALID], ["C:/x", INVALID], ["undeclared/x", INVALID], ["catalog.json/child", INVALID], ["catalog.json", UNSAFE], ["documents/link-to-file", UNSAFE],
    ["documents/link-to-dir/outside.txt", UNSAFE], ["documents/hard", UNSAFE], ["documents/pipe", UNSAFE]];
  for (const [path, expected] of reads) {
    for (const method of ["ownerFiles.stat", "ownerFiles.read"] as const) await r.refused(`${method} ${path}`, expected, operation("query", READ), method, [path], { grants: READ });
  }
  await r.refused("list a file entry as a folder", INVALID, operation("query", READ), "ownerFiles.list", ["catalog.json"], { grants: READ });
  await r.refused("list outside", INVALID, operation("query", READ), "ownerFiles.list", [".."], { grants: READ });
  const writes: Array<[SandboxJson, string]> = [[{ op: "mkdir", path: "../escape" }, INVALID], [{ op: "mkdir", path: "/tmp/escape" }, INVALID], [{ op: "mkdir", path: "undeclared" }, INVALID],
    [{ op: "mkdir", path: "catalog.json" }, INVALID], [{ op: "write", path: "catalog.json/x", data_base64: b64("x"), mode: "create" }, INVALID],
    [{ op: "write", path: "documents/link-to-file", data_base64: b64("overwritten"), mode: "replace" }, UNSAFE], [{ op: "write", path: "documents/link-to-dir/new.txt", data_base64: b64("new"), mode: "create" }, UNSAFE],
    [{ op: "replace_atomic", path: "catalog.json", data_base64: b64("overwritten") }, UNSAFE], [{ op: "write", path: "documents/hard", data_base64: b64("overwritten"), mode: "replace" }, UNSAFE],
    [{ op: "write", path: "documents/pipe", data_base64: b64("x"), mode: "replace" }, UNSAFE], [{ op: "copy", from: "documents/link-to-file", to: "documents/copied.txt" }, UNSAFE],
    [{ op: "copy", from: "../outside.txt", to: "documents/copied.txt" }, INVALID], [{ op: "remove", path: "../outside.txt" }, INVALID], [{ op: "remove", path: "documents" }, INVALID],
    [{ op: "set_access", path: "documents/link-to-file", access: "readwrite" }, UNSAFE]];
  for (const [step, expected] of writes) await r.refused(`write ${JSON.stringify(step).slice(0, 90)}`, expected, command, "ownerFiles.write", write(step));
  assert.equal(readFileSync(outside, "utf8"), "secret", "a file outside the root is neither read nor changed");
  assert.equal(existsSync(join(r.home, "escape")), false);
  assert.equal(existsSync("/tmp/escape"), false);
  assert.deepEqual(r.tree(), before, "the root holds exactly what the test put there");
});

test("S-64 RAC-354 the plugin gets no location and no callback: the services hold four members, the broker has no other method, and no answer carries a path", { timeout: 60_000 }, async t => {
  const r = await rig(t);
  let members: string[] = [];
  r.probe.behavior.read = client => { members = Object.keys(sandboxServicesFor({ storage: { get: () => null, set: () => {}, delete: () => false, compareAndSet: () => true }, ownerFiles: client }).ownerFiles ?? {}).sort(); return null; };
  await r.project.client.invoke(r.probe.caller(r.project.projectId), r.probe.readAction, {});
  assert.deepEqual(members, ["list", "read", "stat", "write"], "no rootPath, nothing else");
  for (const method of ["ownerFiles.rootPath", "ownerFiles.writer", "ownerFiles.open", "ownerFiles"] as const) {
    await r.refused(method, "sandbox.invalid_request", operation("command", WRITE), method as SandboxSdkMethod, []);
  }
  await r.ok(operation("command", WRITE), "ownerFiles.write", write({ op: "write", path: "documents/a.txt", data_base64: b64("a"), mode: "create" }));
  const answers = JSON.stringify([await r.ok(operation("query", READ), "ownerFiles.stat", ["documents/a.txt"], { grants: READ }), await r.ok(operation("query", READ), "ownerFiles.list", ["documents"], { grants: READ }),
    await r.ok(operation("query", READ), "ownerFiles.read", ["documents/a.txt"], { grants: READ })]);
  assert.equal(answers.includes(r.home), false);
  assert.equal(answers.includes(r.root), false);
  assert.equal(answers.includes("plugin-files"), false);
});

test("S-64 RAC-355 a read is bounded: a file past 256 KiB or a folder past 1000 entries is refused, and the Host does not read the big file", { timeout: 90_000 }, async t => {
  const r = await rig(t), query = operation("query", READ);
  mkdirSync(join(r.root, "documents"), { recursive: true });
  writeFileSync(join(r.root, "documents", "big.bin"), Buffer.alloc(256 * 1024 + 1, 7));
  writeFileSync(join(r.root, "documents", "exact.bin"), Buffer.alloc(256 * 1024, 7));
  await r.refused("a file of 256 KiB and one byte", "sandbox.owner_file_too_large", query, "ownerFiles.read", ["documents/big.bin"], { grants: READ });
  assert.equal(r.tally.reads, 0, "its bytes were never read into the Host");
  const exact = await r.ok(query, "ownerFiles.read", ["documents/exact.bin"], { grants: READ }) as { byte_length: number; data_base64: string };
  assert.equal(exact.byte_length, 256 * 1024);
  await r.refused("a folder as a file", "sandbox.invalid_request", query, "ownerFiles.read", ["documents"], { grants: READ });
  mkdirSync(join(r.root, "documents", "many"));
  for (let index = 0; index < 1001; index++) writeFileSync(join(r.root, "documents", "many", `f${index}`), "");
  await r.refused("1001 entries", "sandbox.owner_file_too_large", query, "ownerFiles.list", ["documents/many"], { grants: READ });
});

test("S-64 RAC-355 a call that is cancelled, or that the person's invocation no longer allows, writes nothing", { timeout: 60_000 }, async t => {
  const r = await rig(t), command = operation("command", WRITE), step = write({ op: "mkdir", path: "documents/x" });
  await r.refused("the call is cancelled before the write", "AbortError", command, "ownerFiles.write", step, { between: async () => r.abort.current.abort() });
  assert.deepEqual(r.tree(), []);
  r.abort.current = new AbortController();
  // `beforeEffect` runs before the call, again before the write, and again before the answer: refusing at the first or at the second writes nothing.
  for (const refuseAt of [1, 2]) {
    let calls = 0;
    await r.refused(`the invocation is refused at check ${refuseAt}`, "actions.forbidden", command, "ownerFiles.write", step,
      { guard: async () => { if (++calls >= refuseAt) throw new ActionError("actions.forbidden", "revoked"); } });
  }
  assert.deepEqual(r.tree(), []);
  assert.equal(r.tally.writes, 0, "the Host's client never ran a write");
});

test("S-64 RAC-356 each installation has its own folder, and a platform with no Home refuses the declaration", { timeout: 90_000 }, async t => {
  const a = await rig(t, { name: "sbxa" }), b = await rig(t, { name: "sbxb" });
  await a.ok(operation("command", WRITE), "ownerFiles.write", write({ op: "replace_atomic", path: "catalog.json", data_base64: b64("a's") }));
  assert.equal(await b.ok(operation("query", READ), "ownerFiles.read", ["catalog.json"], { grants: READ }), null);
  assert.notEqual(a.root, b.root);
  assert.equal(existsSync(join(b.root, "catalog.json")), false);
  // A platform with no Home has nowhere to put the folder: the installation stops before its code starts, with the declaration's own code.
  const home = mkdtempSync(join(tmpdir(), "sandbox-owner-files-nohome-")), probe = ownerFilesProbe("sbxnohome", "project");
  probe.definition.execution = "sandbox";
  const project = ownerFilesProject(home, probe, { withoutHome: true });
  t.after(async () => { await project.close(); rmSync(home, { recursive: true, force: true }); });
  const { install } = project.platform.runtime.install({ definition: probe.definition, deployment: "local", grants: probe.permissions });
  await assert.rejects(project.platform.runtime.start(install.install_id), { code: "plugin.executor_failed" });
  assert.equal(project.platform.runtime.get(install.install_id).last_error_code, pluginErrors.declaration_invalid("x").code);
  assert.equal(probe.contexts.length, 0, "its code never ran");
});

test("S-64 RAC-357 an uninstall that keeps no data removes that installation's folder and nothing else; one that keeps it leaves the folder to the same installation, which a reinstall finds", { timeout: 90_000 }, async t => {
  const r = await rig(t, { name: "sbxa" }), other = ownerFilesProbe("sbxb", "project"), runtime = r.project.runtime, command = operation("command", WRITE), query = operation("query", READ);
  other.definition.execution = "sandbox";
  const beside = runtime.install({ definition: other.definition, deployment: "local", grants: other.permissions }).install;
  await runtime.start(beside.install_id);
  const besideRoot = join(realpathSync(r.home), "projects", r.project.projectId!, "plugin-files", beside.install_id);
  writeFileSync(join(besideRoot, "marker.txt"), "another installation's");
  await r.ok(command, "ownerFiles.write", write({ op: "replace_atomic", path: "catalog.json", data_base64: b64("kept") }));
  // Keeping the data keeps the folder, and the same installation id, which a reinstall reuses, finds it.
  await runtime.uninstall(r.install.install_id, { retain_private_data: true });
  assert.equal(readFileSync(join(r.root, "catalog.json"), "utf8"), "kept");
  const again = runtime.install({ definition: r.probe.definition, deployment: "local", grants: r.probe.permissions }).install;
  assert.equal(again.install_id, r.install.install_id);
  await runtime.start(again.install_id);
  assert.deepEqual(await r.ok(query, "ownerFiles.read", ["catalog.json"], { grants: READ }), { data_base64: b64("kept"), byte_length: 4 });
  // An uninstall that keeps nothing takes the installation's folder with the rest of its data, and no other installation's.
  await runtime.uninstall(r.install.install_id, { retain_private_data: false });
  assert.equal(existsSync(join(r.root, "..")), false, "the installation's folder is gone with its files");
  assert.equal(readFileSync(join(besideRoot, "marker.txt"), "utf8"), "another installation's");
  // A reinstall starts with nothing.
  runtime.install({ definition: r.probe.definition, deployment: "local", grants: r.probe.permissions });
  await runtime.start(r.install.install_id);
  assert.deepEqual(r.tree(), []);
  assert.equal(await r.ok(query, "ownerFiles.read", ["catalog.json"], { grants: READ }), null);
  // The person's word at a reinstall that drops the data an uninstall kept drops the folder too, before the new code runs.
  await r.ok(command, "ownerFiles.write", write({ op: "replace_atomic", path: "catalog.json", data_base64: b64("to drop") }));
  await runtime.uninstall(r.install.install_id, { retain_private_data: true });
  assert.equal(readFileSync(join(r.root, "catalog.json"), "utf8"), "to drop");
  runtime.install({ definition: r.probe.definition, deployment: "local", grants: r.probe.permissions, discard_kept_data: true });
  assert.equal(existsSync(join(r.root, "..")), false, "gone as the install is confirmed, before anything starts");
  await runtime.start(r.install.install_id);
  assert.deepEqual(r.tree(), []);
  assert.equal(readFileSync(join(besideRoot, "marker.txt"), "utf8"), "another installation's");
});

test("S-64 RAC-357 the cleanup never follows a link out of the Home: a folder that resolves elsewhere is refused and what it points at is untouched", { timeout: 60_000 }, async t => {
  const r = await rig(t), outside = mkdtempSync(join(tmpdir(), "sandbox-owner-files-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const holder = join(realpathSync(r.home), "projects", r.project.projectId!, "plugin-files");
  mkdirSync(join(outside, r.install.install_id));
  writeFileSync(join(outside, r.install.install_id, "keep.txt"), "not the plugin's");
  await r.project.runtime.stop(r.install.install_id);
  rmSync(holder, { recursive: true, force: true });
  symlinkSync(outside, holder);
  await assert.rejects(r.project.runtime.uninstall(r.install.install_id, { retain_private_data: false }), { code: pluginErrors.declaration_invalid("x").code });
  assert.equal(readFileSync(join(outside, r.install.install_id, "keep.txt"), "utf8"), "not the plugin's");
});

test("S-64 RAC-358 on the Home Runtime a sandboxed installation has its own folder of the Home and the same bounded service, with the same refusals", { timeout: 90_000 }, async t => {
  const r = await rig(t, { scope: "home" }), command = operation("command", WRITE), query = operation("query", READ);
  assert.equal(r.project.runtime.get(r.install.install_id).state, "running");
  assert.equal(r.root, join(realpathSync(r.home), "plugin-files", r.install.install_id, r.probe.owner_files.store_name));
  await r.ok(command, "ownerFiles.write", write({ op: "mkdir", path: "documents" }, { op: "write", path: "documents/a.txt", data_base64: b64("home a"), mode: "create" }));
  assert.equal(readFileSync(join(r.root, "documents/a.txt"), "utf8"), "home a");
  assert.deepEqual(await r.ok(query, "ownerFiles.read", ["documents/a.txt"], { grants: READ }), { data_base64: b64("home a"), byte_length: 6 });
  assert.equal(existsSync(join(r.home, "projects")), false, "a Home installation has no project folder");
  assert.equal(existsSync(join(r.home, r.probe.owner_files.store_name)), false, "and no folder of a registered Home store");
  // The broker's gates and the Host's port are the same ones: an effect that is not declared, a path outside the entries, a request of the wrong shape.
  await r.refused("an effect the operation did not declare", "sandbox.not_authorized", operation("command", { ownerFiles: ["read"] }), "ownerFiles.write", write({ op: "mkdir", path: "documents/x" }));
  await r.refused("a query that writes", "sandbox.not_authorized", operation("query", WRITE), "ownerFiles.write", write({ op: "mkdir", path: "documents/x" }));
  await r.refused("a path outside the declared entries", "host.owner_file_invalid", query, "ownerFiles.read", ["../a.txt"], { grants: READ });
  await r.refused("a request of the wrong shape", "sandbox.invalid_request", command, "ownerFiles.write", [{ op: "mkdir" }]);
  await r.refused("a method that would give a location", "sandbox.invalid_request", command, "ownerFiles.rootPath" as SandboxSdkMethod, []);
  assert.deepEqual(r.tree(), ["documents/", "documents/a.txt"]);
});

test("S-64 RAC-359 on the Home Runtime each installation has its own folder, an uninstall that keeps no data removes it, and a registered Home store covers the folders for a purge", { timeout: 90_000 }, async t => {
  const r = await rig(t, { scope: "home" }), runtime = r.project.runtime, kept = ownerFilesProbe("sbxhomeb", "home");
  kept.definition.execution = "sandbox";
  const beside = runtime.install({ definition: kept.definition, deployment: "local", grants: kept.permissions }).install;
  await runtime.start(beside.install_id);
  const besideRoot = join(realpathSync(r.home), "plugin-files", beside.install_id);
  assert.notEqual(besideRoot, join(r.root, ".."));
  await r.ok(operation("command", WRITE), "ownerFiles.write", write({ op: "replace_atomic", path: "catalog.json", data_base64: b64("a's") }));
  mkdirSync(join(besideRoot, kept.owner_files.store_name), { recursive: true });
  writeFileSync(join(besideRoot, kept.owner_files.store_name, "catalog.json"), "b's");
  assert.equal(readFileSync(join(r.root, "catalog.json"), "utf8"), "a's", "each installation has its own file");
  // Kept data keeps the folder; none removes it, and nothing of the other installation goes with it.
  await runtime.uninstall(beside.install_id, { retain_private_data: true });
  assert.equal(readFileSync(join(besideRoot, kept.owner_files.store_name, "catalog.json"), "utf8"), "b's");
  await runtime.uninstall(r.install.install_id, { retain_private_data: false });
  assert.equal(existsSync(join(r.root, "..")), false);
  assert.equal(readFileSync(join(besideRoot, kept.owner_files.store_name, "catalog.json"), "utf8"), "b's");
  // `plugin-files` is a registered Home store of the Host, so `uninstall --purge-user-data` removes the folders of every installation.
  assert.equal(homeStores().get("plugin-files")?.owner, "apps/local-host");
});
