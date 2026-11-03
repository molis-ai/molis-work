import { pluginSurfaceClients } from "@molis-ai/molis-work-app-workbench";
import assert from "node:assert/strict";
import test from "node:test";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { walkLayers } from "./fixtures/layer-walk.js";
import { TITLES, WIDTHS, chineseFindings, seedLongChinese, writeLongChinese } from "./fixtures/chinese-walk.js";

// specs/visual-ui-experience VUX-40 in Chinese, with VUX-04 and VUX-05: tests/chinese-walkthrough walks the project page,
// every plugin and the detail views with what a person writes in Chinese, long from the start (tests/fixtures/chinese-walk).
// This walks what those screens open and what the walk did not reach, with the same names and the same audits, at 1440,
// 820 and 390 px: every menu, popover and dialog the project page and each plugin open (a more menu, a filter, the plugin
// picker, the project switcher; a create, rename, delete or confirm dialog, also when it is opened from a menu), every page
// of Settings and of the project's settings, and the Goal canvas and kanban. A layer is read alone (`data-audit-scope`);
// a page is read whole.

const SURFACES = ["project", "todo", "pages", "coding", "ppt", "workflows", "feed", "goals", "issues", "im", "shelf", "lingguang", "form", "jelly", "files", "git"];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const evidence = reviewEvidenceUrl("visual-ui-experience/chinese-layers/");

test("VUX-40 (Chinese): every menu, popover and dialog of the project page and every plugin fits long Chinese names at 1440, 820 and 390 px", { timeout: 3_600_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded", seedLongChinese); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const views = Object.fromEntries(await Promise.all(SURFACES.filter(id=>id === "shelf" || pluginSurfaceClients().some(client=>client.id === id)).map(async id=>
    [id,await pluginFrameBrowser(t,browser,id,id === "shelf" ? '[data-side-body="plugin:shelf/side"] iframe' : undefined)])));
  const content = async (path: string) => {
    const id = new URL(path, origin).searchParams.get("openPlugin");
    const child = id ? views[id] : undefined; if (!child) return null;
    await child.waitFor("document.querySelector('[data-work-surface]')"); return child;
  };
  await browser.setViewport(1440, 900);
  // A layer is read where it comes to rest, not while it grows in.
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=zh&next=%2F` }, sessionId));
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.readyState === 'complete' && typeof globalThis.molisWorkControlHeaders === 'function'", 20_000);
  const opened = await writeLongChinese(evaluate, projectId!);
  await mkdir(evidence, { recursive: true });

  const found: string[] = [];
  const native: string[] = [];
  let read = 0;
  const audit = async (where: string, inspect = evaluate) => {
    const all = await chineseFindings(inspect);
    read++;
    for (const finding of all) found.push(`${where}: ${JSON.stringify(finding)}`);
    t.diagnostic(`${where}: ${all.length}`);
    if (all.length) {
      const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(new URL(`${where.replace(/[^\w一-鿿]+/g, "-").slice(0, 80)}.png`, evidence), Buffer.from(shot.data, "base64"));
    }
  };
  const names = TITLES.map((title) => title.slice(0, 10));
  for (const size of WIDTHS) {
    await browser.setViewport(size.width, size.height, size.touch);
    // Each plugin, and the detail view of what was made first in it (its long name heads the view).
    const screens = [...SURFACES, ...SURFACES.filter((id) => opened[id]).map((id) => `${id}:open`)].map((surface): [string, string] => {
      const [id, item] = surface.split(":");
      return [`${size.width} ${surface}`, `/projects/${projectId}/${id === "project" ? "" : `?openPlugin=${id}${item ? `&openItem=${encodeURIComponent(opened[id]!)}` : ""}`}`];
    });
    native.push(...await walkLayers({...browser,content}, screens, names, new Set(), audit, (line) => t.diagnostic(line)));
  }
  await writeFile(new URL("findings.json", evidence), JSON.stringify({ read, found, native }, null, 2));
  t.diagnostic(`layers read: ${read}; a browser's own dialog: ${native.join(", ") || "none"}`);
  assert.ok(read >= WIDTHS.length * 30, `the walk reached the layers (${read})`);
  assert.deepEqual(found, []);
});

test("VUX-40 (Chinese): every page of Settings and of the project's settings, and the Goal canvas and kanban, fit long Chinese names at 1440, 820 and 390 px", { timeout: 1_800_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded", seedLongChinese); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  await browser.setViewport(1440, 900);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=zh&next=%2F` }, sessionId));
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.readyState === 'complete' && typeof globalThis.molisWorkControlHeaders === 'function'", 20_000);
  await writeLongChinese(evaluate, projectId!);
  await mkdir(evidence, { recursive: true });
  const open = async (path: string) => {
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    await command("Page.bringToFront", {}, sessionId);
    await waitFor("document.readyState === 'complete'", 20_000);
  };
  const found: string[] = [];
  let read = 0;
  const audit = async (where: string, expected: (finding: Record<string, unknown>) => boolean = () => false) => {
    const all = (await chineseFindings(evaluate) as Record<string, unknown>[]).filter((finding) => !expected(finding));
    read++;
    for (const finding of all) found.push(`${where}: ${JSON.stringify(finding)}`);
    t.diagnostic(`${where}: ${all.length}`);
    if (all.length) {
      const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(new URL(`${where.replace(/[^\w一-鿿]+/g, "-").slice(0, 80)}.png`, evidence), Buffer.from(shot.data, "base64"));
    }
  };
  const LOADED = "document.readyState === 'complete' && ![...document.querySelectorAll('[data-settings-panel] .mw-loading, [data-settings-loading]:not(.mw-empty--error)')].some((node) => node.checkVisibility())";
  let sections = 0;
  for (const size of WIDTHS) {
    await browser.setViewport(size.width, size.height, size.touch);
    // Every page of the two settings directories, the person's (系统设置) and the project's (项目设置), as the workbench shows them.
    for (const kind of ["settings", "project-settings"]) {
      await open(`/projects/${projectId}/?openPlugin=${kind}`);
      await waitFor(`document.querySelector('[data-directory-panel=${kind}] [data-settings-section]')`, 20_000);
      for (const section of await evaluate<string[]>(`[...document.querySelectorAll('[data-directory-panel=${kind}] [data-settings-section]')].map((row) => row.dataset.settingsSection)`)) {
        await evaluate(`document.querySelector('[data-directory-panel=${kind}] [data-settings-section=${JSON.stringify(section)}]').click()`);
        await pause(400);
        await waitFor(LOADED, 20_000).catch(() => undefined);
        await pause(600);
        sections++;
        if (await evaluate("[...document.querySelectorAll('.mw-empty--error[data-settings-loading]')].some((node) => node.checkVisibility())")) found.push(`${size.width} ${kind} ${section}: did not load`);
        t.diagnostic(await evaluate<string>(`(document.querySelector('[data-work-surface=${kind}]')?.innerText || 'none').replace(/\\s+/g, ' ').slice(0, 120)`));
        await audit(`${size.width} ${kind} ${section}`);
      }
    }
    for (const view of ["canvas", "kanban"]) {
      await open(`/projects/${projectId}/?openPlugin=goals`);
      await waitFor("document.querySelector('[data-board-view-tab=canvas]')", 20_000);
      await evaluate(`document.querySelector('[data-board-view-tab=${view}]').click()`);
      await waitFor(`document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === '${view}'`, 20_000);
      await pause(800);
      // The canvas is a map that pans: what lies past its edge is reached by moving it. It is read with every Goal in view;
      // the map itself is the surface the floating toolbar and zoom sit on, and hides what is past its edge on purpose.
      if (view === "canvas") { await evaluate("document.querySelector('[data-graph-zoom=fit]').click()"); await pause(600); }
      await audit(`${size.width} goals ${view}`, (finding) => view === "canvas" && /^div\.goal-canvas-viewport/.test(String(finding.a)) && /^(overlap|silent-clip)$/.test(String(finding.kind)));
    }
  }
  await writeFile(new URL("settings-findings.json", evidence), JSON.stringify({ read, found }, null, 2));
  assert.equal(read, WIDTHS.length * 2 + sections);
  assert.ok(sections >= WIDTHS.length * 16, `both settings directories were read (${sections})`);
  assert.deepEqual(found, []);
});
