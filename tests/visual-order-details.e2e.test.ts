import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { ORDER_SKIP, orderAudit } from "./fixtures/order-audit.js";
import { walkLayers } from "./fixtures/layer-walk.js";
import { TITLES, seedLongChinese, writeLongChinese } from "./fixtures/chinese-walk.js";

// DESIGN「Order」(VUX-46 to VUX-50) past the start states tests/visual-order reads: what a person has made, and what opens
// from it. With real content (tests/fixtures/chinese-walk writes long to-dos, pages, issues, decks, forms and workflows,
// and seeds long Goals), each plugin's detail view, Shelf and the project discussion, every page of the person's and the
// project's settings, and every menu, popover and dialog those screens open (create, rename, delete, a row's context menu,
// a more menu, a filter) are read by the same order audit: marks as tall as their words, icons the words' size, the type
// scale, corners on the scale, and buttons that sit together one height, one line, one gap apart. Light at 1440 reads
// everything; dark and a touch phone read the screens, whose layout they change.

const DETAILS = ["todo", "pages", "ppt", "workflows", "goals", "issues", "form"];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const LOADED = "document.readyState === 'complete' && ![...document.querySelectorAll('[data-settings-panel] .mw-loading, [data-settings-loading]:not(.mw-empty--error)')].some((node) => node.checkVisibility())";

test("VUX-46 to VUX-50: detail views, settings pages and the menus and dialogs they open are in order, light, dark and on a phone", { timeout: 3_600_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded", seedLongChinese); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  // A layer is read where it comes to rest, not while it grows in.
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=zh&next=%2F` }, sessionId));
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.readyState === 'complete' && typeof globalThis.molisWorkControlHeaders === 'function'", 20_000);
  const opened = await writeLongChinese(evaluate, projectId!);
  const sections = async (path: string) => {
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    await waitFor("document.querySelector('[data-settings-section]')", 20_000);
    return evaluate<string[]>("[...new Set([...document.querySelectorAll('[data-settings-section]')].map((row) => row.dataset.settingsSection))]");
  };
  const screens: Array<[string, string]> = [
    ...DETAILS.filter((id) => opened[id]).map((id): [string, string] => [`${id} detail`, `/projects/${projectId}/?openPlugin=${id}&openItem=${encodeURIComponent(opened[id]!)}`]),
    ["shelf", `/projects/${projectId}/?openPlugin=shelf`],
    ["im", `/projects/${projectId}/?openPlugin=im`],
    ...(await sections("/settings")).map((section): [string, string] => [`settings ${section}`, `/settings/${section}`]),
  ];
  const projectSections = await (async () => {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=project-settings` }, sessionId));
    await waitFor("document.querySelector('[data-directory-panel=project-settings] [data-settings-section]')", 20_000);
    return evaluate<string[]>("[...document.querySelectorAll('[data-directory-panel=project-settings] [data-settings-section]')].map((row) => row.dataset.settingsSection)");
  })();
  assert.ok(screens.length >= DETAILS.length + 2 + 10, `the walk has the detail views and the settings pages (${screens.length})`);
  assert.ok(projectSections.length >= 4, `the project's settings have their pages (${projectSections.length})`);

  const found: string[] = [];
  let read = 0;
  const audit = async (where: string) => {
    const { findings } = await evaluate<{ findings: Array<Record<string, unknown>> }>(orderAudit(ORDER_SKIP));
    read++;
    for (const finding of findings) found.push(`${where}: ${JSON.stringify(finding)}`);
  };
  const MODES = [
    { name: "light", width: 1440, height: 900, dark: false, touch: false, layers: true },
    { name: "dark", width: 1440, height: 900, dark: true, touch: false, layers: false },
    { name: "phone", width: 390, height: 844, dark: false, touch: true, layers: false },
  ];
  for (const mode of MODES) {
    await command("Emulation.setDeviceMetricsOverride", { width: mode.width, height: mode.height, deviceScaleFactor: 1, mobile: mode.touch }, sessionId);
    await command("Emulation.setTouchEmulationEnabled", mode.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-color-scheme", value: mode.dark ? "dark" : "light" }, { name: "pointer", value: mode.touch ? "coarse" : "fine" }] }, sessionId);
    for (const [where, path] of screens) {
      await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
      await command("Page.bringToFront", {}, sessionId);
      await waitFor(LOADED, 20_000).catch(() => undefined);
      await pause(1200);
      await audit(`${mode.name} ${where}`);
    }
    // The project's settings, page by page, as the workbench shows them.
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=project-settings` }, sessionId));
    await waitFor("document.querySelector('[data-directory-panel=project-settings] [data-settings-section]')", 20_000);
    for (const section of projectSections) {
      await evaluate(`document.querySelector('[data-directory-panel=project-settings] [data-settings-section=${JSON.stringify(section)}]').click()`);
      await pause(400);
      await waitFor(LOADED, 20_000).catch(() => undefined);
      await pause(600);
      await audit(`${mode.name} project settings ${section}`);
    }
    if (mode.layers) await walkLayers(browser, screens.map(([where, path]) => [`${mode.name} ${where}`, path]), TITLES.map((title) => title.slice(0, 10)), new Set(),
      (where) => audit(where), (line) => t.diagnostic(line));
  }
  t.diagnostic(`screens and layers read: ${read}`);
  for (const line of found) t.diagnostic(line);
  assert.ok(read >= MODES.length * screens.length + 20, `the walk reached the layers (${read})`);
  assert.deepEqual(found, [], "a mark, an icon, a font size, a corner or a row of buttons is out of order");
});
