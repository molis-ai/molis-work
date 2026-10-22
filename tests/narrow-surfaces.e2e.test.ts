import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { layoutFindings } from "./fixtures/layout-audit.js";
import { TRUNCATION_STRESS } from "./fixtures/truncation-audit.js";

// specs/visual-ui-experience §adaptive-focus (VUX-30, with VUX-05 and VUX-40): every surface fits the container it is given —
// one pane of a split window, a narrow window, a phone — in Chinese and in English, with its own words and with every name
// that may be cut made long. Nothing sits on anything else, is cut off without a word, or leaves the window; what gives way
// is the secondary text, and on a touch screen every control stays large enough to touch.

const PLUGINS = ["todo", "pages", "coding", "ppt", "workflows", "feed", "goals", "issues", "im", "shelf", "lingguang", "form"];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const WIDTHS = [{ name: "split pane", width: 1280, height: 800, touch: false, split: true }, { name: "480", width: 480, height: 800, touch: false, split: false }, { name: "phone", width: 390, height: 844, touch: true, split: false }];

test("VUX-30: the project page and every plugin fit a split pane, a narrow window and a phone, in both languages and with long names", { timeout: 1_800_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  const found: string[] = [];
  let audited = 0;
  for (const lang of ["zh", "en"]) for (const size of WIDTHS) {
    await command("Emulation.setDeviceMetricsOverride", { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.touch }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=${lang}&next=%2F` }, sessionId));
    for (const id of ["project", ...PLUGINS]) {
      await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/${id === "project" ? "" : `?openPlugin=${id}`}` }, sessionId));
      // A tab another browser job put behind it runs no frames, and the Dock folds on a frame.
      await command("Page.bringToFront", {}, sessionId);
      await waitFor("document.readyState === 'complete'", 20_000);
      // The split made here stays: the narrower widths after it are a split window's narrow layout, with its pane controls.
      if (size.split && await evaluate("document.querySelectorAll('[data-tab-pane]').length < 2")) {
        await click(".tab-pane.is-focused [data-tab-split], [data-titlebar-tabs] [data-tab-split]");
        await click("[data-layout-split=right]");
        await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
      }
      await pause(1200);
      for (const stressed of [false, true]) {
        if (stressed) { await evaluate(TRUNCATION_STRESS); await pause(400); }
        const where = `${lang} ${size.name} ${id}${stressed ? " (long names)" : ""}`;
        // Targets under 24 px are a touch screen's problem; a pointer's small controls are checked by tests/touch-targets.
        const findings = (await layoutFindings(evaluate)).filter((finding) => size.touch || finding.kind !== "tiny-target");
        audited++;
        for (const finding of findings) found.push(`${where}: ${JSON.stringify(finding)}`);
        t.diagnostic(`${where}: ${findings.length}`);
      }
    }
  }
  assert.equal(audited, 2 * WIDTHS.length * (PLUGINS.length + 1) * 2);
  assert.deepEqual(found, []);
});
