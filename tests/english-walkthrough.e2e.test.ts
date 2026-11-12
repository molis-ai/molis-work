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
  const projectPath = `/projects/${projectId}/`;
  const project = `${origin}${projectPath}?openPlugin=goals`;
  const fallback = encodeURIComponent(projectPath + "?settings=appearance");
  await navigate(() => command("Page.navigate", { url: project }, sessionId));
  await waitFor("document.readyState === 'complete' && document.querySelector('[data-layout-open]')", 20_000);
  await click("[data-layout-open]");
  await click("[data-layout-split=right]");
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  const paneSelector = "[data-tab-pane]", settings = "[data-appearance-settings]";
  const choices = "[data-ui-language-options] a";
  for (const [tag, htmlLang, name, previousLang] of [["en", "en", "English", "zh-CN"], ["zh", "zh-CN", "简体中文", "en"]] as const) {
    await navigate(() => command("Page.navigate", { url: `${origin}/settings/appearance?project=${projectId}` }, sessionId));
    const control = `${choices}[data-ui-language=${tag}]`;
    await waitFor(`document.body.dataset.desktopSurface === 'settings' && document.querySelector('${settings}')
      && document.querySelector('${control}') && document.querySelectorAll('${paneSelector}').length === 2`, 20_000);
    const where = await evaluate<string>("location.pathname + location.search");
    assert.equal(await evaluate("document.documentElement.lang"), previousLang);
    const option = await evaluate(`(() => {
      const link = document.querySelector('${control}');
      return { name: link.textContent.trim(), lang: link.getAttribute('lang'), href: link.getAttribute('href') };
    })()`);
    assert.deepEqual(option, { name, lang: htmlLang, href: `/locale?lang=${tag}&next=${fallback}` });

    await evaluate(`window.splitLanguageBefore = {
      body: document.body, settings: document.querySelector('${settings}'), panes: [...document.querySelectorAll('${paneSelector}')]
    }`);
    await click(control);
    await waitFor(`document.documentElement.lang === '${htmlLang}' && document.querySelector('${control}')?.getAttribute('aria-current') === 'true'`, 20_000);
    assert.equal(await evaluate("location.pathname + location.search"), where, "Settings stays open where the switch was made");
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('${choices}[aria-current=true]')].map(link => [link.dataset.uiLanguage, link.lang])`), [[tag, htmlLang]]);
    assert.deepEqual(await evaluate(`(() => {
      const before = window.splitLanguageBefore, panes = [...document.querySelectorAll('${paneSelector}')];
      return {
        body: document.body === before?.body,
        settings: document.body.dataset.desktopSurface === 'settings' && document.querySelector('${settings}') === before?.settings,
        panes: panes.length === 2 && panes.every((pane, i) => pane === before?.panes[i]),
      };
    })()`), { body: true, settings: true, panes: true }, `${tag}: Settings and both panes stay mounted`);

    await navigate(() => command("Page.navigate", { url: project }, sessionId));
    await waitFor(`location.pathname === '${projectPath}' && document.documentElement.lang === '${htmlLang}'
      && document.querySelectorAll('${paneSelector}').length === 2`, 20_000);
    await pause(800);
    assert.equal(await evaluate(`document.querySelectorAll('${paneSelector}').length`), 2, `${tag}: the project still has both panes`);
    const layout = (await layoutFindings(evaluate)).filter((finding) => finding.kind !== "tiny-target");
    const spills = (await evaluate<TextWrapIssue[]>(TEXT_WRAP_AUDIT)).filter((issue) => issue.kind === "spill");
    assert.deepEqual([...layout, ...spills], [], `${tag}: the split window fits after the switch`);
    t.diagnostic(`${name} (${htmlLang}): Settings and both panes stayed mounted, and the returned project layout fits`);
  }
});
