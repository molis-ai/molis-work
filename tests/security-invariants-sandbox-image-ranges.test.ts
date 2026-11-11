import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PluginImageGenerationClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SANDBOX_IMAGE_LIMITS, type SandboxEffects, type SandboxImageDescriptor, type SandboxImagePart, type SandboxJson, type SandboxOperationContract, type SandboxPluginContract, type SandboxSdkMethod } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { DEFAULT_SANDBOX_LIMITS, SandboxBroker, SandboxImageHolder, createSandboxRunner, sandboxServicesFor } from "@molis-ai/molis-work-plugin-sandbox";

// BL-918 (specs/visual-ui-experience/work-items/batch27-sandbox-recovery/spec.md, S-60): a sandboxed package's generated pictures are held by the Host
// for the runner call that asked and cross the channel in parts of at most 256 KiB, read with `imageGeneration.readRange`. What is asserted here is the
// broker's and the worker's half (limits on the actual bytes, every refusal, the holder's lifetime) and the agent-host adapter's cap before any buffer.
// The adapter's cap is tests/prologue-inference-native.test.ts; the signed package through the production Host, Seatbelt and Prologue against a real HTTPS provider is RAC-2655 / B27-IMG-02.

const MiB = 1024 * 1024, KiB = 1024;
const IDENTITY = { projectId: null, installationId: "install-img", pluginId: "io.molis.work.example.sbximg", namespace: "installed" } as const;
const OTHER = { ...IDENTITY, installationId: "install-other" } as const;
const code = (expected: string) => (error: unknown) => (error as { code?: string } | undefined)?.code === expected;
const HOST = "images.example.com", ADDRESS = `https://${HOST}/v1`;
const EFFECTS: SandboxEffects = { imageGeneration: ["read", "bind", "generate"], networkDomains: [HOST] };
const operation = (kind: "query" | "command" = "command", effects: SandboxEffects = EFFECTS): SandboxOperationContract => ({ id: "go", kind, input: { type: "null" }, output: { type: "null" }, errors: [], effects, examples: [] });
const storage = { get: () => null, set: () => {}, delete: () => false, compareAndSet: () => true };
const request = { slot_id: "main", base_url: ADDRESS, expected_revision: "r1", protocol: "openai-images", model: "img-1", prompt: "一只猫" };
/** Distinct bytes per picture, so a part from the wrong picture or offset cannot pass for the right one. */
const picture = (size: number, seed: number) => { const bytes = new Uint8Array(size); for (let i = 0; i < size; i++) bytes[i] = (i * 31 + seed * 7) & 0xff; return bytes; };

function rig(sizes: readonly number[] = [4]) {
  const calls: string[] = [];
  let revision = "r1", images = sizes.map((size, index) => picture(size, index));
  let pause: Promise<void> | undefined;
  const client: PluginImageGenerationClient = {
    connections: () => [],
    inspect: () => { calls.push("inspect"); return { connection_id: "c1", available: true, has_key: true, revision }; },
    bind: async () => {}, unbind: async () => {},
    generate: async () => { calls.push("generate"); await pause; return { images: images.map(bytes => ({ bytes, mime: "image/png" })), revision: "r1" }; },
  };
  return {
    calls, client, services: sandboxServicesFor({ storage, imageGeneration: client }),
    set: (next: readonly number[]) => { images = next.map((size, index) => picture(size, index)); }, raw: (next: Uint8Array[]) => { images = next; },
    revise: (next: string) => { revision = next; }, hold: (until: Promise<void> | undefined) => { pause = until; },
  };
}
const broker = (services: ReturnType<typeof sandboxServicesFor>, identity: typeof IDENTITY | typeof OTHER = IDENTITY, grants = EFFECTS) => new SandboxBroker(identity, grants, services, DEFAULT_SANDBOX_LIMITS);
/** One runner call: its own controller and holder, as the runner makes them. */
function call(limits = SANDBOX_IMAGE_LIMITS) {
  const controller = new AbortController();
  return { controller, holder: new SandboxImageHolder(controller.signal, limits) };
}
const rpc = (b: SandboxBroker, holder: SandboxImageHolder | undefined, method: SandboxSdkMethod, args: SandboxJson[], op = operation(), signal = new AbortController().signal) =>
  b.invoke(op, signal, method, args, undefined, undefined, undefined, undefined, holder);
const generate = (b: SandboxBroker, holder: SandboxImageHolder) => rpc(b, holder, "imageGeneration.generate", [request]) as Promise<SandboxImageDescriptor>;
const range = (b: SandboxBroker, holder: SandboxImageHolder, value: Record<string, SandboxJson>) => rpc(b, holder, "imageGeneration.readRange", [value]) as Promise<SandboxImagePart>;
/** Read a held result the way the worker does, part by part, and check every part is inside the channel's share. */
async function readAll(b: SandboxBroker, holder: SandboxImageHolder, held: SandboxImageDescriptor) {
  const out: Buffer[] = [];
  for (const [image_index, image] of held.images.entries()) {
    const parts: Buffer[] = [];
    for (let offset = 0; offset < image.byte_length;) {
      const part = await range(b, holder, { result_id: held.result_id, image_index, offset, length: SANDBOX_IMAGE_LIMITS.part_bytes });
      assert.ok(Buffer.byteLength(JSON.stringify(part)) < DEFAULT_SANDBOX_LIMITS.messageBytes / 2, "every part is inside the channel's half");
      assert.equal(part.offset, offset); assert.equal(part.size, image.byte_length);
      parts.push(Buffer.from(part.data_base64, "base64")); offset += part.byte_length;
    }
    out.push(Buffer.concat(parts));
  }
  return out;
}

test("BL-918 B27-IMG-01 a held result is bounded on the actual bytes: 4 MiB a picture, 8 MiB and 4 pictures in all, parts of 256 KiB; refused whole, never cut", async () => {
  const r = rig([SANDBOX_IMAGE_LIMITS.max_image_bytes, SANDBOX_IMAGE_LIMITS.max_bytes - SANDBOX_IMAGE_LIMITS.max_image_bytes]), b = broker(r.services);
  assert.deepEqual(SANDBOX_IMAGE_LIMITS, { max_images: 4, max_image_bytes: 4 * MiB, max_bytes: 8 * MiB, part_bytes: 256 * KiB });
  let c = call();
  const held = await generate(b, c.holder);
  assert.deepEqual(held.images, [{ byte_length: 4 * MiB, mime: "image/png" }, { byte_length: 4 * MiB, mime: "image/png" }]);
  assert.equal(held.revision, "r1"); assert.match(held.result_id, /^[0-9a-f-]{36}$/u);
  const read = await readAll(b, c.holder, held);
  assert.deepEqual(read.map(bytes => bytes.byteLength), [4 * MiB, 4 * MiB]);
  assert.ok(read[0]!.equals(picture(4 * MiB, 0)) && read[1]!.equals(picture(4 * MiB, 1)), "the parts reassemble the exact bytes");
  // A non-whole last part is the bytes that are left.
  r.set([300 * KiB + 7]); c = call();
  const tail = await generate(b, c.holder);
  const last = await range(b, c.holder, { result_id: tail.result_id, image_index: 0, offset: 256 * KiB, length: 256 * KiB });
  assert.deepEqual([last.byte_length, last.size], [44 * KiB + 7, 300 * KiB + 7]);

  const refused = async (sizes: number[], what: string) => {
    r.set(sizes); const fresh = call();
    await assert.rejects(generate(b, fresh.holder), code("sandbox.response_too_large"), what);
    // Nothing is held after a refusal: the next generation is not refused as a second result.
    r.set([1]); assert.equal((await generate(b, fresh.holder)).images.length, 1);
  };
  await refused([4 * MiB + 1], "one picture over 4 MiB");
  await refused([4 * MiB, 4 * MiB, 1], "8 MiB + 1 in all");
  await refused([1, 1, 1, 1, 1], "five pictures");
  r.raw([]); await assert.rejects(generate(b, call().holder), code("sandbox.host_service_error"), "no picture");
  r.raw([new Uint8Array(0)]); await assert.rejects(generate(b, call().holder), code("sandbox.host_service_error"), "an empty picture");

  // The switch's first step (4 pictures, 360 KiB in all) with the same checks, on a holder given those limits: 360 KiB + 1 is refused.
  const first = { ...SANDBOX_IMAGE_LIMITS, max_bytes: 360 * KiB };
  r.set([360 * KiB]); assert.equal((await generate(b, call(first).holder)).images[0]!.byte_length, 360 * KiB);
  r.set([360 * KiB + 1]); await assert.rejects(generate(b, call(first).holder), code("sandbox.response_too_large"));
  // A part of 256 KiB + 1 is asked for nowhere.
  r.set([512 * KiB]); c = call();
  const big = await generate(b, c.holder);
  await assert.rejects(range(b, c.holder, { result_id: big.result_id, image_index: 0, offset: 0, length: 256 * KiB + 1 }), code("sandbox.invalid_request"));
});

test("BL-918 B27-IMG-03 a part is read only by the call that holds it, with exact fields; another call's, installation's or a released id is the same refusal", async () => {
  const r = rig([600 * KiB]), b = broker(r.services), mine = call(), theirs = call();
  const held = await generate(b, mine.holder), id = held.result_id;
  const part = (value: Record<string, SandboxJson>, holder = mine.holder, via = b) => range(via, holder, value);
  const good = { result_id: id, image_index: 0, offset: 0, length: 1024 };
  // The same range twice gives the same bytes and asks the provider nothing more.
  const generated = r.calls.filter(name => name === "generate").length;
  assert.deepEqual(await part(good), await part(good));
  assert.equal(r.calls.filter(name => name === "generate").length, generated);
  // Another call of the same operation, another installation's broker, a made-up id: not authorized, and no answer about existence.
  await assert.rejects(part(good, theirs.holder), code("sandbox.not_authorized"));
  await assert.rejects(part(good, call().holder, broker(r.services, OTHER)), code("sandbox.not_authorized"));
  await assert.rejects(part({ ...good, result_id: "00000000-0000-4000-8000-000000000000" }), code("sandbox.not_authorized"));
  await assert.rejects(rpc(b, undefined, "imageGeneration.readRange", [good]), code("sandbox.not_authorized"), "no holder: no running call");
  // Bad fields are invalid requests.
  for (const value of [{ ...good, extra: 1 }, { ...good, offset: -1 }, { ...good, offset: 1.5 }, { ...good, length: 0 }, { ...good, image_index: 1 }, { ...good, image_index: 4 }, { ...good, offset: 600 * KiB },
    { ...good, offset: "0" }, { result_id: id, image_index: 0, offset: 0 }]) {
    await assert.rejects(part(value as Record<string, SandboxJson>), code("sandbox.invalid_request"), JSON.stringify(value));
  }
  await assert.rejects(rpc(b, mine.holder, "imageGeneration.readRange", [good, good]), code("sandbox.invalid_request"), "one argument");
  // Undeclared or unapproved generation, and a query, reach nothing.
  await assert.rejects(rpc(b, mine.holder, "imageGeneration.readRange", [good], operation("command", { imageGeneration: ["read"], networkDomains: [HOST] })), code("sandbox.not_authorized"));
  await assert.rejects(rpc(broker(r.services, IDENTITY, { imageGeneration: ["read"], networkDomains: [HOST] }), mine.holder, "imageGeneration.readRange", [good]), code("sandbox.not_authorized"));
  await assert.rejects(rpc(b, mine.holder, "imageGeneration.readRange", [good], operation("query")), code("sandbox.not_authorized"));
  // A second generation while one is held is refused before the provider is asked; release, and it is allowed again.
  const before = r.calls.length;
  await assert.rejects(generate(b, mine.holder), code("sandbox.queue_full"));
  assert.equal(r.calls.length, before, "nothing reached the Host for the refused generation");
  await assert.rejects(rpc(b, mine.holder, "imageGeneration.releaseResult", [{ result_id: "someone-else" }]), code("sandbox.not_authorized"));
  assert.equal(await rpc(b, mine.holder, "imageGeneration.releaseResult", [{ result_id: id }]), null);
  assert.equal(await rpc(b, mine.holder, "imageGeneration.releaseResult", [{ result_id: id }]), null, "the same release again is nothing");
  await assert.rejects(part(good), code("sandbox.not_authorized"), "released: gone");
  await assert.rejects(rpc(b, mine.holder, "imageGeneration.releaseResult", [{ result_id: id, extra: 1 }]), code("sandbox.invalid_request"));
  assert.equal((await generate(b, mine.holder)).images.length, 1);
  // Two generations at once in one call: the broker's queue runs them one after the other, and the second meets the unreleased first; one provider call.
  const pending = call(); let open!: () => void;
  r.hold(new Promise<void>(resolve => { open = resolve; }));
  const generations = r.calls.filter(name => name === "generate").length;
  const first = generate(b, pending.holder), second = assert.rejects(generate(b, pending.holder), code("sandbox.queue_full"));
  await new Promise(resolve => setImmediate(resolve));
  open(); r.hold(undefined);
  assert.equal((await first).images.length, 1); await second;
  assert.equal(r.calls.filter(name => name === "generate").length, generations + 1);
  // The holder itself refuses a second reservation while the first is in flight (a channel that ran requests side by side would meet this).
  const side = call(), done = side.holder.reserve();
  assert.throws(() => side.holder.reserve(), code("sandbox.queue_full")); done();
});

test("BL-918 B27-IMG-04 the result lives exactly as long as its call: ended, cancelled, a late reply or a changed connection delivers nothing more", async () => {
  const r = rig([600 * KiB]), b = broker(r.services);
  // The call ends (any way: its controller aborts): every later part is refused and nothing is held.
  let c = call(); let held = await generate(b, c.holder);
  await range(b, c.holder, { result_id: held.result_id, image_index: 0, offset: 0, length: 256 * KiB });
  c.controller.abort();
  await assert.rejects(range(b, c.holder, { result_id: held.result_id, image_index: 0, offset: 256 * KiB, length: 256 * KiB }), code("sandbox.not_authorized"));
  await assert.rejects(generate(b, c.holder), code("sandbox.cancelled"), "an ended call generates nothing");
  // A reply that arrives after the call ended is dropped, not held.
  c = call(); let open!: () => void;
  r.hold(new Promise<void>(resolve => { open = resolve; }));
  const late = generate(b, c.holder);
  await new Promise(resolve => setImmediate(resolve));
  c.controller.abort(); open(); r.hold(undefined);
  await assert.rejects(late, code("sandbox.cancelled"));
  // A request's own cancellation (the RPC signal) between parts ends that request only; the holder stays the call's.
  c = call(); held = await generate(b, c.holder);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(rpc(b, c.holder, "imageGeneration.readRange", [{ result_id: held.result_id, image_index: 0, offset: 0, length: 1 }], operation(), cancelled.signal));
  assert.equal((await range(b, c.holder, { result_id: held.result_id, image_index: 0, offset: 0, length: 1 })).byte_length, 1);
  // The connection changes between parts: that part is refused, the result is dropped, and changing it back does not bring it back.
  r.revise("r2");
  await assert.rejects(range(b, c.holder, { result_id: held.result_id, image_index: 0, offset: 1, length: 1 }), code("sandbox.not_authorized"));
  r.revise("r1");
  await assert.rejects(range(b, c.holder, { result_id: held.result_id, image_index: 0, offset: 1, length: 1 }), code("sandbox.not_authorized"));
  // The original caller's authority is asked before every part.
  c = call(); held = await generate(b, c.holder);
  let allowed = true;
  const guarded = (value: Record<string, SandboxJson>) => b.invoke(operation(), new AbortController().signal, "imageGeneration.readRange", [value], async () => { if (!allowed) throw Object.assign(new Error("revoked"), { code: "actions.forbidden" }); }, undefined, undefined, undefined, c.holder);
  await guarded({ result_id: held.result_id, image_index: 0, offset: 0, length: 1 });
  allowed = false;
  await assert.rejects(guarded({ result_id: held.result_id, image_index: 0, offset: 1, length: 1 }), code("actions.forbidden"));
});

const mac = { skip: process.platform !== "darwin" };
const RUNNER_CONTRACT = (effects: SandboxEffects): SandboxPluginContract => ({ version: 1, pluginId: IDENTITY.pluginId, revision: "one", entities: [], pages: [], acceptance: [],
  operations: [{ id: "run", kind: "command", input: { type: "string" }, output: { type: "string" }, effects, errors: [], examples: [{ input: "", output: "" }] }] });
const BUNDLE = `export const operations = { run: async (input, sdk) => {
  const result = await sdk.imageGeneration.generate({ slot_id: 'main', base_url: '${ADDRESS}', expected_revision: 'r1', protocol: 'openai-images', model: 'img-1', prompt: input });
  let sum = 0; const sizes = result.images.map(image => { const bytes = Buffer.from(image.base64, 'base64'); for (const byte of bytes) sum = (sum * 31 + byte) >>> 0; return bytes.length; });
  return JSON.stringify({ sizes, sum, mime: result.images.map(image => image.mime ?? null), revision: result.revision });
} };\n`;

test("BL-918 B27-IMG-03 B27-IMG-04 in a real sandbox the same call reads on after the generate request ended; cancelling or stopping between parts delivers nothing", mac, async t => {
  const directory = await mkdtemp(join(tmpdir(), "sandbox-image-ranges-")), bundlePath = join(directory, "plugin.mjs");
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(bundlePath, BUNDLE);
  const r = rig([1 * MiB + 3, 700 * KiB]);
  let gate: { at: number; reached: () => void; open: Promise<void> } | undefined, parts = 0;
  const client: PluginImageGenerationClient = { ...r.client, inspect: target => { parts++; const result = r.client.inspect(target); if (gate && parts === gate.at) { gate.reached(); return gate.open.then(() => result) as never; } return result; } };
  const start = () => createSandboxRunner({ bundlePath, contract: RUNNER_CONTRACT(EFFECTS), identity: IDENTITY, grants: EFFECTS, services: sandboxServicesFor({ storage, imageGeneration: client }) });
  const expected = [picture(1 * MiB + 3, 0), picture(700 * KiB, 1)];
  let sum = 0; for (const bytes of expected) for (const byte of bytes) sum = (sum * 31 + byte) >>> 0;
  let runner = await start();
  try {
    assert.deepEqual(JSON.parse(await runner.call("run", "猫") as string), { sizes: [1 * MiB + 3, 700 * KiB], sum, mime: ["image/png", "image/png"], revision: "r1" });
    assert.equal(parts, 5 + 3, "one Host check per part: 5 parts of the first picture and 3 of the second");
    assert.equal(r.calls.filter(name => name === "generate").length, 1, "one generation for the whole result");
    // Cancel while the third part waits at the Host's check: the call fails and no further part is asked for.
    parts = 0; let reached!: () => void, open!: () => void;
    const at = new Promise<void>(resolve => { reached = resolve; });
    gate = { at: 3, reached, open: new Promise<void>(resolve => { open = resolve; }) };
    const cancel = new AbortController(), pending = assert.rejects(runner.call("run", "猫", { signal: cancel.signal }));
    await at; cancel.abort(); open();
    await pending;
    assert.equal(parts, 3, "no part after the cancellation");
    // Stop the process while a part waits: the same.
    runner = await start(); parts = 0;
    const atStop = new Promise<void>(resolve => { reached = resolve; });
    gate = { at: 2, reached, open: new Promise<void>(resolve => { open = resolve; }) };
    const stopped = assert.rejects(runner.call("run", "猫"), code("sandbox.stopped"));
    await atStop; await runner.stop(); open();
    await stopped;
    assert.equal(parts, 2, "no part after the process stopped");
  } finally { gate = undefined; await runner.stop(); }
});
