import assert from "node:assert/strict";
import test from "node:test";
import { renderAlert, renderKept, renderStepDot } from "@molis-ai/molis-work-plugin-sdk/ui";
import { KEEP_EDITS_BOARD_EN, renderPrimitiveCatalog } from "@molis-ai/molis-work-design-system";
import { renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchStylesheet } from "./workbench-renderer-fixture.js";

// The parts for keeping someone's edits (docs/design/rule-stale-reload/README.md「组件板新增」): the alert's action slot, the kept
// row and the step's dot, published from the SDK's /ui. Their markup and the promise that an alert without actions stays as it was.

test("an alert without the new options writes exactly what it always did", () => {
  assert.equal(renderAlert({ title: "保存失败", body: "草稿仍在。", tone: "danger", className: "extra" }),
    '<div class="mw-alert mw-alert--danger extra" data-slot="alert" role="status"><strong>保存失败</strong><p>草稿仍在。</p></div>');
  assert.equal(renderAlert({ title: "提示" }), '<div class="mw-alert mw-alert--info" data-slot="alert" role="status"><strong>提示</strong></div>');
  assert.equal(renderAlert({ title: "提示", actions: [] }), renderAlert({ title: "提示" }), "an empty list draws no row");
});

test("an alert's actions are a row of real buttons under its words, ghost unless named", () => {
  const html = renderAlert({ title: "在别处改过", body: "还没存。", tone: "warning", actions: [{ label: "存成新规则" }, { label: "载入最新版", variant: "primary", attrs: { "data-act": "reload" } }] });
  assert.match(html, /<p>还没存。<\/p><div class="mw-alert__actions"><button [^>]*class="mw-btn mw-btn--ghost mw-btn--sm"[^>]*>.*存成新规则.*<\/button><button [^>]*class="mw-btn mw-btn--primary mw-btn--sm"[^>]*data-act="reload"[^>]*>.*载入最新版.*<\/button><\/div><\/div>$/s);
});

test("a button without a variant is ghost even when the variant is written as undefined, so one alert never gets two primaries", () => {
  const kept = (variant?: "primary") => renderKept({ who: "你写的", text: "x", action: { label: "放回", variant } });
  const alert = (variant?: "primary") => renderAlert({ title: "t", actions: [{ label: "存成新规则", variant }] });
  for (const html of [alert(undefined), kept(undefined)]) {
    assert.match(html, /mw-btn--ghost/);
    assert.doesNotMatch(html, /mw-btn--primary/);
  }
  assert.match(alert("primary"), /mw-btn--primary/, "a named variant stays");
  assert.match(kept("primary"), /mw-btn--primary/, "a named variant stays");
});

test("what goes into an alert's actions is escaped: words and attributes", () => {
  const html = renderAlert({ title: "<b>题</b>", body: "<i>文</i>", actions: [{ label: '<img src=x onerror="a()">', attrs: { "data-arg": '"><script>x()</script>' } }] });
  assert.doesNotMatch(html, /<img|<script|<b>|<i>/);
  assert.match(html, /&lt;img src=x onerror=&quot;a\(\)&quot;&gt;/);
  assert.match(html, /data-arg="&quot;&gt;&lt;script&gt;x\(\)&lt;\/script&gt;"/);
});

test("an alert's mark, rise and attributes appear only when asked for", () => {
  const done = renderAlert({ title: "已载入", tone: "success", state: "done", rise: true, attrs: { tabindex: "-1" } });
  assert.match(done, /^<div class="mw-alert mw-alert--success mw-alert--rise" data-slot="alert" role="status" tabindex="-1"><strong class="mw-alert__title"><span class="mw-alert__mark" aria-hidden="true">/);
  assert.match(done, /<span>已载入<\/span><\/strong><\/div>$/, "the title's words stay outside the hidden mark");
});

test("the kept row says whose words these are, escapes them, and offers the way back", () => {
  const kept = renderKept({ who: "你写的", text: "<b>只看直发</b>\n第二行", action: { label: "放回", attrs: { "aria-label": "放回你写的：判断说明" } } });
  assert.match(kept, /^<div class="mw-kept" data-slot="kept"><div class="mw-kept__head"><span class="mw-kept__who">你写的<\/span><button [^>]*mw-btn--ghost[^>]*aria-label="放回你写的：判断说明"/);
  assert.match(kept, /<p class="mw-kept__text">&lt;b&gt;只看直发&lt;\/b&gt;\n第二行<\/p><\/div>$/);
  assert.doesNotMatch(kept, /mw-kept__more|style=/, "no fold and no stagger unless asked");
  const swapped = renderKept({ who: "最新版", text: "x", swapped: true, rise: true, index: 2, action: { label: "换回" }, more: { label: "收起", open: true } });
  assert.match(swapped, /^<div class="mw-kept is-swapped mw-kept--rise" data-slot="kept" style="--i:2">/);
  assert.match(swapped, /<p class="mw-kept__text is-open">x<\/p><button [^>]*mw-kept__more[^>]*aria-expanded="true"/);
  assert.match(renderKept({ who: "你写的", text: "", blankText: "你清空了这一栏", action: { label: "放回" } }), /<p class="mw-kept__text is-blank">你清空了这一栏<\/p>/);
});

test("the step's dot has a name, not only a colour", () => {
  assert.equal(renderStepDot({ label: 'a"b' }), '<i class="mw-step-dot" data-slot="step-dot" role="img" aria-label="a&quot;b" title="a&quot;b"></i>');
});

// RAC-551 says every class a /ui part writes has a rule in the host's sheets. These parts are published before their rules reach
// the sheets: until N14's page draws them they are the board's own (KEEP_EDITS_BOARD_STYLES). These are
// exactly the classes waiting. N14's interface moves the rules into the page sheets, empties this list and adds the parts to
// samples() in sdk-ui-markup.test.ts; a class missing a rule for any other reason fails here.
const UNTIL_N14 = ["mw-alert--rise", "mw-alert__actions", "mw-alert__mark", "mw-alert__title", "mw-kept", "mw-kept--rise", "mw-kept__head", "mw-kept__more", "mw-kept__text", "mw-kept__who", "mw-step-dot"];

test("RAC-551: the classes these parts write without a host rule are exactly the ones waiting for N14, and the board defines them", () => {
  const sheets = [renderMolisWorkWorkbenchStylesheet(), renderMolisWorkArrivalStylesheet(), renderMolisWorkSettingsStylesheet()].join("\n");
  const defined = (css: string, token: string): boolean => new RegExp(`\\.${token}(?![\\w-])`, "u").test(css);
  const html = [
    renderAlert({ title: "t", body: "b", tone: "success", state: "done", rise: true, actions: [{ label: "x" }] }),
    renderKept({ who: "w", text: "", blankText: "b", swapped: true, rise: true, index: 1, action: { label: "x" }, more: { label: "m", open: true } }),
    renderStepDot({ label: "l" }),
  ].join("");
  const written = new Set([...html.matchAll(/\bclass="([^"]*)"/gu)].flatMap((match) => match[1]!.split(/\s+/u)));
  // is-* are states of a named part; the words after the dot are checked with the part's own rule on the board.
  const waiting = [...written].filter((token) => !token.startsWith("is-") && !defined(sheets, token)).sort();
  assert.deepEqual(waiting, UNTIL_N14);
  const board = renderPrimitiveCatalog();
  const style = board.slice(board.indexOf("<style>"), board.indexOf("</style>"));
  for (const token of UNTIL_N14) assert.ok(defined(style, token), `the board defines .${token}`);
});

test("the board's words all have English, and the motion takes only tokens", () => {
  const english = renderPrimitiveCatalog({ say: (text, values = {}) => (KEEP_EDITS_BOARD_EN[text] ?? text).replace(/\{(\w+)\}/gu, (whole, name: string) => String(values[name] ?? whole)) });
  const start = english.indexOf('id="alert-actions"');
  const sections = english.slice(start, english.indexOf("</section>", english.indexOf('id="field-wash"')));
  assert.deepEqual(sections.match(/[㐀-鿿]+/gu) ?? [], [], "no Chinese is left in English");
  const board = renderPrimitiveCatalog();
  const style = board.slice(board.indexOf("<style>"), board.indexOf("</style>"));
  const from = style.indexOf(".mw-alert > :is(strong, p)");
  const rules = style.slice(from, style.indexOf("data-keep-wash-hold", from));
  assert.doesNotMatch(rules, /#[0-9a-f]{3,8}\b/iu, "no written colour");
  assert.doesNotMatch(rules, /(?:animation|transition)[^;]*\d+m?s\b/u, "no written duration");
  assert.match(rules, /prefers-reduced-motion: reduce/);
});
