import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("Manage projects leaves a Coding session and returns from a responsive directory", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { origin, projectId, command, sessionId, navigate, evaluate, click, waitFor } = browser;
  for (const desktop of [false, true]) {
    await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" + (desktop ? "?desktop=1" : "") }, sessionId));
    await waitFor("document.body.classList.contains('immersive-workbench') && !!document.querySelector('[data-plugin-strip]')");
    await click('[data-plugin-strip] [data-plugin-id="coding"]');
    await waitFor("document.body.dataset.desktopSurface === 'coding'");
    await click('[data-coding-new]');
    await waitFor("!!document.querySelector('[data-coding-session][aria-current=\"true\"]')");
    const codingSessionId = await evaluate<string>("document.querySelector('[data-coding-session][aria-current=\"true\"]').dataset.codingSession");
    t.diagnostic("Coding session ready, desktop=" + desktop);
    const href = await evaluate<string>("document.querySelector('.bar-end .navigator-project-manage').getAttribute('href')");
    assert.equal(href, desktop ? "/?desktop=1" : "/");
    await navigate(() => click(".bar-end .navigator-project-manage"));
    t.diagnostic("manage projects navigated, desktop=" + desktop);
    await waitFor("document.body.classList.contains('project-index-page')");
    assert.equal(await evaluate("location.pathname"), "/");
    assert.equal(await evaluate("new URLSearchParams(location.search).get('desktop')"), desktop ? "1" : null);
    await click("[data-project-search]");
    await command("Input.insertText", { text: "no-match-12345" }, sessionId);
    await waitFor("!!document.querySelector('[data-project-search-empty]:not([hidden])')");
    assert.equal(await evaluate("document.querySelectorAll('[data-project-search-row]:not([hidden])').length"), 0);
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
    await waitFor("document.querySelector('[data-project-search]').value === ''");
    t.diagnostic("search responsive, desktop=" + desktop);
    await navigate(() => click(".project-card[href*='" + projectId + "']"));
    await waitFor("document.body.dataset.desktopSurface === 'coding' && !!document.querySelector('[data-coding-session][aria-current=\"true\"]')");
    assert.equal(await evaluate("document.querySelector('[data-coding-session][aria-current=\"true\"]').dataset.codingSession"), codingSessionId);
    t.diagnostic("returned to project, desktop=" + desktop);
  }
});
