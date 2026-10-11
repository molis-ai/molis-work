import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";
import { ISSUE_FRAME, issueView, type IssueBrowser } from "./fixtures/issue-browser.js";

const entry = "[data-side-plugin-open]";
const open = "document.body.dataset.sideOpen === 'true'", closed = "document.body.dataset.sideOpen === 'false'";

/** The page and the panel side by side (or stacked on a phone), nothing cut off, the entry still clickable. */
async function beside(b: IssueBrowser, width: number, name: string) {
  const v = issueView(b, "issue-global-navigation");
  await v.viewport(width, width < 600 ? 844 : 900); await b.waitFor(open);
  await v.shot(`${name}-${width}`);
  const geometry = await b.evaluate<Record<string, boolean>>(`(() => {
    const main = document.querySelector('[data-plugin-stage]').getBoundingClientRect(), panel = document.querySelector('[data-side-panel]').getBoundingClientRect();
    const button = document.querySelector(${JSON.stringify(entry)}), box = button.getBoundingClientRect();
    return { visible: main.width > 200 && main.height > 100 && panel.height > 200, separate: innerWidth > 760 ? main.right <= panel.left : main.bottom <= panel.top,
      clickable: button.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)), fits: document.documentElement.scrollWidth <= innerWidth };
  })()`);
  assert.deepEqual(geometry, { visible: true, separate: true, clickable: true, fits: true }, `${name} at ${width}`);
  assert.equal(await v.ask("d.documentElement.scrollWidth <= d.documentElement.clientWidth"), true, `${name} panel content fits at ${width}`);
}

test("ISSUE-35 in a project the chord and the button summon Issue from the page and from inside other frames, and put it away from inside", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  await issueModel(t, b.homeDirectory);
  const v = issueView(b, "issue-global-navigation");
  await v.viewport(1440); await v.go(`/projects/${b.projectId}/?desktop=1`);
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(entry)}).getAttribute('aria-keyshortcuts')`), "Meta+Shift+I");
  assert.match(await b.evaluate<string>(`document.querySelector(${JSON.stringify(entry)}).title`), /Issue (⌘⇧I|Ctrl\+Shift\+I)/);
  await b.waitFor(`'loaded' in (document.querySelector(${JSON.stringify(ISSUE_FRAME)})?.dataset ?? {})`, 10_000);
  const url = await b.evaluate<string>("location.href");
  await v.chord(); await b.waitFor(open); await v.composerFocused();
  assert.equal(await b.evaluate("location.href"), url, "the work stays where it was");
  await beside(b, 1440, "project");
  // From inside the tool the chord puts it away and the keyboard goes back to the page.
  await v.chord(); await b.waitFor(closed);
  assert.equal(await b.evaluate("document.querySelector('[data-side-panel]').contains(document.activeElement)"), false);
  // The button is a switch, and it brings the keyboard along.
  await b.click(entry); await b.waitFor(open); await v.composerFocused();
  await v.type("项目页里写了一半");
  await b.click(entry); await b.waitFor(closed);
  // Pressed while the keyboard is inside another side view's frame, the chord still reaches the shell.
  const other = await b.evaluate<string | null>("document.querySelector('[data-side-tab^=\"plugin:\"]:not([data-side-keys])')?.dataset.sideTab ?? null");
  assert.ok(other, "a project offers another plugin side view to type in");
  {
    await b.evaluate(`document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'plugin', view: ${JSON.stringify(other.slice(7))} }, cancelable: true }))`);
    await b.waitFor(`document.querySelector('[data-side-body="${other}"] iframe')?.contentDocument?.readyState === 'complete' && 'loaded' in document.querySelector('[data-side-body="${other}"] iframe').dataset`, 15_000);
    await b.evaluate(`document.querySelector('[data-side-body="${other}"] iframe').focus()`);
    await v.chord();
    await b.waitFor(`document.querySelector('[data-side-tab="plugin:issues/capture"]').getAttribute('aria-selected') === 'true'`);
    await v.composerFocused();
  }
  assert.equal(await v.ask("$('[data-issue-composer] [name=description]').value"), "项目页里写了一半", "the draft was kept while closed");
  for (const width of [1024, 390, 320]) await beside(b, width, "project");
});

test("ISSUE-31 ISSUE-35 on Home the draft survives closing and a full navigation, and Escape closes from the composer", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  const v = issueView(b, "issue-global-navigation");
  await v.viewport(1440); await v.go("/");
  await b.click(entry); await b.waitFor(open); await v.composerFocused();
  await beside(b, 1440, "home");
  await v.type("首页写到一半，");
  await v.escape(); await b.waitFor(closed);
  assert.equal(await b.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(entry)})`), true, "focus returns to what opened it");
  // Writing is kept on this device until it is sent, across pages that each have their own panel.
  await v.go(`/projects/${b.projectId}/?desktop=1`);
  await v.chord(); await b.waitFor(open); await v.composerFocused();
  assert.equal(await v.ask("$('[data-issue-composer] [name=description]').value"), "首页写到一半，");
  await v.go("/"); await v.chord(); await b.waitFor(open); await v.composerFocused();
  await v.type("接着写"); await v.go("/"); await v.chord(); await b.waitFor(open); await v.composerFocused();
  assert.equal(await v.ask("$('[data-issue-composer] [name=description]').value"), "首页写到一半，接着写");
  for (const width of [1024, 390, 320]) await beside(b, width, "home");
});
