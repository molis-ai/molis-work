import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const KEYS = { Tab: 9, Enter: 13, Escape: 27 };
const selector = "#presentation-forms";

test("IUI-21 IUI-26: the real board keeps names, state and consequences visible in both languages, themes and narrow panes", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, command, sessionId, navigate, origin, waitFor, setViewport } = browser;

  for (const width of [1440, 1024, 390]) for (const lang of ["zh", "en"]) for (const theme of ["light", "dark"]) {
    const expected = lang === "zh"
      ? ["呈现形态", "等你决定", "会发送到外部", "操作无法撤回", "可能产生费用"]
      : ["Presentation forms", "Needs your decision", "Sends information outside Molis Work", "This cannot be undone", "May incur a charge"];
    const label = `${width}/${lang}/${theme}`;
    await setViewport(width, 900);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=${lang}&presentation-check=${width}-${theme}${selector}` }, sessionId));
    await waitFor(`document.readyState === "complete" && !!document.querySelector("${selector}")`, 15_000);
    const result = await evaluate<{
      text: string; theme: string; status: boolean; outside: string[]; name: string; hues: string[]; titleClipped: boolean;
    }>(`(() => {
      const section = document.querySelector("${selector}"), row = section.querySelector(".mw-item"), status = row.querySelector(".mw-status");
      const title = row.querySelector(".mw-presentation__row-title strong");
      const shown = el => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility === "visible";
      const within = el => !shown(el) || (el.getBoundingClientRect().left >= 0 && el.getBoundingClientRect().right <= innerWidth + 1);
      return { text: section.innerText, theme: document.documentElement.dataset.resolvedTheme, status: shown(status),
        outside: [...section.querySelectorAll(".mw-presentation, .mw-presentation__tag, .mw-item__end, .mw-presentation__consequence")].filter(el => !within(el)).map(el => {
          const { left, right } = el.getBoundingClientRect(); return el.className + " " + left + ".." + right;
        }),
        name: title.textContent, titleClipped: title.scrollWidth > title.clientWidth,
        hues: [...section.querySelectorAll(".mw-presentation__owner")].slice(0, 4).map(el => getComputedStyle(el).backgroundColor) };
    })()`);
    for (const word of expected) assert.ok(result.text.includes(word), `${label} ${word}`);
    assert.equal(result.theme, theme, label);
    assert.equal(result.status, true, `visible row state ${label}`);
    assert.deepEqual(result.outside, [], `forms fit their container ${label}`);
    assert.match(result.name, /^Mobile pricing table.*long customer names$/u, label);
    if (width === 390) assert.equal(result.titleClipped, true, label);
    assert.equal(result.hues[0], result.hues[1], `same owner's chip and row colour ${label}`);
    assert.equal(result.hues[1], result.hues[2], `same owner's row and card colour ${label}`);
    assert.notEqual(result.hues[2], result.hues[3], `the example includes another owner's hue ${label}`);
  }
});

test("IUI-21 IUI-26: Tab and Enter reach one peek, menu Escape restores focus, and a narrow view uses the same contents in a bottom sheet", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, command, sessionId, navigate, origin, waitFor, setViewport } = browser;
  const key = async (name: keyof typeof KEYS) => {
    for (const type of ["keyDown", "keyUp"] as const) {
      await command("Input.dispatchKeyEvent", { type, key: name, code: name, windowsVirtualKeyCode: KEYS[name], nativeVirtualKeyCode: KEYS[name],
        ...(type === "keyDown" && name === "Enter" ? { text: "\r" } : {}) }, sessionId);
    }
  };
  const active = (query: string) => evaluate<boolean>(`document.activeElement.matches(${JSON.stringify(query)})`);
  let desktopPeek = "";
  for (const width of [1024, 390]) {
    await setViewport(width, 900);
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=en&keyboard-width=${width}${selector}` }, sessionId));
    await waitFor(`document.readyState === "complete" && !!document.querySelector("${selector}")`, 15_000);
    // Start at the non-focusable section heading, then enter through a genuine Tab.
    const { x, y, hit } = await evaluate<{ x: number; y: number; hit: string }>(`(() => {
      const header = document.querySelector("${selector} h2"); header.scrollIntoView({ block: "center", behavior: "instant" });
      const { left, top, height } = header.getBoundingClientRect(); const x = left + 4, y = top + height / 2; return { x, y, hit: document.elementFromPoint(x, y)?.outerHTML.slice(0, 200) };
    })()`);
    await command("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, x, y }, sessionId);
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, x, y }, sessionId);
    await key("Tab");
    const focus = await evaluate<string>("document.activeElement.outerHTML.slice(0, 200)");
    assert.equal(await active("[data-presentation-peek]"), true, `Tab enters the name chip at ${width} after ${hit}; focus ${focus}`);
    if (width === 1024) await waitFor('document.querySelector("#presentation-popover:popover-open") !== null', 3000);
    await key("Enter");
    const layer = width === 390 ? "#presentation-sheet[open]" : "#presentation-popover:popover-open";
    await waitFor(`document.querySelector(${JSON.stringify(layer)}) !== null`, 3000);
    assert.equal(await active(layer + ' [data-presentation-action="show-card"]'), true,
      `Enter focuses the first control at ${width}; focus ${await evaluate("document.activeElement.outerHTML.slice(0, 200)")}`);
    const peek = await evaluate<string>(`document.querySelector(${JSON.stringify(layer + " .mw-presentation--peek")}).textContent`);
    if (width === 1024) desktopPeek = peek;
    else {
      assert.equal(peek, desktopPeek);
      assert.equal(await evaluate<boolean>('Math.abs(document.querySelector("#presentation-sheet").getBoundingClientRect().bottom - innerHeight) < 2'), true);
    }
    assert.equal(await evaluate<number>('document.querySelectorAll("#presentation-forms .mw-presentation--peek").length'), 1, "one rendered body");
    assert.equal(await evaluate<boolean>(`(() => {
      const box = document.querySelector(${JSON.stringify(layer)}).getBoundingClientRect();
      return box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
    })()`), true, `the layer fits at ${width}`);
    await key("Tab");
    assert.equal(await active(layer + ' [data-presentation-action="close-peek"]'), true);
    await key("Escape");
    assert.equal(await active("[data-presentation-peek]"), true, `Escape restores the chip at ${width}`);
    assert.equal(await evaluate<boolean>('!document.querySelector("#presentation-sheet[open], #presentation-popover:popover-open")'), true);
  }

  await key("Tab");
  await key("Tab");
  await key("Tab");
  assert.equal(await active(".mw-presentation__more > summary"), true);
  await key("Enter");
  await key("Tab");
  assert.equal(await active('details[open] [role="menuitem"][data-presentation-action="review-retry"]'), true);
  assert.match(await evaluate<string>("document.activeElement.innerText"), /Review retry details.*May incur a charge/su);
  await key("Escape");
  assert.equal(await active(".mw-presentation__more > summary"), true);
  assert.equal(await evaluate<boolean>('!document.querySelector(".mw-presentation__more[open]")'), true);
});
