import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { computeBuildSourceDigest } from "../apps/local-host/src/installer/fingerprint.js";
import { declaredReleaseFileEntries, copyReleaseEntries } from "../apps/local-host/src/installer/package-release-files.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { createMaterialExtractor, extractMaterial, readMaterialHtml } from "../apps/local-host/src/material-extraction.js";
import { extractUploadedMaterial } from "../apps/local-host/src/material-upload.js";
import { prepareContextDocument } from "../apps/local-host/src/context-onboarding-documents.js";

function pdf(texts: string[]): Buffer {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${texts.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${texts.length} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  texts.forEach((text, index) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`);
    const content = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  let body = "%PDF-1.4\n"; const offsets: number[] = [];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(body + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
test("the shared extractor preserves page positions and declares missing text or exhausted budgets", async () => {
  const bytes = pdf(["First page", "Second page", ""]);
  const result = await extractMaterial({ file_name: "test.pdf", bytes });
  assert.equal(result.coverage.status, "partial"); assert.equal(result.coverage.truncated, false);
  assert.deepEqual(result.pages.map(page => [page.number, page.text]), [[1, "First page"], [2, "Second page"], [3, ""]]);
  assert.match(result.coverage.issues.join(" "), /第 3 页.*文本层/);
  const limited = await extractMaterial({ file_name: "test.pdf", bytes }, { limits: { maxPages: 1 } });
  assert.equal(limited.coverage.total_pages, 3); assert.equal(limited.coverage.processed_pages, 1);
  assert.equal(limited.coverage.truncated, true); assert.equal(limited.text, "First page");
  const short = await extractMaterial({ file_name: "test.pdf", bytes }, { limits: { maxCharacters: 5 } });
  assert.equal(short.text, "First"); assert.equal(short.pages[0]!.text, "First"); assert.equal(short.coverage.status, "partial");
  const full = await extractMaterial({ file_name: "test.pdf", bytes: pdf(["First", "Second"]) });
  assert.equal(full.coverage.status, "sufficient"); assert.equal(full.text, "First\n\nSecond");
});
test("text limits preserve UTF-8/code points and HTML parsing excludes active content without network access", async () => {
  const source = { file_name: "notes.md", bytes: Buffer.from("中文😀尾") };
  const bytes = await extractMaterial(source, { limits: { maxTextBytes: 9 } });
  assert.equal(bytes.text, "中文"); assert.equal(bytes.coverage.truncated, true);
  const characters = await extractMaterial(source, { limits: { maxCharacters: 3 } });
  assert.equal(characters.text, "中文");
  assert.equal((await extractMaterial({ file_name: "plain.txt", bytes: Buffer.from("# Plain text heading") })).title, undefined);
  const html = await extractMaterial({ file_name: "article.html", bytes: Buffer.from('<title>标题 &amp; 名称</title><nav>导航</nav><article><h2>正文</h2><p>A &#x4E2D; &#99999999;</p><script>SECRET') }, { textFormat: "markdown" });
  assert.equal(html.title, "标题 & 名称"); assert.match(html.text, /## 正文/); assert.match(html.text, /A 中 &#99999999;/);
  assert.doesNotMatch(html.text, /SECRET|导航/); assert.equal(html.coverage.status, "partial"); assert.equal(html.coverage.truncated, false);
  await assert.rejects(extractMaterial({ file_name: "binary.txt", bytes: Buffer.from([0xff]) }), (error: unknown) => error instanceof ActionError && error.code === "material.encoding" && actionHttpStatus(error) === 400);
  await assert.rejects(extractMaterial(source, { limits: { maxBytes: 1 } }), /容量/);
});
test("PDF cancellation and timeout terminate the worker before returning; later extraction still works", async () => {
  const ports = () => process.getActiveResourcesInfo().filter(name => name === "MessagePort").length;
  const initialPorts = ports(), source = { file_name: "test.pdf", bytes: pdf(["Live worker"]) };
  const controller = new AbortController(), stopped = new Error("cancel material");
  const pending = extractMaterial(source, { signal: controller.signal }); controller.abort(stopped);
  await assert.rejects(pending, error => error === stopped); assert.equal(ports(), initialPorts);
  await assert.rejects(extractMaterial(source, { timeoutMs: 1 }), error => error instanceof ActionError && error.code === "material.timeout" && actionHttpStatus(error) === 502);
  assert.equal(ports(), initialPorts);
  assert.equal((await extractMaterial(source)).text, "Live worker"); assert.equal(ports(), initialPorts);
});

test("malformed HTML cannot block the Host deadline; cancellation releases its worker and later parsing recovers", { timeout: 5_000 }, async () => {
  const ports = () => process.getActiveResourcesInfo().filter(name => name === "MessagePort").length;
  const initial = ports(), html = "<".repeat(200_000), started = performance.now();
  await assert.rejects(readMaterialHtml(html, { timeoutMs: 200 }), error => error instanceof ActionError && error.code === "material.timeout" && actionHttpStatus(error) === 502);
  assert.ok(performance.now() - started < 2_000); assert.equal(ports(), initial);
  const controller = new AbortController(), stopped = new Error("cancel HTML");
  const pending = extractMaterial({ file_name: "bad.html", bytes: Buffer.from(html) }, { signal: controller.signal });
  setTimeout(() => controller.abort(stopped), 100);
  await assert.rejects(pending, error => error === stopped); assert.equal(ports(), initial);
  assert.deepEqual(await readMaterialHtml("<head><title>OK</title></head><p>Recovered</p>"), { title: "OK", text: "Recovered" });
  assert.equal(ports(), initial);
});
test("read, revoked and aborted uploads leave nothing in the Home", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "molis-material-ref-"));
  try {
    const upload = { file_name: "old.md", data_base64: Buffer.from("# 原始材料\n保持原件").toString("base64") };
    assert.equal((await extractUploadedMaterial(home, upload)).text, "# 原始材料\n保持原件");
    assert.deepEqual(readdirSync(home), [], "the text is returned; the upload itself is not kept");
    const cancelled = new AbortController();
    await assert.rejects(extractUploadedMaterial(home, { file_name: "cancel.md", data_base64: Buffer.from("NEW COPY").toString("base64") }, {
      signal: cancelled.signal, beforeEffect() { cancelled.abort(); },
    }), /已取消/);
    const revoked = new Error("permission revoked");
    await assert.rejects(extractUploadedMaterial(home, upload, { beforeEffect() { throw revoked; } }), error => error === revoked);
    const simultaneous = await Promise.all(Array.from({ length: 8 }, () => extractUploadedMaterial(home, {
      file_name: "simultaneous.txt", data_base64: Buffer.from("same concurrent content").toString("base64"),
    })));
    assert.ok(simultaneous.every(result => result.text === "same concurrent content"));
    assert.deepEqual(readdirSync(home), []);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
test("native cancellation kills the child and cleans its actual temporary input and run directory", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "molis-material-process-"));
  let runDirectory = "", pid = 0;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    const helper = path.join(home, "wait-helper");
    writeFileSync(helper, `#!${process.execPath}\nprocess.on('SIGTERM',()=>{});process.stderr.write(JSON.stringify({stage:JSON.stringify({file:process.argv[3],pid:process.pid}),progress:0})+'\\n');setInterval(()=>{},1000);\n`, { mode: 0o700 });
    const controller = new AbortController();
    const extract = createMaterialExtractor({ platform: "darwin", whisperHelperPath: helper, modelDirectory: home });
    const pending = extract({ file_name: "sample.wav", bytes: Buffer.from("authorized input") }, { signal: controller.signal,
      onProgress(progress) { const info = JSON.parse(progress.stage); runDirectory = path.dirname(info.file); pid = info.pid; assert.ok(existsSync(info.file)); controller.abort(); },
    });
    const deadline = new Promise<never>((_, reject) => { watchdog = setTimeout(() => reject(new Error("native cancellation did not finish")), 5000); });
    try {
      await assert.rejects(Promise.race([pending, deadline]), error => error instanceof Error && error.name === "AbortError");
      assert.ok(runDirectory); assert.equal(existsSync(runDirectory), false);
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    } finally {
      clearTimeout(watchdog);
      if (pid) { try { process.kill(pid, "SIGKILL"); } catch {} }
      await pending.catch(() => {});
    }
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("Host sends the selected OCR languages to its helper and rejects invalid line confidence or text", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "material-ocr-contract-"));
  const helper = path.join(home, "helper"), args = path.join(home, "arguments.json");
  const source = { file_name: "fixture.png", bytes: Buffer.from("authorized image bytes") };
  const base = { text: "Known line", extractor: "fixture", pages: [{ number: 1, text: "Known line", method: "vision-ocr", confidence: 0.9,
    lines: [{ text: "Known line", confidence: 0.9 }] }], coverage: { status: "sufficient", processed_pages: 1, total_pages: 1, issues: [] } };
  const fixture = (value: unknown) => writeFileSync(helper,
    `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(args)},JSON.stringify(process.argv.slice(2)));process.stdout.write(${JSON.stringify(JSON.stringify(value))});\n`, { mode: 0o700 });
  const extract = createMaterialExtractor({ platform: "darwin", helperPath: helper });
  try {
    fixture(base);
    const result = await extract(source, { ocrLanguages: ["zh-Hans", "en-US"] });
    assert.deepEqual(JSON.parse(readFileSync(args, "utf8")).slice(2), ["--languages", "zh-Hans,en-US"]);
    assert.deepEqual(result.pages[0]!.lines, [{ text: "Known line", confidence: 0.9 }]);
    for (const line of [{ text: "Known line", confidence: 2 }, { text: "Different line", confidence: 0.9 }]) {
      fixture({ ...base, pages: [{ ...base.pages[0], lines: [line] }] });
      await assert.rejects(extract(source), { code: "material.invalid_result" });
    }
  } finally { rmSync(home, { recursive: true, force: true }); }
});
// A long text is read whole (user 2026-10-22, replaces the 2 MB rejection of slice 90): each file is read on its own into the
// journey's staging, under its digest; a partly readable PDF still fails on its own.
test("onboarding rejects partially readable PDFs, reads long text whole, preserves exact originals and titles", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "molis-onboarding-documents-")), id = randomUUID();
  try {
    const html = '<title>Project</title><article><h1>Plan</h1><p>Ship it</p></article>', long = "中".repeat(700_000);
    const files = [{ path: "partial.pdf", bytes: pdf(["Readable", ""]) }, { path: "large.txt", bytes: Buffer.from(long) }, { path: "page.html", bytes: Buffer.from(html) }];
    const read = [];
    for (const file of files) read.push(await prepareContextDocument(home, id, "files", file));
    const issues = read.flatMap(r => "issue" in r ? [r.issue] : []), references = read.flatMap(r => "reference" in r ? [r.reference] : []);
    assert.deepEqual(issues.map(issue => issue.path), ["partial.pdf"]); assert.match(issues[0]!.reason, /第 2 页/);
    const staged = (kind: "files" | "texts", sha256: string) => readFileSync(path.join(home, "context-onboarding", "journeys", id, kind, sha256));
    const [large, page] = references;
    assert.equal(references.length, 2); assert.equal(page!.title, "Project");
    assert.equal(String(staged("texts", large!.text.sha256)), long, "the whole long text, not cut at 2 MB");
    assert.match(String(staged("texts", page!.text.sha256)), /# Plan/);
    assert.equal(page!.original.sha256, createHash("sha256").update(html).digest("hex"));
    assert.equal(String(staged("files", page!.original.sha256)), html, "the exact original");
    const controller = new AbortController(), stopped = new Error("cancel onboarding"); controller.abort(stopped);
    await assert.rejects(prepareContextDocument(home, id, "files", files[2]!, controller.signal), error => error === stopped);
  } finally { rmSync(home, { recursive: true, force: true }); }
});


test("Host release assets include executable native extraction and its licenses without shipping Swift caches", { skip: process.platform !== "darwin" }, async () => {
  const source = fileURLToPath(new URL("../apps/local-host/", import.meta.url));
  const destination = mkdtempSync(path.join(tmpdir(), "molis-material-release-"));
  try {
    const manifest = JSON.parse(readFileSync(path.join(source, "package.json"), "utf8"));
    const entries = (await declaredReleaseFileEntries(source, manifest)).filter(entry => entry.startsWith("native/"));
    await copyReleaseEntries(source, destination, entries);
    const native = path.join(destination, "native", "materials");
    const capabilities = JSON.parse(execFileSync(path.join(native, "bin", "jelly-material"), ["capabilities"], { encoding: "utf8" }));
    assert.equal(capabilities.image_ocr, "available"); assert.equal(capabilities.pdf, "available");
    assert.ok(existsSync(path.join(native, "bin", "jelly-whisper")));
    assert.ok(existsSync(path.join(native, "licenses", "argmax-oss-swift-LICENSE.txt")));
    assert.equal(existsSync(path.join(native, "whisper")), false);
  } finally { rmSync(destination, { recursive: true, force: true }); }
});


test("native source and build inputs invalidate the existing installation build check, generated caches do not", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "molis-material-build-"));
  try {
    writeFileSync(path.join(root, "package.json"), "{}"); writeFileSync(path.join(root, "tsconfig.json"), "{}");
    const packageRoot = path.join(root, "apps", "local-host"), native = path.join(packageRoot, "native", "materials");
    mkdirSync(native, { recursive: true }); writeFileSync(path.join(packageRoot, "package.json"), "{}");
    const source = path.join(native, "extract.swift"); writeFileSync(source, "print(1)");
    const original = await computeBuildSourceDigest(root);
    for (const directory of [".build", ".swiftpm", "bin"]) {
      const cache = path.join(native, directory); mkdirSync(cache); writeFileSync(path.join(cache, "cached.swift"), "temporary");
    }
    assert.equal(await computeBuildSourceDigest(root), original);
    writeFileSync(source, "print(2)"); const changed = await computeBuildSourceDigest(root); assert.notEqual(changed, original);
    writeFileSync(path.join(native, "build.sh"), "swift build"); const withBuild = await computeBuildSourceDigest(root); assert.notEqual(withBuild, changed);
    writeFileSync(path.join(native, "Package.resolved"), "locked dependencies"); assert.notEqual(await computeBuildSourceDigest(root), withBuild);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// A title is cut to 500 whole characters (an emoji is one, as the action schemas count it), never between the two halves of one.
const TITLES = [
  { name: "the 500th character is a two-unit one", heading: "a".repeat(499) + "😀" + "尾".repeat(10), title: "a".repeat(499) + "😀" },
  { name: "600 two-unit characters", heading: "😀".repeat(600), title: "😀".repeat(500) },
  { name: "exactly 500 two-unit characters", heading: "😀".repeat(500), title: "😀".repeat(500) },
  { name: "short", heading: "短标题", title: "短标题" },
];

test("RAC-1861 a material title is cut to 500 whole characters, in Markdown and in HTML", async t => {
  for (const kind of ["markdown", "html"] as const) for (const c of TITLES) await t.test(`${kind}: ${c.name}`, async () => {
    const source = kind === "markdown" ? { file_name: "title.md", bytes: Buffer.from(`# ${c.heading}\n\nbody`) }
      : { file_name: "title.html", bytes: Buffer.from(`<title>${c.heading}</title><p>body</p>`) };
    assert.equal((await extractMaterial(source)).title, c.title);
  });
});

test("RAC-1862 an onboarding document's title is whole characters, so the sources line can encode it", async t => {
  const home = mkdtempSync(path.join(tmpdir(), "molis-onboarding-titles-")), id = randomUUID();
  try {
    for (const c of TITLES.slice(0, 3)) await t.test(c.name, async () => {
      const read = await prepareContextDocument(home, id, "files", { path: "notes/long.md", bytes: Buffer.from(`# ${c.heading}\n\nbody`) });
      const title = "reference" in read ? read.reference.title : read.issue.reason;
      // The onboarding page's sources line encodes the title this way (context-onboarding-service.ts); half a character throws here.
      assert.doesNotThrow(() => encodeURIComponent(title));
      assert.equal(title, c.title);
    });
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("RAC-1863 a title that fits is kept as it is: the document's own, else the file name without its extension", async t => {
  const home = mkdtempSync(path.join(tmpdir(), "molis-onboarding-titles-")), id = randomUUID();
  try {
    const titles = [];
    for (const file of [{ path: "notes/plan.md", bytes: Buffer.from("# 十月计划\n\nbody") }, { path: "notes/周报 😀.txt", bytes: Buffer.from("body") }]) {
      const read = await prepareContextDocument(home, id, "files", file);
      titles.push("reference" in read ? read.reference.title : read.issue.reason);
    }
    assert.deepEqual(titles, ["十月计划", "周报 😀"]);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
