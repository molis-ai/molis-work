import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { chineseFindings, seedLongChinese, WIDTHS, writeLongChinese } from "./fixtures/chinese-walk.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// specs/visual-ui-experience VUX-40「所支持语言完整，真实页面验证…长文案…与切换布局」in Chinese, with VUX-04 (中文标点和混排) and
// VUX-05/VUX-30: the English walk (tests/english-walkthrough, tests/narrow-surfaces) lengthens only what is already styled to
// be cut. Here what a person writes in Chinese is long from the start — a project name, Goal titles, to-dos, pages, issues,
// decks, forms and workflows, with Latin words, numbers and full-width punctuation mixed in — and the project page, every
// plugin and the detail views that open by link are walked at 1440, 820 and 390 px. Nothing runs out of its box, sits on
// something else or is cut without an ellipsis; what is cut can still be reached by keyboard; a name cut short is not left so
// while its row has room; a column does not slide sideways; Chinese lines keep their rhythm (no line packed tighter than 1.3
// times its type, no column squeezed to a character or two a line, no closing mark starting a line or opening mark ending
// one); and a control's short label never wraps, so a control keeps its size.
// Before: Goal rows scrolled up under the Goals toolbar, which has no strip of its own (all widths); 「新建内容存到 项目「…」」
// and the to-do composer's project choice pushed the plugin column sideways at 390 px (and an opened page at every width);
// Workflows gave its names a third of the row and cut them while the row stood half empty (1440, 820).

const SURFACES = ["project", "todo", "pages", "coding", "ppt", "workflows", "feed", "goals", "issues", "im", "shelf", "lingguang", "form", "jelly", "files", "git"];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("VUX-40 (Chinese): long Chinese names, mixed Latin and full-width marks fit the project page and every plugin at 1440, 820 and 390 px", { timeout: 1_800_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded", seedLongChinese); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=zh&next=%2F` }, sessionId));
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.readyState === 'complete' && typeof globalThis.molisWorkControlHeaders === 'function'", 20_000);
  const opened = await writeLongChinese(evaluate, projectId);

  const found: string[] = [];
  const counts: Record<string, number> = {};
  let audited = 0;
  const evidence = reviewEvidenceUrl("visual-ui-experience/chinese-walk/"); await mkdir(evidence, { recursive: true });
  for (const size of WIDTHS) {
    await command("Emulation.setDeviceMetricsOverride", { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.touch }, sessionId);
    for (const surface of [...SURFACES, ...SURFACES.filter((id) => opened[id]).map((id) => `${id}:open`)]) {
      const [id, open] = surface.split(":");
      const query = id === "project" ? "" : `?openPlugin=${id}${open ? `&openItem=${encodeURIComponent(opened[id]!)}` : ""}`;
      await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/${query}` }, sessionId));
      // A tab another browser job put behind it runs no frames.
      await command("Page.bringToFront", {}, sessionId);
      await waitFor("document.readyState === 'complete'", 20_000);
      await pause(1500);
      const where = `${size.width} ${surface}`;
      const all = await chineseFindings(evaluate);
      audited++;
      counts[where] = all.length;
      for (const finding of all) found.push(`${where}: ${JSON.stringify(finding)}`);
      t.diagnostic(`${where}: ${all.length}`);
      if (all.length) {
        const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
        await writeFile(new URL(`${size.width}-${surface.replace(":", "-")}.png`, evidence), Buffer.from(shot.data, "base64"));
      }
    }
  }
  await writeFile(new URL("findings.json", evidence), JSON.stringify({ counts, found }, null, 2));
  assert.equal(audited, WIDTHS.length * (SURFACES.length + SURFACES.filter((id) => opened[id]).length));
  assert.deepEqual(found, []);
});
