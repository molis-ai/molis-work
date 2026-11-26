// @requires-platform darwin
import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { seedBoard } from "./fixtures/goal-application.js";

// QEA-27: native helper outcomes are fixtures; the browser entry, HTTP and saved versions are real.
// The timeout case is the helper's timeout reply, not a 30-minute wall-clock deadline test.
for (const outcome of ["extraction_failed", "timeout", "empty"] as const) {
  test(`QEA-27 transcription ${outcome} keeps the original and an honest retry until text is available`, { timeout: 90_000, skip: process.platform !== "darwin" }, async t => {
    const b = await openGoalBrowser(t, "user", seedBoard, null); if (!b) return;
    const helper = join(b.homeDirectory, "speech-helper"), recovered = join(b.homeDirectory, "recovered");
    const file = join(b.homeDirectory, "meeting.m4a"); await writeFile(file, "original audio fixture");
    await writeFile(helper, `#!${process.execPath}
const fs=require('node:fs');
if(!process.argv.includes('--allow-model-download')){process.stdout.write(JSON.stringify({error:'model_required',message:'Consent needed',approximate_bytes:1000000}));process.exit(1);}
if(!fs.existsSync(${JSON.stringify(recovered)}) && ${JSON.stringify(outcome)}!=='empty'){process.stdout.write(JSON.stringify({error:${JSON.stringify(outcome)},message:'Fixture extraction outcome'}));process.exit(1);}
process.stdout.write(JSON.stringify({text:fs.existsSync(${JSON.stringify(recovered)})?'Meeting transcript.':'',extractor:'fixture',pages:[],coverage:{status:'sufficient',processed_pages:0,total_pages:0,issues:[]}}));
`, { mode: 0o700 });
    const prior = process.env.MOLIS_MATERIAL_WHISPER_HELPER; process.env.MOLIS_MATERIAL_WHISPER_HELPER = helper;
    t.after(() => { if (prior === undefined) delete process.env.MOLIS_MATERIAL_WHISPER_HELPER; else process.env.MOLIS_MATERIAL_WHISPER_HELPER = prior; });
    const target = `/projects/${b.projectId}/`;
    await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/locale?lang=en&next=${encodeURIComponent(target)}` }, b.sessionId));
    await b.evaluate("document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'files' } }))");
    await b.waitFor("document.querySelector('[data-knowledge-import-open]')?.getClientRects().length");
    await b.click("[data-knowledge-import-open]");
    const root = await b.command<{ root: { nodeId: number } }>("DOM.getDocument", {}, b.sessionId);
    const input = await b.command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.root.nodeId, selector: "[data-knowledge-import-pick]" }, b.sessionId);
    await b.command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] }, b.sessionId);
    const idle = () => b.waitFor("!document.querySelector('[data-knowledge-import-dialog]').hasAttribute('aria-busy')");
    await b.click("[data-knowledge-import-submit]"); await idle();
    const artifacts = openProjectVersionStores(b.store).artifacts;
    const original = artifacts.query.listArtifacts(b.projectId!)[0]!;
    assert.equal(original.version, 1);
    await b.click("[data-knowledge-import-model-yes]"); await idle();
    const failed = artifacts.query.latestArtifactVersion(b.projectId!, original.artifact_id)!;
    assert.equal((failed.payload as Record<string, unknown>).content, "");
    assert.ok((failed.payload as Record<string, unknown>).original_file, "the failed extraction preserves the original");
    const download = target + `api/artifacts/${encodeURIComponent(failed.artifact_id)}/versions/${failed.version}/file`;
    assert.deepEqual(await b.evaluate(`fetch(${JSON.stringify(download)}).then(async response => [response.status, await response.text()])`),
      [200, "original audio fixture"], "the normal download still reads the exact original after extraction fails");
    assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-model]').hidden"), false, "no text leaves the file available for retry");
    assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-picked] li').classList.contains('is-done')"), false);
    assert.match(await b.evaluate<string>("document.querySelector('[data-knowledge-import-status]').textContent"), /Transcribed 0; 1 not transcribed/);
    await writeFile(recovered, "ready");
    await b.click("[data-knowledge-import-model-yes]"); await idle();
    const saved = artifacts.query.latestArtifactVersion(b.projectId!, original.artifact_id)!;
    assert.equal(saved.version, failed.version + 1);
    assert.equal((saved.payload as Record<string, unknown>).content, "Meeting transcript.");
    assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-model]').hidden"), true);
    assert.equal(await b.evaluate("document.querySelector('[data-knowledge-import-picked] li').classList.contains('is-done')"), true);
    const again = await b.web.post<{ version: number; reused: boolean; text_available: boolean }>(target + "api/artifacts/import", {
      source: "file", filename: "meeting.m4a", allow_model_download: true,
      original_file: (original.payload as Record<string, unknown>).original_file,
    });
    assert.equal(again.version, saved.version); assert.equal(again.reused, true); assert.equal(again.text_available, true);
  });
}
