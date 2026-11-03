import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-16 / VUX-21 (slice 85): a question that moves up or down, and one that goes, leave their
// neighbours easing from where they were to where they are (the page's molisReflow), not jumping; the move keeps focus
// on the button that was pressed, so the keyboard can keep moving the same question.
test("VUX-21: Forms questions ease into their new places when one moves or goes, and the moved question keeps focus", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const {evaluate, waitFor, click} = await pluginFrameBrowser(t, browser, "form");
  const { command, sessionId, navigate, origin, projectId } = browser;
  const idle = () => waitFor("document.querySelector('[data-form=workbench]').getAttribute('aria-busy') === 'false'");
  const saved = () => waitFor("['已保存','已发布'].includes(document.querySelector('[data-form-editor-status]').textContent)");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=form` }, sessionId));
  await browser.waitFor("document.body.dataset.desktopSurface === 'form'");
  await click("[data-form-new]"); await idle();
  for (const title of ["第一题", "第二题", "第三题"]) {
    await click("[data-form-add-question]"); await idle();
    await evaluate(`(()=>{const node=document.querySelector('[data-form-question]:last-child [data-question-title]');node.value=${JSON.stringify(title)};node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await saved();
  }
  const titles = () => evaluate<string[]>("[...document.querySelectorAll('[data-form-question] [data-question-title]')].map((node) => node.value)");
  // Automation keeps pages still; this test is about the motion, so it lets it run. Settle the arrivals, then move the
  // first question down.
  await evaluate("document.documentElement.removeAttribute('data-craft-still')");
  await evaluate("Promise.all(document.getAnimations().map((motion) => motion.finished.catch(() => {})))");
  const moved = await evaluate<{ order: string[]; eased: string[]; from: number; focused: boolean }>(`(() => {
    const first = document.querySelector('[data-form-question]'), button = first.querySelector('[data-question-move="1"]');
    const before = first.getBoundingClientRect().top;
    button.focus(); button.click();
    const eased = [...document.querySelectorAll('[data-form-question]')].filter((row) => row.getAnimations().some((motion) => motion.id === 'mw-reflow'))
      .map((row) => row.querySelector('[data-question-title]').value);
    // Where the moved question is seen on the first frame: still where it was, easing down from there.
    const from = first.getBoundingClientRect().top - before;
    return { order: [...document.querySelectorAll('[data-form-question] [data-question-title]')].map((node) => node.value), eased, from, focused: document.activeElement === button };
  })()`);
  assert.deepEqual(moved.order, ["第二题", "第一题", "第三题"]);
  assert.deepEqual(moved.eased.toSorted(), ["第一题", "第二题"], "the two questions that swapped ease; the third stays");
  assert.ok(Math.abs(moved.from) < 2, `the moved question starts where it was seen: ${moved.from}px`);
  assert.ok(moved.focused, "the pressed button keeps focus");
  await saved();
  assert.deepEqual(await titles(), ["第二题", "第一题", "第三题"]);
  // A question that goes: the one below closes up from where it was.
  await evaluate("Promise.all(document.getAnimations().map((motion) => motion.finished.catch(() => {})))");
  const closed = await evaluate<string[]>(`(() => {
    document.querySelector('[data-form-question] [data-question-remove]').click();
    return [...document.querySelectorAll('[data-form-question]')].filter((row) => row.getAnimations().some((motion) => motion.id === 'mw-reflow'))
      .map((row) => row.querySelector('[data-question-title]').value);
  })()`);
  assert.deepEqual(closed, ["第一题", "第三题"], "the questions below close the gap");
  await saved();
  assert.deepEqual(await titles(), ["第一题", "第三题"]);
});
