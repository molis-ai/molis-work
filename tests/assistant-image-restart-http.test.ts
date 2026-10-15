import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import type { AssistantMaterial, AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { serveTestHost, type TestHostServer } from "./fixtures/test-home.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";

// W3-02-G3-04: close the actual Home Host and reopen the same Home, rather than clearing an image Map.
test("the same Home reopens its Assistant work while an image's old runtime handle answers 404 without a call number", { timeout: 60_000 }, async t => {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-image-restart-"));
  let host: MolisWorkLocalHost | undefined, server: TestHostServer | undefined;
  t.after(async () => {
    const failures: unknown[] = [];
    for (const close of [() => server?.close(), () => host?.close(), () => rm(home, { recursive: true, force: true })]) {
      try { await close(); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Assistant restart test cleanup failed");
  });
  const model = await startModelStandIn("image-model-fixture-key", "这是一张图片");
  t.after(() => model.close());
  const start = async () => {
    host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    server = await serveTestHost(null, { home, host });
  };
  await start();
  const request = async (path: string, body?: object) => {
    assert.ok(server);
    return fetch(server.origin + path, body === undefined ? {} : { method: "POST",
      headers: { origin: server.origin, "content-type": "application/json", "x-molis-work-control-token": server.controlToken, "x-molis-work-idempotency-key": randomUUID() },
      body: JSON.stringify(body) });
  };
  const saved = await request("/api/settings/models/image-fixture", { display_name: "本机图片模型", base_url: model.baseUrl,
    api_format: "openai-chat-completions", prompt_cache: "off", enabled: true, api_key: "image-model-fixture-key", models: [{ model_id: "image-model", enabled: true, vision: true }] });
  assert.equal(saved.status, 200, await saved.text());
  const data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=";
  const attachment = await request("/api/assistant/attachments", { name: "chart.png", data });
  assert.equal(attachment.status, 200);
  const { material }: { material: AssistantMaterial } = await attachment.json();
  assert.equal(material.kind, "image");
  const sent = await request("/api/assistant/send", { text: "图里有什么？", request_id: "image-restart-send-1", scope: { kind: "personal" }, materials: [material] });
  assert.equal(sent.status, 200);
  const started: AssistantSendResult = await sent.json();
  const path = `/api/assistant/works/${started.work.work_id}`;
  let before: AssistantWorkView | undefined;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const view: AssistantWorkView = await (await request(path)).json();
    if (view.work.state === "completed") { before = view; break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(before, "the real image round completed");
  assert.equal(before.rounds[0]?.materials[0]?.material_id, material.material_id);
  const imagePath = `${path}/materials/${material.material_id}/image`;
  const image = await request(imagePath);
  assert.equal(image.status, 200); assert.deepEqual(await image.json(), { image: { media_type: "image/png", data } });
  assert.ok(server && host); await server.close(); await host.close();
  await start();
  const expired = await request(imagePath);
  assert.equal(expired.status, 404);
  const body: Record<string, unknown> = await expired.json();
  assert.equal(body.code, "assistant.expired"); assert.match(String(body.error), /重新添加/);
  assert.equal(Object.hasOwn(body, "call_id"), false); assert.equal(expired.headers.has("x-molis-work-call-id"), false);
  const reopened: AssistantWorkView = await (await request(path)).json();
  assert.equal(reopened.work.work_id, before.work.work_id);
  assert.equal(reopened.rounds[0]?.run_id, before.rounds[0]?.run_id);
  assert.equal(reopened.rounds[0]?.materials[0]?.material_id, material.material_id);
  const kept = reopened.rounds[0]?.materials[0]; assert.ok(kept && "expired" in kept);
  assert.equal(kept.expired, true, "the persisted material remains and explains why it must be added again");
});
