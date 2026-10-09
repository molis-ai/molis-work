import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// Frontend flow walk V-4 (docs: specs/repository-anti-corruption/frontend-flow-walk.md): on a phone, the Todo view tabs scroll
// and bring the chosen one fully into view, and a Goals row keeps to the screen instead of running off its right edge.
test("390px: Todo reveals the chosen view tab, and Goals rows do not run past the screen", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded");
  if (!b) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);

  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo` }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'todo' && document.querySelector('[data-todo-loading]')?.hidden", 20_000);
  const inside = () => evaluate<{ left: number; right: number }>(`(() => { const strip = document.querySelector('.todo-views').getBoundingClientRect(), tab = document.querySelector('[data-todo-view="closed"]').getBoundingClientRect();
    return { left: Math.round(tab.left - strip.left), right: Math.round(strip.right - tab.right) }; })()`);
  assert.ok((await inside()).right < 0, "the last tab starts out beyond the strip's edge, so there is something to reveal");
  // A script click does not scroll by itself: the page has to bring the chosen tab into view.
  await evaluate("document.querySelector('[data-todo-view=\"closed\"]').click()");
  await waitFor("document.querySelector('[data-todo-view=\"closed\"]').getAttribute('aria-pressed') === 'true'", 10_000);
  const revealed = await inside();
  assert.ok(revealed.left >= 0 && revealed.right >= 0, `the chosen tab is fully inside its strip: ${JSON.stringify(revealed)}`);

  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=goals` }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'goal' && Boolean(document.querySelector('.goal-stage-list .tree-entry'))", 20_000);
  const rows = await evaluate<{ scroll: number; client: number; overrun: string[] }>(`(() => { const list = document.querySelector('.goal-stage-list'), edge = list.getBoundingClientRect().right;
    const overrun = [...list.querySelectorAll('.tree-entry')].flatMap(entry => [...entry.children].filter(child => getComputedStyle(child).display !== 'none' && child.getBoundingClientRect().width > 0
      && child.getBoundingClientRect().right > edge + 1).map(child => child.className)); return { scroll: list.scrollWidth, client: list.clientWidth, overrun: [...new Set(overrun)] }; })()`);
  assert.deepEqual(rows.overrun, [], "no column of a Goal row runs past the list's edge");
  assert.ok(rows.scroll <= rows.client + 1, `the Goals list does not scroll sideways: ${rows.scroll} > ${rows.client}`);
});
