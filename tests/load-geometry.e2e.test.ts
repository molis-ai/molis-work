import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// specs/visual-ui-experience VUX-31 (§feedback-lifecycle, Skeleton Geometry): what a surface paints first has the geometry
// it ends with, so nothing moves under the reader while it loads. Every plugin and the project page, opened by address at
// three widths, shift by less than a fiftieth of the viewport's worth (layout-shift score) from first paint to settled.
// Before: a side-panel plugin opened by link painted the page at full width, then narrowed it (Shelf 0.354); Jelly's toolbar
// and filters grew when the period's name and the categories came (0.071 at 820 px); Todo's placement choices came after
// first paint and wrapped the row (0.088 at 390 px).

const SURFACES = ["project", "todo", "pages", "coding", "ppt", "workflows", "feed", "goals", "issues", "im", "shelf", "lingguang", "form", "jelly", "files", "git"];
const WIDTHS = [[1440, 950], [820, 900], [390, 844]] as const;
// Chrome's own score for each shift not caused by input, with what moved. Touch emulation reports none, so widths are
// emulated with a pointer.
const OBSERVE = `window.__shifts = []; new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shifts.push({ value: entry.value,
  moved: (entry.sources || []).map((source) => { const node = source.node?.nodeType === 1 ? source.node : source.node?.parentElement; return (node ? node.tagName.toLowerCase() + (typeof node.className === 'string' && node.className ? '.' + node.className.trim().split(/\\s+/)[0] : '') : '?') + ' ' + Math.round(source.previousRect.y) + '→' + Math.round(source.currentRect.y); }) }); }).observe({ type: 'layout-shift', buffered: true });`;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("VUX-31: the project page and every plugin keep their first-painted geometry while they load, at three widths", { timeout: 600_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: OBSERVE }, sessionId);
  const scores: Record<string, number> = {}, moved: string[] = [];
  for (const [width, height] of WIDTHS) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    for (const id of SURFACES) {
      await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/${id === "project" ? "" : `?openPlugin=${id}`}` }, sessionId));
      // A tab another browser job put behind it runs no frames.
      await command("Page.bringToFront", {}, sessionId);
      await waitFor("document.readyState === 'complete'", 20_000);
      await pause(2_000);
      const shifts = await evaluate<Array<{ value: number; moved: string[] }>>("window.__shifts");
      const score = shifts.reduce((sum, shift) => sum + shift.value, 0);
      scores[`${width} ${id}`] = Math.round(score * 10_000) / 10_000;
      if (score >= 0.02) moved.push(`${width}px ${id}: ${score.toFixed(4)} — ${shifts.filter((shift) => shift.value >= 0.002).map((shift) => shift.moved.join(", ")).join(" / ")}`);
    }
  }
  assert.equal(Object.keys(scores).length, WIDTHS.length * SURFACES.length);
  assert.deepEqual(moved, [], "a surface moved under the reader while it loaded");
  const evidence = reviewEvidenceUrl("visual-ui-experience/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("load-geometry.json", evidence), JSON.stringify(scores, null, 2));
});
