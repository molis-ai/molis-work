import assert from "node:assert/strict";
import test from "node:test";
import {
  ANCHORED_MENU_CLIENT_SCRIPT, CAPABILITY_PACK_BOARD_EN, CAPABILITY_PACK_BOARD_STYLES, SKILL_PACK_BOARD_STYLES, renderCells, renderDetailTrail, renderIconCounts, renderItemGroup,
  renderMenuItem, renderNowBlock, renderPickRow, renderPrimitiveCatalog, renderStateRows, renderUsage,
} from "@molis-ai/molis-work-design-system";
import { workbenchClientSource } from "@molis-ai/molis-work-app-workbench";
import { renderMolisWorkSettingsStylesheet } from "./workbench-renderer-fixture.js";

// 09 AI kits (docs/design/capability-pack/README.md「组件板新增」, decided 2026-11-09): the board's eight new parts as renderers a
// page calls, their board sections, their English, tokens only, and the settings shell's scrolling-area height.

const SECTIONS = ["now-block", "item-group", "cell-grid", "detail-trail", "icon-counts", "state-rows", "usage-figure", "sticky-detail"];
const sectionOf = (html: string, id: string) => {
  const start = html.indexOf(`<section class="mw-catalog__section" id="${id}"`);
  assert.ok(start >= 0, `section ${id}`);
  return html.slice(start, html.indexOf(`<section class="mw-catalog__section"`, start + 10));
};

test("CPK-14 CPK-03: the state block draws its status, note and buttons, and its menu is the last button's, anchored in the top layer", () => {
  const html = renderNowBlock({ status: '<p class="mw-status-line">x</p>', note: "说明", actions: "<b>a</b>", menu: { id: "m1", label: "导出这个包", icon: "download", items: renderMenuItem({ label: "整个包" }) } });
  assert.match(html, /^<div class="mw-now" data-slot="now"><p class="mw-status-line">x<\/p><p class="mw-now__note">说明<\/p><div class="mw-now__actions"><b>a<\/b><button /);
  assert.match(html, /<button [^>]*id="m1-button" data-anchored-menu popovertarget="m1" aria-controls="m1" aria-haspopup="menu" aria-expanded="false">/);
  assert.match(html, /<div class="mw-menu mw-anchored-menu" data-slot="menu" role="menu" aria-labelledby="m1-button" id="m1" popover="auto">/);
  assert.ok(html.indexOf("m1-button") < html.indexOf('id="m1"'), "the menu follows its button");
  assert.doesNotMatch(renderNowBlock({ status: "s" }), /data-anchored-menu|popover/, "no menu unless asked");
  // The placing client: the top layer, never over the button, Escape and focus left to the popover, keys among items.
  for (const part of ["popovertarget", "aria-expanded", "ArrowDown", "Home", "End", "hidePopover", "maxHeight"]) assert.ok(ANCHORED_MENU_CLIENT_SCRIPT.includes(part), part);
});

test("CPK-13 CPK-01: an item group is a choosable parent row with its own entries indented under a named group", () => {
  const child = renderPickRow({ glyph: "text", name: "说明", sub: "默认第 2 版", end: "", attrs: { "data-x": "1" } });
  const html = renderItemGroup({ glyph: "user", name: "写作编辑", description: "改稿", where: "生效：助理", end: "", label: "它的提示词", children: [child], empty: "没有" });
  assert.match(html, /<li class="mw-item-group"><button type="button" class="mw-item-group__head">/);
  assert.match(html, /<div class="mw-item-group__children" role="group" aria-label="写作编辑 · 它的提示词"><span class="mw-item-group__label" aria-hidden="true">它的提示词<\/span><ul class="mw-items"><li class="mw-item mw-item--pick"><button type="button" class="mw-item__pick" data-x="1">/);
  assert.match(renderItemGroup({ glyph: "user", name: "n", description: "d", where: "w", end: "", label: "l", children: [], empty: "没有自己的提示词" }), /<p class="mw-item-group__empty">没有自己的提示词<\/p>/);
});

test("CPK-01 CPK-04: cells, trail, counts, state rows and usage carry their names for hover and screen readers", () => {
  assert.match(renderCells([{ name: "运行命令", code: "run_command", tag: "<i></i>", current: true }]), /<button type="button" class="mw-cell" title="运行命令 · run_command" aria-current="true"><span class="mw-cell__name"><strong>运行命令<\/strong><code>run_command<\/code><\/span><i><\/i><\/button>/);
  const trail = renderDetailTrail({ up: "回到「写作工具」", path: ["写作工具", "写作编辑", "说明"], label: "所在位置" });
  assert.match(trail, /<nav class="mw-list-detail__trail" aria-label="所在位置"><button [^>]*class="mw-btn mw-btn--ghost mw-btn--sm mw-list-detail__up"[^>]*data-list-up>/);
  assert.match(trail, /<ol class="mw-list-detail__path"><li>写作工具<\/li><li>写作编辑<\/li><li aria-current="page">说明<\/li><\/ol>/);
  assert.match(renderIconCounts([{ glyph: "book", value: "3", name: "3 个技能" }]), /<span class="mw-count" title="3 个技能"><svg[^>]*>.*<\/svg><span aria-hidden="true">3<\/span><span class="mw-sr-only">3 个技能<\/span><\/span>/);
  assert.match(renderStateRows([{ name: "服务器", meaning: "在不在跑", mark: "<m></m>", go: "<g></g>" }]), /<li><span class="mw-state-row__what"><strong>服务器<\/strong><small>在不在跑<\/small><\/span><span class="mw-state-row__state"><m><\/m><\/span><span class="mw-state-row__go"><g><\/g><\/span><\/li>/);
  assert.match(renderUsage({ figure: 12, head: "近期 12 次", scope: "不是总数" }), /<span class="mw-usage__num">12<\/span>.*<p class="mw-usage__scope">不是总数<\/p>/);
  assert.doesNotMatch(renderUsage({ head: "只有最近一次" }), /mw-usage__num/, "no figure stands for the last use only");
});

test("CPK-01: the board has the eight sections, in order, with English for every word and tokens only", () => {
  const board = renderPrimitiveCatalog();
  const at = SECTIONS.map((id) => board.indexOf(`id="${id}"`));
  assert.ok(at.every((index, n) => index > 0 && (n === 0 || index > at[n - 1]!)), "every new part has its section, in order");
  assert.match(sectionOf(board, "sticky-detail"), /<div class="mw-list-detail" data-list-detail data-sticky-detail>/);
  const english = renderPrimitiveCatalog({ say: (text, values = {}) => {
    const words = CAPABILITY_PACK_BOARD_EN[text] ?? text;
    return words.replace(/\{(\w+)\}/g, (whole, name: string) => String(values[name] ?? whole));
  } });
  for (const id of SECTIONS) assert.deepEqual(sectionOf(english, id).replace(/<style>[\s\S]*?<\/style>/g, "").match(/[㐀-鿿]+/gu) ?? [], [], `no Chinese is left in ${id}`);
  assert.doesNotMatch(CAPABILITY_PACK_BOARD_STYLES, /#[0-9a-f]{3,8}\b|rgba?\(|\d+ms|cubic-bezier/iu, "colours and motion come from tokens");
  assert.doesNotMatch(CAPABILITY_PACK_BOARD_STYLES, /overscroll-behavior/u, "the sticky detail hands its scroll on to the page");
  assert.match(CAPABILITY_PACK_BOARD_STYLES, /\.mw-list-detail\[data-sticky-detail\] \.mw-list-detail__detail \{ position: sticky; top: 16px; max-height: calc\(var\(--settings-view-h, 100dvh\) - 32px\); overflow-y: auto; \}/);
  assert.match(CAPABILITY_PACK_BOARD_STYLES, /prefers-reduced-motion: reduce/);
});

test("CPK-01: the sticky detail is opt-in, so 08's skill page is unchanged, and the settings shell gives its scrolling area's height", () => {
  assert.doesNotMatch(SKILL_PACK_BOARD_STYLES, /sticky/u, "08's list and detail keeps its own behaviour");
  assert.doesNotMatch(renderMolisWorkSettingsStylesheet(), /data-sticky-detail/u, "no product sheet opts in yet");
  assert.match(workbenchClientSource(), /--settings-view-h/u, "the workbench's settings stage measures its scrolling area");
});
