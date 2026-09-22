import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { preparePagesImport } from "../plugins/native/pages/src/import-files.js";
import { pagesSchema } from "../plugins/native/pages/src/schema.js";

const requirePages = createRequire(new URL("../plugins/native/pages/package.json", import.meta.url));
const { zipSync } = requirePages("fflate") as {
  zipSync(entries: Record<string, Uint8Array>, options?: { level: number }): Uint8Array;
};
const upload = (name: string, content: string | Uint8Array) => ({ name, data: Buffer.from(content).toString("base64") });
const zip = (entries: Record<string, string | Uint8Array>, level = 0): Buffer => Buffer.from(zipSync(
  Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, Buffer.from(value)])), { level },
));
const minimalDocx = (externalImage = false): Buffer => zip({
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`,
  "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`,
  "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>
      <w:p><w:r><w:t>飞书导出的中文正文</w:t></w:r></w:p>
      <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>保留粗体</w:t></w:r></w:p>
      <w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>保留下划线</w:t></w:r></w:p>
      ${externalImage ? `<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="图片" descr="外部图片说明"/>
        <a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:link="rIdImage"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>
      </wp:inline></w:drawing></w:r></w:p>` : ""}
    </w:body></w:document>`,
  ...(externalImage ? {
    "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
        Target="file:///this-file-does-not-exist/pages-import-never-read.png" TargetMode="External"/>
      </Relationships>`,
  } : {}),
});

function centralOffset(buffer: Buffer): number {
  return buffer.readUInt32LE(buffer.length - 6);
}

test("Pages import reads mixed files with deterministic keys and valid editor documents", async () => {
  const files = [upload("笔记.md", "# 导入标题\n\n来自 Notion 的 **中文正文**"), upload("记录.txt", "第一行\n第二行")];
  const result = await preparePagesImport(files);
  assert.equal(result.documents.length, 2);
  assert.deepEqual(result.documents.map((document) => document.key), ["document-1", "document-2"]);
  assert.equal(result.documents[0].name, "笔记.md");
  assert.match(JSON.stringify(result.documents[0].body), /中文正文/);
  for (const document of result.documents) pagesSchema.nodeFromJSON(document.body).check();
  assert.deepEqual((await preparePagesImport(files)).documents, result.documents);
});

test("Notion ZIP imports nested documents as separate Pages and reports skipped attachments", async () => {
  const archive = zip({
    "工作区/产品 0123456789abcdef0123456789abcdef.md": "# 产品\n\n文档内容",
    "工作区/项目/计划.html": "<h1>计划</h1><p>HTML 正文</p>",
    "工作区/数据.csv": "姓名,状态\n张三,完成",
    "工作区/image.png": new Uint8Array([137, 80, 78, 71]),
    "__MACOSX/._计划.html": "metadata",
    ".DS_Store": "metadata",
  }, 6);
  const result = await preparePagesImport([upload("Notion.zip", archive)]);
  assert.equal(result.documents.length, 3);
  assert.match(result.documents[0].name, /^Notion\.zip \/ 工作区\//);
  assert.ok(result.warnings.some((warning) => warning.includes("image.png")));
  assert.ok(result.warnings.some((warning) => warning.includes("2 个系统元数据")));
  for (const document of result.documents) pagesSchema.nodeFromJSON(document.body).check();
});

test("real DOCX package converts through Mammoth, directly and inside a ZIP", async () => {
  const document = minimalDocx();
  const result = await preparePagesImport([upload("飞书.docx", document), upload("导出.zip", zip({ "嵌套/另一份.docx": document }))]);
  assert.equal(result.documents.length, 2);
  for (const entry of result.documents) {
    assert.match(JSON.stringify(entry.body), /飞书导出的中文正文/);
    assert.match(JSON.stringify(entry.body), /"type":"strong"/);
    assert.match(JSON.stringify(entry.body), /"type":"underline"/);
    pagesSchema.nodeFromJSON(entry.body).check();
  }
});

test("UTF-16 BOM text exports import without becoming binary content", async () => {
  const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("中文导出", "utf16le")]);
  const result = await preparePagesImport([upload("文本.txt", bytes)]);
  assert.match(JSON.stringify(result.documents[0].body), /中文导出/);
});

test("DOCX linked images preserve visible descriptions without reading external files", async () => {
  const result = await preparePagesImport([upload("外部图片.docx", minimalDocx(true))]);
  assert.match(JSON.stringify(result.documents[0].body), /外部图片说明/);
  assert.ok(result.documents[0].warnings.some((warning) => warning.includes("1 张图片")));
  assert.ok(!result.documents[0].warnings.some((warning) => warning.includes("could not read external image")));
  assert.doesNotMatch(JSON.stringify(result.documents[0].body), /file:\/\/\//);
});

test("unsupported files warn while corrupt supported files reject the entire batch", async () => {
  const result = await preparePagesImport([upload("图片.png", "attachment"), upload("正常.md", "正常内容")]);
  assert.equal(result.documents.length, 1);
  assert.match(result.warnings[0], /图片\.png/);
  await assert.rejects(preparePagesImport([upload("正常.md", "正常内容"), upload("损坏.docx", "not a docx")]), /损坏|格式/);
  await assert.rejects(preparePagesImport([upload("伪装.docx", zip({ "a.md": "no Word data" }))]), /有效的 Word/);
  await assert.rejects(preparePagesImport([upload("损坏.zip", "not a zip")]), /损坏|格式/);
  await assert.rejects(preparePagesImport([upload("图片.png", "attachment")]), /没有可导入/);
  await assert.rejects(preparePagesImport([]), /请选择/);
});

test("ZIP rejects traversal, encrypted entries, duplicate paths and corrupted bytes", async () => {
  for (const path of ["../evil.md", "/absolute.md", "C:\\evil.md", "nested\\..\\evil.md"]) {
    await assert.rejects(preparePagesImport([upload("不安全.zip", zip({ [path]: "bad" }))]), /不安全/);
  }
  const encrypted = zip({ "a.md": "body" });
  const encryptedCentral = centralOffset(encrypted);
  encrypted.writeUInt16LE(encrypted.readUInt16LE(6) | 1, 6);
  encrypted.writeUInt16LE(encrypted.readUInt16LE(encryptedCentral + 8) | 1, encryptedCentral + 8);
  await assert.rejects(preparePagesImport([upload("加密.zip", encrypted)]), /加密/);

  const duplicate = zip({ "a.md": "A", "b.md": "B" });
  const duplicateCentral = centralOffset(duplicate);
  const secondCentral = duplicateCentral + 46 + duplicate.readUInt16LE(duplicateCentral + 28)
    + duplicate.readUInt16LE(duplicateCentral + 30) + duplicate.readUInt16LE(duplicateCentral + 32);
  duplicate[secondCentral + 46] = "a".charCodeAt(0);
  duplicate[duplicate.readUInt32LE(secondCentral + 42) + 30] = "a".charCodeAt(0);
  await assert.rejects(preparePagesImport([upload("重复.zip", duplicate)]), /重复路径/);

  const corrupted = zip({ "a.md": "original" });
  corrupted[30 + corrupted.readUInt16LE(26) + corrupted.readUInt16LE(28)] ^= 1;
  await assert.rejects(preparePagesImport([upload("损坏.zip", corrupted)]), /校验码|损坏/);
});

test("ZIP filenames with non-ASCII bytes must explicitly declare UTF-8", async () => {
  const archive = zip({ "中文文件.md": "中文内容" });
  const directory = centralOffset(archive);
  archive.writeUInt16LE(archive.readUInt16LE(6) & ~2048, 6);
  archive.writeUInt16LE(archive.readUInt16LE(directory + 8) & ~2048, directory + 8);
  await assert.rejects(preparePagesImport([upload("旧编码.zip", archive)]), /重新导出为 UTF-8 ZIP/);
});

test("size and compression limits reject entries before unsafe inflation", async () => {
  const oversized = zip({ "a.md": "tiny" });
  const directory = centralOffset(oversized);
  oversized.writeUInt32LE(5 * 1024 * 1024 + 1, 22);
  oversized.writeUInt32LE(5 * 1024 * 1024 + 1, directory + 24);
  await assert.rejects(preparePagesImport([upload("超限.zip", oversized)]), /5 MiB/);

  const compressedBomb = zip({ "a.md": "A".repeat(200_000) }, 9);
  await assert.rejects(preparePagesImport([upload("高压缩比.zip", compressedBomb)]), /压缩比/);

  // Forge a small originalSize in both headers: bounded inflation must still reject it.
  compressedBomb.writeUInt32LE(10, 22);
  compressedBomb.writeUInt32LE(10, centralOffset(compressedBomb) + 24);
  await assert.rejects(preparePagesImport([upload("伪造大小.zip", compressedBomb)]), /损坏|安全限制/);

  await assert.rejects(preparePagesImport([upload("过大.txt", Buffer.alloc(10 * 1024 * 1024 + 1, 65))]), /10 MiB/);
  await assert.rejects(preparePagesImport([upload("一.txt", Buffer.alloc(6 * 1024 * 1024, 65)), upload("二.txt", Buffer.alloc(5 * 1024 * 1024, 65))]), /合计不能超过 10 MiB/);
});

test("document, archive entry, and expanded aggregate limits apply across the batch", async () => {
  const documents = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`${index}.md`, "body"]));
  await assert.rejects(preparePagesImport([upload("太多文档.zip", zip(documents))]), /100 篇/);
  const entries = Object.fromEntries(Array.from({ length: 1001 }, (_, index) => [`${index}.png`, ""]));
  await assert.rejects(preparePagesImport([upload("太多文件.zip", zip(entries))]), /1000/);

  const block = Buffer.alloc(16 * 1024);
  let seed = 42;
  for (let index = 0; index < block.length; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    block[index] = seed >>> 24;
  }
  // Repeated random blocks keep the compression ratio below 200, while 5 x 5 MiB exceeds the budget.
  const largeEntry = Buffer.concat(Array.from({ length: 320 }, () => block));
  const aggregate = zip(Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`${index}.png`, largeEntry])), 1);
  await assert.rejects(preparePagesImport([upload("总解压超限.zip", aggregate)]), /20 MiB/);
});

test("invalid base64 and invalid text encoding reject before producing documents", async () => {
  await assert.rejects(preparePagesImport([{ name: "bad.md", data: "%%%=" }]), /编码无效/);
  await assert.rejects(preparePagesImport([upload("bad.md", new Uint8Array([0xc0, 0xaf]))]), /编码无效/);
  await assert.rejects(preparePagesImport([upload("binary.txt", new Uint8Array([65, 0, 66]))]), /二进制/);
});
