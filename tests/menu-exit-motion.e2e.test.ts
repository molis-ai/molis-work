import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type MenuFrame = { elapsed: number; opacity: number; visible: boolean; pointer: string; content: string; animations: unknown[] };

test("VUX-36 VUX-22 menus remain drawn while closing, open immediately, and leave ordinary disclosure height alone", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#motion` }, sessionId));
  await waitFor("document.querySelector('.mw-motion-menu > .mw-menu')");
  await evaluate(`(async () => {
    document.documentElement.removeAttribute('data-craft-still');
    const html = await (await fetch('/__ui/catalog/bar')).text();
    const stage = new DOMParser().parseFromString(html, 'text/html').querySelector('.mw-catalog-bar-stage');
    stage.id = 'menu-bar-probe'; document.body.append(stage);
  })()`);
  // The actual component-board menu supplies the body. Exercise each existing details host used by production renderers
  // and an unknown parent class; dynamic menus keep the existing child-based recognition after page load.
  for (const [host, body] of [
    ["mw-motion-menu", "mw-menu"], ["mw-menu-host", "mw-menu"], ["navigator-project-menu", "navigator-project-menu-popover"],
    ["dynamic-menu-parent", "mw-menu"], ["todo-batch-more", "mw-menu"], ["todo-reminder-later", "mw-menu"],
  ]) for (const phase of ["finished", "early", "late"] as const) {
    const opening = await evaluate<{ visible: boolean; content: string; entry: { properties: string[]; time: number; duration: number }[] }>(`(async () => {
      const source = document.querySelector('.mw-motion-menu'), d = source.cloneNode(true); d.id = 'menu-close-probe'; d.className = ${JSON.stringify(host)};
      d.open = false; const menu = d.querySelector('div'); menu.className = ${JSON.stringify(body)};
      if (${JSON.stringify(host)} === 'navigator-project-menu') document.querySelector('#menu-bar-probe .workbench-bar').append(d); else source.after(d);
      d.querySelector('summary').click(); getComputedStyle(menu).opacity;
      const opening = { visible: menu.checkVisibility({ checkVisibilityCSS: true }), content: getComputedStyle(d, '::details-content').contentVisibility };
      const entering = menu.getAnimations();
      if (${JSON.stringify(phase)} === 'finished') await Promise.all(entering.map(animation => animation.finished));
      else {
        // Hold a real browser animation at a known entry phase; a busy CI frame cannot skip the late interruption.
        for (const animation of entering) { animation.pause(); animation.currentTime = ${phase === "early" ? 80 : 230}; }
        getComputedStyle(menu).opacity;
      }
      return { ...opening, entry: entering.map(animation => ({ properties: animation.effect.getKeyframes().flatMap(Object.keys),
        time: Number(animation.currentTime), duration: Number(animation.effect.getTiming().duration) })) };
    })()`);
    assert.equal(opening.visible, true, `${host}: opening is drawn immediately`);
    assert.equal(opening.content, "visible", `${host}: opening does not wait for the closing clock`);
    if (phase !== "finished") {
      assert.ok(["opacity", "transform"].every(property => opening.entry.some(animation => animation.properties.includes(property))), `${host}/${phase}: a real entry is interrupted; ${JSON.stringify(opening)}`);
      assert.ok(opening.entry.every(animation => animation.time > 0 && animation.time < animation.duration && animation.duration === 250), `${host}/${phase}: the entry clock is inside its original duration; ${JSON.stringify(opening)}`);
    }
    const closing = await evaluate<{ before: Record<string, unknown>; frames: MenuFrame[] }>(`new Promise(resolve => {
      const d = document.getElementById('menu-close-probe'), menu = d.querySelector('div'), seen = [], start = performance.now();
      const animations = () => d.getAnimations({ subtree: true }).map(animation => ({ type: animation.constructor.name,
        name: animation.animationName ?? animation.transitionProperty, playState: animation.playState, currentTime: animation.currentTime,
        startTime: animation.startTime, pending: animation.pending, pseudoElement: animation.effect?.pseudoElement,
        timing: animation.effect?.getComputedTiming() }));
      const style = getComputedStyle(menu); style.opacity;
      const before = { at: performance.now(), timeline: document.timeline.currentTime, open: d.open, opacity: Number(style.opacity),
        still: document.documentElement.hasAttribute('data-craft-still'), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        transition: style.transition, animation: style.animation, content: getComputedStyle(d, '::details-content').contentVisibility,
        contentTransition: getComputedStyle(d, '::details-content').transition, animations: animations() };
      d.querySelector('summary').click();
      const frame = () => { const style = getComputedStyle(menu); seen.push({ opacity: Number(style.opacity),
        visible: menu.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), pointer: style.pointerEvents,
        content: getComputedStyle(d, '::details-content').contentVisibility, elapsed: performance.now() - start,
        timeline: document.timeline.currentTime, animations: animations() });
        if (performance.now() - start < 250) requestAnimationFrame(frame); else { d.remove(); resolve({ before, frames: seen }); } };
      requestAnimationFrame(frame);
    })`);
    const diagnostic = `${phase}: ${JSON.stringify(closing)}`;
    const beforeOpacity = Number(closing.before.opacity);
    assert.ok(closing.frames.some(frame => frame.opacity > 0 && frame.opacity < 1 && frame.visible && frame.content === "visible"), `${host}: the menu fades while its content is still drawn; ${diagnostic}`);
    assert.ok(closing.frames.some(frame => frame.opacity > 0 && frame.opacity < beforeOpacity && frame.visible), `${host}: exit visibly fades from its interrupted entry value; ${diagnostic}`);
    assert.ok(closing.frames.every((frame, index) => frame.opacity <= (index ? closing.frames[index - 1]!.opacity : beforeOpacity) + 0.000001), `${host}: closing never continues the entry fade-in; ${diagnostic}`);
    assert.ok(closing.frames.every(frame => frame.pointer === "none"), `${host}: closing cannot take a click; ${diagnostic}`);
    assert.equal(closing.frames.at(-1)!.content, "hidden", `${host}: content is released after the exit; ${diagnostic}`);
    assert.equal(closing.frames.at(-1)!.visible, false, `${host}: closed content is no longer drawn; ${diagnostic}`);
  }
  await evaluate("document.getElementById('menu-bar-probe').remove()");
  // Use the board's ordinary disclosure under the same full stylesheet: a menu-only fix must not replace its height transition.
  const foldFrames = (open: boolean) => evaluate<number[]>(`new Promise(resolve => {
    const d = document.querySelector('.mw-motion-row-detail'), p = d.querySelector('p'), seen = [], start = performance.now();
    getComputedStyle(p).height; d.open = ${open};
    const frame = () => { seen.push(d.getBoundingClientRect().height - d.querySelector('summary').getBoundingClientRect().height);
      if (performance.now() - start < 350) requestAnimationFrame(frame); else resolve(seen); }; requestAnimationFrame(frame);
  })`);
  const heights = await foldFrames(true);
  const full = heights.at(-1)!;
  assert.ok(full > 0 && new Set(heights.filter(height => height > 0 && height < full).map(Math.round)).size >= 3, "ordinary disclosure opens through intermediate natural heights");
  const folded = await foldFrames(false);
  assert.ok(new Set(folded.filter(height => height > 0 && height < full).map(Math.round)).size >= 3, "ordinary disclosure also closes through intermediate heights");
  assert.equal(folded.at(-1), 0);
  for (const mode of ["reduced", "still"]) {
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: mode === "reduced" ? "reduce" : "no-preference" }] }, sessionId);
    const instant = await evaluate<{ opening: number; closing: number; pointer: string; active: number; released: string }>(`(async () => {
      document.documentElement.toggleAttribute('data-craft-still', ${mode === "still"});
      const source = document.querySelector('.mw-motion-menu'), d = source.cloneNode(true); d.open = false; source.after(d);
      const menu = d.querySelector('.mw-menu'); d.querySelector('summary').click(); const opening = Number(getComputedStyle(menu).opacity);
      d.querySelector('summary').click(); const style = getComputedStyle(menu);
      const result = { opening, closing: Number(style.opacity), pointer: style.pointerEvents, active: menu.getAnimations().length };
      // Pseudo-element transitions are not reliably returned by getAnimations; observe the actual box within the original exit window.
      const start = performance.now(); await new Promise(resolve => { const frame = () => {
        if (getComputedStyle(d, '::details-content').contentVisibility === 'hidden' || performance.now() - start >= 250) resolve();
        else requestAnimationFrame(frame);
      }; requestAnimationFrame(frame); });
      const released = getComputedStyle(d, '::details-content').contentVisibility; d.remove(); return { ...result, released };
    })()`);
    assert.equal(instant.opening, 1, `${mode}: entry is immediately visible`);
    assert.equal(instant.closing, 0, `${mode}: exit is immediately invisible`);
    assert.equal(instant.pointer, "none", `${mode}: closed menu cannot take a click`);
    assert.equal(instant.active, 0, `${mode}: opacity and transform do not animate`);
    assert.equal(instant.released, "hidden", `${mode}: the content box is released`);
  }
});
