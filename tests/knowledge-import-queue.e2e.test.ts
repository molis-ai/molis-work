import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { seedBoard } from "./fixtures/goal-application.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

async function openImport(t: Parameters<typeof openGoalBrowser>[0]) {
  const b = await openGoalBrowser(t, "user", seedBoard, null);
  if (!b) return null;
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/` }, b.sessionId));
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
  const b = await openImport(t); if (!b) return;
  const folder = join(b.homeDirectory, "chosen"); await mkdir(folder);
  const files = Array.from({ length: 201 }, (_, index) => join(folder, `document-${index}.txt`));
  await Promise.all(files.map((file, index) => writeFile(file, `Document ${index}: independently identifiable content.`)));
  await b.pick(files);
  await b.waitFor("document.querySelectorAll('[data-knowledge-import-picked] li').length === 200");
  await b.click("[data-knowledge-import-submit]"); await b.idle();
  assert.equal(b.records().length, 200);
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
});
