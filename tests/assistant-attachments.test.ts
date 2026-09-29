import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantService } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";
import { pdfDocumentParser } from "../apps/local-host/src/pdf-document-parser.js";

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
    await assert.rejects(service.readAttachment({ name: "photo.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString("base64") }), /暂时只能读取文本文件和 PDF|不能读取/);
    await assert.rejects(service.readAttachment({ name: "empty.pdf", data: "" }), /没有收到文件/);
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});
