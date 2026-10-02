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
    await waitFor("document.body.classList.contains('arrival-page') && !!document.querySelector('.chooser-dir [role=option]')");
    assert.equal(await evaluate("location.pathname"), "/");
    assert.equal(await evaluate("new URLSearchParams(location.search).get('desktop')"), desktop ? "1" : null);
    // The project just left is the one the chooser has ready: its row is selected and its way in is the bar's.
    assert.equal(await evaluate("document.querySelector('.chooser-dir [aria-selected=true]')?.dataset.id"), projectId);
    await click("#chooser-q");
    await command("Input.insertText", { text: "no-match-12345" }, sessionId);
    await waitFor("!!document.querySelector('#chooser-detail .brief-none')");
    assert.equal(await evaluate("document.querySelectorAll('.chooser-dir [role=option]:not([hidden])').length"), 0);
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
    await waitFor("document.getElementById('chooser-q').value === ''");
    await waitFor("document.querySelector('.chooser-dir [aria-selected=true]')?.dataset.id === " + JSON.stringify(projectId));
    t.diagnostic("search responsive, desktop=" + desktop);
    await navigate(() => click(".arrival-bar [data-act=enter]"));
    await waitFor("document.body.dataset.desktopSurface === 'coding' && !!document.querySelector('[data-coding-session][aria-current=\"true\"]')");
    assert.equal(await evaluate("document.querySelector('[data-coding-session][aria-current=\"true\"]').dataset.codingSession"), codingSessionId);
    t.diagnostic("returned to project, desktop=" + desktop);
  }
});
