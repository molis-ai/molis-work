import assert from "node:assert/strict";
import test from "node:test";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

test("RAC-2345 actual platform Artifact import, exact Goal input, English navigation and handoff work without Plugin membership", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, projectId } = b;
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
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await click("[data-artifact-goal-input] summary");
  await waitFor("Boolean(document.querySelector('[data-artifact-goal-input] select option[value=V1]'))");
  await evaluate("document.querySelector('[data-artifact-goal-input] select').value='V1'");
  await click("[data-artifact-goal-input-form] button[type=submit]");
  await waitFor("Boolean(document.querySelector('[data-artifact-links] a[href$=\"/goals/V1\"]'))");
  // A fixed input is listed with the Goal's other inputs (artifact-positioning 五.1, one entry), opening its exact version.
  const fixedInput = `Boolean(document.querySelector('[data-goal-inputs] [data-goal-input-fixed] [data-workbench-item-id="/artifacts/${encodeURIComponent(exact!.artifact_id)}/versions/1"]'))`;
  await visit("/goals/V1");
  assert.equal(await evaluate(fixedInput), true);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: b.homeDirectory });
  const artifactEntry = '.plugin-rail-items button.plugin-rail-item[data-plugin-id="artifacts"][data-work-surface-open]';
  try {
    assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(artifactEntry)}))`), true, "the platform has a real navigation entry");
    assert.throws(() => catalog.removeProjectPlugin({ project_id: projectId!, plugin_id: "artifacts", actor_id: "browser-owner" }), (error: unknown) => error instanceof Error && "code" in error && error.code === "catalog.plugin_not_found");
    assert.equal(catalog.listProjectPlugins(projectId!).includes("artifacts"), false);
    await visit("/goals/V1");
    assert.equal(await evaluate(fixedInput), true);
    assert.equal(await evaluate("Boolean(document.querySelector('[data-artifact-unavailable]'))"), false);
    assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(artifactEntry)}))`), true, "the platform entry remains after an invalid removal attempt");
    const exactPath = `/artifacts/${encodeURIComponent(exact!.artifact_id)}/versions/${exact!.version}`;
    const readable = await fetch(b.origin + prefix + exactPath, { headers: { "x-molis-work-fragment": "artifact-workbench" } });
    assert.equal(readable.status, 200);
    const html = await readable.text();
    assert.match(html, /浏览器原始文档/);
    assert.match(html, /通过同一能力保存与读取/);
    const exported = await fetch(b.origin + prefix + `/api${exactPath}/export`);
    assert.equal(exported.status, 200);
    const exportedVersion = await exported.json();
    assert.deepEqual({ content: exportedVersion.payload.content, version: exportedVersion.version }, { content, version: exact!.version });
    assert.throws(() => catalog.addProjectPlugin({ project_id: projectId!, plugin_id: "artifacts", actor_id: "browser-owner" }), (error: unknown) => error instanceof Error && "code" in error && error.code === "catalog.plugin_not_found");
    await visit("/goals/V1");
    assert.equal(await evaluate(fixedInput), true);
    assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(artifactEntry)}))`), true);
    await evaluate("document.cookie='molis_work_locale=en; path=/'");
    await visit("/");
    await waitFor("document.documentElement.lang === 'en'");
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(artifactEntry)}).textContent.includes('Artifacts')`), true);
    await click(artifactEntry);
    await waitFor("document.body.dataset.desktopSurface === 'artifacts' && Boolean(document.querySelector('[data-artifact-directory] [data-frame-asset=artifact]'))");
    await click(`[data-artifact-directory] [data-frame-asset-id="${exact!.artifact_id}#${exact!.version}"]`);
    await waitFor("Boolean(document.querySelector('[data-artifact-detail] [data-artifact-hand=assistant]'))");
    assert.equal(await evaluate("document.querySelector('[data-artifact-hand=assistant]').textContent"), "Hand to the Assistant");
    await evaluate("window.__maintenanceHandoff=null;window.addEventListener('molis:assistant-message',event=>{window.__maintenanceHandoff=event.detail},{once:true})");
    await click("[data-artifact-hand=assistant]");
    await waitFor("Boolean(window.__maintenanceHandoff)");
    const handoff = await evaluate<{ object: { id: string; version: number }; source: { surface: string }; materials: { text: string }[] }>("window.__maintenanceHandoff");
    assert.deepEqual(JSON.parse(handoff.object.id), [exact!.artifact_id, exact!.version]);
    assert.equal(handoff.object.version, exact!.version);
    assert.equal(handoff.source.surface, "artifacts");
    assert.match(handoff.materials[0]!.text, /浏览器原始文档/);
  } finally { catalog.close(); }
});
