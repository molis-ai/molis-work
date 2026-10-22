import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { orderAudit } from "./fixtures/order-audit.js";

// DESIGN「Order」(VUX-46 to VUX-49): on the project page, the common plugin pages, settings and the component board, a
// state mark stands as tall as its words and on their line, an icon beside words is the words' size or one step up, the
// words use the type scale, and buttons that sit together are one height, on one line, one gap apart.

const PAGES = ["goals", "todo", "pages", "ppt", "workflows", "lingguang", "form", "dataset", "inbox", "images", "sessions", "feed", "issues"];
// Left out, each with why it is not one row of peers or one line of words.
const SKIP = [
  ".dock-pins > :first-child",          // 项目首页 stands apart from the pinned plugins: the wider gap is the divider between them
  ".bar-composer [type=submit]",        // the bar's send is its one large target, a step above the bar's other buttons
  ".mw-catalog__sizes",                 // the board's size specimen shows sm, md and lg side by side
  ".mw-icon-inventory",                 // the board's icon list: an icon beside its name and code, centred on both lines
].join(", ");
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("VUX-46 to VUX-49: marks, words and button rows are in order on the common pages", { timeout: 600_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const paths = [["project", `/projects/${projectId}/`], ...PAGES.map((id) => [id, `/projects/${projectId}/?openPlugin=${id}`]), ["settings", "/settings"], ["catalog", "/__ui/catalog"]];
  const found: string[] = [];
  for (const [id, path] of paths) {
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    await waitFor("document.readyState === 'complete'", 20_000);
    await pause(800);
    const { findings } = await evaluate(orderAudit(SKIP)) as { findings: Array<Record<string, unknown>> };
    for (const finding of findings) found.push(`${id}: ${JSON.stringify(finding)}`);
  }
  assert.deepEqual(found, [], "a mark, an icon, a font size or a row of buttons is out of order");
});
