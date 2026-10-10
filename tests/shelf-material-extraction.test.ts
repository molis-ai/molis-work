import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createExtractablePdf, openShelfStore, hashBytes } from "@molis-ai/molis-work-module-shelf";
import { shelfActions as a, SHELF_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-shelf";
import { shelfActionProvider } from "../apps/local-host/src/shelf-actions.js";
import { extractMaterial } from "../apps/local-host/src/material-extraction.js";
import { materialImageTextAvailable } from "../apps/local-host/src/material-native.js";

const caller: ActionCallContext = { actor_id: "owner", project_id: null, audience: "user", permissions: SHELF_ACTION_PERMISSIONS };
const pdf = createExtractablePdf("Preserve the original PDF and this preview.");

for (const stop of ["cancel", "revoke", "withdraw", "copy-change", "job-cancel"] as const) {
  test(`Shelf ${stop} during Host extraction cannot commit an output or failure result and can recover`, { timeout: 20_000 }, async () => {
    const home = await mkdtemp(join(tmpdir(), "shelf-extraction-")), controller = new AbortController();
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let paused = false, allowed = true;
    let extractionSignal: AbortSignal | undefined;
    const registration = shelfActionProvider(home, { extract: async (source, options) => {
      const extracted = await extractMaterial(source, options);
      if (paused) { extractionSignal = options?.signal; entered.resolve(); await release.promise; }
      return extracted;
    } });
    const service = new ActionService(); let dispose = service.registerProvider(registration);
    const context = { ...caller, signal: controller.signal, validate_authority: () => {
      if (!allowed) throw new ActionError("actions.permission_denied", "revoked during extraction");
    } };
    let pending: Promise<unknown> | undefined, rejected: Promise<void> | undefined;
    try {
      const { item } = await service.invoke(caller, a.admit, { filename: "source.pdf", bytes_base64: pdf.toString("base64"), mime: "application/pdf" });
      assert.match(item.preview_text!, /Preserve the original PDF/);
      const store = openShelfStore(home), copy = join(home, "shelf", item.relative_path), before = store.snapshot().results;
      paused = true;
      pending = service.invoke(context, a.extract, { recipe: "extract_text", item_id: item.item_id });
      const code = stop === "cancel" ? undefined : stop === "revoke" ? "actions.permission_denied" : stop === "withdraw" ? "actions.provider_changed" : stop === "copy-change" ? "shelf.hash_changed" : "shelf.cancelled";
      rejected = assert.rejects(pending, code ? { code } : { name: "AbortError" });
      await entered.promise;
      const job = store.snapshot().running_jobs[0]!; assert.ok(job);
      const fast = await service.invoke(caller, a.admit, { text: "Another material while parsing", title: "fast" });
      assert.equal(fast.item.kind, "markdown");
      if (stop === "cancel") controller.abort();
      if (stop === "revoke") allowed = false;
      if (stop === "withdraw") dispose();
      if (stop === "copy-change") await writeFile(copy, createExtractablePdf("Edited while reading"));
      if (stop === "job-cancel") assert.equal((await service.invoke(caller, a.cancelJob, { job_id: job.job_id })).job.status, "cancelled");
      if (stop === "cancel" || stop === "job-cancel") assert.equal(extractionSignal?.aborted, true, "cancellation reaches the actual extractor");
      release.resolve(); await rejected;
      assert.deepEqual(store.snapshot().results, before);
      assert.deepEqual(await readdir(join(home, "shelf", "jobs", job.job_id, "output")), []);
      assert.deepEqual(store.snapshot().running_jobs, []);
      if (stop === "copy-change") await writeFile(copy, pdf);
      assert.equal(hashBytes(store.readFile(item.item_id).bytes), item.origin_hash);
      store.hide(item.item_id); // A terminated execution cannot keep the material busy for another 20 minutes.
      allowed = true; paused = false;
      if (stop === "withdraw") dispose = service.registerProvider(registration);
      const fresh = await service.invoke(caller, a.admit, { filename: "fresh.pdf", bytes_base64: pdf.toString("base64") });
      const result = await service.invoke(caller, a.extract, { recipe: "extract_text", item_id: fresh.item.item_id });
      assert.equal(result.job.status, "succeeded"); assert.match(result.result!.preview_text!, /Preserve the original PDF/);
    } finally {
      controller.abort(); release.resolve(); await Promise.allSettled([...(pending ? [pending] : []), ...(rejected ? [rejected] : [])]);
      dispose(); await rm(home, { recursive: true, force: true });
    }
  });
}

test("PDF admission cancellation after parsing leaves no saved copy", async () => {
  const home = await mkdtemp(join(tmpdir(), "shelf-preview-")), controller = new AbortController();
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const service = new ActionService();
  const dispose = service.registerProvider(shelfActionProvider(home, { extract: async (source, options) => {
    const result = await extractMaterial(source, options); entered.resolve(); await release.promise; return result;
  } }));
  const pending = service.invoke({ ...caller, signal: controller.signal }, a.admit, { filename: "late.pdf", bytes_base64: pdf.toString("base64") });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  try {
    await entered.promise; controller.abort(); release.resolve(); await rejected;
    assert.deepEqual(await readdir(join(home, "shelf", "files")), []);
  } finally { controller.abort(); release.resolve(); await Promise.allSettled([pending, rejected]); dispose(); await rm(home, { recursive: true, force: true }); }
});

test("Shelf preserves all selected PDF/image materials, OCR language and line-level uncertainty", async () => {
  const home = await mkdtemp(join(tmpdir(), "shelf-mixed-extract-"));
  const seen: unknown[] = [];
  const store = openShelfStore(home, { disabled: true }, { imageTextAvailable: () => true, extract: async (source, options) => {
    if (source.file_name.endsWith(".pdf")) return extractMaterial(source, options);
    seen.push(options?.ocrLanguages);
    return { text: "Clear\nUncertain\nUnknown", extractor: "fixture", pages: [{ number: 1, text: "Clear\nUncertain\nUnknown", method: "ocr", confidence: 0.8,
      lines: [{ text: "Clear", confidence: 0.99 }, { text: "Uncertain", confidence: 0.4 }, { text: "Unknown", confidence: null }] }],
      coverage: { status: "partial", processed_pages: 1, total_pages: 2, issues: ["仅提取第一张图片"] } };
  } });
  try {
    const first = store.admit({ filename: "one.pdf", bytes: pdf });
    const second = store.admit({ filename: "two.pdf", bytes: createExtractablePdf("Second selected document") });
    const third = store.admit({ filename: "scan.png", bytes: Buffer.from("fixture bytes") });
    const result = await store.runJob({ recipe: "extract_text", item_ids: [first.item_id, second.item_id, third.item_id], option_id: "en" });
    assert.deepEqual(seen, [["en-US"]]);
    const text = store.readFile(result.result!.item_id).bytes.toString("utf8");
    for (const expected of ["## one.pdf", "Preserve the original", "## two.pdf", "Second selected document", "## scan.png", "Uncertain（待确认）", "Unknown（待确认）", "仅提取第一张图片"]) assert.ok(text.includes(expected), expected);
    assert.doesNotMatch(text, /Clear（待确认）/);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("the packaged Host Vision helper reads clear English and Chinese with line confidence", { skip: process.platform !== "darwin", timeout: 60_000 }, async () => {
  assert.equal(materialImageTextAvailable(), true);
  const home = await mkdtemp(join(tmpdir(), "shelf-vision-languages-"));
  try {
    const fixture = join(home, "image.swift");
    await writeFile(fixture, `import Foundation
import AppKit
let rect = NSRect(x: 0, y: 0, width: 1400, height: 440)
let image = NSImage(size: rect.size)
image.lockFocus(); NSColor.white.setFill(); rect.fill()
for (text, y) in [("Shared Material Reader", 260.0), ("材料提取", 100.0)] {
  (text as NSString).draw(at: NSPoint(x: 80, y: y), withAttributes: [.font: NSFont.systemFont(ofSize: 64), .foregroundColor: NSColor.black])
}
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
`);
    execFileSync("swift", [fixture, join(home, "source.png")], { timeout: 30_000 });
    const bytes = readFileSync(join(home, "source.png"));
    for (const languages of [["en-US"], ["zh-Hans"], ["zh-Hans", "en-US"]] as const) {
      const result = await extractMaterial({ file_name: "scan.png", bytes }, { ocrLanguages: languages });
      if (languages.some(language => language === "en-US")) assert.match(result.text, /Shared Material Reader/);
      if (languages.some(language => language === "zh-Hans")) assert.match(result.text, /材料提取/);
      assert.ok(result.pages[0]!.lines!.length > 0);
      assert.equal(result.pages[0]!.lines!.map(line => line.text).join("\n"), result.pages[0]!.text);
      assert.ok(result.pages[0]!.lines!.every(line => line.confidence !== null && line.confidence >= 0 && line.confidence <= 1));
    }
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("Shelf retains 32 MiB admissions while the common extractor keeps its smaller default", { timeout: 20_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "shelf-pdf-limit-"));
  const split = pdf.indexOf("startxref");
  const large = Buffer.concat([pdf.subarray(0, split), Buffer.alloc(26 * 1024 * 1024, 32), pdf.subarray(split)]);
  const store = openShelfStore(home, { disabled: true }, { extract: extractMaterial });
  try {
    await assert.rejects(extractMaterial({ file_name: "large.pdf", bytes: large }), { code: "invalid_data" });
    const item = await store.admitFile({ filename: "large.pdf", bytes: large });
    assert.match(item.preview_text!, /Preserve the original PDF/);
    assert.equal(item.size_bytes, large.length);
    assert.equal(hashBytes(store.readFile(item.item_id).bytes), hashBytes(large));
    await assert.rejects(store.admitFile({ filename: "too-large.pdf", bytes: Buffer.alloc(32 * 1024 * 1024 + 1) }), { code: "shelf.too_large" });
    await assert.rejects(extractMaterial({ file_name: "test.pdf", bytes: pdf }, { limits: { maxBytes: 32 * 1024 * 1024 + 1 } }), { code: "invalid_limits" });
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("an old running record without a live execution is preserved without replay and can be explicitly cancelled", async () => {
  const home = await mkdtemp(join(tmpdir(), "shelf-interrupted-"));
  let calls = 0;
  const ports = { extract: (...args: Parameters<typeof extractMaterial>) => { calls++; return extractMaterial(...args); } };
  try {
    const store = openShelfStore(home, { disabled: true }, ports);
    const item = store.admit({ filename: "source.pdf", bytes: pdf });
    const completed = await store.runJob({ recipe: "extract_text", item_id: item.item_id });
    const file = join(home, "shelf", "catalog.json"), catalog = JSON.parse(readFileSync(file, "utf8"));
    catalog.jobs.push({ ...completed.job, job_id: "interrupted", status: "running", result_item_id: null, finished_at: null });
    await writeFile(file, JSON.stringify(catalog));
    const before = readFileSync(file, "utf8"), reopened = openShelfStore(home, { disabled: true }, ports);
    assert.deepEqual(reopened.snapshot().running_jobs, []);
    assert.equal(calls, 1); assert.equal(readFileSync(file, "utf8"), before);
    reopened.hide(item.item_id);
    assert.equal(reopened.cancelJob("interrupted").status, "cancelled");
    assert.equal(calls, 1); assert.equal(reopened.snapshot().results.length, 1);
  } finally { await rm(home, { recursive: true, force: true }); }
});
