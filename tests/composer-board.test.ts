import assert from "node:assert/strict";
import test from "node:test";
import { PLUGIN_ICON_NAMES } from "@molis-ai/molis-work-plugin-sdk/ui";
import { COMPOSER_BOARD_EN, KEEP_EDITS_BOARD_EN, LOOK_BOARD_EN, listedIconNames, renderIconSprite, renderMenuItem, renderPrimitiveCatalog } from "@molis-ai/molis-work-design-system";

// The unified input's three new board parts (specs/unified-input-voice/implementation-plan.md §3.6, UIC-04): the multi-row
// composer shell, the menu item's description line and the microphone glyph. K0c's renderComposer() and K2's client use these
// class names, so the board pins them.

const sectionOf = (html: string, id: string) => {
  const start = html.indexOf(`<section class="mw-catalog__section" id="${id}"`);
  assert.ok(start >= 0, `section ${id}`);
  return html.slice(start, html.indexOf("</section>", start));
};

test("UIC-04: the board has a composer section with every state on one attribute", () => {
  const composer = sectionOf(renderPrimitiveCatalog(), "composer");
  assert.equal(composer.match(/class="mw-composer" data-slot="composer"/g)?.length, 9, "nine specimens");
  for (const state of ["sending", "running", "failed", "unknown", "disabled"]) assert.match(composer, new RegExp(`class="mw-composer" data-slot="composer" data-state="${state}"`), state);
  for (const part of ["mw-composer__to", "mw-composer__box", "mw-uploads mw-composer__files", "mw-composer__restore", "mw-composer__text", "mw-composer__status", "mw-composer__foot", "mw-composer__start", "mw-composer__end"]) {
    assert.match(composer, new RegExp(`class="[^"]*${part}`), part);
  }
  assert.match(composer, /<textarea class="mw-composer__input" data-fit rows="1"/, "the text area grows with data-fit");
  assert.match(composer, /class="mw-btn-group" role="group"[^>]*>.*data-compose-menu-toggle/s, "running sends from a split button with a ▾ menu");
  assert.match(composer, /mw-btn--danger-outline/, "stop is the danger-outline button");
  // The board still shows the microphone (a product page draws it only once it takes voice, user 11-08): first in the end group,
  // aria-disabled so it keeps its focus stop and says why, never `disabled`.
  assert.match(composer, /<div class="mw-composer__end"><button(?![^>]* disabled\b)(?=[^>]*aria-disabled="true")[^>]*aria-label="语音输入（还没有接上）"[^>]*>(?:(?!<\/button>).)*href="#icon-mic"/s, "the microphone holds its place first in the end group, unavailable and saying why");
  // Seen through the board's English: no specimen text is left without a translation (the board's dictionary also carries the
  // keep-edits and look sections' words, which go through the same translator; the few words the product already says are not
  // written twice).
  const board: Record<string, string> = { ...COMPOSER_BOARD_EN, ...KEEP_EDITS_BOARD_EN, ...LOOK_BOARD_EN };
  const english = renderPrimitiveCatalog({ say: (text, values = {}) => {
    assert.ok(text in board || /^(助理|发送|补充|停止|重试|失败|运行中|待确认|不可用|聚焦|让助理做点什么…|保存|取消|更多|移除|知道了|提示|没有找到|命令|浅色|深色|再试一次|进行中|内置|没通过检查|项目名称)$/.test(text), `English for ${text}`);
    return (board[text] ?? text).replace(/\{(\w+)\}/g, (whole, name: string) => String(values[name] ?? whole));
  } });
  assert.match(sectionOf(english, "composer"), /<h2>Composer<\/h2>/);
});

test("UIC-04: a menu item's description line sits under its name; an unavailable item keeps its reason", () => {
  const item = renderMenuItem({ label: "打断并改向", iconName: "zap", description: "这个对象不支持打断", disabled: true });
  assert.match(item, /class="mw-menu__item mw-menu__item--described"[^>]* disabled/);
  assert.match(item, /<span data-slot="menu-item-label"><span id="([\w-]+)-label">打断并改向<\/span><small class="mw-menu__desc" id="\1-desc">这个对象不支持打断<\/small><\/span>/);
  // The accessible name is the label alone; the description line is the item's description, not part of its name
  // (#1850 D-track review, item 2).
  const [, ident] = item.match(/<span id="([\w-]+)-label">/)!;
  assert.match(item, new RegExp(`role="menuitem" aria-labelledby="${ident}-label" aria-describedby="${ident}-desc"`));
  assert.equal(renderMenuItem({ label: "打断并改向", description: "这个对象不支持打断" }).match(/id="([\w-]+)-label"/)![1], ident, "the derived id is stable");
  const given = renderMenuItem({ id: "c1-delivery-interrupt", label: "打断并改向", description: "x" });
  assert.match(given, /aria-labelledby="c1-delivery-interrupt-label" aria-describedby="c1-delivery-interrupt-desc"/, "a caller's id is used");
  assert.doesNotMatch(renderMenuItem({ label: "重命名" }), /mw-menu__desc|--described/, "an item without one is unchanged");
  const board = sectionOf(renderPrimitiveCatalog(), "menu-desc");
  assert.match(board, /mw-menu__shortcut/, "with shortcuts");
  assert.ok((board.match(/mw-menu__item--described"[^>]*disabled/g)?.length ?? 0) >= 2, "unavailable items with reasons");
  // The same delivery menu is drawn more than once on the board; every copy names its own items.
  const ids = [...renderPrimitiveCatalog().matchAll(/<(?:span|small)(?: class="mw-menu__desc")? id="([^"]+-(?:label|desc))"/g)].map((match) => match[1]!);
  assert.ok(ids.length >= 20, `read ${ids.length} described items' ids`);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), [], "no described item's id is repeated on the board");
});

test("UIC-04: the microphone is in the icon set, the sprite and the board at 16 and 20px", () => {
  assert.ok((PLUGIN_ICON_NAMES as readonly string[]).includes("mic"));
  assert.ok(listedIconNames().includes("mic"));
  assert.match(renderIconSprite(), /<symbol id="icon-mic" viewBox="0 0 24 24">/);
  const mic = sectionOf(renderPrimitiveCatalog(), "mic");
  assert.match(mic, /--mic-size: 16px/);
  assert.match(mic, /--mic-size: 20px/);
});
