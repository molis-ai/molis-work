import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareContextDocument } from "../apps/local-host/src/context-onboarding-documents.js";
import { contextSources, includedContextFiles, readContextSource } from "../apps/local-host/src/context-onboarding-sources.js";

const { zipSync, strToU8 } = createRequire(new URL("../apps/local-host/package.json", import.meta.url))("fflate");
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
test("PDF text and DOCX body retain exact originals while malformed and blank documents fail individually", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-context-docs-")), id = randomUUID(); t.after(() => rm(home, { recursive: true, force: true }));
  const word = Buffer.from(zipSync({ "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    "word/document.xml": strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>十月发布，日期需要复核。</w:t></w:r></w:p></w:body></w:document>') })).toString("base64");
  const files = [{ path: "brief.pdf", data: pdf("Release needs review") }, { path: "review.docx", data: word }, { path: "broken.docx", data: Buffer.from("invalid").toString("base64") }, { path: "empty.pdf", data: pdf("") }];
  // The journey's staging, as docs/system/HOME-DATA.md lays it out: each file and each text under its digest.
  const staged = (kind: "files" | "texts", sha256: string) => readFile(join(home, "context-onboarding", "journeys", id, kind, sha256));
  const read = [];
  for (const file of files) read.push(await prepareContextDocument(home, id, "files", { path: file.path, bytes: Buffer.from(file.data, "base64") }));
  const references = read.flatMap(r => "reference" in r ? [r.reference] : []), issues = read.flatMap(r => "issue" in r ? [r.issue] : []);
  assert.equal(references.length, 2);
  assert.match(String(await staged("texts", references[0]!.text.sha256)), /Release needs review/); assert.match(String(await staged("texts", references[1]!.text.sha256)), /日期需要复核/);
  assert.equal((await staged("files", references[0]!.original.sha256)).toString("base64"), files[0]!.data);
  assert.equal(references[1]!.original.sha256, createHash("sha256").update(Buffer.from(word, "base64")).digest("hex"));
  assert.deepEqual(issues.map(i => i.path), ["broken.docx", "empty.pdf"]); assert.match(issues[1]!.reason, /文本层/);
});
test("preview persists only bounded metadata and excludes both file and subdirectory from read payload", async () => {
  const files = ["include.md", "exclude.md", "private/a.md"].map(path => ({ path, size: 12, modified_ms: 1000, identity: "1:2:3:4:5:6" }));
  const raw = { kind: "downloads", selected: true, days: 7, metadata: { files, skipped: 2, truncated: false }, excluded: ["exclude.md", "private"] };
  const source = contextSources([raw])[0]!;
  assert.equal(source.files, undefined); assert.deepEqual(includedContextFiles(source).map(f => f.path), ["include.md"]);
  const staged = createHash("sha256").update("Content").digest("hex");
  assert.throws(() => contextSources([{ ...raw, files: [{ path: "private/a.md", staged }] }]), /预览选定范围/);
  assert.throws(() => contextSources([{ ...raw, metadata: { files: [{ ...files[0], path: "../escape.md" }] } }]), /范围无效/);
  assert.throws(() => contextSources([{ ...raw, files: [{ path: "include.md", staged: "not-a-digest" }] }]), /内容无效/);
  await assert.rejects(readContextSource("/unused", { kind: "directory", selected: true, path: "/tmp" }), /请选择/);
});

// What an unreadable file's issue keeps of the error is the first 600 whole characters of its message (a 🙂 is one character, though two UTF-16 units).
const ISSUE_CUTS = [
  { name: "the 600th character is a 🙂: kept whole", message: "x".repeat(599) + "🙂" + "tail", kept: "x".repeat(599) + "🙂" },
  { name: "the first slice ends inside a 🙂: x and 700 🙂 are cut to x and 599 🙂", message: "x" + "🙂".repeat(700), kept: "x" + "🙂".repeat(599) },
  { name: "700 🙂 are cut to 600", message: "🙂".repeat(700), kept: "🙂".repeat(600) },
  { name: "601 one-unit characters are cut to 600", message: "x".repeat(601), kept: "x".repeat(600) },
];
// A message of 600 characters or fewer is kept whole, whatever its length in UTF-16 units.
const ISSUE_FITS = [
  { name: "599 one-unit characters and a 🙂 (600 characters, 601 units)", message: "x".repeat(599) + "🙂" },
  { name: "600 🙂 (600 characters, 1,200 units)", message: "🙂".repeat(600) },
  { name: "600 one-unit characters", message: "x".repeat(600) },
  { name: "a short message", message: "文件已损坏，无法解析" },
];
// The reasons the issue keeps in place of the message, whatever its length: an encrypted PDF, and a file the Host could not hold whole.
const ENCRYPTED = "PDF 已加密，请解密后导入";
const UNREADABLE = [
  { code: "ERR_FS_FILE_TOO_LARGE", reason: "文件超过 2 GB，暂时读不出正文；请拆分后再选" },
  { code: "ERR_STRING_TOO_LONG", reason: "正文太长，一次读不出来；请拆分后再选" },
];

/** A file whose reading throws `thrown` (a getter that throws, as the disk-full test of tests/context-onboarding.test.ts does): the issue prepareContextDocument keeps of it. */
async function issueOf(thrown: unknown) {
  const read = await prepareContextDocument("/unused", "journey", "files", { path: "notes/a.md", get reason(): string { throw thrown; } });
  assert.ok("issue" in read, "a file that cannot be read is an issue of its own");
  return read.issue;
}

for (const c of ISSUE_CUTS) test(`RAC-2145 an unreadable file's issue keeps the first 600 whole characters of the error: ${c.name}`, async () => {
  assert.equal((await issueOf(new Error(c.message))).reason, c.kept);
});

for (const c of ISSUE_FITS) test(`RAC-2146 an unreadable file's issue keeps an error of 600 characters or fewer whole: ${c.name}`, async () => {
  assert.equal((await issueOf(new Error(c.message))).reason, c.message);
});

test("RAC-2147 a file whose reading throws something that is not an Error keeps the plain text of its own, not a cut of the value", async () => {
  assert.equal((await issueOf("x".repeat(700))).reason, "无法读取文件");
});

for (const c of [{ name: "a short message", message: "No password given" }, { name: "the word comes after the 600th character", message: "x".repeat(700) + " password" }]) {
  test(`RAC-2148 an encrypted PDF keeps its own text, not a cut of the error: ${c.name}`, async () => {
    assert.equal((await issueOf(new Error(c.message))).reason, ENCRYPTED);
  });
}

for (const c of UNREADABLE) test(`RAC-2149 a file the Host could not hold keeps the reason of its code, not a cut of the message: ${c.code}`, async () => {
  assert.equal((await issueOf(Object.assign(new Error("x".repeat(700)), { code: c.code }))).reason, c.reason);
});
