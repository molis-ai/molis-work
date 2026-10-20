import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginModelFailure, PluginModelResult } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { deferred } from "./fixtures/home-runtime.js";
import { gif, modelRuntimeFixture, png } from "./fixtures/plugin-model-runtime.js";

for (const format of ["openai-chat-completions", "anthropic-messages"] as const) {
  test(`W5-01-SHM-01 Runtime ${format} preserves original image snapshots and the actual inference receipt`, { timeout: 60_000 }, async t => {
    const f = await modelRuntimeFixture(t, format);
    const key = `${f.probe.id}/${f.probe.instruction.prompt_id}`;
    assert.equal((await f.request("/api/agent-definitions/prompt", { method: "POST", body: { key, body: "SHM_PERSON_OVERRIDE", expected_revision: null } })).status, 200);
    const bytes = new Uint8Array(png), selection = { ...f.selection };
    const images = [{ bytes, label: "../original.png" }, { bytes: new Uint8Array(gif), label: "second.gif" }, { bytes, label: "duplicate.png" }];
    let result!: PluginModelResult;
    await f.invoke(async model => {
      const pending = f.complete(model, { images, selection, output: "json" });
      bytes.fill(0); images[0]!.label = "changed"; selection.model_id = "text";
      result = await pending; result.validateResult(); return result.text;
    });
    assert.deepEqual(result.value, { answer: "original" });
    assert.deepEqual(result.execution, f.receipts.at(-1));
    assert.equal(result.execution?.configuredModel, "vision");
    assert.deepEqual(result.execution?.reportedModels, ["reported-vision"]);
    assert.deepEqual(result.usage, { input_tokens: 12, output_tokens: 2 });
    assert.equal(result.execution?.usage[0]?.cost.source, "unknown");
    assert.equal(result.execution?.usage[0]?.cost.amount, undefined);
    assert.deepEqual(f.sources.map(source => source.bytes), [png, gif, png]);
    assert.deepEqual(f.sources.map(source => source.label), ["../original.png", "second.gif", "duplicate.png"]);
    assert.ok(f.sources.every(source => source.mode === 0o600 && source.directoryMode === 0o700));
    const sent = JSON.stringify(f.requests[0]);
    assert.match(sent, /SHM_PERSON_OVERRIDE/);
    for (const image of [png, gif]) assert.ok(sent.includes(image.toString("base64")), "provider receives each original image");
    const blocks = f.requests[0]!.messages.at(-1)!.content;
    assert.ok(Array.isArray(blocks));
    const encoded = blocks.flatMap((block: { type: string; image_url?: { url: string }; source?: { data: string } }) =>
      block.type === "image_url" ? [block.image_url!.url.split(",")[1]] : block.type === "image" ? [block.source!.data] : []);
    assert.deepEqual(encoded, [png, gif, png].map(image => image.toString("base64")));
    await f.assertClean();
  });
}

test("W5-01-SHM-01 JSON decode and provider failures retain their actual completed/failed receipts and guards", { timeout: 60_000 }, async t => {
  const f = await modelRuntimeFixture(t);
  for (const failure of ["json", "provider", "empty"] as const) {
    f.answer(async () => failure === "json" ? { text: "not-json" } : failure === "provider" ? { text: "", status: 400 } : { text: "" });
    let caught!: PluginModelFailure;
    await f.invoke(async model => {
      try { await f.complete(model, { output: "json", images: [{ bytes: png }] }); assert.fail("invalid result must reject"); }
      catch (error) {
        assert.ok(error instanceof ActionError); caught = error;
        assert.equal(typeof caught.validateResult, "function"); caught.validateResult!();
        assert.deepEqual(caught.execution, f.receipts.at(-1));
        return "recordable failure";
      }
    });
    assert.equal(caught.code, failure === "json" ? "plugin.model_output_invalid" : "plugin.model_failed");
    assert.equal(caught.execution?.state, failure === "provider" ? "failed" : "completed");
    assert.ok(caught.execution?.run_ref.id);
    await f.assertClean();
  }
});

// BL-355: fifty is the limit, not past it. The Host's own inference has its case (prologue-inference-images); this one goes through the plugin model service.
test("W5-01-SHM-01 fifty images are one call: the plugin model service sends every one, in order", { timeout: 60_000 }, async t => {
  const f = await modelRuntimeFixture(t);
  const pictures = Array.from({ length: 50 }, (_, index) => Buffer.concat([png, Buffer.from([index])]));
  await f.result({ images: pictures.map(bytes => ({ bytes })) });
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.sources.map(source => source.bytes), pictures);
  const sent = JSON.stringify(f.requests[0]);
  for (const bytes of pictures) assert.equal(sent.split(bytes.toString("base64")).length - 1, 1, "each image reaches the model exactly once");
  await f.assertClean();
});

test("W5-01-SHM-01 false images, byte limits and nonvision models refuse without dispatch or invented receipts", { timeout: 60_000 }, async t => {
  const f = await modelRuntimeFixture(t);
  for (const request of [
    { images: [{ bytes: Buffer.from("not an image") }] },
    { images: Array.from({ length: 51 }, () => ({ bytes: png })) },
    { images: [{ bytes: new Uint8Array(32 * 1024 * 1024 + 1) }] },
    { images: [{ bytes: png }], selection: { ...f.selection, model_id: "text" } },
  ]) {
    await assert.rejects(f.result(request), error => { assert.ok(error instanceof Error); assert.equal((error as PluginModelFailure).execution, undefined); return true; });
    assert.equal(f.requests.length, 0); await f.assertClean();
  }
});

for (const change of ["unchanged", "connection", "model", "revoke", "grant", "restart"] as const) {
  test(`W5-01-SHM-02 actual final beforeEffect barrier rejects ${change} and permits only the unchanged result`, { timeout: 60_000 }, async t => {
    const f = await modelRuntimeFixture(t), entered = deferred(), release = deferred();
    let finalWait = false, revoked = false;
    const pending = f.invoke(async (model, caller) => {
      const result = await f.complete(model);
      finalWait = true; await caller.beforeEffect(); result.validateResult();
      f.probe.contexts.at(-1)!.services!.storage!.set("committed", result.text);
      return result.text;
    }, { validate_authority: async () => { if (finalWait) { entered.resolve(); await release.promise; } },
      assert_authority_current: () => { if (revoked) throw new ActionError("actions.forbidden", "original caller revoked"); } });
    const outcome = pending.then(value => ({ value }), error => ({ error }));
    try {
      await entered.promise;
      if (change === "connection") withConnectorConnections(f.home, store => store.disconnect(f.connectionId));
      if (change === "model") await f.save(true, false);
      if (change === "revoke") revoked = true;
      if (change === "grant") {
        await f.platform.runtime.stop(f.install.install_id);
        f.platform.runtime.grant(f.install.install_id, f.probe.permissions.filter(permission => permission !== "model:invoke"));
        await f.platform.supervisor.restart(f.probe.id);
      }
      if (change === "restart") { await f.platform.runtime.stop(f.install.install_id); await f.platform.supervisor.restart(f.probe.id); }
    } finally { release.resolve(); }
    const result = await outcome;
    if (change === "unchanged") { assert.ok("value" in result); assert.ok(f.probe.contexts.at(-1)!.services!.storage!.get("committed")); }
    else {
      assert.ok("error" in result);
      if (change === "connection" || change === "model") assert.equal(result.error.code, "actions.configuration_changed");
      assert.equal(f.probe.contexts.at(-1)!.services!.storage!.get("committed"), null);
    }
  });
}

test("W5-01-SHM-02 a provider failure cannot be recorded after its binding changes during final beforeEffect", { timeout: 60_000 }, async t => {
  const f = await modelRuntimeFixture(t), entered = deferred(), release = deferred();
  f.answer(async () => ({ text: "", status: 400 }));
  let finalWait = false;
  const pending = f.invoke(async (model, caller) => {
    let failure!: PluginModelFailure;
    try { await f.complete(model); assert.fail("provider failure expected"); }
    catch (error) { assert.ok(error instanceof ActionError); failure = error; }
    assert.ok(failure.execution); assert.equal(typeof failure.validateResult, "function");
    finalWait = true; await caller.beforeEffect(); failure.validateResult!();
    f.probe.contexts.at(-1)!.services!.storage!.set("failed", failure.message);
    return "failed";
  }, { validate_authority: async () => { if (finalWait) { entered.resolve(); await release.promise; } } });
  const rejected = assert.rejects(pending, { code: "actions.configuration_changed" });
  try { await entered.promise; withConnectorConnections(f.home, store => store.disconnect(f.connectionId)); }
  finally { release.resolve(); }
  await rejected;
  assert.equal(f.probe.contexts.at(-1)!.services!.storage!.get("failed"), null);
});

test("W5-01-SHM-02 a result guard cannot survive its action or be borrowed by the next action", { timeout: 60_000 }, async t => {
  const f = await modelRuntimeFixture(t), release = deferred();
  let result!: PluginModelResult, expired!: Promise<void>;
  await f.invoke(async model => {
    result = await f.complete(model);
    expired = release.promise.then(() => { assert.throws(() => result.validateResult(), { code: "actions.expired" }); });
    return result.text;
  });
  release.resolve(); await expired;
  await f.invoke(async () => { assert.throws(() => result.validateResult(), { code: "plugin.model_action_required" }); return "refused"; });
});

test("W5-01-SHM-03 choices use live metadata with zero requests/decryption and refuse revoked or stopped installations", { timeout: 60_000 }, async t => {
  const f = await modelRuntimeFixture(t), secrets = runWithMolisWorkHome(f.home, () => createFileSecretStore());
  let reads = 0;
  const get = secrets.get.bind(secrets);
  t.mock.method(secrets, "get", (ref: string) => { reads++; return get(ref); });
  const model = f.model();
  const choices = (read = () => model.choices()) => {
    const beforeReads = reads, beforeRequests = f.requests.length;
    try { return read(); }
    finally {
      assert.equal(reads - beforeReads, 0, "each choices read must not decrypt credentials");
      assert.equal(f.requests.length - beforeRequests, 0, "each choices read must not contact the provider");
    }
  };
  assert.deepEqual(choices(), [
    { provider_id: "shm", model_id: "vision", label: "SHM · vision", vision: true, reasoning_effort: false },
    { provider_id: "shm", model_id: "text", label: "SHM · text", vision: false, reasoning_effort: false },
  ]);
  assert.doesNotMatch(JSON.stringify(choices()), /credential|http|secret|token/);
  await f.save(false); assert.deepEqual(choices(), []);
  await f.save(); assert.equal(choices().length, 2);
  withConnectorConnections(f.home, store => store.disconnect(f.connectionId));
  assert.deepEqual(choices(), []);
  assert.equal(f.requests.length, 0);
  await f.platform.runtime.stop(f.install.install_id);
  f.platform.runtime.grant(f.install.install_id, f.probe.permissions.filter(permission => permission !== "model:invoke"));
  await f.platform.supervisor.restart(f.probe.id);
  const revokedModel = f.model();
  assert.throws(() => choices(() => revokedModel.choices()));
  await f.platform.runtime.stop(f.install.install_id);
  assert.throws(() => choices(() => revokedModel.choices()));
});

test("W5-01-SHM-01 cancellation releases Host image sources and SDK intake resources on owner close", { timeout: 60_000 }, async t => {
  const f = await modelRuntimeFixture(t), entered = deferred(), release = deferred(), controller = new AbortController();
  f.answer(async () => { entered.resolve(); await release.promise; return { text: "late image answer" }; });
  let handed = false;
  const pending = f.invoke(async model => { await f.complete(model, { images: [{ bytes: png }] }); handed = true; return "late"; }, { signal: controller.signal });
  const rejected = assert.rejects(pending);
  try { await entered.promise; controller.abort(); await rejected; await f.host.close(); await f.assertClean(); }
  finally { release.resolve(); }
  assert.equal(handed, false);
});
