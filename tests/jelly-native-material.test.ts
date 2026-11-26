import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { extractUploadedMaterial } from "../apps/local-host/src/material-upload.js";
/** A refusal of the material reader: an ActionError under the platform's material name, whose status comes from its kind. */
const isMaterialFailure = (error: unknown): error is ActionError => error instanceof ActionError && error.code.startsWith("material.");
const helper = fileURLToPath(new URL("../apps/local-host/native/materials/bin/molis-material", import.meta.url));
const upload = (name: string, text: string | Buffer) => ({ file_name: name, data_base64: Buffer.from(text).toString("base64") });
function home() { return mkdtempSync(path.join(tmpdir(), "molis-native-material-")); }

test("uploaded UTF8 and HTML become traceable text without evaluating scripts", async () => {
  const directory = home();
  try {
    const text = await extractUploadedMaterial(upload("用户笔记.md", "# 真实想法\n保留中文。")); assert.equal(text.text, "# 真实想法\n保留中文。"); assert.equal(text.coverage.status, "sufficient");
    const html = await extractUploadedMaterial(upload("网页.html", "<html><style>SECRET STYLE</style><script>SECRET SCRIPT</script><h1>标题</h1><p>A &amp; B &#x4E2D;&#25991;</p></html>"));
    assert.match(html.text, /标题/); assert.match(html.text, /A & B 中文/); assert.doesNotMatch(html.text, /SECRET/); assert.equal(html.coverage.status, "partial");
    // Reading keeps no spark, so nothing of the upload stays in the Home: no raw copy that no one would read or clean up.
    assert.deepEqual(readdirSync(directory), []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("path names, invalid base64, empty, unsupported and non-UTF8 inputs fail", async () => {
  const directory = home();
  try {
    for (const input of [upload("../private.txt", "safe"), upload("C:\\private.txt", "safe"), upload("program.exe", "binary"), upload("empty.txt", ""), { file_name: "bad.txt", data_base64: "%%%" }, upload("binary.txt", Buffer.from([0xFF, 0xFE]))]) await assert.rejects(extractUploadedMaterial(input), isMaterialFailure);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("missing native helper and unsupported host return explicit unavailable errors and leave no copy of the upload", async () => {
  const directory = home();
  try {
    const input = upload("document.pdf", "%PDF-1.4\n");
    await assert.rejects(extractUploadedMaterial(input, { platform: "linux" }), (error: unknown) => isMaterialFailure(error) && actionHttpStatus(error) === 503);
    await assert.rejects(extractUploadedMaterial(input, { platform: "darwin", helperPath: path.join(directory, "missing") }), (error: unknown) => isMaterialFailure(error) && error.code === "material.native_unavailable");
    assert.deepEqual(readdirSync(directory), []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("Batch 112: audio and video are refused before any helper runs; text still reads", async () => {
  assert.equal((await extractUploadedMaterial(upload("test.txt", "data"))).text, "data");
  for (const name of ["sample.wav", "clip.mp4"]) await assert.rejects(extractUploadedMaterial(upload(name, Buffer.from("RIFF"))), (error: unknown) => isMaterialFailure(error) && error.code === "material.unsupported");
});
test("real macOS helper extracts image OCR (including Japanese), PDF text and image-only PDF pages", { skip: process.platform !== "darwin" || !existsSync(helper) }, async () => {
  const directory = home();
  try {
    const fixture = path.join(directory, "fixtures.swift");
    writeFileSync(fixture, `import Foundation\nimport AppKit\nimport PDFKit\nlet directory = CommandLine.arguments[1]\nlet rect = NSRect(x: 0, y: 0, width: 1200, height: 500)\nlet image = NSImage(size: rect.size)\nimage.lockFocus()\nNSColor.white.setFill(); rect.fill()\n("JELLY MATERIAL SAMPLE 2026" as NSString).draw(at: NSPoint(x: 50, y: 230), withAttributes: [.font: NSFont.systemFont(ofSize: 46), .foregroundColor: NSColor.black])\nimage.unlockFocus()\nlet bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!\ntry bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: directory + "/sample.png"))\nlet japanese = NSImage(size: rect.size)\njapanese.lockFocus()\nNSColor.white.setFill(); rect.fill()\n("日本語の資料サンプル" as NSString).draw(at: NSPoint(x: 50, y: 230), withAttributes: [.font: NSFont.systemFont(ofSize: 56), .foregroundColor: NSColor.black])\njapanese.unlockFocus()\ntry NSBitmapImageRep(data: japanese.tiffRepresentation!)!.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: directory + "/sample-ja.png"))\nvar mediaBox = CGRect(x: 0, y: 0, width: 600, height: 400)\nlet context = CGContext(URL(fileURLWithPath: directory + "/sample.pdf") as CFURL, mediaBox: &mediaBox, nil)!\ncontext.beginPDFPage(nil)\nNSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)\n("JELLY PDF NATIVE TEXT 2026" as NSString).draw(at: NSPoint(x: 30, y: 200), withAttributes: [.font: NSFont.systemFont(ofSize: 26), .foregroundColor: NSColor.black])\nNSGraphicsContext.restoreGraphicsState(); context.endPDFPage()\ncontext.beginPDFPage(nil); context.draw(bitmap.cgImage!, in: CGRect(x: 0, y: 50, width: 600, height: 250)); context.endPDFPage(); context.closePDF()\n`);
    execFileSync("swift", [fixture, directory], { timeout: 60_000 });
    const image = await extractUploadedMaterial(upload("sample.png", readFileSync(path.join(directory, "sample.png"))));
    assert.match(image.text, /JELLY MATERIAL SAMPLE 2026/); assert.equal(image.pages[0]!.method, "vision-ocr"); assert.equal(image.coverage.status, "sufficient");
    // Batch 112: Japanese is one of the recognition languages the helper accepts.
    const japanese = await extractUploadedMaterial(upload("sample-ja.png", readFileSync(path.join(directory, "sample-ja.png"))), { ocrLanguages: ["ja-JP"] });
    assert.match(japanese.text, /日本語/);
    const pdf = await extractUploadedMaterial(upload("sample.pdf", readFileSync(path.join(directory, "sample.pdf"))));
    assert.equal(pdf.coverage.total_pages, 2); assert.equal(pdf.pages[0]!.method, "pdf-text"); assert.equal(pdf.pages[1]!.method, "vision-ocr"); assert.match(pdf.text, /JELLY PDF NATIVE TEXT 2026/); assert.match(pdf.text, /JELLY MATERIAL SAMPLE 2026/);
    const capabilities = JSON.parse(execFileSync(helper, ["capabilities"], { encoding: "utf8" })); assert.equal(capabilities.image_ocr, "available"); assert.equal(capabilities.pdf, "available"); assert.equal(capabilities.foundation_models, undefined);
    await assert.rejects(extractUploadedMaterial(upload("invalid.pdf", "broken pdf"), { helperPath: helper }), (error: unknown) => isMaterialFailure(error) && actionHttpStatus(error) === 400);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("RAC-427: the Home extractor invokes the configured material helper and never falls back to the retired variable on any platform", async () => {
  const directory = home();
  const currentName = "MOLIS_MATERIAL_NATIVE_HELPER", retiredName = ["MOLIS", "JELLY", "NATIVE", "HELPER"].join("_");
  const previous = new Map([currentName, retiredName].map(name => [name, process.env[name]]));
  const current = path.join(directory, "current-helper"), retired = path.join(directory, "retired-helper");
  const invoked = path.join(directory, "current.jsonl"), retiredMarker = path.join(directory, "retired.called");
  const answer = { text: "材料助手返回的文字", extractor: "configured-material-helper", pages: [],
    coverage: { status: "sufficient", processed_pages: 0, total_pages: 0, issues: [] } };
  let discovery: ReturnType<typeof registerHooks> | undefined;
  try {
    writeFileSync(current, `#!${process.execPath}
const fs = require('node:fs');
const [command, input, ...flags] = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(invoked)}, JSON.stringify({ command, input, flags, bytes: fs.readFileSync(input).toString('base64') }) + '\\n');
process.stdout.write(${JSON.stringify(JSON.stringify(answer))});
`, { mode: 0o700 });
    writeFileSync(retired, `#!${process.execPath}
require('node:fs').writeFileSync(${JSON.stringify(retiredMarker)}, 'retired helper ran');
process.stdout.write(${JSON.stringify(JSON.stringify({ ...answer, text: "retired fallback" }))});
`, { mode: 0o700 });
    process.env[currentName] = current; process.env[retiredName] = retired;
    const input = Buffer.from("PNG bytes for the helper");
    // The trusted platform option only enters the native boundary; the real upload → extractHomeMaterial chain runs unchanged.
    const result = await extractUploadedMaterial(upload("sample.png", input), { platform: "darwin", ocrLanguages: ["ja-JP", "en-US"] });
    assert.deepEqual(result, { ...answer, file_name: "sample.png" });
    const calls = readFileSync(invoked, "utf8"), [call] = calls.trim().split("\n").map(line => JSON.parse(line));
    assert.equal(calls.trim().split("\n").length, 1);
    assert.equal(call.command, "extract"); assert.equal(call.bytes, input.toString("base64")); assert.deepEqual(call.flags, ["--languages", "ja-JP,en-US"]);
    assert.equal(existsSync(call.input), false); assert.equal(existsSync(path.dirname(call.input)), false);
    assert.equal(existsSync(retiredMarker), false, "configuring both names calls only the current helper");

    delete process.env[currentName];
    // Isolate only bundled executable discovery, so the old-name-only case never touches an installed native helper.
    const emptyEntry = pathToFileURL(path.join(directory, "empty-install", "dist", "index.js")).href;
    let discoveries = 0;
    discovery = registerHooks({ resolve(specifier, context, nextResolve) {
      if (specifier === "@molis-ai/molis-work-app-local-host" && /\/material-native\.[jt]s$/.test(context.parentURL ?? "")) {
        discoveries++; return { url: emptyEntry, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    } });
    await assert.rejects(extractUploadedMaterial(upload("only-old.png", input), { platform: "darwin" }), { code: "material.native_unavailable" });
    assert.equal(discoveries, 1, "an absent current variable uses bundled discovery, never the retired variable");
    assert.equal(existsSync(retiredMarker), false, "a configured retired helper is never invoked, even without the current name");
    assert.equal(readFileSync(invoked, "utf8"), calls, "the first helper was not retained as a fallback");
  } finally {
    discovery?.deregister();
    for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    rmSync(directory, { recursive: true, force: true });
  }
});
test("cancelling an image extraction terminates the helper and removes its working copy", async () => {
  const directory = home();
  try {
    const fake = path.join(directory, "wait-helper"), started = path.join(directory, "started");
    writeFileSync(fake, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(started)}, process.argv[3]);setInterval(()=>{},1000);\n`, { mode: 0o700 });
    const controller = new AbortController();
    const pending = extractUploadedMaterial(upload("scan.png", "image bytes"), { platform: "darwin", helperPath: fake, signal: controller.signal });
    const watcher = setInterval(() => { if (existsSync(started)) { clearInterval(watcher); controller.abort(); } }, 20);
    try { await assert.rejects(pending, (error: unknown) => isMaterialFailure(error) && error.code === "material.cancelled"); } finally { clearInterval(watcher); }
    const input = readFileSync(started, "utf8");
    assert.equal(existsSync(input), false); assert.equal(existsSync(path.dirname(input)), false);
    assert.deepEqual(readdirSync(directory).sort(), ["started", "wait-helper"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
