import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { orderAudit } from "./fixtures/order-audit.js";

// DESIGN「Order」(VUX-46 to VUX-50): on the project page, the common plugin pages, settings and the component board, a
// state mark stands as tall as its words and on their line, an icon beside words is the words' size or one step up, the
// words use the type scale and their role, and buttons that sit together are one height, on one line, one gap apart.
// Light at 1440 reads every page; dark, compact density and a touch phone read the pages whose layout they change.

const PAGES = ["goals", "todo", "pages", "ppt", "workflows", "lingguang", "form", "dataset", "inbox", "images", "sessions", "feed", "issues"];
const MODE_PAGES = ["goals", "pages", "lingguang", "inbox", "sessions", "feed", "jelly", "coding"];
// Left out, each with why it is not one row of peers or one line of words.
const SKIP = [
  ".dock-pins > :first-child",          // 项目首页 stands apart from the pinned plugins: the wider gap is the divider between them
  ".bar-composer [type=submit]",        // the bar's send is its one large target, a step above the bar's other buttons
  ".mw-catalog__sizes",                 // the board's size specimen shows sm, md and lg side by side
  ".mw-icon-inventory",                 // the board's icon list: an icon beside its name and code, centred on both lines
].join(", ");
const MODES = [
  { name: "light", width: 1440, height: 900, dark: false, compact: false, touch: false, pages: PAGES },
  { name: "dark", width: 1440, height: 900, dark: true, compact: false, touch: false, pages: MODE_PAGES },
  { name: "compact", width: 1440, height: 900, dark: false, compact: true, touch: false, pages: MODE_PAGES },
  { name: "phone", width: 390, height: 844, dark: false, compact: false, touch: true, pages: MODE_PAGES },
];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("VUX-46 to VUX-50: marks, words and button rows are in order on the common pages, light, dark, compact and on a phone", { timeout: 1_200_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const found: string[] = [];
  for (const mode of MODES) {
    await command("Emulation.setDeviceMetricsOverride", { width: mode.width, height: mode.height, deviceScaleFactor: 1, mobile: mode.touch }, sessionId);
    await command("Emulation.setTouchEmulationEnabled", mode.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: mode.dark ? "dark" : "light" }, { name: "pointer", value: mode.touch ? "coarse" : "fine" }] }, sessionId);
    const paths = [["project", `/projects/${projectId}/`], ...mode.pages.map((id) => [id, `/projects/${projectId}/?openPlugin=${id}`]), ["settings", "/settings"], ["catalog", "/__ui/catalog"]];
    for (const [id, path] of paths) {
      await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
      await waitFor("document.readyState === 'complete'", 20_000);
      if (mode.compact) await evaluate("document.documentElement.dataset.density = 'compact'");
      await pause(800);
      const { findings } = await evaluate(orderAudit(SKIP)) as { findings: Array<Record<string, unknown>> };
      for (const finding of findings) found.push(`${mode.name} ${id}: ${JSON.stringify(finding)}`);
    }
  }
  assert.deepEqual(found, [], "a mark, an icon, a font size, a control's role or a row of buttons is out of order");
});
