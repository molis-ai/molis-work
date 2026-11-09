import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { readSandboxPackage } from "@molis-ai/molis-work-app-local-host";
import { ActionError, defineSubjectContextAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES } from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePresentationOverviewAction, definePresentationValuesAction } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { SandboxEffects, SandboxPluginContract, SandboxReadOperation } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { validatePluginComponentPlans } from "@molis-ai/molis-work-design-system";
import { signPluginPackage, verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { assertContract, createSandboxRunner } from "@molis-ai/molis-work-plugin-sandbox";
import { effectsFromContract, sandboxActionId, sandboxPackageBuildId, sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { newPublisher, packageContract, packageFiles } from "./fixtures/sandbox-package.js";

const cli = fileURLToPath(new URL("../tooling/plugin-cli/dist/main.js", import.meta.url));

const subject = { kind: "note", id: "note-1" };
const contextResult = { subject, revision: "r1", title: "First note", content: "Private contents", truncated: false };
const valuesInput = { subjects: [subject], fields: ["title"] };
const valuesResult = { items: [{ subject, revision: "r1", state: "ok", values: { title: "First note" } }] };
const overviewResult = { summary: { literal: "One note" }, subjects: [subject], start: [] };

function presentationContract(publisher: string): SandboxPluginContract {
  const contract = packageContract();
  const buildId = sandboxPackageBuildId(contract.pluginId, publisher);
  const ref = (localId: string) => sandboxActionId(buildId, localId);
  const read = defineSubjectContextAction(ref("notes.context"), 1, "note", "Context", []);
  const values = definePresentationValuesAction(ref("notes.values"), 1, ["note"], "Values", []);
  const overview = definePresentationOverviewAction(ref("notes.overview"), 1, "Overview", []);
  contract.operations.push(
    { id: "notes.context", kind: "query", read_protocol: { kind: "subject_context", subject_kind: "note" },
      input: read.action.input_schema, output: read.action.output_schema!, effects: {}, errors: [], examples: [{ input: { subject_id: subject.id }, output: contextResult }] },
    { id: "notes.values", kind: "query", read_protocol: { kind: "presentation_values", subject_kinds: ["note"] },
      input: values.action.input_schema, output: values.action.output_schema!, effects: { storage: ["read"] },
      errors: [{ code: "sandbox.not_authorized", description: "Denied service" }], examples: [{ input: valuesInput, output: valuesResult }] },
    { id: "notes.overview", kind: "query", read_protocol: { kind: "presentation_overview" },
      input: overview.action.input_schema, output: overview.action.output_schema!, effects: {}, errors: [], examples: [{ input: {}, output: overviewResult }] },
  );
  contract.operations[1]!.external = true;
  contract.presentation = { objects: [{ kind: "note", fields: [{ key: "title", role: "title" }],
    forms: { chip: { fields: ["title"] }, card: { fields: ["title"] } }, actions: [{ ref: `${ref("notes.add")}@1`, primary: true }] }],
    overview: { capability_id: overview.capability_id, version: 1 } };
  return contract;
}

const entrypoint = `export const operations = {
  'notes.list': async () => [],
  'notes.add': async () => true,
  'notes.context': async () => (${JSON.stringify(contextResult)}),
  'notes.overview': async () => (${JSON.stringify(overviewResult)}),
  'notes.values': async (input, sdk) => {
    const subject = input.subjects[0];
    if (subject.id === 'denied-write') await sdk.storage.set('denied', 'no');
    if (subject.id === 'bad-output') return { items: [{ subject, revision: 'r1', state: 'impossible' }] };
    return ${JSON.stringify(valuesResult)};
  },
};`;

function signedPresentation(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "signed-presentation-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const publisher = newPublisher();
  const contract = presentationContract(publisher.identity);
  const { files } = packageFiles(publisher.identity, files => {
    files["contract.json"] = JSON.stringify(contract);
    files["plugin.mjs"] = entrypoint;
  });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(directory, name), content!);
  const key = join(directory, "private.pem");
  writeFileSync(key, publisher.keys.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  const unsigned = join(directory, "unsigned.json"), signed = join(directory, "signed.json");
  const invoke = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  const packed = invoke("pack-sandbox", directory, unsigned, "--name", "Presentation notes", "--version", "1.0.0", "--publisher-id", "author",
    "--publisher-key-id", publisher.identity);
  assert.equal(packed.status, 0, packed.stderr);
  const signing = invoke("sign", unsigned, key, signed);
  assert.equal(signing.status, 0, signing.stderr);
  const { bundle } = verifyPluginPackageSignature(JSON.parse(readFileSync(signed, "utf8")));
  return { contract, bundle, signer: publisher.signer, bundlePath: join(directory, "plugin.mjs") };
}

test("SCS-15 a signed sandbox operation's external flag survives pack, signature verification and Host validation", t => {
  const directory = mkdtempSync(join(tmpdir(), "sandbox-presentation-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const publisher = newPublisher();
  const root = join(directory, "source");
  mkdirSync(root);
  const contract = packageContract();
  contract.operations[1]!.external = true;
  const { files } = packageFiles(publisher.identity, files => { files["contract.json"] = JSON.stringify(contract); });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content!);
  const key = join(directory, "key.pem");
  writeFileSync(key, publisher.keys.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  const unsigned = join(directory, "unsigned.json"), signed = join(directory, "signed.json");
  const invoke = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  const args = ["--name", "Authored notes", "--version", "1.0.0", "--publisher-id", "author", "--publisher-key-id", publisher.identity];
  const packed = invoke("pack-sandbox", root, unsigned, ...args);
  assert.equal(packed.status, 0, packed.stderr);
  const signing = invoke("sign", unsigned, key, signed);
  assert.equal(signing.status, 0, signing.stderr);
  const { payload } = verifyPluginPackageSignature(JSON.parse(readFileSync(signed, "utf8"))).bundle;
  const kept = readSandboxPackage(payload);
  assert.equal(kept.contract.operations[1]?.external, true);
  assert.equal(kept.manifest.actions?.find(action => action.action.local_id === "notes.add")?.action.external, true);
  assert.equal(kept.manifest.actions?.find(action => action.action.local_id === "notes.list")?.action.external, undefined);

  const invalid = { ...contract, operations: [contract.operations[0], { ...contract.operations[1], external: false }] };
  writeFileSync(join(root, "contract.json"), JSON.stringify(invalid));
  const bad = join(directory, "bad.json");
  assert.equal(invoke("pack-sandbox", root, bad, ...args).status, 1);
  assert.equal(existsSync(bad), false);
  const badPayload = structuredClone(payload);
  badPayload.files.find(file => file.path === "contract.json")!.content_base64 = Buffer.from(JSON.stringify(invalid)).toString("base64");
  assert.throws(() => readSandboxPackage(badPayload), error => error instanceof ActionError && error.code === "plugin.declaration_invalid" && /external/u.test(error.message));
});

test("SCS-11 signed sandbox presentation uses the same three fixed action protocols and ordinary manifests keep their projection", t => {
  const { contract, bundle, signer } = signedPresentation(t);
  const loaded = readSandboxPackage(bundle.payload);
  assert.deepEqual(loaded.manifest.presentation, contract.presentation);
  for (const operation of contract.operations.filter((item): item is SandboxReadOperation => item.read_protocol !== undefined)) {
    const action = loaded.manifest.actions?.find(definition => definition.action.local_id === operation.id)?.action;
    assert.deepEqual([action?.input_schema, action?.output_schema], [operation.input, operation.output]);
    assert.deepEqual([action?.kind, action?.effect, action?.execution?.cost, action?.project_reach], ["query", "read", "none", undefined]);
  }
  const { payload } = structuredClone(bundle);
  payload.manifest.actions = payload.manifest.actions?.map(definition => definition.action.local_id === "notes.context"
    ? { ...definition, action: { ...definition.action, execution: { cost: "unknown" } } } : definition);
  payload.files.find(file => file.path === SANDBOX_PACKAGE_FILES.manifest)!.content_base64 = Buffer.from(JSON.stringify(payload.manifest)).toString("base64");
  const forged = verifyPluginPackageSignature(signPluginPackage({ payload, signature: null, publisher_key: null }, signer)).bundle;
  assert.throws(() => readSandboxPackage(forged.payload), error =>
    error instanceof ActionError && error.code === "plugin.declaration_invalid" && /清单不是沙箱插件的形状/u.test(error.message));

  const ordinary = packageContract();
  const input = { pluginId: ordinary.pluginId, name: "Notes", version: "1.0.0", publisher: { publisher_id: "author", signature: "author-key" },
    effects: effectsFromContract(ordinary), presentation: false };
  assert.equal(JSON.stringify(sandboxPluginManifest({ ...input, contract: ordinary })), JSON.stringify(sandboxPluginManifest(input)));
});

test("SCS-11 the fixed sandbox protocol refuses nonlocal effects, modified schema and malformed examples", () => {
  const check = (mutate: (operation: SandboxReadOperation) => void, expected = "sandbox.invalid_contract") => {
    const contract = presentationContract("author-key");
    const operation = contract.operations.find((item): item is SandboxReadOperation => item.read_protocol?.kind === "presentation_values")!;
    mutate(operation);
    assert.throws(() => assertContract(contract), { code: expected });
  };
  const outside: SandboxEffects[] = [{ storage: ["write"] }, { resources: ["local"] }, { capabilities: ["notes.lookup"] },
    { networkDomains: ["example.com"] }, { connections: ["service"] }, { model: ["read"] }, { imageGeneration: ["read"] }];
  for (const effects of outside) check(operation => { operation.effects = effects; });
  check(operation => { operation.external = true; });
  check(operation => { Reflect.set(operation, "read_protocol", { kind: "anything" }); });
  check(operation => { operation.output = { ...operation.output, additionalProperties: true }; });
  check(operation => { operation.examples[0]!.input = { ...valuesInput, project_id: "elsewhere" }; }, "sandbox.schema_mismatch");
  const ordinary = packageContract();
  Reflect.set(ordinary.operations[0]!, "output", { type: "object", additionalProperties: true });
  assert.throws(() => assertContract(ordinary), { code: "sandbox.invalid_schema" });
});

test("fixed sandbox read protocols cannot be bound to ordinary page components", () => {
  const contract = presentationContract("author-key");
  const region = contract.pages[0]!.regions[0]!;
  region.operationIds.push("notes.overview");
  assert.throws(() => validatePluginComponentPlans([{ id: "overview", pageId: "home", regionId: region.id, intent: "description",
    purpose: "Show the summary", props: {}, read: { operationId: "notes.overview", input: {} } }], contract), /平台读取协议不能绑定到页面组件/u);
});

test("SCS-11 one signed contract previews in the real sandbox and rejects wrong input, output and undeclared writes", { skip: process.platform !== "darwin" }, async t => {
  const { contract, bundlePath } = signedPresentation(t);
  let writes = 0;
  const runner = await createSandboxRunner({ bundlePath, contract,
    identity: { projectId: "preview", installationId: "test-surface", pluginId: contract.pluginId, namespace: "preview" },
    grants: { storage: ["read", "write"] }, services: { storage: { transaction: async (_identity, run) => { writes++; return run(new Map()); } } },
  });
  t.after(() => runner.stop());
  assert.deepEqual(await runner.call("notes.context", { subject_id: subject.id }), contextResult);
  assert.deepEqual(await runner.call("notes.values", valuesInput), valuesResult);
  assert.deepEqual(await runner.call("notes.overview", {}), overviewResult);
  await assert.rejects(runner.call("notes.values", { ...valuesInput, project_id: "elsewhere" }), { code: "sandbox.schema_mismatch" });
  await assert.rejects(runner.call("notes.values", { ...valuesInput, subjects: [{ ...subject, id: "denied-write" }] }), { code: "sandbox.not_authorized" });
  assert.equal(writes, 0);
  await assert.rejects(runner.call("notes.values", { ...valuesInput, subjects: [{ ...subject, id: "bad-output" }] }), { code: "sandbox.protocol_error" });
});
