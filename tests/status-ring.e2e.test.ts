import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("RING-01 RING-02 RING-03 RING-04 RING-05 catalog, lifecycle, Goals and Home plugin states", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#status-ring` }, sessionId));
  await waitFor("document.querySelector('#status-ring [data-ring-choice]')");
  const choose = async (state: string) => {
    await evaluate(`document.querySelector('[data-ring-choice="${state}"]').click()`);
    await waitFor(`document.querySelector('.mw-ring-catalog__hero svg').dataset.mwState === '${state}'`);
    await evaluate("document.querySelector('.mw-ring-catalog__preview').scrollIntoView({ block: 'center' })");
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  };
  const changing = () => evaluate(`(async () => {
    const ring = document.querySelector('.mw-ring-catalog__hero svg');
    const a = ring.querySelector('[data-ring-segments]').innerHTML;
    await new Promise(resolve => setTimeout(resolve, 220));
    return a !== ring.querySelector('[data-ring-segments]').innerHTML;
  })()`);
  await choose("running");
  await waitFor("document.querySelector('.mw-ring-catalog__hero svg').dataset.ringFamily === 'running'");
  assert.equal(await changing(), true, "actual execution animates");
  await choose("doing");
  await evaluate("new Promise(resolve => setTimeout(resolve, 750))");
  assert.equal(await changing(), false, "ordinary work in progress has no pretend execution");
  await choose("verify");
  await waitFor("document.querySelector('.mw-ring-catalog__hero [data-ring-core]').getAttribute('d').startsWith('M12 8.8')");
  await choose("interrupted");
  assert.equal(await evaluate("document.querySelector('.mw-ring-catalog__hero [data-ring-core]').getAttribute('d')"), "");
  assert.equal(await evaluate("document.querySelectorAll('.mw-ring-catalog__hero [data-ring-tone=danger]').length"), 0);
  await choose("running");
  await evaluate("document.querySelector('.mw-ring-catalog__preview').hidden = true");
  await evaluate("new Promise(resolve => setTimeout(resolve, 80))");
  assert.equal(await changing(), false, "hidden ancestors suspend the animation");
  await evaluate("document.querySelector('.mw-ring-catalog__preview').hidden = false");
  await evaluate("new Promise(resolve => setTimeout(resolve, 80))");
  assert.equal(await changing(), true, "visibility resumes from retained state");
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await evaluate("new Promise(resolve => setTimeout(resolve, 80))");
  assert.equal(await changing(), false, "reduced motion removes continuing movement");
  await evaluate(`(() => {
    const holder = document.createElement('span'); holder.id = 'ring-repaint'; holder.dataset.mwState = 'saving';
    holder.textContent = '保存中'; document.querySelector('.mw-ring-catalog__preview').append(holder);
  })()`);
  await waitFor("document.querySelector('#ring-repaint svg')");
  await evaluate("document.querySelector('#ring-repaint').textContent = '已保存'; document.querySelector('#ring-repaint').dataset.mwState = 'saved'");
  await waitFor("document.querySelector('#ring-repaint svg')?.dataset.mwState === 'saved'");
  assert.equal(await evaluate("document.querySelector('#ring-repaint').textContent"), "已保存");
  await evaluate("document.querySelector('#ring-repaint').dataset.mwState = 'partial'; document.querySelector('#ring-repaint').dataset.ringProgress = '.25'");
  await waitFor("document.querySelectorAll('#ring-repaint [data-ring-segments] [data-ring-tone=success]').length === 3");
  await evaluate("document.querySelector('#ring-repaint').dataset.ringProgress = '.75'");
  await waitFor("document.querySelectorAll('#ring-repaint [data-ring-segments] [data-ring-tone=success]').length === 9");
  await evaluate("document.querySelector('#ring-repaint').remove()");
  await mkdir(new URL("../.impeccable/qa/review/status-ring-system/", import.meta.url), { recursive: true });
  for (const theme of ["light", "dark"]) {
    await evaluate(`document.documentElement.dataset.resolvedTheme = '${theme}'`);
    for (const width of [1440, 1024, 390]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
      await evaluate("document.getElementById('status-ring').scrollIntoView()");
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
      const picture = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(new URL(`../.impeccable/qa/review/status-ring-system/catalog-${theme}-${width}.png`, import.meta.url), Buffer.from(picture.data, "base64"));
    }
  }
  // RING-07: a pending full-page navigation mounts once and pageshow clears it.
  await evaluate(`(() => { const link = document.createElement('a'); link.href = location.origin + '/ring-navigation-probe'; link.id = 'ring-navigation-probe'; document.body.append(link);
    window.addEventListener('click', event => event.preventDefault(), { once: true }); link.click(); })()`);
  await waitFor("document.querySelector('.mw-navigation-loading .mw-state-ring')?.dataset.mwState === 'running'");
  assert.equal(await evaluate("document.querySelectorAll('.mw-navigation-loading').length"), 1);
  await evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); document.getElementById('ring-navigation-probe').remove()");
  await waitFor("!document.querySelector('.mw-navigation-loading') && !document.body.dataset.navigationPending");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${browser.projectId}` }, sessionId));
  await browser.showGoalStageList();
  await waitFor("document.querySelector('[data-goal-stage-list] .goal-status .mw-state-ring')");
  for (const [view, selector] of [["list", "[data-goal-stage-list]"], ["kanban", ".goal-kanban-card"], ["canvas", ".goal-canvas-node"]]) {
    await evaluate(`document.querySelector('[data-board-view-tab="${view}"]').click()`);
    await waitFor(`document.querySelector('${selector} .goal-status .mw-state-ring')?.checkVisibility({ visibilityProperty: true })`);
    if (view === "kanban") assert.equal(await evaluate("document.querySelectorAll('.goal-kanban-column summary .mw-state-ring').length"), 6);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('${selector} .goal-status'), '::before').content`), "none", "the ring replaces the old CSS dot");
    // RING-08: measure the actual business ring, including old view-specific CSS overrides.
    for (const width of [1440, 390]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
      const ringSelector = view === "kanban" && width === 390 ? `${selector} > .goal-kanban-status .mw-state-ring` : `${selector} .goal-status .mw-state-ring`;
      await waitFor(`document.querySelector('${ringSelector}')?.checkVisibility({ visibilityProperty: true })`);
      // The canvas retains its camera across window sizes; pan the measured node into view at normal zoom.
      if (view === "canvas") await evaluate(`(() => {
        const ring = document.querySelector('${ringSelector}'), node = ring.closest('[data-graph-node]').getBoundingClientRect();
        const viewport = document.querySelector('[data-graph-viewport]'), box = viewport.getBoundingClientRect();
        viewport.dispatchEvent(new WheelEvent('wheel', { deltaX: node.x + node.width / 2 - box.x - box.width / 2,
          deltaY: node.y + node.height / 2 - box.y - box.height / 2, bubbles: true, cancelable: true }));
      })()`);
      const size = await evaluate<{ width: number; height: number; diameter: number; stroke: number }>(`(() => {
        const ring = document.querySelector('${ringSelector}'), box = ring.getBoundingClientRect();
        return { width: box.width, height: box.height, diameter: ring.querySelector('[data-ring-segments]').getBBox().width * box.width / 24,
          stroke: parseFloat(getComputedStyle(ring.querySelector('[data-ring-segments] path')).strokeWidth) * box.width / 24 };
      })()`);
      assert.ok(size.width >= 20 && size.height >= 20 && size.diameter >= 15 && size.stroke >= 1.4, `${view} at ${width}: ${JSON.stringify(size)}`);
      assert.equal(await evaluate(`(() => { const box = document.querySelector('${ringSelector}').getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight; })()`), true, "the measured ring is in the visible window");
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
      const picture = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(new URL(`../.impeccable/qa/review/status-ring-system/goals-${view}-${width}.png`, import.meta.url), Buffer.from(picture.data, "base64"));
    }
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  }
  await navigate(() => command("Page.navigate", { url: `${origin}/plugins/issues` }, sessionId));
  await waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'");
  await navigate(() => browser.click('[data-home-lifecycle="disable"]'));
  await waitFor("document.querySelector('h1[data-mw-state=disabled] .mw-state-ring [data-ring-segments]')");
  assert.equal(await evaluate("document.querySelectorAll('h1[data-mw-state=disabled] [data-ring-segments] path').length"), 12);
  await navigate(() => browser.click('[data-home-lifecycle="enable"]'));
  await waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'");
});
