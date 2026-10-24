import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxEffects, SandboxIdentity, SandboxJson, SandboxOperationContract, SandboxSdkMethod } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { MaterialDocumentBatch, MaterialExtraction } from "@molis-ai/molis-work-contracts/services/materials";
import { createPluginMaterialsClient, runInPluginAction, type PluginMaterialsDispatch, type PluginMaterialsPort } from "@molis-ai/molis-work-plugin-runtime";
import { assertEffects, DEFAULT_SANDBOX_LIMITS, SandboxBroker, sandboxServicesFor } from "@molis-ai/molis-work-plugin-sandbox";

// S-60 for `services.materials` (PG-017 P2): a sandboxed plugin reads files it already holds through the Host's readers, over the broker. Two
// gates in series: the broker asks the operation's declared and approved `materials: ["read"]` and the shape of the request, then the Host's own
// client asks what it asks every plugin (the Manifest's permission, the grant, the running concurrent action that declares the permission). What
// reaches out (a network page, a page on this machine, the Host's saved originals) has no method on the broker. These tests assert the refusals,
// with the real client behind the broker.

const PLUGIN_ID = "io.molis.work.example.sbxmaterials";
const IDENTITY: SandboxIdentity = { projectId: "p", installationId: "install-sbx", pluginId: PLUGIN_ID, namespace: "installed" };
const code = (expected: string) => (error: unknown) => (error as { code?: string } | undefined)?.code === expected;
const READ: SandboxEffects = { materials: ["read"] };
const FILE = { file_name: "note.md", data_base64: Buffer.from("# 标题\n正文").toString("base64") };
const ALL_METHODS_MANIFEST_PERMISSIONS = ["storage:private", "materials:read", "materials:fetch", "materials:fetch_local", "materials:original"];

const manifest: PluginManifest = {
  schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version: "1.0.0", name: "Sandbox materials probe", kind: "app",
  publisher: { publisher_id: "example", signature: "probe-sbxmaterials" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: ALL_METHODS_MANIFEST_PERMISSIONS.map(permission => ({ permission, required: true, reason: "probe" })),
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
};

const operation = (kind: "query" | "command", effects: SandboxEffects): SandboxOperationContract =>
  ({ id: "read", kind, input: { type: "null" }, output: { type: "null" }, errors: [], effects, examples: [] });

/** What a Host reader answers for a Markdown note: optional fields left `undefined`, the way the Host's own results are. */
const extraction = (text: string): MaterialExtraction => ({ text, title: undefined, extractor: "probe", pages: [{ number: 1, text, method: "text", confidence: null }],
  coverage: { status: "sufficient", truncated: undefined, processed_pages: 1, total_pages: 1, issues: [] } });
const batch = (): MaterialDocumentBatch => ({ documents: [{ name: "note.md", format: "markdown", content: "正文", coverage: { status: "sufficient", issues: [], truncated: undefined } }], warnings: [] });

interface Rig {
  readonly reads: Array<{ method: string; name: string; bytes?: Buffer; options: PluginMaterialsDispatch }>;
  readonly state: { granted: boolean; active: boolean; abort: AbortController; reply: () => MaterialExtraction };
  inAction<T>(run: () => T, options?: { concurrent?: boolean; permissions?: string[] }): T;
  call(op: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[], options?: { grants?: SandboxEffects; where?: "action" | "outside" | "serial" | "unpermitted"; guard?: () => Promise<void> }): Promise<SandboxJson>;
}

function rig(services: "materials" | "none" = "materials"): Rig {
  const reads: Rig["reads"] = [], state = { granted: true, active: true, abort: new AbortController(), reply: () => extraction("正文") };
  // The port has every member a Host with all four permissions would give; the broker is what keeps the plugin to the readers of bytes.
  const port: PluginMaterialsPort = {
    async extract(source, options) { await options.beforeEffect(); reads.push({ method: "extract", name: source.file_name, bytes: Buffer.from(source.bytes), options }); return state.reply(); },
    async readDocuments(files, options) { await options.beforeEffect(); reads.push({ method: "readDocuments", name: files[0]!.file_name, options }); return batch(); },
    imageTextAvailable: () => true,
    async readSource(url, options) { reads.push({ method: "readSource", name: url, options }); throw new Error("the sandbox reached the network reader"); },
    async readLocalPage(url, options) { reads.push({ method: "readLocalPage", name: url, options }); throw new Error("the sandbox reached the local page reader"); },
    async claimOriginal(_key, path, options) { reads.push({ method: "claimOriginal", name: path, options }); },
    async readOriginal(key, options) { reads.push({ method: "readOriginal", name: key.record_key, options }); return new Uint8Array(); },
    async releaseOriginal(key, options) { reads.push({ method: "releaseOriginal", name: key.record_key, options }); },
  };
  const client = createPluginMaterialsClient(manifest, port, { install_id: "install-sbx", installation_generation: "g1", project_id: "p",
    assertActive: () => { if (!state.active) throw new ActionError("actions.forbidden", "实例已停止"); },
    requireGrant: permission => { if (!state.granted) throw new ActionError("actions.forbidden", `没有 ${permission}`); } });
  const storage = { get: () => null, set: () => {}, delete: () => false, compareAndSet: () => true };
  const action = (concurrent: boolean, permissions: string[]): ActionDefinition => ({ capability_id: "example.sbx.read", version: 1, operation: "command", action: {
    title: "read", description: "probe", scope: "project", kind: "operation", subject_kinds: [], audiences: ["user", "agent", "workflow", "mcp", "plugin"],
    permissions, ...(concurrent ? { scheduling: "concurrent" as const } : {}), input_schema: { type: "object", additionalProperties: false } } });
  const caller = { permissions: ["materials:read"], audience: "user", signal: state.abort.signal, beforeEffect: async () => {} } as ActionExecutionContext;
  const inAction = <T>(run: () => T, options: { concurrent?: boolean; permissions?: string[] } = {}): T =>
    runInPluginAction({ install_id: "install-sbx", installation_generation: "g1", definition: action(options.concurrent ?? true, options.permissions ?? ["materials:read"]), caller }, run);
  return {
    reads, state, inAction,
    async call(op, method, args, options = {}) {
      const broker = new SandboxBroker(IDENTITY, options.grants ?? READ, sandboxServicesFor({ storage, ...(services === "materials" ? { materials: client } : {}) }), DEFAULT_SANDBOX_LIMITS);
      const run = () => broker.invoke(op, state.abort.signal, method, args, options.guard);
      if (options.where === "outside") return run();
      return inAction(run, options.where === "serial" ? { concurrent: false } : options.where === "unpermitted" ? { permissions: [] } : {});
    },
  };
}

test("S-60 RAC-235 a read of bytes needs materials: read in the operation's effects and in the person's approval, and a request of a plain shape", async () => {
  const r = rig();
  assert.deepEqual(await r.call(operation("command", READ), "materials.readDocuments", [[FILE], {}]), JSON.parse(JSON.stringify(batch())));
  assert.deepEqual(await r.call(operation("command", READ), "materials.extract", [FILE, { textFormat: "markdown", ocrLanguages: ["zh-Hans", "en-US"], timeoutMs: 5000 }]), JSON.parse(JSON.stringify(extraction("正文"))));
  const before = r.reads.length;
  // Not declared by the operation, not approved by the person, or approved for something else.
  for (const method of ["materials.readDocuments", "materials.extract", "materials.imageTextAvailable"] as const) {
    const args: SandboxJson[] = method === "materials.imageTextAvailable" ? [] : method === "materials.extract" ? [FILE, {}] : [[FILE], {}];
    await assert.rejects(r.call(operation("command", {}), method, args), code("sandbox.not_authorized"), method);
    await assert.rejects(r.call(operation("command", READ), method, args, { grants: {} }), code("sandbox.not_authorized"), method);
    await assert.rejects(r.call(operation("command", READ), method, args, { grants: { connections: ["github"] } }), code("sandbox.not_authorized"), method);
  }
  // The shape: two arguments, a file of a name and base64 bytes and nothing else, choices of the four the plugin has and nothing else.
  const refused: Array<[SandboxSdkMethod, SandboxJson[]]> = [
    ["materials.extract", []], ["materials.extract", [FILE]], ["materials.extract", [FILE, {}, 1]], ["materials.extract", ["note.md", {}]], ["materials.extract", [null, {}]], ["materials.extract", [[FILE], {}]],
    ["materials.extract", [{ file_name: "note.md" }, {}]], ["materials.extract", [{ ...FILE, path: "/etc/hosts" }, {}]], ["materials.extract", [{ file_name: "", data_base64: "" }, {}]],
    ["materials.extract", [{ file_name: "a\nb.md", data_base64: FILE.data_base64 }, {}]], ["materials.extract", [{ ...FILE, data_base64: "YR==" }, {}]], ["materials.extract", [{ ...FILE, data_base64: "not base64!" }, {}]],
    ["materials.extract", [{ ...FILE, data_base64: 1 }, {}]],
    ["materials.extract", [FILE, { limits: { maxBytes: 1 } }]], ["materials.extract", [FILE, { allowModelDownload: true }]], ["materials.extract", [FILE, { onProgress: true }]], ["materials.extract", [FILE, { signal: true }]],
    ["materials.extract", [FILE, { textFormat: "html" }]], ["materials.extract", [FILE, { pdfMode: 1 }]], ["materials.extract", [FILE, { ocrLanguages: ["fr"] }]], ["materials.extract", [FILE, { ocrLanguages: "en-US" }]],
    ["materials.extract", [FILE, { timeoutMs: 0 }]], ["materials.extract", [FILE, { timeoutMs: 31 * 60_000 }]], ["materials.extract", [FILE, { timeoutMs: "5" }]], ["materials.extract", [FILE, []]],
    ["materials.readDocuments", []], ["materials.readDocuments", [[FILE]]], ["materials.readDocuments", [[], {}]], ["materials.readDocuments", [FILE, {}]], ["materials.readDocuments", [Array.from({ length: 101 }, () => FILE), {}]],
    ["materials.readDocuments", [[{ ...FILE, extra: 1 }], {}]], ["materials.readDocuments", [[FILE], { textFormat: "text" }]], ["materials.readDocuments", [[FILE], { limits: {} }]], ["materials.readDocuments", [[FILE], { timeoutMs: -1 }]],
    ["materials.imageTextAvailable", [1]],
  ];
  for (const [method, args] of refused) await assert.rejects(r.call(operation("command", READ), method, args), code("sandbox.invalid_request"), `${method} ${JSON.stringify(args).slice(0, 80)}`);
  assert.equal(r.reads.length, before, "no refused read reached the Host's port");
});

test("S-60 RAC-235 the plugin's bytes reach the reader decoded and its choices as given, and nothing of the Host's own options is the plugin's", async () => {
  const r = rig();
  await r.call(operation("command", READ), "materials.extract", [FILE, { textFormat: "markdown", pdfMode: "ocr", ocrLanguages: ["zh-Hant"], timeoutMs: 7000 }]);
  const read = r.reads.at(-1)!;
  assert.equal(read.bytes!.toString("utf8"), "# 标题\n正文");
  assert.equal(read.options.textFormat, "markdown");
  assert.equal(read.options.pdfMode, "ocr");
  assert.deepEqual(read.options.ocrLanguages, ["zh-Hant"]);
  assert.equal(read.options.timeoutMs, 7000);
  assert.equal(read.options.allowModelDownload, false, "a model download is a person's explicit choice, never an operation's");
  assert.equal(read.options.limits, undefined, "the Host's own limits stand");
  assert.ok(read.options.signal instanceof AbortSignal);
});

test("S-60 RAC-235 an answer crosses as plain JSON, and one larger than the channel is refused, not cut", async () => {
  const r = rig();
  const answer = await r.call(operation("command", READ), "materials.extract", [FILE, {}]) as { [key: string]: SandboxJson };
  assert.equal(Object.hasOwn(answer, "title"), false, "a field the Host left undefined is not on the wire");
  assert.deepEqual(Object.keys(answer.coverage as object).sort(), ["issues", "processed_pages", "status", "total_pages"]);
  r.state.reply = () => extraction("字".repeat(300_000));
  await assert.rejects(r.call(operation("command", READ), "materials.extract", [FILE, {}]), code("sandbox.response_too_large"));
  assert.equal(await r.call(operation("query", READ), "materials.imageTextAvailable", [], { where: "outside" }), true, "a fact about the machine is asked outside any action");
});

test("S-60 RAC-235 RAC-237 the Host's own client refuses a read outside the plugin's concurrent action that declares the permission, and a service the Host did not build answers service_unavailable", async () => {
  const r = rig();
  await assert.rejects(r.call(operation("command", READ), "materials.extract", [FILE, {}], { where: "outside" }), code("plugin.materials_action_required"));
  await assert.rejects(r.call(operation("command", READ), "materials.readDocuments", [[FILE], {}], { where: "serial" }), code("plugin.materials_action_not_concurrent"));
  await assert.rejects(r.call(operation("command", READ), "materials.extract", [FILE, {}], { where: "unpermitted" }), code("plugin.materials_permission_undeclared"));
  assert.equal(r.reads.length, 0);
  const none = rig("none");
  await assert.rejects(none.call(operation("command", READ), "materials.extract", [FILE, {}]), code("sandbox.service_unavailable"));
  await assert.rejects(none.call(operation("command", READ), "materials.imageTextAvailable", []), code("sandbox.service_unavailable"));
});

test("S-60 RAC-235 what reaches out has no method: a network page, a page on this machine and the Host's saved originals are refused even when the Manifest declares them", async () => {
  const r = rig();
  const names = ["materials.readSource", "materials.readLocalPage", "materials.claimOriginal", "materials.readOriginal", "materials.releaseOriginal", "materials.original", "materials.fetch"];
  for (const method of names) {
    await assert.rejects(r.call(operation("command", READ), method as never, ["https://example.com/", {}]), code("sandbox.invalid_request"), method);
    await assert.rejects(r.call(operation("command", {}), method as never, ["https://example.com/", {}]), code("sandbox.not_authorized"), `${method} without the effect`);
  }
  // An effect that names one of them (a contract is refused on load; here the broker is asked anyway) is no `read`: nothing matches it.
  for (const effects of [{ materials: ["fetch"] }, { materials: ["fetch_local"] }, { materials: ["original"] }]) {
    await assert.rejects(r.call(operation("command", effects as never), "materials.readSource" as never, ["https://example.com/", {}], { grants: effects as never }), code("sandbox.not_authorized"), JSON.stringify(effects));
  }
  assert.equal(r.reads.length, 0, "none of them reached the Host's port");
  // The contract an operation declares names `read` and nothing else, so a package cannot even load with the others.
  assert.doesNotThrow(() => assertEffects(READ));
  for (const access of ["fetch", "fetch_local", "original", "write"]) assert.throws(() => assertEffects({ materials: [access] }), code("sandbox.invalid_contract"), access);
});

test("S-60 RAC-231 a stopped installation, a taken-back grant and a cancelled call read nothing through the broker", async () => {
  const r = rig();
  const read = () => r.call(operation("command", READ), "materials.extract", [FILE, {}]);
  r.state.granted = false;
  await assert.rejects(read(), code("actions.forbidden"));
  r.state.granted = true; r.state.active = false;
  await assert.rejects(read(), code("actions.forbidden"));
  assert.equal(r.reads.length, 0);
  r.state.active = true;
  await assert.rejects(r.call(operation("command", READ), "materials.extract", [FILE, {}], { guard: async () => { throw new ActionError("actions.forbidden", "这次调用已被撤销"); } }), code("actions.forbidden"));
  const cancelled = rig(); cancelled.state.abort.abort();
  await assert.rejects(cancelled.call(operation("command", READ), "materials.extract", [FILE, {}]));
  assert.equal(cancelled.reads.length, 0);
  assert.equal(r.reads.length, 0);
  // And once nothing is taken back it reads.
  assert.equal((await read() as { text: string }).text, "正文");
  assert.equal(r.reads.length, 1);
});
