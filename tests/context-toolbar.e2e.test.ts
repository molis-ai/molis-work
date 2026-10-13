import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// W1-06 (context-program §19.4): the context toolbar on the component board, driven in a real browser. The board's section holds the
// real program on sample text. What this proves: the bar sits next to the selection, never takes the editor's focus, keeps two actions in
// a narrow window and 44px targets on a finger, folds the tools it cannot fit, and opens the plugin's form under itself.

const SELECT = `(() => {
  const text = document.querySelector("[data-ctx-demo-text]");
  text.scrollIntoView({ block: "center", behavior: "instant" });
  const range = document.createRange();
  range.setStart(text.firstChild, 4); range.setEnd(text.firstChild, 18);
  const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  return selection.toString();
})()`;
const MEASURE = `(() => {
  const bar = document.querySelector(".mw-ctx:not(.mw-ctx--static)"), box = bar.getBoundingClientRect(), selection = getSelection().getRangeAt(0).getBoundingClientRect();
  return { role: bar.getAttribute("role"), above: box.bottom <= selection.top + 0.5, below: box.top >= selection.bottom - 0.5,
    actions: bar.querySelectorAll("[data-key]").length, tools: bar.querySelectorAll("[data-group]").length, folded: Boolean(bar.querySelector("[data-fold]")),
    heights: [...bar.querySelectorAll(".mw-btn")].map(node => Math.round(node.getBoundingClientRect().height)), inside: box.left >= 0 && box.right <= innerWidth };
})()`;
type Measured = { role: string; above: boolean; below: boolean; actions: number; tools: number; folded: boolean; heights: number[]; inside: boolean };

for (const [width, height, touch, actions] of [[1440, 900, false, 3], [390, 844, true, 2]] as const) {
  test(`context toolbar at ${width}px: next to the selection, no focus taken, ${actions} actions, ${touch ? "44px targets" : "tools in line"}, a form under it`, async (t) => {
    const browser = await openGoalBrowser(t, "seeded");
    if (!browser) return;
    const { command, sessionId, evaluate, waitFor, navigate, origin } = browser;
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: touch }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog` }, sessionId));
    await waitFor("document.querySelector('[data-ctx-demo-text]') !== null", 20_000);
    const key = (name: string, extra: Record<string, unknown> = {}) => command("Input.dispatchKeyEvent", { type: "keyDown", key: name, code: name, ...extra }, sessionId);
    const click = async (selector: string) => {
      const at = await evaluate<{ x: number; y: number }>(`(() => { const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`);
      for (const type of ["mousePressed", "mouseReleased"]) await command("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "left", clickCount: 1 }, sessionId);
    };
    const log = () => evaluate<string>(`document.querySelector("[data-ctx-demo-log]").textContent`);

    const selected = await evaluate<string>(SELECT);
    await waitFor("document.querySelector('.mw-ctx:not(.mw-ctx--static):not([hidden]):not([data-away])') !== null", 5_000);
    const bar = await evaluate<Measured>(MEASURE);
    assert.equal(bar.role, "toolbar");
    assert.equal(bar.actions, actions, "three recommended actions; two in a narrow window");
    assert.ok(bar.inside, "inside the window");
    assert.ok(bar.tools >= 1);
    if (touch) { assert.ok(bar.heights.every(size => size >= 44), `44px on a finger: ${bar.heights}`); assert.ok(bar.folded, "the format tools fold into one menu"); }
    else { assert.ok(bar.above, "above the selection"); assert.ok(bar.heights.every(size => size >= 28 && size <= 32), `the shared control height: ${bar.heights}`); assert.equal(bar.folded, false); }

    // A press on the bar chooses and leaves the selection and the focus where they were.
    await click(".mw-ctx:not(.mw-ctx--static) [data-key='a']");
    assert.match(await log(), /选了推荐动作：a/u, "the choice reached the host by its key");
    assert.equal(await evaluate<string>(`getSelection().toString()`), selected, "the selection is still the person's");
    assert.equal(await evaluate<boolean>(`document.activeElement.closest(".mw-ctx") === null`), true, "the focus did not move into the bar");

    // ⌘. moves in, Esc puts the bar away.
    await evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: ".", metaKey: true, bubbles: true }))`);
    assert.equal(await evaluate<boolean>(`document.activeElement.closest(".mw-ctx") !== null`), true);
    await key("Escape", { windowsVirtualKeyCode: 27 });
    await waitFor("document.querySelector('.mw-ctx:not(.mw-ctx--static)').hidden === true", 3_000);
    assert.match(await log(), /Esc/u);

    // 更多 opens a menu with the rest and the assistant's; Esc closes it and the focus goes back to 更多.
    await evaluate(SELECT);
    await waitFor("document.querySelector('.mw-ctx:not(.mw-ctx--static):not([hidden]):not([data-away]) [data-more]') !== null", 5_000);
    await click(".mw-ctx:not(.mw-ctx--static) [data-more]");
    const menu = await evaluate<{ items: string[]; inside: boolean; focused: boolean }>(`(() => { const menu = document.querySelector(".mw-ctx-menu"), box = menu.getBoundingClientRect();
      return { items: [...menu.querySelectorAll("[role=menuitem]")].map(node => node.textContent.trim()), inside: box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, focused: menu.contains(document.activeElement) }; })()`);
    assert.ok(menu.items.some(label => label.includes("解释这段")) && menu.items.some(label => label.includes("带到助理")), `the menu holds the rest and the assistant: ${menu.items}`);
    assert.ok(menu.inside && menu.focused);
    await key("Escape", { windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate<boolean>(`document.querySelector(".mw-ctx-menu") === null && document.activeElement.hasAttribute("data-more")`), true);

    // A tool: pressed state comes back from the plugin; the link tool opens the plugin's form under the bar.
    const strong = touch ? null : ".mw-ctx:not(.mw-ctx--static) [data-id='strong']";
    if (strong) {
      await click(strong);
      await waitFor(`document.querySelector(${JSON.stringify(strong)}).getAttribute("aria-pressed") === "true"`, 3_000);
    }
    await click(".mw-ctx:not(.mw-ctx--static) [data-id='link']");
    await waitFor("document.querySelector('.mw-ctx-panel') !== null", 3_000);
    const panel = await evaluate<{ below: boolean; inside: boolean; field: boolean }>(`(() => { const panel = document.querySelector(".mw-ctx-panel").getBoundingClientRect(), bar = document.querySelector(".mw-ctx:not(.mw-ctx--static)").getBoundingClientRect();
      return { below: panel.top >= bar.bottom - 0.5 || panel.bottom <= bar.top + 0.5, inside: panel.left >= 0 && panel.right <= innerWidth, field: Boolean(document.querySelector(".mw-ctx-panel input")) }; })()`);
    assert.ok(panel.below && panel.inside && panel.field, "the form sits clear of the bar and inside the window");
    await evaluate(`document.querySelector(".mw-ctx-panel input").focus()`);
    await key("Escape", { windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate<boolean>(`document.querySelector(".mw-ctx-panel") === null`), true);
    assert.match(await log(), /关了/u);
  });
}
