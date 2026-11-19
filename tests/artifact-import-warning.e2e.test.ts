import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { artifactVersionPath } from "@molis-ai/molis-work-module-artifacts";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { seedBoard } from "./fixtures/goal-application.js";

test("QEA-79: import and exact-version preview translate the saved warning in the Workbench's language", { timeout: 180_000 }, async t => {
  const b = await openGoalBrowser(t, "user", seedBoard, null);
  if (!b) return;
  const prefix = `/projects/${b.projectId}`, home = `${prefix}/`;
  const marker = "[data-knowledge-import-picked] li.is-done small", warning = ".artifact-document-warnings li";
  const english = "A text snapshot was extracted from the HTML", chinese = "已提取 HTML 文本";
  const navigate = (lang: "en" | "zh", path: string) => b.navigate(() => b.command("Page.navigate", {
    url: `${b.origin}/locale?lang=${lang}&next=${encodeURIComponent(path)}`,
  }, b.sessionId));
  const visible = (selector: string, text = "") => `document.querySelector(${JSON.stringify(selector)})?.checkVisibility() && document.querySelector(${JSON.stringify(selector)}).textContent.includes(${JSON.stringify(text)})`;
  const importHtml = async (filename: string, text: string) => {
    const file = join(b.homeDirectory, filename);
    await writeFile(file, "<!doctype html><title>Localized import</title><p>Read this snapshot later.</p>");
    await b.evaluate("document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'files' } }))");
    await b.waitFor(visible("[data-knowledge-import-open]"), 20_000);
    await b.click("[data-knowledge-import-open]");
    const root = await b.command<{ root: { nodeId: number } }>("DOM.getDocument", {}, b.sessionId);
    const input = await b.command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.root.nodeId, selector: "[data-knowledge-import-pick]" }, b.sessionId);
    await b.command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] }, b.sessionId);
    await b.click("[data-knowledge-import-submit]");
    await b.waitFor(visible(marker, text), 20_000);
  };

  await b.setViewport(1440, 900);
  await navigate("en", home);
  await b.waitFor("document.documentElement.lang === 'en'");
  await importHtml("english-import.html", english);
  const query = openProjectVersionStores(b.store).artifacts.query, projectId = b.projectId!;
  const saved = query.listArtifacts(projectId).map(item => query.latestArtifactVersion(projectId, item.artifact_id))
    .find(item => item?.origin.kind === "imported" && item.origin.file_name === "english-import.html");
  assert.ok(saved);
  assert.equal(saved.schema_version, 2);
  assert.deepEqual((saved.payload as { warnings: unknown }).warnings, [{ key: "workbench.import.warning-html-snapshot" }]);
  const versionPath = prefix + artifactVersionPath(saved);
  const before = query.listArtifactVersions(projectId, saved.artifact_id);
  const screenshotDir = process.env.MOLIS_WORK_QF15_QA;
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  for (const [lang, text] of [["en", english], ["zh", chinese]] as const) {
    await navigate(lang, versionPath);
    await b.waitFor(visible(warning, text), 25_000);
    for (const width of [1440, 800, 390]) for (const theme of ["light", "dark"]) {
      await b.setViewport(width, 900);
      await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, b.sessionId);
      await b.waitFor(`innerWidth === ${width} && matchMedia('(prefers-color-scheme: ${theme})').matches && ${visible(warning, text)}`);
      assert.equal(await b.evaluate(`(() => { const note = document.querySelector('${warning}'); return note.clientWidth > 0 && note.scrollWidth <= note.clientWidth + 1; })()`), true);
      if (screenshotDir) {
        await b.evaluate(`document.querySelector('${warning}').scrollIntoView({ block: 'center' })`);
        const { data } = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId);
        await writeFile(join(screenshotDir, `qf-15-${lang}-${width}-${theme}.png`), Buffer.from(data, "base64"));
      }
    }
  }
  assert.deepEqual(query.listArtifactVersions(projectId, saved.artifact_id), before, "language and appearance changes left the fixed record and digest intact");
  await b.setViewport(1440, 900);
  await navigate("zh", home);
  await importHtml("chinese-import.html", chinese);
});
