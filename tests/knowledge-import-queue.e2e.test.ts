import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openProjectVersionStores, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { seedBoard } from "./fixtures/goal-application.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

async function openImport(t: Parameters<typeof openGoalBrowser>[0], language: "zh" | "en" = "zh") {
  const b = await openGoalBrowser(t, "user", seedBoard, null);
  if (!b) return null;
  const target = `/projects/${b.projectId}/`;
  const entry = language === "en" ? `/locale?lang=en&next=${encodeURIComponent(target)}` : target;
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + entry }, b.sessionId));
  await b.waitFor("Boolean(document.querySelector('[data-knowledge-import-dialog]'))", 15_000);
  await b.evaluate("document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'files' } }))");
  await b.waitFor("Boolean(document.querySelector('[data-knowledge-import-open]')?.getClientRects().length)", 10_000);
  await b.click("[data-knowledge-import-open]");
  await b.waitFor("document.querySelector('[data-knowledge-import-dialog]')?.open === true");
  const root = await b.command<{ root: { nodeId: number } }>("DOM.getDocument", {}, b.sessionId);
  const input = await b.command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.root.nodeId, selector: "[data-knowledge-import-pick]" }, b.sessionId);
  return Object.assign(b, {
    pick: (files: string[]) => b.command("DOM.setFileInputFiles", { nodeId: input.nodeId, files }, b.sessionId),
    idle: () => b.waitFor("!document.querySelector('[data-knowledge-import-dialog]').hasAttribute('aria-busy')", 240_000),
    rows: () => b.evaluate<Array<{ name: string; failed: boolean; done: boolean }>>("[...document.querySelectorAll('[data-knowledge-import-picked] li')].map(row => ({ name: row.querySelector('span').textContent, failed: row.classList.contains('is-failed'), done: row.classList.contains('is-done') }))"),
    records: () => openProjectVersionStores(b.store).artifacts.query.listArtifacts(b.projectId!),
  });
}

test("QEA-05 importing a batch keeps the remaining selection and stores each file exactly once", { timeout: 360_000 }, async t => {
  const b = await openImport(t, "en"); if (!b) return;
  const folder = join(b.homeDirectory, "chosen"); await mkdir(folder);
  const files = Array.from({ length: 201 }, (_, index) => join(folder, `document-${index}.txt`));
  await Promise.all(files.map((file, index) => writeFile(file, `Document ${index}: independently identifiable content.`)));
  await b.pick(files);
  await b.waitFor("document.querySelectorAll('[data-knowledge-import-picked] li').length === 200");
  await b.click("[data-knowledge-import-submit]"); await b.idle();
  assert.equal(b.records().length, 200);
  await b.setViewport(390, 844);
  await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, b.sessionId);
  await b.waitFor("document.documentElement.dataset.resolvedTheme === 'light'");
  assert.match(await b.evaluate<string>("document.querySelector('[data-knowledge-import-status]').textContent"), /1 file remains\. Select Import to continue\./);
  assert.equal(await b.evaluate(`(() => {
    const dialog = document.querySelector('[data-knowledge-import-dialog]'), box = dialog.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth;
  })()`), true, "the remaining-file result fits the narrow English dialog");
  const evidence = `${REVIEW_EVIDENCE}/quality-experience-audit`;
  await mkdir(evidence, { recursive: true });
  const shot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId);
  await writeFile(`${evidence}/import-remaining-en-390-light.png`, Buffer.from(shot.data, "base64"));
  await b.setViewport(1440, 900);
  assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-submit]').disabled"), false, "the 201st file is still selected");
  await b.click("[data-knowledge-import-submit]"); await b.idle();
  assert.deepEqual(await b.rows(), [{ name: "document-200.txt", failed: false, done: true }]);
  const records = b.records();
  assert.equal(records.length, 201);
  assert.deepEqual(records.map(row => row.title).sort(), Array.from({ length: 201 }, (_, index) => `document-${index}`).sort());
  for (let index = 0; index < 201; index++) {
    const record = records.find(row => row.title === `document-${index}`)!;
    assert.equal((record.payload as Record<string, unknown>).content, `Document ${index}: independently identifiable content.`);
  }
  assert.equal(new Set(records.map(row => row.artifact_id)).size, 201);
  assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-submit]').disabled"), true);
  // A whole rejected batch must not keep the unattempted tail behind it forever. Sparse files exercise the real size refusal.
  const rejected = Array.from({ length: 200 }, (_, index) => join(folder, `large-${index}.txt`));
  await Promise.all(rejected.map(async file => { await writeFile(file, ""); await truncate(file, 6 * 1024 * 1024 + 1); }));
  const tail = join(folder, "after-rejected-batch.txt"); await writeFile(tail, "Still worth importing.");
  await b.pick([...rejected, tail]);
  await b.click("[data-knowledge-import-submit]"); await b.idle();
  assert.equal(b.records().length, 201, "the rejected batch saved nothing");
  await b.click("[data-knowledge-import-submit]"); await b.idle();
  const tailRecord = b.records().find(row => row.title === "after-rejected-batch");
  assert.equal((tailRecord?.payload as Record<string, unknown> | undefined)?.content, "Still worth importing.", "failed files do not starve the unattempted tail");
  assert.equal(b.records().length, 202);
});

test("QEA-06 retry results follow the actual files and selecting during import does not lose work", { timeout: 120_000 }, async t => {
  const b = await openImport(t); if (!b) return;
  const good = join(b.homeDirectory, "good.txt"), large = join(b.homeDirectory, "too-large.txt"), added = join(b.homeDirectory, "added.txt");
  await Promise.all([writeFile(good, "First document."), writeFile(large, "x".repeat(6 * 1024 * 1024 + 1)), writeFile(added, "Added during the first import.")]);
  // Hold a real request before dispatch, then release it to the normal Host. Only timing is controlled; persistence is real.
  await b.evaluate(`(() => {
    const original = window.molisWorkRequest; let held = false;
    window.molisWorkRequest = Object.assign(async (...args) => {
      if (!held && String(args[0]).endsWith('/api/artifacts/import')) {
        held = true; window.__importHeld = true;
        await new Promise(resolve => { window.__releaseImport = resolve; });
      }
      return original(...args);
    }, original);
  })()`);
  await b.pick([good, large]);
  await b.click("[data-knowledge-import-submit]");
  await b.waitFor("window.__importHeld === true");
  await b.pick([added]);
  await b.click('[data-knowledge-import-dialog] input[name="kind"][value="online"]');
  await b.click('[data-knowledge-import-dialog] input[name="kind"][value="files"]');
  await b.click('[data-knowledge-import-dialog] header [data-knowledge-import-close]');
  await b.click("[data-knowledge-import-open]");
  await b.evaluate("window.__releaseImport()"); await b.idle();
  assert.deepEqual(await b.rows(), [
    { name: "good.txt", failed: false, done: true }, { name: "too-large.txt", failed: true, done: false },
  ], "adding a file does not replace the running batch's result rows");
  await b.click("[data-knowledge-import-submit]"); await b.idle();
  assert.deepEqual(await b.rows(), [
    { name: "added.txt", failed: false, done: true }, { name: "too-large.txt", failed: true, done: false },
  ], "the retry marks the oversized file, and imports the new selection without repeating the successful file");
  assert.deepEqual(b.records().map(row => [row.title, (row.payload as Record<string, unknown>).content]).sort(), [
    ["added", "Added during the first import."], ["good", "First document."],
  ]);
  await b.click("[data-knowledge-import-submit]"); await b.idle();
  assert.deepEqual(await b.rows(), [{ name: "too-large.txt", failed: true, done: false }]);
  assert.equal(b.records().length, 2);
  assert.doesNotMatch(await b.evaluate<string>("document.querySelector('[data-knowledge-import-status]').textContent"), /点击.*继续/, "a rejected file is explained by its error, not presented as another untouched batch");
  const evidence = `${REVIEW_EVIDENCE}/quality-experience-audit`;
  await mkdir(evidence, { recursive: true });
  for (const language of ["zh", "en"]) {
    if (language === "en") {
      await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=en&next=" + encodeURIComponent(`/projects/${b.projectId}/`) }, b.sessionId));
      await b.waitFor("Boolean(document.querySelector('[data-knowledge-import-dialog]'))");
      await b.evaluate("document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'files' } }))");
      await b.waitFor("Boolean(document.querySelector('[data-knowledge-import-open]')?.getClientRects().length)");
      await b.click("[data-knowledge-import-open]");
      const { root } = await b.command<{ root: { nodeId: number } }>("DOM.getDocument", {}, b.sessionId);
      const { nodeId } = await b.command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-knowledge-import-pick]" }, b.sessionId);
      await b.command("DOM.setFileInputFiles", { nodeId, files: [large] }, b.sessionId);
      await b.click("[data-knowledge-import-submit]"); await b.idle();
      assert.match(await b.evaluate<string>("document.querySelector('[data-knowledge-import-picked] li small').textContent"), /Over 6 MB/);
      assert.equal(await b.evaluate<string>("document.querySelector('[data-knowledge-import-submit]').textContent"), "Import", "the available action is not labelled as an already completed import");
    }
    for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
      await b.setViewport(width, 900);
      await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, b.sessionId);
      await b.waitFor(`document.documentElement.dataset.resolvedTheme === '${theme}'`);
      assert.equal(await b.evaluate(`(() => {
        const dialog = document.querySelector('[data-knowledge-import-dialog]'), r = dialog.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth;
      })()`), true, "the import result fits the viewport");
      const shot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId);
      await writeFile(`${evidence}/import-retry-${language}-${width}-${theme}.png`, Buffer.from(shot.data, "base64"));
    }
  }
});

test("QEA-07 dropping a folder keeps every eligible selection beyond 400 and skips dependency directories", { timeout: 120_000 }, async t => {
  const b = await openImport(t); if (!b) return;
  const folder = join(b.homeDirectory, "drop-folder"), ignored = join(folder, "node_modules");
  await mkdir(ignored, { recursive: true });
  await Promise.all(Array.from({ length: 401 }, (_, index) => writeFile(join(folder, `file-${index}.txt`), `File ${index}`)));
  await writeFile(join(ignored, "ignored.txt"), "Not a source file.");
  const point = await b.evaluate<{ x: number; y: number }>("(() => { const r = document.querySelector('[data-knowledge-import-drop]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
  for (const type of ["dragEnter", "dragOver", "drop"]) await b.command("Input.dispatchDragEvent", { type, ...point, data: { items: [], files: [folder], dragOperationsMask: 1 } }, b.sessionId);
  await b.waitFor("document.querySelector('[data-knowledge-import-status]').textContent.includes('401')", 15_000);
  assert.equal((await b.rows()).length, 200, "only the next batch is rendered");
  assert.equal((await b.rows()).some(row => row.name.includes("node_modules")), false);
  // A deeply nested dropped tree (> 16 levels) stops recursion cleanly and shows the bounded status instead of freezing.
  await b.click("[data-knowledge-import-dialog] footer [data-knowledge-import-close]");
  await b.click("[data-knowledge-import-open]");
  await b.waitFor("document.querySelector('[data-knowledge-import-dialog]')?.open === true");
  const deepDepthVisited = await b.evaluate<number>(`(() => {
    let maxDepth = 0;
    const makeDir = (depth) => {
      maxDepth = Math.max(maxDepth, depth);
      let readOnce = false;
      return {
        isFile: false,
        isDirectory: true,
        name: "level-" + depth,
        createReader: () => ({
          readEntries: (resolve) => {
            if (readOnce) {
              resolve([]);
              return;
            }
            readOnce = true;
            const entries = [{
              isFile: true,
              isDirectory: false,
              name: "note-" + depth + ".txt",
              file: (ok) => ok(new File(["depth " + depth], "note-" + depth + ".txt", { type: "text/plain" })),
            }];
            if (depth < 25) entries.push(makeDir(depth + 1));
            resolve(entries);
          },
        }),
      };
    };
    const rootEntry = makeDir(0);
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        types: ["Files"],
        items: [{ webkitGetAsEntry: () => rootEntry }],
      },
    });
    document.querySelector("[data-knowledge-import-drop]").dispatchEvent(event);
    return new Promise(resolve => setTimeout(() => resolve(maxDepth), 200));
  })()`);
  assert.equal(deepDepthVisited, 16, "dropped directory recursion stops cleanly at depth 16");
  await b.waitFor("document.querySelector('[data-knowledge-import-status]').textContent.includes(globalThis.t.text('workbench.import.folder-scan-truncated'))", 10_000);
  const deepStatus = await b.evaluate<string>("document.querySelector('[data-knowledge-import-status]').textContent");
  assert.match(deepStatus, /16/, "shows the actual scanned count when <= 200");
  assert.doesNotMatch(deepStatus, /200/, "must not show the 200-per-batch limit message when <= 200 files were selected");
  // Dropping > 200 files together with a deep truncated tree shows BOTH the 200-per-batch limit and the folder-scan-truncated notice.
  await b.evaluate(`(() => {
    const entries = Array.from({ length: 205 }, (_, i) => ({
      isFile: true,
      isDirectory: false,
      name: "extra-" + i + ".txt",
      file: (ok) => ok(new File(["extra " + i], "extra-" + i + ".txt", { type: "text/plain" })),
    }));
    let readOnce = false;
    const rootEntry = {
      isFile: false,
      isDirectory: true,
      name: "wide-dir",
      createReader: () => ({
        readEntries: (resolve) => {
          if (readOnce) { resolve([]); return; }
          readOnce = true;
          resolve(entries);
        },
      }),
    };
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { types: ["Files"], items: [{ webkitGetAsEntry: () => rootEntry }] },
    });
    document.querySelector("[data-knowledge-import-drop]").dispatchEvent(event);
  })()`);
  await b.waitFor("document.querySelector('[data-knowledge-import-status]').textContent.includes('200')", 10_000);
  const bothStatus = await b.evaluate<string>("document.querySelector('[data-knowledge-import-status]').textContent");
  assert.match(bothStatus, /200/, "shows the 200-per-batch limit once > 200 files are selected");
  assert.ok(
    bothStatus.includes(await b.evaluate<string>("globalThis.t.text('workbench.import.folder-scan-truncated')")),
    "keeps the folder-scan-truncated explanation alongside the 200-per-batch limit",
  );
});

// QEA-06: a display path is not a file identity; the artifact service owns content deduplication.
test("QEA-06 same-named selections keep distinct contents and repeated content reuses its artifact", { timeout: 90_000 }, async t => {
  const b = await openImport(t); if (!b) return;
  const files: string[] = [];
  for (const folder of ["alpha", "bravo", "charlie"]) {
    const directory = join(b.homeDirectory, folder); await mkdir(directory);
    const file = join(directory, "report.txt"); await writeFile(file, `Report from ${folder}.`); files.push(file);
  }
  await b.pick(files.slice(0, 2));
  assert.equal((await b.rows()).length, 2, "same-batch names do not discard distinct files");
  await b.pick([files[2]]);
  assert.equal((await b.rows()).length, 3, "later selections do not collide with a display name");
  await b.click("[data-knowledge-import-submit]"); await b.idle();
  assert.equal((await b.rows()).filter(row => row.done).length, 3);
  assert.deepEqual(b.records().map(row => (row.payload as Record<string, unknown>).content).sort(), ["Report from alpha.", "Report from bravo.", "Report from charlie."]);
  const ids = b.records().map(row => row.artifact_id).sort();
  await b.pick([files[0]]);
  await b.click("[data-knowledge-import-submit]"); await b.idle();
  assert.deepEqual(b.records().map(row => row.artifact_id).sort(), ids, "reselecting the same content reuses the stored artifact");
  assert.deepEqual(await b.rows(), [{ name: "report.txt", failed: false, done: true }]);
});

for (const rejected of [false, true]) test(`QEA-23 stopping after the current ${rejected ? "failed" : "saved"} file retains untouched selections and never repeats saved files`, { timeout: 120_000 }, async t => {
  const b = await openImport(t); if (!b) return;
  const names = ["saved", "current", "remaining", "added"];
  const files = names.map(name => join(b.homeDirectory, `${name}.txt`));
  await Promise.all(files.map((file, index) => writeFile(file, rejected && index === 1 ? "x".repeat(3 * 1024 * 1024) : `Document ${names[index]}.`)));
  // Hold the second actual success/refusal after the Host completes it. No fabricated result or store write.
  await b.evaluate(`(() => {
    const original = window.molisWorkRequest; window.__importCalls = 0;
    window.molisWorkRequest = Object.assign(async (...args) => {
      if (!String(args[0]).endsWith('/api/artifacts/import')) return original(...args);
      const call = ++window.__importCalls;
      try { return await original(...args); }
      finally { if (call === 2) { window.__importHeld = true; await new Promise(resolve => { window.__releaseImport = resolve; }); } }
    }, original);
  })()`);
  await b.pick(files.slice(0, 3)); await b.click("[data-knowledge-import-submit]");
  await b.waitFor("window.__importHeld === true", 30_000);
  await b.pick([files[3]!]);
  let staysOpen: unknown;
  try {
    await b.click("[data-knowledge-import-dialog] footer [data-knowledge-import-close]");
    staysOpen = await b.evaluate("document.querySelector('[data-knowledge-import-dialog]').open");
    if (staysOpen) {
      assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-dialog] footer [data-knowledge-import-close]').disabled"), true);
      assert.match(await b.evaluate<string>("document.querySelector('[data-knowledge-import-status]').textContent"), /当前文件/);
    }
  } finally { await b.evaluate("window.__releaseImport()"); }
  await b.idle();
  assert.equal(staysOpen, true, "stop retains the actual in-flight result instead of closing and silently continuing");
  assert.equal(await b.evaluate("window.__importCalls"), 2, "no remaining file was dispatched after stop");
  assert.deepEqual(b.records().map(row => row.title).sort(), rejected ? ["saved"] : ["current", "saved"]);
  assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-submit]').disabled"), false);
  assert.match(await b.evaluate<string>("document.querySelector('[data-knowledge-import-status]').textContent"), /2.*待导入|2.*剩余/);
  if (!rejected) await captureStoppedImport(b, "files-zh");
  await b.click("[data-knowledge-import-dialog] header [data-knowledge-import-close]");
  await b.click("[data-knowledge-import-open]");
  assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-submit]').disabled"), false, "hiding a stopped batch retains its remaining selection");
  await b.click("[data-knowledge-import-submit]"); await b.idle();
  assert.deepEqual((await b.rows()).map(row => [row.name, row.failed]), [
    ["remaining.txt", false], ["added.txt", false], ...rejected ? [["current.txt", true]] : [],
  ]);
  assert.deepEqual(b.records().map(row => [row.title, row.version]).sort(),
    (rejected ? ["added", "remaining", "saved"] : names).sort().map(name => [name, 1]));
  assert.equal(await b.evaluate("window.__importCalls"), rejected ? 5 : 4);
});

// QEA-25: the native speech helper is a deterministic model stand-in. HTTP and stored versions are real;
// one pre-dispatch transport failure is injected to verify that failed and untouched clips remain resumable.
test("QEA-25 stopped transcription keeps failed and untouched clips across hiding, then resumes only those clips", { timeout: 120_000, skip: process.platform !== "darwin" }, async t => {
  const b = await openImport(t, "en"); if (!b) return;
  const helper = join(b.homeDirectory, "speech-helper");
  await writeFile(helper, `#!${process.execPath}
const fs=require('node:fs');
if(!process.argv.includes('--allow-model-download')){process.stdout.write(JSON.stringify({error:'model_required',message:'Consent needed',approximate_bytes:1000000}));process.exit(1);}
process.stderr.write(JSON.stringify({stage:'transcribing',progress:0.5})+'\\n');
process.stdout.write(JSON.stringify({text:fs.readFileSync(process.argv[3],'utf8'),extractor:'fixture',pages:[],coverage:{status:'sufficient',processed_pages:0,total_pages:0,issues:[]}}));
`, { mode: 0o700 });
  const previous = process.env.MOLIS_MATERIAL_WHISPER_HELPER;
  process.env.MOLIS_MATERIAL_WHISPER_HELPER = helper;
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_MATERIAL_WHISPER_HELPER; else process.env.MOLIS_MATERIAL_WHISPER_HELPER = previous; });
  const files = ["first", "second", "third"].map(name => join(b.homeDirectory, `${name}.m4a`));
  await Promise.all(files.map((file, index) => writeFile(file, `Clip ${index}.`)));
  await b.pick(files); await b.click("[data-knowledge-import-submit]"); await b.idle();
  const originals = b.records(); assert.equal(originals.length, 3);
  assert.ok(originals.every(row => row.version === 1 && (row.payload as Record<string, unknown>).content === ""));
  await b.evaluate(`(() => {
    const original=window.molisWorkRequest.stream; window.__transcribeCalls=0;
    window.molisWorkRequest.stream=async (...args)=>{
      const call=++window.__transcribeCalls;
      if(call===1)throw new Error('Fixture: transport unavailable before dispatch');
      const saved=await original(...args);
      if(call===2){window.__transcribeHeld=true;await new Promise(resolve=>{window.__releaseTranscribe=resolve;});}
      return saved;
    };
  })()`);
  await b.click("[data-knowledge-import-model-yes]"); await b.waitFor("window.__transcribeHeld === true", 30_000);
  try {
    await b.click("[data-knowledge-import-dialog] footer [data-knowledge-import-close]");
    assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-dialog]').open"), true);
  } finally { await b.evaluate("window.__releaseTranscribe()"); }
  await b.idle();
  assert.equal(await b.evaluate("window.__transcribeCalls"), 2);
  assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-model]').hidden"), false);
  assert.match(await b.evaluate<string>("document.querySelector('[data-knowledge-import-status]').textContent"), /1 transcribed, 2 still/);
  assert.deepEqual(await b.rows(), [{ name: "first.m4a", failed: true, done: false }, { name: "second.m4a", failed: false, done: true }, { name: "third.m4a", failed: false, done: false }]);
  await captureStoppedImport(b, "transcription-en");
  await b.click("[data-knowledge-import-dialog] header [data-knowledge-import-close]"); await b.click("[data-knowledge-import-open]");
  await b.click("[data-knowledge-import-model-yes]"); await b.idle();
  assert.equal(await b.evaluate("window.__transcribeCalls"), 4);
  assert.deepEqual(await b.rows(), [{ name: "third.m4a", failed: false, done: true }, { name: "first.m4a", failed: false, done: true }]);
  assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-model]').hidden"), true);
  for (const row of originals) {
    const latest: ArtifactVersionRecord = openProjectVersionStores(b.store).artifacts.query.latestArtifactVersion(b.projectId!, row.artifact_id)!;
    assert.equal(latest.version, 2, "each original gets one transcribed version, including the already-completed second clip");
    assert.equal((latest.payload as Record<string, unknown>).content, `Clip ${["first", "second", "third"].indexOf(row.title)}.`);
  }
});

async function captureStoppedImport(b: NonNullable<Awaited<ReturnType<typeof openImport>>>, name: string) {
  const evidence = `${REVIEW_EVIDENCE}/quality-experience-audit`; await mkdir(evidence, { recursive: true });
  for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
    await b.setViewport(width, 900);
    await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, b.sessionId);
    await b.waitFor(`document.documentElement.dataset.resolvedTheme === '${theme}'`);
    assert.equal(await b.evaluate(`(() => {const d=document.querySelector('[data-knowledge-import-dialog]'),r=d.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && d.scrollWidth<=d.clientWidth;})()`), true);
    const shot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId);
    await writeFile(`${evidence}/import-stopped-${name}-${width}-${theme}.png`, Buffer.from(shot.data, "base64"));
  }
  await b.setViewport(1440, 900);
}

// QEA-25: a real connected source enables the normal form; a held pre-dispatch transport failure avoids external network access.
test("QEA-25 online import offers Hide while waiting and retains the result on reopening", { timeout: 90_000 }, async t => {
  const b = await openImport(t, "en"); if (!b) return;
  withConnectorConnections(b.homeDirectory, store => store.createToken({ serviceId: "notion", displayName: "Fixture", token: "fixture-only-unused-token" }));
  await b.click('[data-knowledge-import-dialog] input[name="kind"][value="online"]');
  // The sources come from the integrations' declarations once online is chosen (44C), in their order; the connected one is picked as a person would.
  await b.waitFor(`document.querySelector('[data-knowledge-import-source] option[value="notion"]')`);
  await b.evaluate(`(() => { const picker = document.querySelector('[data-knowledge-import-source]'); picker.value = 'notion'; picker.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await b.waitFor("!document.querySelector('[data-knowledge-import-submit]').disabled");
  await b.evaluate(`document.querySelector('[data-knowledge-import-url]').value='https://www.notion.so/fixture'`);
  await b.evaluate(`(() => {
    const original=window.molisWorkRequest;
    window.molisWorkRequest=Object.assign(async (...args)=>{
      if(!String(args[0]).endsWith('/api/artifacts/import'))return original(...args);
      window.__onlineHeld=true;
      await new Promise(resolve=>{window.__releaseOnline=resolve;});
      throw new Error('Fixture: document transport unavailable');
    },original);
  })()`);
  await b.click("[data-knowledge-import-submit]"); await b.waitFor("window.__onlineHeld === true");
  try {
    assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-dialog] footer [data-knowledge-import-close]').textContent"), "Hide");
    await b.click("[data-knowledge-import-dialog] footer [data-knowledge-import-close]");
    assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-dialog]').open"), false);
    await b.click("[data-knowledge-import-open]");
    assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-dialog]').hasAttribute('aria-busy')"), true);
  } finally { await b.evaluate("window.__releaseOnline()"); }
  await b.idle();
  assert.match(await b.evaluate<string>("document.querySelector('[data-knowledge-import-status]').textContent"), /document transport unavailable/);
  assert.equal(b.records().length, 0);
});
