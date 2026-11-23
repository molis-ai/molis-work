import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { pluginFrameBrowser } from "./plugin-frame-browser.js";
import { openGoalBrowser } from "./goal-browser.js";
import { ORDER_SKIP, orderAudit } from "./order-audit.js";
import { walkLayers } from "./layer-walk.js";
import { TITLES, seedLongChinese, writeLongChinese } from "./chinese-walk.js";

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

const MODES = {
  light: { name: "light", width: 1440, height: 900, dark: false, touch: false },
  dark: { name: "dark", width: 1440, height: 900, dark: true, touch: false },
  phone: { name: "phone", width: 390, height: 844, dark: false, touch: true },
};

export async function auditVisualOrderDetails(t: TestContext, modeName: keyof typeof MODES, scope: "screens" | "layers" = "screens") {
  const browser = await openGoalBrowser(t, "seeded", seedLongChinese); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const views = Object.fromEntries(await Promise.all([...DETAILS.filter(id=>id!=="goals"), "shelf"].map(async id=>
    [id,await pluginFrameBrowser(t,browser,id,id === "shelf" ? '[data-side-body="plugin:shelf/side"] iframe' : undefined)])));
  const content = async (path: string) => {
    const id = new URL(path,origin).searchParams.get("openPlugin"), child = id ? views[id] : undefined;
    if (!child) return null; await child.waitFor("document.querySelector('[data-work-surface]')"); return child;
  };
  await browser.setViewport(1440, 900);
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
  const audit = async (where: string, inspect = evaluate) => {
    const { findings } = await inspect<{ findings: Array<Record<string, unknown>> }>(orderAudit(ORDER_SKIP));
    read++;
    for (const finding of findings) found.push(`${where}: ${JSON.stringify(finding)}`);
  };
  const mode = MODES[modeName];
  await browser.setViewport(mode.width, mode.height, mode.touch);
  await command("Emulation.setTouchEmulationEnabled", mode.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" },
    { name: "prefers-color-scheme", value: mode.dark ? "dark" : "light" }, { name: "pointer", value: mode.touch ? "coarse" : "fine" }] }, sessionId);
  if (scope === "layers") {
    await walkLayers({ ...browser, content }, screens.map(([where, path]): [string, string] => [`${mode.name} ${where}`, path]),
      TITLES.map((title) => title.slice(0, 10)), new Set(), audit, (line) => t.diagnostic(line));
    // Each of the three screen modes also reads at least four project settings pages.
    assert.ok(read >= 8, `the walk reached the layers (${read})`);
  } else {
    for (const [where, path] of screens) {
      await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
      await command("Page.bringToFront", {}, sessionId);
      await waitFor(LOADED, 20_000).catch(() => undefined);
      await pause(1200);
      await audit(`${mode.name} ${where}`);
      const child=await content(path); if(child) await audit(`${mode.name} ${where} content`,child.evaluate);
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
    assert.ok(read >= screens.length + projectSections.length, `the walk reached the screens (${read})`);
  }
  t.diagnostic(`screens and layers read: ${read}`);
  for (const line of found) t.diagnostic(line);
  assert.deepEqual(found, [], "a mark, an icon, a font size, a corner or a row of buttons is out of order");
}
