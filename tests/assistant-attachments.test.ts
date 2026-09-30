import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantError, AssistantService } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";
import { pdfDocumentParser } from "../apps/local-host/src/pdf-document-parser.js";
import { deflateSync, crc32 } from "node:zlib";

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}

/** A small real PNG: a blue square on the left, a yellow one on the right. */
function png(): Buffer {
  const w = 96, h = 48, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const colour = y > 8 && y < 40 && x > 6 && x < 40 ? [20, 60, 220] : y > 8 && y < 40 && x > 56 && x < 90 ? [240, 200, 20] : [255, 255, 255];
    raw.set(colour, y * (w * 3 + 1) + 1 + x * 3);
  }
  const chunk = (type: string, data: Buffer) => { const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc32(body) >>> 0); return Buffer.concat([length, body, sum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function reply(text = "左边是蓝色方块，右边是黄色方块。"): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

/** A one-page PDF with a real text layer, built byte by byte (offsets in the cross-reference table must be exact). */
function pdf(lines: string[]): Buffer {
  const text = lines.map((line, index) => `BT /F1 12 Tf 72 ${720 - index * 18} Td (${line}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body)); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

test("a PDF the person brings is read by the Agent runtime's own parser into bounded text; what cannot be read says why", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-attachments-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-attachments-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    documentParsers: [pdfDocumentParser],
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const service = new AssistantService(new AssistantStore(new DatabaseSync(":memory:")), { host: async () => host, authority: async work => assistantAuthority(local, work, () => new Set()) }, "web-user");
  try {
    const material = await service.readAttachment({ name: "brief.pdf", data: pdf(["Q4 plan brief", "Weekly sync moves to Wednesday"]).toString("base64") });
    assert.equal(material.kind, "file");
    assert.equal(material.explicit, true);
    assert.equal(material.title, "brief.pdf（1 页）");
    assert.match(material.text ?? "", /Q4 plan brief[\s\S]*Weekly sync moves to Wednesday/);
    await assert.rejects(service.readAttachment({ name: "broken.pdf", data: Buffer.from("%PDF-1.4\nnot really a pdf").toString("base64") }), /PDF 打不开|没有可读取的文本层/);
    await assert.rejects(service.readAttachment({ name: "archive.zip", data: Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]).toString("base64") }), /暂时只能读取文本文件、PDF 和图片|不能读取/);
    await assert.rejects(service.readAttachment({ name: "empty.pdf", data: "" }), /没有收到文件/);
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("a picture the person brings is taken in by the runtime and shown to the model in that round only; a model marked as not seeing images gets nothing", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-images-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests.push(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    return reply();
  });
  let vision: boolean | undefined;
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-images-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture", ...(vision === undefined ? {} : { vision }) }),
    resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => host, authority: async work => assistantAuthority(local, work, () => new Set()), timeZone: "Asia/Shanghai" }, "web-user");
  try {
    const image = png(), bytes = image.toString("base64");
    const material = await service.readAttachment({ name: "chart.png", data: bytes });
    assert.equal(material.kind, "image");
    assert.equal(material.image?.media_type, "image/png");
    assert.equal(material.text, undefined, "a picture never travels as text");

    // Unknown whether the model sees images: it gets the picture, and is told to say so rather than guess.
    const sent = await service.send({ text: "图里有什么？", request_id: "image-send-1", scope: { kind: "personal" }, materials: [material] }, {});
    await until(async () => (await service.read(sent.work.work_id)).work.state === "completed", "first round");
    const first = requests.at(-1)!;
    assert.ok(first.includes(bytes), "the model call carries the picture itself");
    assert.match(first, /"type":"image"/);
    assert.ok(first.includes("看不到图片内容就直接说看不到"), "the model is told not to guess");
    assert.equal((await service.read(sent.work.work_id)).rounds[0]!.materials[0]!.kind, "image");
    // The picture can be looked at again from the work (the side panel shows it), exactly as it was brought.
    assert.deepEqual(await service.materialImage(sent.work.work_id, material.material_id), { media_type: "image/png", data: bytes });
    // After a restart the runtime holds no copy: the work says so, and asking for it gives the way out instead of a picture.
    const restarted = new AssistantService(store, { host: async () => host, authority: async work => assistantAuthority(local, work, () => new Set()), timeZone: "Asia/Shanghai" }, "web-user");
    assert.equal((await restarted.read(sent.work.work_id)).rounds[0]!.materials[0]!.expired, true);
    assert.equal((await service.read(sent.work.work_id)).rounds[0]!.materials[0]!.expired, undefined);
    await assert.rejects(restarted.materialImage(sent.work.work_id, material.material_id), (error: unknown) => error instanceof AssistantError && error.code === "assistant.expired" && /重新添加/.test(error.message));

    // The next round of the same work does not carry it again.
    await service.send({ text: "继续说说颜色的含义", request_id: "image-send-2", work_id: sent.work.work_id }, {});
    await until(async () => { const view = await service.read(sent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed"; }, "second round");
    assert.ok(!requests.at(-1)!.includes(bytes), "a later round does not see the picture again");
    assert.ok(requests.at(-1)!.includes("之前的轮次里用户附过图片（「chart.png」）"), "it is told a picture came earlier, so it does not disown what it saw");

    // Marked as not seeing images: nothing is sent, the person hears why, and what they typed is kept.
    vision = false;
    const before = requests.length;
    await assert.rejects(service.send({ text: "再看这张", request_id: "image-send-3", work_id: sent.work.work_id, materials: [material] }, {}), /不支持看图/);
    assert.equal(requests.length, before, "no model call ran");
    assert.equal((await service.read(sent.work.work_id)).work.draft, "再看这张");

    // A reference this runtime never issued is refused before anything starts; so is what is not a picture.
    await assert.rejects(service.send({ text: "看这个", request_id: "image-send-4", scope: { kind: "personal" }, materials: [{ ...material, image: { ...material.image!, resource_id: "res-forged" } }] }, {}), /已失效/);
    await assert.rejects(service.readAttachment({ name: "photo.heic", data: Buffer.from("not an image at all").toString("base64") }), /只能带 PNG、JPEG、GIF 或 WebP 图片/);
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});
