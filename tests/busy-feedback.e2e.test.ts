import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";

// specs/visual-ui-experience VUX-31 (§feedback-lifecycle, Skeleton Geometry): a quick load never flashes a waiting mark, and
// a slow one shows it in time. Every frame is sampled for a visible spinner, skeleton or dimmed busy region while each plugin
// opens (twice round) and Files and Git refresh. Before, Todo's skeleton showed for 3 frames on its first open, and the
// Files and Git refresh spinners for 1 to 4 frames on every open and refresh; marks now wait 250ms (`.mw-loading`'s rule).
// A refresh held back in Chrome (a real request) keeps the button's label at first and shows the spinner after the wait.

const SAMPLE = `window.__marks = []; (() => { const seen = (el) => { if (!el.isConnected) return false; const box = el.getBoundingClientRect(); if (!box.width || !box.height || box.bottom <= 0 || box.top >= innerHeight) return false;
    for (let node = el; node; node = node.parentElement) { const style = getComputedStyle(node); if (style.display === 'none' || +style.opacity < 0.05 || (node === el && style.visibility !== 'visible')) return false; } return true; };
  const name = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : '');
  const frame = () => { const now = [];
    for (const el of document.querySelectorAll('.mw-spinner, .mw-skeleton')) if (seen(el)) now.push(name(el));
    for (const el of document.querySelectorAll('[aria-busy=true]')) if (seen(el)) for (const part of [el, ...el.children]) if (seen(part) && +getComputedStyle(part).opacity < 0.95) { now.push('dim ' + name(part)); break; }
    if (now.length) window.__marks.push(now.join(', ')); requestAnimationFrame(frame); }; requestAnimationFrame(frame); })();`;
const ORDER = ["todo", "pages", "coding", "ppt", "workflows", "feed", "goals", "issues", "im", "shelf", "lingguang", "form", "jelly", "files", "git", "home"];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("VUX-31: quick loads never flash a waiting mark, and a slow refresh shows its spinner after the wait", { timeout: 300_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await command("Page.bringToFront", {}, sessionId);
  await waitFor("document.readyState === 'complete' && typeof molisWorkOpenPlugin === 'function'", 20_000);
  await pause(1_500);
  await evaluate(SAMPLE);
  const flashes: string[] = [];
  const watch = async (label: string, run: string) => {
    await evaluate("window.__marks.length = 0"); await evaluate(run); await pause(1_500);
    const marks = await evaluate<string[]>("window.__marks");
    if (marks.length) flashes.push(`${label}: ${[...new Set(marks)].join(" / ")} (${marks.length} frames)`);
  };
  for (const round of [1, 2]) for (const id of ORDER) await watch(`open ${id} (round ${round})`, `molisWorkOpenPlugin(${JSON.stringify(id)})`);
  for (const id of ["files", "git"]) {
    await evaluate(`molisWorkOpenPlugin(${JSON.stringify(id)})`); await waitFor(`!document.querySelector('[data-${id}-refresh]').disabled`, 15_000);
    await watch(`${id} refresh`, `document.querySelector('[data-${id}-refresh]').click()`);
  }
  assert.deepEqual(flashes, [], "a quick load showed a waiting mark");

  // Slow: the refresh's read is held.
  await evaluate("molisWorkOpenPlugin('files')"); await waitFor("!document.querySelector('[data-files-refresh]').disabled", 15_000);
  const barrier = await sendBarrier(browser as never, [{ urlPattern: "*files/state*", requestStage: "Request" }]);
  const parts = `(() => { const button = document.querySelector('[data-files-refresh]'), opacity = (el) => getComputedStyle(el).visibility === 'visible' ? +getComputedStyle(el).opacity : 0;
    return { busy: button.hasAttribute('data-loading'), label: opacity(button.querySelector(':scope > :not(.mw-spinner)')), spinner: button.querySelector('.mw-spinner').hidden ? 0 : opacity(button.querySelector('.mw-spinner')) }; })()`;
  await evaluate("document.querySelector('[data-files-refresh]').click()"); const held = await barrier.next();
  await pause(60);
  const early = await evaluate<{ busy: boolean; label: number; spinner: number }>(parts);
  assert.deepEqual(early, { busy: true, label: 1, spinner: 0 }, "just after the click the label stays and no spinner shows");
  await pause(700);
  const late = await evaluate<{ busy: boolean; label: number; spinner: number }>(parts);
  assert.deepEqual(late, { busy: true, label: 0, spinner: 1 }, "past the wait the spinner shows in the label's place");
  await barrier.release(held); await barrier.close();
  await waitFor("!document.querySelector('[data-files-refresh]').hasAttribute('data-loading')", 15_000);
  assert.deepEqual(await evaluate(parts), { busy: false, label: 1, spinner: 0 }, "when the read answers the label comes back at once");
});
