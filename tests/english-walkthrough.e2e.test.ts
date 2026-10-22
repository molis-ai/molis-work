import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { layoutFindings } from "./fixtures/layout-audit.js";
import { TEXT_WRAP_AUDIT, type TextWrapIssue } from "./fixtures/text-wrap-audit.js";

// specs/visual-ui-experience VUX-40「真实页面验证英文长文案、数量与切换布局」: the project page and the twelve plugins are
// walked in both languages by tests/narrow-surfaces (VUX-30); this walks every section of Settings the same way, at a
// desktop width and a narrow one, and switches the language from Settings' own control while a split window is open.
// The English is longer: nothing runs out of its box, sits on something else or is cut off without a word, and after the
// switch the person is where they were, with the same panes. Which words are still Chinese in English is the language
// system's to finish (specs/font-and-skin-system §6, its 2026-10-21 notes); this checks the layout they get.

const SECTIONS = ["appearance", "assistant", "characters", "coding-settings", "connectors", "diagnostics", "functions", "general", "guidance",
  "mcp", "memory", "models", "planning", "projects", "prompts", "rules", "runtimes", "workspaces"];
const SIZES = [{ name: "desktop", width: 1440, height: 900 }, { name: "narrow", width: 480, height: 800 }];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("VUX-40: every section of Settings fits in English and in Chinese, at a desktop and a narrow width", { timeout: 900_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  const found: string[] = [];
  let audited = 0;
  for (const lang of ["zh", "en"]) for (const size of SIZES) {
    await command("Emulation.setDeviceMetricsOverride", { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=${lang}&next=%2F` }, sessionId));
    for (const section of SECTIONS) {
      await navigate(() => command("Page.navigate", { url: `${origin}/settings/${section}?project=${projectId}` }, sessionId));
      await command("Page.bringToFront", {}, sessionId);
      // Sections that read their rows after the page draws show 「正在读取…」 until they have them (a closed disclosure reads when opened).
      const where = `${lang} ${size.name} ${section}`;
      await waitFor("document.readyState === 'complete' && ![...document.querySelectorAll('[data-settings-panel] .mw-loading')].some((node) => node.checkVisibility())", 20_000)
        .catch(async () => { throw new Error(`${where} never finished reading: ${await evaluate<string>("[...document.querySelectorAll('[data-settings-panel] .mw-loading')].map(n => n.parentElement.outerHTML.slice(0, 400)).join(' || ')")}`); });
      await pause(500);
      const layout = (await layoutFindings(evaluate)).filter((finding) => finding.kind !== "tiny-target");
      const spills = (await evaluate<TextWrapIssue[]>(TEXT_WRAP_AUDIT)).filter((issue) => issue.kind === "spill");
      audited++;
      for (const finding of [...layout, ...spills]) found.push(`${where}: ${JSON.stringify(finding)}`);
      t.diagnostic(`${where}: ${layout.length + spills.length}`);
    }
  }
  assert.equal(audited, 2 * SIZES.length * SECTIONS.length);
  assert.deepEqual(found, []);
});

test("VUX-40: switching the language from Settings keeps the split window and lands back where the person was", { timeout: 240_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, click, navigate, command, sessionId, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const project = `${origin}/projects/${projectId}/?openPlugin=goals`;
  await navigate(() => command("Page.navigate", { url: project }, sessionId));
  await waitFor("document.readyState === 'complete' && document.querySelector('[data-titlebar-tabs] [data-tab-split], .tab-pane.is-focused [data-tab-split]')", 20_000);
  await click(".tab-pane.is-focused [data-tab-split], [data-titlebar-tabs] [data-tab-split]");
  await click("[data-layout-split=right]");
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  const panes = () => evaluate<string[]>("[...document.querySelectorAll('[data-tab-pane]')].map((pane) => pane.querySelector('[data-tab-id][aria-selected=true], [aria-selected=true]')?.textContent?.trim() || '')");
  const before = await panes();
  for (const [lang, word] of [["en", "English"], ["zh", "中文"]] as const) {
    await navigate(() => command("Page.navigate", { url: `${origin}/settings/appearance?project=${projectId}` }, sessionId));
    await waitFor("document.querySelector('.settings-segmented a[lang]')", 20_000);
    const where = await evaluate<string>("location.pathname + location.search");
    const href = await evaluate<string>(`[...document.querySelectorAll('.settings-segmented a[lang]')].find((a) => a.textContent === ${JSON.stringify(word)}).getAttribute('href')`);
    assert.match(href, /^\/locale\?lang=(en|zh)&next=/, "the control switches through the locale route");
    await navigate(() => command("Page.navigate", { url: origin + href }, sessionId));
    await waitFor(`document.documentElement.lang.startsWith(${JSON.stringify(lang)})`, 20_000);
    await waitFor("document.querySelector('.settings-segmented a[lang]')", 20_000);
    await waitFor("document.body.dataset.desktopSurface === 'settings'", 20_000);
    assert.equal(await evaluate("location.pathname + location.search"), where, "back on the page the switch was made from, with Settings still open on it");
    assert.equal(await evaluate("document.querySelector('.settings-segmented a[aria-current=true]').getAttribute('lang')"), lang);
    await navigate(() => command("Page.navigate", { url: project }, sessionId));
    await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2", 20_000);
    await pause(800);
    const now = await panes();
    assert.equal(now.length, before.length, `${lang}: the same two panes`);
    const layout = (await layoutFindings(evaluate)).filter((finding) => finding.kind !== "tiny-target");
    const spills = (await evaluate<TextWrapIssue[]>(TEXT_WRAP_AUDIT)).filter((issue) => issue.kind === "spill");
    assert.deepEqual([...layout, ...spills], [], `${lang}: the split window fits after the switch`);
  }
});
