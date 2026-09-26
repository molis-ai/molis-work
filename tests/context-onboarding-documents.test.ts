import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { prepareContextDocuments } from "../apps/local-host/src/context-onboarding-documents.js";
import { contextSources, includedContextFiles, readContextSource } from "../apps/local-host/src/context-onboarding-sources.js";

const { zipSync, strToU8 } = createRequire(new URL("../plugins/native/pages/package.json", import.meta.url))("fflate");
function pdf(text: string) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const content = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  let body = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((value, i) => { offsets.push(Buffer.byteLength(body)); body += `${i+1} 0 obj\n${value}\nendobj\n`; });
  const start = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n` + offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(body + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`).toString("base64");
}
test("PDF text and DOCX body retain exact originals while malformed and blank documents fail individually", async () => {
  const word = Buffer.from(zipSync({ "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    "word/document.xml": strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>十月发布，日期需要复核。</w:t></w:r></w:p></w:body></w:document>') })).toString("base64");
  const files = [{ path: "brief.pdf", data: pdf("Release needs review") }, { path: "review.docx", data: word }, { path: "broken.docx", data: Buffer.from("invalid").toString("base64") }, { path: "empty.pdf", data: pdf("") }];
  const result = await prepareContextDocuments("files", files);
  assert.equal(result.references.length, 2); assert.match(result.references[0]!.body, /Release needs review/); assert.match(result.references[1]!.body, /日期需要复核/);
  assert.equal(result.references[0]!.original.data_base64, files[0]!.data); assert.equal(result.references[1]!.original.data_base64, word);
  assert.deepEqual(result.issues.map(i => i.path), ["broken.docx", "empty.pdf"]); assert.match(result.issues[1]!.reason, /文本层/);
});
test("preview persists only bounded metadata and excludes both file and subdirectory from read payload", async () => {
  const files = ["include.md", "exclude.md", "private/a.md"].map(path => ({ path, size: 12, modified_ms: 1000, identity: "1:2:3:4:5:6" }));
  const raw = { kind: "downloads", selected: true, days: 7, metadata: { files, skipped: 2, truncated: false }, excluded: ["exclude.md", "private"] };
  const source = contextSources([raw])[0]!;
  assert.equal(source.files, undefined); assert.deepEqual(includedContextFiles(source).map(f => f.path), ["include.md"]);
  const data = Buffer.from("Content").toString("base64");
  assert.throws(() => contextSources([{ ...raw, files: [{ path: "private/a.md", data }] }]), /预览选定范围/);
  assert.throws(() => contextSources([{ ...raw, metadata: { files: [{ ...files[0], path: "../escape.md" }] } }]), /范围无效/);
  assert.throws(() => contextSources([{ ...raw, files: [{ path: "include.md", data: "invalid-base64" }] }]), /内容无效/);
  await assert.rejects(readContextSource("/unused", { kind: "directory", selected: true, path: "/tmp" }), /请选择/);
});
