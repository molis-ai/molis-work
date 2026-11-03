import assert from "node:assert/strict";
import test from "node:test";
import type { PluginImageGenerationClient, PluginModelClient, PluginModelConfigurationInput, PluginModelConfigurationView } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SANDBOX_IMAGE_LIMITS, type SandboxEffects, type SandboxJson, type SandboxOperationContract, type SandboxPluginContract, type SandboxSdkMethod } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { DEFAULT_SANDBOX_LIMITS, SandboxBroker, assertContract, sandboxServicesFor } from "@molis-ai/molis-work-plugin-sandbox";

// BL-491 (PG-017; specs/repository-anti-corruption/slices/pg011-pg017-remaining.md §6, S-60): a sandboxed package reaches its model settings and the person's image
// connections through the broker. What is asserted here is the broker's half: the declared and approved effect, a command for anything that changes or spends,
// the address a call names being one of the operation's approved `networkDomains`, the settings a package sees and may save, and the size of an image result.
// The Host's half (the pinned origin, the names, the clean-up) is tests/sandbox-home-model-image.test.ts.

const IDENTITY = { projectId: null, installationId: "install-sbx", pluginId: "io.molis.work.example.sbximage", namespace: "installed" } as const;
const code = (expected: string) => (error: unknown) => (error as { code?: string } | undefined)?.code === expected;
const HOST = "images.example.com", ADDRESS = `https://${HOST}/v1`;
const operation = (kind: "query" | "command", effects: SandboxEffects): SandboxOperationContract => ({ id: "go", kind, input: { type: "null" }, output: { type: "null" }, errors: [], effects, examples: [] });
const storage = { get: () => null, set: () => {}, delete: () => false, compareAndSet: () => true };
const SETTINGS: SandboxEffects = { modelSettings: ["read", "save"] };
const IMAGES: SandboxEffects = { imageGeneration: ["read", "bind", "generate"], networkDomains: [HOST] };

const fullView: PluginModelConfigurationView = { configured: true, source: "selection", selection: { provider_id: "p1", model_id: "m1" }, effective_selection: { provider_id: "p1", model_id: "m1" },
  providers: [{ id: "p1", provider_id: "p1", name: "供应商一", base_url: "https://api.secret-gateway.example/v1", api_format: "openai-chat-completions", enabled: true, has_credential: true,
    models: [{ model_id: "m1", display_name: "模型一", enabled: true }] }],
  connections: [{ connection_id: "conn-1", display_name: "我的账号", state: "connected" }], custom_connection_id: "conn-1" };

function settingsRig() {
  const saved: PluginModelConfigurationInput[] = [];
  const model: PluginModelClient = { choices: () => [], availability: () => ({ available: true }), complete: () => Promise.reject(new Error("not used")),
    configuration: { selection: () => fullView.selection, read: async () => fullView, save: async input => { saved.push(input); return fullView; } } };
  return { saved, services: sandboxServicesFor({ storage, model }) };
}

function imageRig() {
  const calls: string[] = [];
  let bytes = 4;
  const images: PluginImageGenerationClient = {
    connections: () => [{ connection_id: "c1", service_id: "image-api", display_name: "图片账号", account_label: "a", auth_method: "token", source: "manual", enabled: true, state: "connected", target_origin: `https://${HOST}` }],
    inspect: () => { calls.push("inspect"); return { connection_id: "c1", available: true, has_key: true, revision: "r1" }; },
    bind: async () => { calls.push("bind"); }, unbind: async () => { calls.push("unbind"); },
    generate: async () => { calls.push("generate"); return { images: [{ bytes: new Uint8Array(bytes), mime: "image/png" }], revision: "r1" }; },
  };
  return { calls, setBytes: (n: number) => { bytes = n; }, services: sandboxServicesFor({ storage, imageGeneration: images }) };
}
const broker = (grants: SandboxEffects, services: ReturnType<typeof sandboxServicesFor>) => new SandboxBroker(IDENTITY, grants, services, DEFAULT_SANDBOX_LIMITS);
const call = (b: SandboxBroker, op: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[]) => b.invoke(op, new AbortController().signal, method, args);
const target = { slot_id: "main", base_url: ADDRESS };
const request = { ...target, expected_revision: "r1", protocol: "openai-images", model: "img-1", prompt: "一只猫" };

test("BL-491 RAC-2629 a package reads its model settings without the endpoint, the format or the connections, and saves only the two names of a choice", async () => {
  const { saved, services } = settingsRig(), b = broker(SETTINGS, services), op = operation("command", SETTINGS);
  const view = await call(b, op, "model.settings.read", []);
  assert.deepEqual(view, { configured: true, source: "selection", selection: { provider_id: "p1", model_id: "m1" }, effective_selection: { provider_id: "p1", model_id: "m1" },
    providers: [{ provider_id: "p1", name: "供应商一", enabled: true, has_credential: true, models: [{ model_id: "m1", display_name: "模型一", enabled: true }] }] });
  assert.doesNotMatch(JSON.stringify(view), /base_url|api_format|connection|secret-gateway/u);
  await call(b, op, "model.settings.save", [{ provider_id: "p1", model_id: "m1" }]);
  assert.deepEqual(saved, [{ provider_id: "p1", model_id: "m1" }]);
});

test("BL-491 RAC-2630 a save that carries anything but the two names, or that is not allowed to save, reaches nothing", async () => {
  const { saved, services } = settingsRig(), command = operation("command", SETTINGS);
  const b = broker(SETTINGS, services);
  for (const extra of [{ base_url: "https://evil.example/v1" }, { connection_id: "conn-1" }, { api_format: "openai-chat-completions" }, { surprise: "x" }]) {
    await assert.rejects(call(b, command, "model.settings.save", [{ provider_id: "p1", model_id: "m1", ...extra }]), code("sandbox.invalid_request"), JSON.stringify(extra));
  }
  for (const bad of [null, "p1", ["p1", "m1"], { provider_id: 1, model_id: "m1" }, { provider_id: "p1" }]) {
    await assert.rejects(call(b, command, "model.settings.save", [bad]), code("sandbox.invalid_request"), JSON.stringify(bad));
  }
  await assert.rejects(call(b, operation("query", SETTINGS), "model.settings.save", [{ provider_id: "p1", model_id: "m1" }]), code("sandbox.not_authorized"), "a query cannot save");
  await assert.rejects(call(b, operation("command", { modelSettings: ["read"] }), "model.settings.save", [{ provider_id: "p1", model_id: "m1" }]), code("sandbox.not_authorized"), "undeclared");
  await assert.rejects(call(broker({ modelSettings: ["read"] }, services), command, "model.settings.save", [{ provider_id: "p1", model_id: "m1" }]), code("sandbox.not_authorized"), "not approved");
  await assert.rejects(call(broker({}, services), operation("command", {}), "model.settings.read", []), code("sandbox.not_authorized"));
  assert.deepEqual(saved, [], "no refused save reached the Host");
});

test("BL-491 RAC-2632 image bind, unbind and generate need a command, the declared and approved effect, and an https address in the operation's approved networkDomains", async () => {
  const { calls, services } = imageRig(), command = operation("command", IMAGES), b = broker(IMAGES, services);
  assert.deepEqual(await call(b, command, "imageGeneration.connections", []), [{ connection_id: "c1", display_name: "图片账号", state: "connected", target_origin: `https://${HOST}` }]);
  assert.equal((await call(b, operation("query", { imageGeneration: ["read"], networkDomains: [HOST] }), "imageGeneration.inspect", [target]) as { revision: string }).revision, "r1");
  const before = calls.length;
  for (const method of ["imageGeneration.bind", "imageGeneration.unbind", "imageGeneration.generate"] as const) {
    const args: SandboxJson[] = method === "imageGeneration.bind" ? [target, "c1"] : method === "imageGeneration.unbind" ? ["main"] : [request];
    await assert.rejects(call(b, operation("query", IMAGES), method, args), code("sandbox.not_authorized"), `a query cannot ${method}`);
    await assert.rejects(call(b, operation("command", { networkDomains: [HOST] }), method, args), code("sandbox.not_authorized"), `${method} is not declared`);
    await assert.rejects(call(broker({ imageGeneration: ["read"], networkDomains: [HOST] }, services), command, method, args), code("sandbox.not_authorized"), `${method} is not approved`);
  }
  for (const base_url of ["https://other.example.com/v1", "http://images.example.com/v1", "http://127.0.0.1:8080/v1"]) {
    await assert.rejects(call(b, command, "imageGeneration.bind", [{ slot_id: "main", base_url }, "c1"]), code("sandbox.not_authorized"), `bind ${base_url}`);
    await assert.rejects(call(b, command, "imageGeneration.generate", [{ ...request, base_url }]), code("sandbox.not_authorized"), `generate ${base_url}`);
    await assert.rejects(call(b, command, "imageGeneration.inspect", [{ slot_id: "main", base_url }]), code("sandbox.not_authorized"), `inspect ${base_url}`);
  }
  assert.equal(calls.length, before, "no refused call reached the Host's client");
  await call(b, command, "imageGeneration.bind", [target, "c1"]);
  await call(b, command, "imageGeneration.unbind", ["main"]);
  assert.deepEqual(calls.slice(before), ["bind", "unbind"]);
});

test("BL-491 RAC-2633 an image result is bounded: at most the contract's count and bytes cross the channel as base64, and nothing is cut", async () => {
  const { services, setBytes } = imageRig(), command = operation("command", IMAGES), b = broker(IMAGES, services);
  setBytes(SANDBOX_IMAGE_LIMITS.max_bytes);
  const fits = await call(b, command, "imageGeneration.generate", [request]) as { images: Array<{ base64: string; mime: string }>; revision: string };
  assert.equal(Buffer.from(fits.images[0]!.base64, "base64").byteLength, SANDBOX_IMAGE_LIMITS.max_bytes);
  assert.ok(Buffer.byteLength(JSON.stringify(fits)) <= DEFAULT_SANDBOX_LIMITS.messageBytes / 2, "the largest allowed result is inside the channel's share");
  setBytes(SANDBOX_IMAGE_LIMITS.max_bytes + 1);
  await assert.rejects(call(b, command, "imageGeneration.generate", [request]), code("sandbox.response_too_large"));
  const many = sandboxServicesFor({ storage, imageGeneration: { connections: () => [], inspect: () => ({ connection_id: null, available: false, has_key: false, revision: "r" }), bind: async () => {}, unbind: async () => {},
    generate: async () => ({ images: Array.from({ length: SANDBOX_IMAGE_LIMITS.max_images + 1 }, () => ({ bytes: new Uint8Array(1) })), revision: "r" }) } });
  await assert.rejects(call(broker(IMAGES, many), command, "imageGeneration.generate", [request]), code("sandbox.response_too_large"));
});

test("BL-491 RAC-2627 a contract cannot ask for what the broker would never give: new effect values, a query that changes, an address-less generate", () => {
  const contract = (effects: SandboxEffects, kind: "query" | "command" = "command"): SandboxPluginContract => ({ version: 1, pluginId: IDENTITY.pluginId, revision: "one", entities: [], acceptance: [],
    operations: [{ ...operation(kind, effects), id: "go", examples: [{ input: null, output: null }] }], pages: [] });
  assertContract(contract({ modelSettings: ["read", "save"], imageGeneration: ["read", "bind", "generate"], networkDomains: [HOST] }));
  const invalid = code("sandbox.invalid_contract");
  assert.throws(() => assertContract(contract({ modelSettings: ["write" as never] })), invalid);
  assert.throws(() => assertContract(contract({ imageGeneration: ["spend" as never] })), invalid);
  assert.throws(() => assertContract(contract({ imageGeneration: ["generate"] })), invalid);
  assert.throws(() => assertContract(contract({ imageGeneration: ["bind"] })), invalid);
  assert.throws(() => assertContract(contract({ modelSettings: ["save"] }, "query")), invalid);
  assert.throws(() => assertContract(contract({ imageGeneration: ["generate"], networkDomains: [HOST] }, "query")), invalid);
});
