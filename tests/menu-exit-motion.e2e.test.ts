import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type MenuFrame = { opacity: number; visible: boolean; pointer: string; content: string };

test("VUX-36 VUX-22 menus remain drawn while closing, open immediately, and leave ordinary disclosure height alone", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#motion` }, sessionId));
  await waitFor("document.querySelector('.mw-motion-menu > .mw-menu')");
  await evaluate("document.documentElement.removeAttribute('data-craft-still')");
  // The actual component-board menu supplies the body. Exercise each existing details host used by production renderers
  // and the shared mw-menu-host declaration, including the reminder menu created after the page has loaded.
  for (const [host, body] of [
    ["mw-motion-menu", "mw-menu"], ["mw-menu-host", "mw-menu"], ["navigator-project-menu", "navigator-project-menu-popover"],
    ["project-record-filter-menu", ""], ["todo-batch-more", "mw-menu"], ["todo-reminder-later", "mw-menu"], ["session-more", "mw-menu"],
  ]) {
    const opening = await evaluate<{ visible: boolean; content: string }>(`(() => {
      const source = document.querySelector('.mw-motion-menu'), d = source.cloneNode(true); d.id = 'menu-close-probe'; d.className = ${JSON.stringify(host)};
      d.open = false; const menu = d.querySelector('div'); menu.className = ${JSON.stringify(body)}; source.after(d);
      d.querySelector('summary').click(); getComputedStyle(menu).opacity;
      return { visible: menu.checkVisibility({ checkVisibilityCSS: true }), content: getComputedStyle(d, '::details-content').contentVisibility };
    })()`);
    assert.equal(opening.visible, true, `${host}: opening is drawn immediately`);
    assert.equal(opening.content, "visible", `${host}: opening does not wait for the closing clock`);
    await evaluate("new Promise(resolve => setTimeout(resolve, 300))");
    const closing = await evaluate<MenuFrame[]>(`new Promise(resolve => {
      const d = document.getElementById('menu-close-probe'), menu = d.querySelector('div'), seen = [], start = performance.now();
      getComputedStyle(menu).opacity; d.querySelector('summary').click();
      const frame = () => { const style = getComputedStyle(menu); seen.push({ opacity: Number(style.opacity),
        visible: menu.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), pointer: style.pointerEvents,
        content: getComputedStyle(d, '::details-content').contentVisibility });
        if (performance.now() - start < 250) requestAnimationFrame(frame); else { d.remove(); resolve(seen); } };
      requestAnimationFrame(frame);
    })`);
    assert.ok(closing.some(frame => frame.opacity > 0 && frame.opacity < 1 && frame.visible && frame.content === "visible"), `${host}: the menu fades while its content is still drawn`);
    assert.ok(closing.every(frame => frame.pointer === "none"), `${host}: closing cannot take a click`);
    assert.equal(closing.at(-1)!.content, "hidden", `${host}: content is released after the exit`);
    assert.equal(closing.at(-1)!.visible, false);
  }
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
});
