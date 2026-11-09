import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import type { SurfaceHomeDisplay } from "@molis-ai/molis-work-app-workbench";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

const home = '[data-work-surface="home"]';
const goals = '[data-home-card="io.molis.work.goals"]';
const start = goals + ' [data-home-control$=":start:0"]';
const row = goals + ' [data-home-row]';
const title = row + ' .mw-presentation__row-title';
const endpoint = "/api/host/surface-home";

test("IUI-21 IUI-26 SCS-11 WBR-21: the project home opens Goals’ original form and renders real rows at twelve settings", { timeout: 150_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null);
  if (!b) return;
  const project = await createProject(b.web, "Home journey"), prefix = "/projects/" + project.project_id;
  const go = (query = "") => b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/" + query }, b.sessionId));
  const painted = () => b.waitFor(`document.querySelector(${JSON.stringify(goals)}) && !document.querySelector(${JSON.stringify(home)}).hidden`, 15_000);
  const rows = async () => (await b.web.post<SurfaceHomeDisplay>(prefix + endpoint, {})).display.rows.filter(item => item.owner === "io.molis.work.goals");
  await go();
  await painted();
  assert.equal((await rows()).length, 0);
  await b.click(start);
  await b.waitFor("document.querySelector('[data-create-dialog]').open");
  await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, b.sessionId);
  await b.waitFor("!document.querySelector('[data-create-dialog]').open");
  assert.equal((await rows()).length, 0, "opening and cancelling the real form write no Goal");
  await b.click('[data-dock-pin="home"]');
  await painted();
  await b.click(start);
  await b.waitFor("document.querySelector('[data-create-dialog]').open");
  await b.evaluate(`(() => {
    const form = document.querySelector('[data-create-form]');
    form.elements.title.value = 'Homepage object · a long title with real values';
    form.elements.title.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await b.navigate(() => b.click('[data-create-form] [type="submit"]'));
  assert.match(await b.evaluate<string>("location.pathname"), /\/goals\//u);
  assert.equal((await rows()).length, 1, "one submit creates one Goal");
  await b.click('[data-dock-pin="home"]');
  await painted();

  // Take the actual Tab stop, then use the real browser keyboard, not a direct DOM click or focus on the dialog.
  await b.evaluate(`document.querySelector(${JSON.stringify(goals + ' h3')}).setAttribute('tabindex','-1');document.querySelector(${JSON.stringify(goals + ' h3')}).focus()`);
  const key = async (name: string, code: number) => {
    await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: name, code: name, windowsVirtualKeyCode: code }, b.sessionId);
    await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name, windowsVirtualKeyCode: code }, b.sessionId);
  };
  await key("Tab", 9);
  assert.equal(await b.evaluate(`document.activeElement.matches(${JSON.stringify(title)})`), true);
  await key("Enter", 13);
  await b.waitFor("document.querySelector('[data-home-peek]').open && document.activeElement.matches('[data-home-close]')");
  await key("Tab", 9);
  assert.equal(await b.evaluate("document.activeElement.closest('[data-home-peek]') !== null"), true);
  await key("Escape", 27);
  await b.waitFor(`!document.querySelector('[data-home-peek]').open && document.activeElement.matches(${JSON.stringify(title)})`);

  for (const width of [1440, 1024, 390]) for (const lang of ["zh", "en"]) for (const theme of ["light", "dark"]) {
    await b.setViewport(width, 900, width === 390);
    await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, b.sessionId);
    await b.command("Network.setCookie", { name: "molis_work_locale", value: lang, url: b.origin }, b.sessionId);
    await go();
    await painted();
    const sample = await b.evaluate<{ words: string; content: string; theme: string; overflow: boolean }>(`(() => {
      const box = document.querySelector(${JSON.stringify(home)}), mark = box.querySelector(${JSON.stringify(row + ' .mw-status')});
      const grid = box.querySelector('.home-plugin-cards');
      return { words: mark?.textContent || '', content: box.innerText, theme: document.documentElement.dataset.resolvedTheme,
        overflow: grid.scrollWidth > grid.clientWidth + 1 };
    })()`);
    assert.ok(sample.content.includes("Homepage object"), width + "/" + lang + "/" + theme);
    assert.equal(sample.theme, theme);
    assert.equal(sample.overflow, false);
    assert.match(sample.words, lang === "zh" ? /进行中/ : /In progress/);
    assert.doesNotMatch(sample.content, /(?:接着做|Pick up where you left off|当天的事件|Today’s events)/u);
    if (width === 1440 && lang === "zh" && theme === "light" || width === 390 && lang === "en" && theme === "dark") {
      const captures = reviewEvidenceUrl("surface-home-consumers/");
      await mkdir(captures, { recursive: true });
      const shot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, b.sessionId);
      await writeFile(new URL(`home-${width}-${lang}-${theme}.png`, captures), Buffer.from(shot.data, "base64"));
    }
  }
});
