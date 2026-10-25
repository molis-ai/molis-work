import assert from "node:assert/strict";
import test from "node:test";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";
import { goalsQueryOf } from "./fixtures/goal-application.js";

test("actual Artifact import, fixed version, Goal embed and disabled reader survive the shared action path", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, store, projectId } = b;
  const prefix = `/projects/${projectId}`;
  const visit = (path: string) => navigate(() => command("Page.navigate", { url: b.origin + prefix + path }, sessionId));
  const file = join(b.homeDirectory, "动作导入.md"), content = "# 浏览器原始文档\n通过同一能力保存与读取。";
  await writeFile(file, content);
  await mkdir(`${REVIEW_EVIDENCE}/action-service/artifacts`, { recursive: true });
  let exact: { artifact_id: string; version: number } | undefined;
  for (const width of [1440, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
    // Importing is the side panel's 资料 tab (specs/project-knowledge PMAT-14), saved through the 成果库's own import.
    await visit("/?openPlugin=artifacts");
    await waitFor("Boolean(document.querySelector('[data-knowledge-import-dialog]'))", 15_000);
    await evaluate("document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'files' } }))");
    await waitFor("Boolean(document.querySelector('[data-knowledge-import-open]')?.getClientRects().length)", 10_000);
    await click("[data-knowledge-import-open]");
    await waitFor("document.querySelector('[data-knowledge-import-dialog]')?.open === true");
    const root = await command<{ root: { nodeId: number } }>("DOM.getDocument", {}, sessionId);
    const input = await command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.root.nodeId, selector: "[data-knowledge-import-dialog] [data-knowledge-import-pick]" }, sessionId);
    await command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] }, sessionId);
    await waitFor("document.querySelectorAll('[data-knowledge-import-picked] li').length === 1");
    await click("[data-knowledge-import-submit]");
    await waitFor("/导入了 1 个/.test(document.querySelector('[data-knowledge-import-status]').textContent)", 10_000);
    assert.equal(await evaluate("document.querySelectorAll('[data-knowledge-import-picked] .is-failed').length"), 0);
    await evaluate("document.querySelector('[data-knowledge-import-dialog]').close()");
    // The same file again is the same stored version.
    const again = await b.web.post<{ artifact_id: string; version: number; reused: boolean }>(prefix + "/api/artifacts/import", { source: "file", filename: "动作导入.md", content });
    assert.equal(again.reused, true);
    const reference = { artifact_id: again.artifact_id, version: again.version };
    if (exact) assert.deepEqual(reference, exact, "repeated import keeps the same stored version");
    exact = reference;
    await visit(`/?openPlugin=artifacts&openItem=${encodeURIComponent(`/artifacts/${encodeURIComponent(exact.artifact_id)}/versions/${exact.version}`)}`);
    // The version opens in the workbench, without leaving the page.
    await waitFor("document.body.dataset.desktopSurface === 'artifacts' && (document.querySelector('[data-artifact-detail]')?.innerText ?? '').includes('浏览器原始文档')", 15_000);
    assert.match(await evaluate<string>("document.querySelector('[data-artifact-detail]').innerText"), /通过同一能力保存与读取/);
    const exported = await evaluate<any>(`fetch(${JSON.stringify(prefix + `/api/artifacts/${encodeURIComponent(exact.artifact_id)}/versions/1/export`)}).then(r=>r.json())`);
    assert.equal(exported.payload.content, content); assert.equal(exported.version, 1);
    const screenshot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(`${REVIEW_EVIDENCE}/action-service/artifacts/read-${width}.png`, Buffer.from(screenshot.data, "base64"));
  }
  const board = goalsQueryOf(store).listProjectIds()[0]!, scope = { kind: "personal" as const, id: board };
  const ledger = createContextLedger(store.db, { authorize: () => true });
  ledger.commands.put({ actor_id: "browser-owner", scope }, { key: "artifact-action-input", type: "goal.input", cause: "Explicit browser fixture",
    source: { module: "goals", id: "V1", version: null, scope }, target: { module: "artifacts", id: exact!.artifact_id, version: exact!.version, scope } });
  // A fixed input is listed with the Goal's other inputs (artifact-positioning 五.1, one entry), opening its exact version.
  const fixedInput = `Boolean(document.querySelector('[data-goal-inputs] [data-goal-input-fixed] [data-workbench-item-id="/artifacts/${encodeURIComponent(exact!.artifact_id)}/versions/1"]'))`;
  await visit("/goals/V1");
  assert.equal(await evaluate(fixedInput), true);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: b.homeDirectory });
  try {
    catalog.removeProjectPlugin({ project_id: projectId!, plugin_id: "artifacts", actor_id: "browser-owner" });
    await visit("/goals/V1");
    assert.match(await evaluate<string>("document.querySelector('[data-artifact-unavailable]').textContent"), /未启用/);
    const denied = await fetch(b.origin + prefix + "/artifacts");
    assert.equal(denied.status, 403); await denied.text();
    catalog.addProjectPlugin({ project_id: projectId!, plugin_id: "artifacts", actor_id: "browser-owner" });
    await visit("/goals/V1");
    assert.equal(await evaluate(fixedInput), true);
  } finally { catalog.close(); }
});
