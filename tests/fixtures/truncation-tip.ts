import assert from "node:assert/strict";
import test from "node:test";
import { openBoardBrowser as openGoalBrowser } from "./board-browser.js";
import { TRUNCATION_AUDIT, TRUNCATION_STRESS, type TruncationHeld, type TruncationIssue } from "./truncation-audit.js";

// specs/visual-ui-experience §type-optics (VUX-05): a name, path or summary cut short by an ellipsis or a line clamp on the
// board, the project page or a plugin can be read whole without opening it: the page's one tooltip
// (packages/design-system/src/browser/tip.ts) shows it on a pointer's rest, on keyboard focus and on a press and hold.
// Nothing is cut beyond recovery: a button's own label, an error and a status included. Seeded names are short, so every
// text whose style may cut it is lengthened in place first.

const PLUGINS = ["todo", "pages", "coding", "ppt", "workflows", "feed", "goals", "issues", "im", "shelf", "lingguang", "form"];
const pause = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
const TIP = "(() => { const tip = document.querySelector('body > .craft-tip[data-shown]'); return tip ? tip.textContent : null; })()";

export function testTruncationAudit(width: 1280 | 390) {
  test(`VUX-05 QEA-171 ${width}px: text cut short on the board, the project page and every plugin is shown whole by the tooltip; nothing is cut beyond recovery`, { timeout: 1_800_000 }, async (t) => {
    const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
    const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
    const move = (x: number, y: number) => command("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }, sessionId);
    const surfaces: [string, string][] = [["组件板", "/__ui/catalog"], ["项目页", `/projects/${projectId}/`], ["Home", "/"], ["侧栏 Shelf", `/projects/${projectId}/side/shelf/side`],
      ...PLUGINS.map((id): [string, string] => [id, `/projects/${projectId}/?openPlugin=${id}`])];
    const found: string[] = [];
    let checked = 0;
    await command("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    for (const [name, path] of surfaces) {
      await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
      await command("Page.bringToFront", {}, sessionId);
      await waitFor("document.readyState === 'complete'", 20_000);
      await pause(1500);
      const stressed = await evaluate<number>(TRUNCATION_STRESS);
      await pause(200);
      const { found: issues, held } = await evaluate<{ found: TruncationIssue[]; held: TruncationHeld[] }>(TRUNCATION_AUDIT);
      for (const issue of issues) found.push(`${width} ${name}: ${issue.kind} ${issue.at} "${issue.text}"`);
      // One of each kind of cut text per surface: the same row drawn forty times is one check.
      const seen = new Set<string>();
      let skipped = 0;
      for (const item of held) {
        if (seen.has(item.at)) continue;
        seen.add(item.at);
        const selector = JSON.stringify(`[data-cut-audit="${item.index}"]`);
        const locate = () => evaluate<{ x: number; y: number } | null>(`(async () => { const el = document.querySelector(${selector});
          if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const box = el.getBoundingClientRect();
          const x = box.x + Math.min(box.width / 2, 24), y = box.y + box.height / 2;
          return el.contains(document.elementFromPoint(x, y)) ? { x, y } : null; })()`);
        await move(1, 1);
        await pause(150);
        let point = await locate();
        if (!point) { skipped++; continue; }
        let shown: string | null = null, stayed = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt) {
            // Measuring and scrolling the stressed tabs can move a label out from under the pointer.
            await move(1, 1);
            await pause(150);
            const current = await locate();
            if (!current) break;
            point = current;
          }
          await move(point.x, point.y);
          await pause(800);
          ({ stayed, shown } = await evaluate<{ stayed: boolean; shown: string | null }>(`({
            stayed: document.querySelector(${selector})?.contains(document.elementFromPoint(${point.x}, ${point.y})) === true,
            shown: ${TIP}
          })`));
          if (stayed) break;
        }
        checked++;
        if (!stayed) found.push(`${width} ${name}: ${item.at} did not stay under the pointer`);
        else if (shown?.replace(/\s+/g, " ").trim() !== item.text) found.push(`${width} ${name}: ${item.at} "${item.text.slice(0, 60)}" shows ${shown === null ? "no tooltip" : `"${shown.slice(0, 60)}"`}`);
      }
      t.diagnostic(`${width} ${name}: ${held.length} cut (${seen.size} kinds, ${skipped} covered), ${issues.length} issues, ${stressed} lengthened`);
      await move(1, 1);
    }
    // Both viewport files together must reach at least the original 30 cut texts.
    assert.ok(checked >= 15, `the ${width}px audit reached cut texts (${checked})`);
    assert.deepEqual(found, []);
  });
}
