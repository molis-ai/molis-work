import assert from "node:assert/strict";
import test from "node:test";
import { openBoardBrowser as openGoalBrowser } from "./fixtures/board-browser.js";

const KEYS = { Tab: 9, Enter: 13, Escape: 27 };
const selector = "#presentation-forms";

test("IUI-21 IUI-26: the real board keeps names, state and consequences visible in both languages, themes and narrow panes", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, command, sessionId, navigate, origin, waitFor, setViewport } = browser;

  const finishChecks: string[] = [];
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
      text: string; theme: string; status: boolean; outside: string[]; name: string; titleClipped: boolean;
      tiles: Array<{ glyph: string; paint: string; matchesPalette: boolean; contrast: number }>;
      corners: Array<{ actual: string; expected: string }>;
      skinnedCorners: string[];
      card: { body: number; fields: number; leftDelta: number; rightDelta: number };
    }>(`(() => {
      const section = document.querySelector("${selector}"), row = section.querySelector(".mw-item"), status = row.querySelector(".mw-status");
      const title = row.querySelector(".mw-presentation__row-title strong");
      const shown = el => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility === "visible";
      const within = el => !shown(el) || (el.getBoundingClientRect().left >= 0 && el.getBoundingClientRect().right <= innerWidth + 1);
      const context = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
      const pixel = color => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = "transparent";
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      };
      const lightness = rgba => rgba.slice(0, 3).map(value => value / 255)
        .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const owners = [...section.querySelectorAll(".mw-presentation__owner")];
      const tiles = owners.map(owner => {
        const style = getComputedStyle(owner), mark = owner.querySelector("svg"), glyph = mark.querySelector("use").getAttribute("href");
        const paint = pixel(style.backgroundColor), ink = pixel(getComputedStyle(mark).stroke);
        const matchesPalette = paint[3] === 255 && ink[3] === 255 && paint.join() === pixel(style.getPropertyValue("--presentation-soft")).join()
          && ink.join() === pixel(style.getPropertyValue("--presentation-hue")).join() && Boolean(document.getElementById(glyph.slice(1)));
        const [a, b] = [lightness(ink), lightness(paint)];
        return { glyph, paint: style.backgroundColor, matchesPalette, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
      });
      const card = section.querySelector(".mw-presentation--card");
      const body = card.querySelector(".mw-preview-card").getBoundingClientRect();
      const fields = card.querySelector(".mw-presentation__fields").getBoundingClientRect();
      const cornerNodes = [
        [owners[0], "--r-tag"], [owners[1], "--r-control"], [card, "--r-card"],
        [section.querySelector(".mw-presentation-board__trigger"), "--r-tag"], [section.querySelector("#presentation-sheet"), "--r-sheet"],
      ];
      const corners = cornerNodes.map(([node, token]) => {
        const style = getComputedStyle(node);
        return { actual: style.borderTopLeftRadius, expected: style.getPropertyValue(token).trim() };
      });
      // Exercise the inherited skin override on the same real nodes without depending on a particular skin-picker menu.
      const inlineStyle = section.getAttribute("style");
      section.style.setProperty("--sk-r-slot", "5px");
      section.style.setProperty("--sk-r-card", "17px");
      const skinnedCorners = cornerNodes.map(([node]) => getComputedStyle(node).borderTopLeftRadius);
      if (inlineStyle === null) section.removeAttribute("style");
      else section.setAttribute("style", inlineStyle);
      return { text: section.innerText, theme: document.documentElement.dataset.resolvedTheme, status: shown(status),
        outside: [...section.querySelectorAll(".mw-presentation, .mw-presentation__tag, .mw-item__end, .mw-presentation__consequence")].filter(el => !within(el)).map(el => {
          const { left, right } = el.getBoundingClientRect(); return el.className + " " + left + ".." + right;
        }),
        name: title.textContent, titleClipped: title.scrollWidth > title.clientWidth,
        tiles, corners, skinnedCorners,
        card: { body: body.width, fields: fields.width, leftDelta: body.left - fields.left, rightDelta: body.right - fields.right } };
    })()`);
    for (const word of expected) assert.ok(result.text.includes(word), `${label} ${word}`);
    assert.equal(result.theme, theme, label);
    assert.equal(result.status, true, `visible row state ${label}`);
    assert.deepEqual(result.outside, [], `forms fit their container ${label}`);
    assert.match(result.name, /^Mobile pricing table.*long customer names$/u, label);
    if (width === 390) assert.equal(result.titleClipped, true, label);
    const [chip, row, card, other] = result.tiles;
    assert.equal(chip?.paint, row?.paint, `same owner's chip and row colour ${label}`);
    assert.equal(row?.paint, card?.paint, `same owner's row and card colour ${label}`);
    assert.notEqual(card?.paint, other?.paint, `the example includes another owner's hue ${label}`);
    for (const tile of result.tiles) {
      assert.equal(tile.matchesPalette, true, `${tile.glyph} uses its hue and soft wash ${label}`);
      assert.ok(tile.contrast >= 3, `${tile.glyph} is ${tile.contrast.toFixed(2)}:1 ${label}`);
    }
    for (const { actual, expected } of result.corners) {
      assert.ok(parseFloat(expected) > 0, `the default corner token resolves ${label}`);
      assert.equal(actual, expected, `default corner follows its role ${label}`);
    }
    assert.deepEqual(result.skinnedCorners, ["5px", "5px", "17px", "5px", "17px"], `the skin overrides the corners ${label}`);
    assert.ok(Math.abs(result.card.leftDelta) <= 1 && Math.abs(result.card.rightDelta) <= 1,
      `card title and summary use the same available width as fields ${label} ${JSON.stringify(result.card)}`);
    finishChecks.push(`${label} ${Math.min(...result.tiles.map(tile => tile.contrast)).toFixed(2)}:1, corners ${result.corners.map(corner => corner.actual).join("/")}, card ${Math.round(result.card.body)}px`);
  }
  t.diagnostic(finishChecks.join("\n"));
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
      const sheet = await evaluate<{ atBottom: boolean; corner: string; sheetRadius: string }>(`(() => {
        const sheet = document.querySelector("#presentation-sheet"), style = getComputedStyle(sheet);
        return { atBottom: Math.abs(sheet.getBoundingClientRect().bottom - innerHeight) < 2,
          corner: style.borderTopLeftRadius, sheetRadius: style.getPropertyValue("--r-sheet").trim() };
      })()`);
      assert.equal(sheet.atBottom, true);
      assert.ok(parseFloat(sheet.sheetRadius) > 0);
      assert.equal(sheet.corner, sheet.sheetRadius, "the open bottom sheet uses the sheet's default corner");
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
