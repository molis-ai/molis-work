import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractJellyMaterial, JellyMaterialError } from "../apps/local-host/src/jelly-native-material.js";
const helper = fileURLToPath(new URL("../plugins/native/jelly/native/bin/jelly-material", import.meta.url));
const upload = (name: string, text: string | Buffer) => ({ file_name: name, data_base64: Buffer.from(text).toString("base64") });
function home() { return mkdtempSync(path.join(tmpdir(), "molis-jelly-material-")); }

test("uploaded UTF8 and HTML become traceable text without evaluating scripts", async () => {
  const directory = home();
  try {
    const text = await extractJellyMaterial(directory, upload("用户笔记.md", "# 真实想法\n保留中文。")); assert.equal(text.text, "# 真实想法\n保留中文。"); assert.equal(text.coverage.status, "sufficient");
    const html = await extractJellyMaterial(directory, upload("网页.html", "<html><style>SECRET STYLE</style><script>SECRET SCRIPT</script><h1>标题</h1><p>A &amp; B &#x4E2D;&#25991;</p></html>"));
    assert.match(html.text, /标题/); assert.match(html.text, /A & B 中文/); assert.doesNotMatch(html.text, /SECRET/); assert.equal(html.coverage.status, "partial");
    assert.ok(readdirSync(path.join(directory, "jelly", "imports")).every(file => /^[\da-f]{64}\.(md|html)$/.test(file)));
    await extractJellyMaterial(directory, upload("副本.md", "# 真实想法\n保留中文。")); assert.equal(readdirSync(path.join(directory, "jelly", "imports")).length, 2);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("path names, invalid base64, empty, unsupported and non-UTF8 inputs fail", async () => {
  const directory = home();
  try {
    for (const input of [upload("../private.txt", "safe"), upload("C:\\private.txt", "safe"), upload("program.exe", "binary"), upload("empty.txt", ""), { file_name: "bad.txt", data_base64: "%%%" }, upload("binary.txt", Buffer.from([0xFF, 0xFE]))]) await assert.rejects(extractJellyMaterial(directory, input), JellyMaterialError);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("missing native helper and unsupported host return explicit unavailable errors, preserving uploaded copy", async () => {
  const directory = home();
  try {
    const input = upload("document.pdf", "%PDF-1.4\n");
    await assert.rejects(extractJellyMaterial(directory, input, { platform: "linux" }), (error: unknown) => error instanceof JellyMaterialError && error.status === 503);
    await assert.rejects(extractJellyMaterial(directory, input, { platform: "darwin", helperPath: path.join(directory, "missing") }), (error: unknown) => error instanceof JellyMaterialError && error.code === "jelly.material.native_unavailable");
    assert.equal(readdirSync(path.join(directory, "jelly", "imports")).length, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("imports symlink cannot redirect uploaded data outside the private directory", async () => {
  const directory = home(); const outside = home();
  try { mkdirSync(path.join(directory, "jelly")); symlinkSync(outside, path.join(directory, "jelly", "imports")); await assert.rejects(extractJellyMaterial(directory, upload("test.txt", "data")), JellyMaterialError); assert.deepEqual(readdirSync(outside), []); }
  finally { rmSync(directory, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});
test("real macOS helper extracts image OCR, PDF text and image-only PDF pages", { skip: process.platform !== "darwin" || !existsSync(helper) }, async () => {
  const directory = home();
  try {
    const fixture = path.join(directory, "fixtures.swift");
    writeFileSync(fixture, `import Foundation\nimport AppKit\nimport PDFKit\nlet directory = CommandLine.arguments[1]\nlet rect = NSRect(x: 0, y: 0, width: 1200, height: 500)\nlet image = NSImage(size: rect.size)\nimage.lockFocus()\nNSColor.white.setFill(); rect.fill()\n("JELLY MATERIAL SAMPLE 2026" as NSString).draw(at: NSPoint(x: 50, y: 230), withAttributes: [.font: NSFont.systemFont(ofSize: 46), .foregroundColor: NSColor.black])\nimage.unlockFocus()\nlet bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!\ntry bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: directory + "/sample.png"))\nvar mediaBox = CGRect(x: 0, y: 0, width: 600, height: 400)\nlet context = CGContext(URL(fileURLWithPath: directory + "/sample.pdf") as CFURL, mediaBox: &mediaBox, nil)!\ncontext.beginPDFPage(nil)\nNSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)\n("JELLY PDF NATIVE TEXT 2026" as NSString).draw(at: NSPoint(x: 30, y: 200), withAttributes: [.font: NSFont.systemFont(ofSize: 26), .foregroundColor: NSColor.black])\nNSGraphicsContext.restoreGraphicsState(); context.endPDFPage()\ncontext.beginPDFPage(nil); context.draw(bitmap.cgImage!, in: CGRect(x: 0, y: 50, width: 600, height: 250)); context.endPDFPage(); context.closePDF()\n`);
    execFileSync("swift", [fixture, directory], { timeout: 60_000 });
    const image = await extractJellyMaterial(directory, upload("sample.png", readFileSync(path.join(directory, "sample.png"))), { helperPath: helper });
    assert.match(image.text, /JELLY MATERIAL SAMPLE 2026/); assert.equal(image.pages[0]!.method, "vision-ocr"); assert.equal(image.coverage.status, "sufficient");
    const pdf = await extractJellyMaterial(directory, upload("sample.pdf", readFileSync(path.join(directory, "sample.pdf"))), { helperPath: helper });
    assert.equal(pdf.coverage.total_pages, 2); assert.equal(pdf.pages[0]!.method, "pdf-text"); assert.equal(pdf.pages[1]!.method, "vision-ocr"); assert.match(pdf.text, /JELLY PDF NATIVE TEXT 2026/); assert.match(pdf.text, /JELLY MATERIAL SAMPLE 2026/);
    const capabilities = JSON.parse(execFileSync(helper, ["capabilities"], { encoding: "utf8" })); assert.equal(capabilities.image_ocr, "available"); assert.match(capabilities.foundation_models, /^(available|unavailable:)/);
    await assert.rejects(extractJellyMaterial(directory, upload("invalid.pdf", "broken pdf"), { helperPath: helper }), (error: unknown) => error instanceof JellyMaterialError && error.status === 422);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
const whisperHelper = fileURLToPath(new URL("../plugins/native/jelly/native/bin/jelly-whisper", import.meta.url));
function silentWav(): Buffer {
  const samples = 16000; const header = Buffer.alloc(44); header.write("RIFF", 0); header.writeUInt32LE(36 + samples * 2, 4); header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(samples * 2, 40); return Buffer.concat([header, Buffer.alloc(samples * 2)]);
}
test("real Whisper helper requires an explicit model download choice and leaves no temporary audio", { skip: process.platform !== "darwin" || !existsSync(whisperHelper) }, async () => {
  const directory = home();
  try {
    await assert.rejects(extractJellyMaterial(directory, upload("sample.wav", silentWav()), { whisperHelperPath: whisperHelper }), (error: unknown) => error instanceof JellyMaterialError && error.code === "jelly.material.model_required" && error.status === 409 && error.details?.approximate_bytes === 626000000);
    assert.deepEqual(readdirSync(path.join(directory, "jelly", "models")), []);
    assert.ok(!readdirSync(path.join(directory, "jelly")).some(file => file.startsWith("material-run-")));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("cancelling media extraction terminates the helper and removes its run directory", async () => {
  const directory = home();
  try {
    const fake = path.join(directory, "wait-helper");
    writeFileSync(fake, `#!${process.execPath}\nprocess.stderr.write(JSON.stringify({stage:'transcribing',progress:0})+'\\n');setInterval(()=>{},1000);\n`, { mode: 0o700 });
    const controller = new AbortController();
    await assert.rejects(extractJellyMaterial(directory, upload("sample.wav", silentWav()), { platform: "darwin", whisperHelperPath: fake, signal: controller.signal, onProgress() { controller.abort(); } }), (error: unknown) => error instanceof JellyMaterialError && error.code === "jelly.material.cancelled");
    assert.ok(!readdirSync(path.join(directory, "jelly")).some(file => file.startsWith("material-run-")));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("real silent video extracts timestamped frame OCR without downloading a speech model", { skip: process.platform !== "darwin" || !existsSync(whisperHelper) }, async () => {
  const directory = home();
  try {
    const fixture = path.join(directory, "video.swift");
    writeFileSync(fixture, `import Foundation\nimport AppKit\nimport AVFoundation\nlet output = URL(fileURLWithPath: CommandLine.arguments[1] + "/sample.mov")\nlet writer = try AVAssetWriter(outputURL: output, fileType: .mov)\nlet input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 800, AVVideoHeightKey: 400])\nlet adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: 800, kCVPixelBufferHeightKey as String: 400])\nwriter.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)\nvar optional: CVPixelBuffer?\nCVPixelBufferCreate(kCFAllocatorDefault, 800, 400, kCVPixelFormatType_32ARGB, [kCVPixelBufferCGImageCompatibilityKey as String: true, kCVPixelBufferCGBitmapContextCompatibilityKey as String: true] as CFDictionary, &optional)\nlet buffer = optional!; CVPixelBufferLockBaseAddress(buffer, [])\nlet context = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: 800, height: 400, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!\ncontext.setFillColor(NSColor.white.cgColor); context.fill(CGRect(x: 0, y: 0, width: 800, height: 400))\nNSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)\n("JELLY VIDEO FRAME 2026" as NSString).draw(at: NSPoint(x: 50, y: 200), withAttributes: [.font: NSFont.systemFont(ofSize: 38), .foregroundColor: NSColor.black])\nNSGraphicsContext.restoreGraphicsState(); CVPixelBufferUnlockBaseAddress(buffer, [])\nfor index in 0..<20 { while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.01) }; adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(index), timescale: 10)) }\ninput.markAsFinished(); let complete = DispatchSemaphore(value: 0); writer.finishWriting { complete.signal() }; complete.wait()\nif writer.status != .completed { exit(1) }\n`);
    execFileSync("swift", [fixture, directory], { timeout: 60_000 });
    const result = await extractJellyMaterial(directory, upload("sample.mov", readFileSync(path.join(directory, "sample.mov"))), { whisperHelperPath: whisperHelper });
    assert.match(result.text, /JELLY VIDEO FRAME 2026/); assert.equal(result.frames?.length, 5); assert.equal(result.segments?.length, 0); assert.equal(result.coverage.status, "partial");
    assert.ok(result.frames!.every(frame => Number.isFinite(frame.seconds))); assert.deepEqual(readdirSync(path.join(directory, "jelly", "models")), []);
    assert.ok(!readdirSync(path.join(directory, "jelly")).some(file => file.startsWith("material-run-")));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
