import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { ORDER_SKIP as SKIP, orderAudit } from "./fixtures/order-audit.js";

// DESIGN「Order」(VUX-46 to VUX-50): on the project page, the common plugin pages, settings and the component board, a
// state mark stands as tall as its words and on their line, an icon beside words is the words' size or one step up, the
// words use the type scale and their role, a painted box's corner is on the corner scale, and buttons that sit together are one
// height, on one line, one gap apart.
// Light at 1440 reads every page; dark, compact density and a touch phone read the pages whose layout they change.

const PAGES = ["goals", "todo", "pages", "ppt", "workflows", "lingguang", "form", "dataset", "inbox", "images", "feed", "issues",
  "jelly", "coding", "alchemist", "artifacts", "cognia", "diff", "files", "git", "schedule", "text-stats", "plugin-builder"];
// What light at 1440 also opens and reads: the header's create on the pages where it opens a new item's editor or the dialog
// that asks for it in place (the others create in a sheet, or have none), and the Pages template list.
const OPENS = [
  ...["pages", "ppt", "workflows", "lingguang", "form", "dataset", "images", "alchemist", "cognia", "schedule"].map((page) => ["create", ".plugin-stage-chrome .tree-create", page]),
  ["templates", "[data-pages-templates]", "pages"],
];
const MODE_PAGES = ["goals", "pages", "lingguang", "inbox", "feed", "jelly", "coding"];
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
  const child = await pluginFrameBrowser(t,browser);
  const found: string[] = [];
  for (const mode of MODES) {
    await command("Emulation.setDeviceMetricsOverride", { width: mode.width, height: mode.height, deviceScaleFactor: 1, mobile: mode.touch }, sessionId);
    await command("Emulation.setTouchEmulationEnabled", mode.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: mode.dark ? "dark" : "light" }, { name: "pointer", value: mode.touch ? "coarse" : "fine" }] }, sessionId);
    const paths = [["project", `/projects/${projectId}/`], ...mode.pages.map((id) => [id, `/projects/${projectId}/?openPlugin=${id}`]), ["settings", "/settings"], ["catalog", "/__ui/catalog"],
      ["chooser", "/"], ["onboarding", "/onboarding?mode=new-project"]];
    for (const [id, path] of paths) {
      await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
      await waitFor("document.readyState === 'complete'", 20_000);
      if (mode.compact) await evaluate("document.documentElement.dataset.density = 'compact'");
      await pause(800);
      const isolated = await evaluate<boolean>("Boolean(document.querySelector('iframe[data-plugin-frame]'))");
      const audit = async () => {
        const owner = await evaluate<{findings: Array<Record<string, unknown>>}>(orderAudit(SKIP));
        if (isolated) {
          await child.waitFor("document.querySelector('[data-work-surface]') && document.fonts.status === 'loaded'");
          const inside = await child.evaluate<{findings: Array<Record<string, unknown>>}>(orderAudit(SKIP));
          owner.findings.push(...inside.findings);
        }
        return owner.findings;
      };
      for (const finding of await audit()) found.push(`${mode.name} ${id}: ${JSON.stringify(finding)}`);
      if (mode.name !== "light") continue;
      for (const [what, opener, page] of OPENS) {
        if (page !== id) continue;
        await waitFor(`document.body.dataset.desktopSurface === ${JSON.stringify(id)}`, 20_000);
        await (isolated ? child : browser).evaluate(`document.querySelector(${JSON.stringify(opener)}).click()`);
        await pause(1500);
        for (const finding of await audit()) found.push(`${mode.name} ${id} ${what}: ${JSON.stringify(finding)}`);
      }
      if (id !== "settings") continue;
      // Settings: every section, each read once it has loaded.
      const sections = await evaluate("[...document.querySelectorAll('[data-settings-section]')].map((row) => row.dataset.settingsSection)") as string[];
      for (const section of sections.slice(1)) {
        await evaluate(`document.querySelector('[data-settings-section=${JSON.stringify(section)}]').click()`);
        await pause(1500);
        const read = await evaluate(orderAudit(SKIP)) as { findings: Array<Record<string, unknown>> };
        for (const finding of read.findings) found.push(`${mode.name} settings ${section}: ${JSON.stringify(finding)}`);
      }
    }
  }
  assert.deepEqual(found, [], "a mark, an icon, a font size, a control's role or a row of buttons is out of order");
});
