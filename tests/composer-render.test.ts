import assert from "node:assert/strict";
import { withPageText } from "./fixtures/page-text.js";
import test from "node:test";
import { renderComposer, type MwComposerAiLabels } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderPrimitiveCatalog } from "@molis-ai/molis-work-design-system";
import { COMPOSER_AI_LABELS as LABELS, COMPOSER_PLAIN_LABELS as PLAIN_LABELS } from "./fixtures/composer-labels.js";

// The SDK's first screen of the unified input (specs/unified-input-voice/implementation-plan.md §3.1, §5 slice K0c, UIC-13):
// `renderComposer()` draws the K1 board structure (§3.6) from the caller's words, escapes all of them, keeps the AI layer
// to `kind: "ai"`, says why when unavailable, and the board's `#composer` specimens are this function's output.
/** The outer HTML of the `<div>` that opens at `start`, counting nested divs. */
function divAt(html: string, start: number): string {
  const tags = /<\/?div\b[^>]*>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, tags.lastIndex);
  }
  throw new Error(`unclosed div at ${start}`);
}

/** Tags in order with their class and state only: the structure, without words, ids or other attributes. */
function skeleton(html: string): string[] {
  return [...html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>/g)].map(([, close, name, attrs]) =>
    close ? `/${name}` : `${name}${/\bclass="([^"]*)"/.exec(attrs!)?.[1]?.replace(/^|\s+/g, ".") ?? ""}${/\bdata-state="([^"]*)"/.exec(attrs!)?.[0] ?? ""}`);
}

test("UIC-13 UIV-19: the shell is the K1 structure: box, text area, status line, bottom bar with who it goes to beside ＋", () => {
  const html = renderComposer({ kind: "ai", labels: LABELS, receiver: { label: "助理" }, placeholder: "让助理做点什么…", status: { caption: "运行中", text: "正在做这一轮" }, state: "running", text: "补一句" });
  const order = ["mw-composer\"", "mw-composer__box", "mw-composer__text", "mw-composer__input", "mw-composer__status", "mw-composer__foot", "mw-composer__start", "mw-composer__to", "mw-composer__end"];
  const at = order.map((part) => html.indexOf(`class="${part}`));
  assert.ok(at.every((index) => index >= 0), `every part is drawn: ${order.filter((_, i) => at[i]! < 0).join(", ")}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, "in the K1 order");
  assert.match(html, /^<div class="mw-composer" data-slot="composer" data-state="running">/);
  assert.match(html, /<textarea class="mw-composer__input" data-fit rows="1" aria-label="发给 助理 的话" placeholder="让助理做点什么…">补一句<\/textarea>/);
  // A product page that takes no voice draws no microphone (user 11-08): the end group is stop, then the split button.
  assert.match(html, /<div class="mw-composer__end"><button[^>]*mw-btn--danger-outline[^>]*title="停止这一轮"[^>]*data-composer-stop.*?<div class="mw-btn-group" role="group" aria-label="送达方式">/s);
  assert.doesNotMatch(html, /icon-mic|data-composer-voice/);
  // A page that takes voice gets it in the same place, first in the end group: aria-disabled (still focusable, its tooltip
  // read out), never `disabled`, until voice input is connected.
  const voiced = renderComposer({ kind: "ai", labels: LABELS, receiver: { label: "助理" }, state: "running", text: "补一句", voice: "语音输入（还没有接上）" });
  assert.match(voiced, /<div class="mw-composer__end"><button(?![^>]* disabled\b)[^>]*aria-label="语音输入（还没有接上）"[^>]*aria-disabled="true"[^>]*data-composer-voice[^>]*>(?:(?!<\/button>).)*href="#icon-mic".*?mw-btn--danger-outline/s);
  // compose-pattern anchors, not composer children (§3.6); the ▾ menu's container is there, empty, for the client to fill.
  assert.match(html, /<div class="mw-compose__anchor"><button[^>]*data-compose-menu-toggle[^>]*aria-expanded="false" aria-haspopup="menu"[^>]*>.*?<\/button><div class="mw-compose__menu" data-compose-menu hidden><\/div><\/div>/s);
  assert.match(html, /class="mw-composer__status" role="status"><span class="mw-status mw-status--progress"/, "a running status line is in progress by default");
});

test("UIC-13: plain is the editor layer only: no receiver row, no stop, no delivery split button", () => {
  const plain = renderComposer({ kind: "plain", labels: PLAIN_LABELS, text: "评论" });
  assert.doesNotMatch(plain, /mw-composer__to|mw-btn-group|data-compose-menu-toggle|danger-outline/);
  assert.match(plain, /mw-composer__text.*mw-composer__foot/s);
  assert.match(plain, /aria-label="发送"[^>]*title="发送（⌘↵）"|title="发送（⌘↵）"[^>]*aria-label="发送"/, "send carries its key in the tooltip");
  assert.doesNotMatch(plain, /data-state=/, "no attribute is the ordinary state");
  const ai = renderComposer({ kind: "ai", labels: LABELS, receiver: { label: "Coding · 注册接口", resetLabel: "改回发给助理" } });
  // Who it goes to is a tag in the bottom bar, after ＋ (user 2026-11-10, one input): "发给：" is spoken, the tag shows the name.
  assert.match(ai, /<div class="mw-composer__start">(?:<div class="mw-compose__anchor">.*?<\/div><\/div>)?<div class="mw-composer__to"><span class="mw-composer__to-label">发给：<\/span><span class="mw-tag"><span>Coding · 注册接口<\/span><button type="button" data-tag-remove aria-label="改回发给助理"/s);
  assert.doesNotMatch(ai, /<div class="mw-composer__to">[^]*<div class="mw-composer__box">/, "no row above the box");
  assert.match(renderComposer({ kind: "ai", labels: LABELS, receiver: { label: "助理", icon: "sparkles" } }), /<span class="mw-tag"><svg[^>]*>.*?href="#icon-sparkles".*?<\/svg><span>助理<\/span><\/span>/s, "the receiver's glyph leads its name");
  assert.doesNotMatch(ai, /mw-btn-group|danger-outline/, "not running: one send button");
  assert.match(ai, /mw-btn--primary mw-btn--icon mw-btn--icon-only"[^>]* disabled aria-label="发送"/, "nothing written: send cannot be pressed");
  assert.match(renderComposer({ kind: "ai", labels: LABELS, text: "x" }), /^<div class="mw-composer" data-slot="composer"><div class="mw-composer__box">/, "no receiver: no receiver row");
  // ＋ only where something is behind it (contract desk 11-06): a page with no attachments, sources or commands leaves it out.
  assert.match(plain, /<div class="mw-composer__start"><div class="mw-compose__anchor"><button[^>]*data-composer-add/);
  assert.match(renderComposer({ kind: "plain", labels: PLAIN_LABELS, add: false }), /<div class="mw-composer__start"><\/div>/);
});

test("UIC-13: scene controls are drawn from the first paint with the board's controls, behind 更多 on a narrow box", () => {
  const html = renderComposer({ kind: "plain", labels: PLAIN_LABELS, controls: [
    { kind: "select", id: "model", label: "模型", value: "b", options: [{ value: "a", label: "快" }, { value: "b", label: "稳" }] },
    { kind: "toggle", id: "plan", label: "先出计划", on: true },
    { kind: "button", id: "tidy", label: "整理", run: () => undefined },
  ] });
  assert.match(html, /<div class="mw-composer__more"><button[^>]*data-composer-more[^>]*aria-expanded="false"/);
  assert.match(html, /<div class="mw-composer__controls" data-composer-controls><select class="mw-select"[^>]*data-composer-control="model"[^>]*aria-label="模型"[^>]*><option value="a">快<\/option><option value="b" selected>稳<\/option><\/select>/);
  assert.match(html, /<button[^>]*data-composer-control="plan"[^>]*aria-pressed="true"[^>]*>.*?先出计划/s);
  assert.match(html, /<button[^>]*data-composer-control="tidy"(?![^>]*aria-pressed)[^>]*>.*?整理/s);
  assert.doesNotMatch(renderComposer({ kind: "plain", labels: PLAIN_LABELS }), /mw-composer__controls|data-composer-more/, "no controls, no 更多");
});

test("UIC-13: unavailable says why; sending and unknown lock send", () => {
  const off = renderComposer({ kind: "ai", labels: LABELS, receiver: { label: "Coding" }, placeholder: "这个会话已结束", disabled: { caption: "不可用", reason: "会话已结束，不能再发；新开一个会话接着做" }, state: "failed", text: "x" });
  assert.match(off, /data-state="disabled"/, "unavailable takes the state's place");
  assert.match(off, /<textarea [^>]* disabled>/);
  assert.match(off, /class="mw-composer__status" role="status"><span class="mw-status mw-status--hold"[^>]*>.*?不可用.*?<span>会话已结束，不能再发；新开一个会话接着做<\/span>/s);
  assert.match(off, /aria-label="添加文件与资料"[^>]*disabled|disabled[^>]*aria-label="添加文件与资料"/, "＋ is unavailable too");
  assert.match(off, /disabled aria-label="发送"/);
  const sending = renderComposer({ kind: "plain", labels: PLAIN_LABELS, state: "sending", text: "x" });
  assert.match(sending, /data-loading disabled aria-label="发送"/, "sending: the send button turns and cannot be pressed");
  const unknown = renderComposer({ kind: "plain", labels: PLAIN_LABELS, state: "unknown", text: "x", status: { caption: "待确认", text: "没能确认是否送到", action: "查看" } });
  assert.match(unknown, /data-state="unknown"/);
  assert.match(unknown, /disabled aria-label="发送"/);
  assert.match(unknown, /mw-status--attention.*mw-btn--link[^>]*><span data-slot="button-label">查看<\/span>/s);
});

test("UIC-13: every word, the text and the root's attributes are escaped", () => {
  const evil = `"><script>alert('x')</script>`;
  const word = { name: evil, title: evil, description: evil };
  const evilLabels: MwComposerAiLabels = { ...LABELS, ...Object.fromEntries(Object.keys(LABELS).filter((key) => key !== "modes").map((key) => [key, `${key}${evil}`])),
    modes: { "next-boundary": word, interrupt: word, "after-run": word } };
  const html = renderComposer({
    kind: "ai",
    labels: evilLabels,
    voice: evil, controls: [{ kind: "select", id: evil, label: evil, value: evil, options: [{ value: evil, label: evil }] }, { kind: "toggle", id: evil, label: evil, on: false }],
    receiver: { label: evil, resetLabel: evil }, placeholder: evil, text: `</textarea>${evil}`,
    status: { caption: evil, text: evil, action: evil }, state: "running", attrs: { "data-x": evil },
  });
  assert.doesNotMatch(html, /<script|alert\('x'\)/);
  assert.equal(html.match(/<\/textarea>/g)?.length, 1, "the text cannot close its text area");
  assert.match(html, /&lt;\/textarea&gt;&quot;&gt;&lt;script&gt;alert\(&#039;x&#039;\)&lt;\/script&gt;<\/textarea>/);
  assert.match(html, /data-x="&quot;&gt;&lt;script&gt;/);
  for (const [, value] of html.matchAll(/\s[a-z-]+="([^"]*)"/g)) assert.doesNotMatch(value!, /[<>"']/, "no attribute value breaks out");
});

test("UIC-13: the board's #composer specimens are renderComposer's structure, plus what K2's client puts in", () => {
  const board = withPageText("zh", [], renderPrimitiveCatalog);
  const section = board.slice(board.indexOf('<section class="mw-catalog__section" id="composer"'), board.indexOf("</section>", board.indexOf('id="composer"')));
  const starts = [...section.matchAll(/<div class="mw-composer" data-slot="composer"/g)].map((match) => match.index!);
  // Ten states plus the two at rest in one row (user 11-08): a phone's and a short window's.
  assert.equal(starts.length, 12, "eleven AI specimens and one plain");
  const states = new Set<string>();
  for (const start of starts) {
    let specimen = divAt(section, start);
    // The client's parts: the attachment strip, the restored line, the ▾ menu's items; and the board's own markers.
    specimen = specimen.replace(/<ul class="mw-uploads mw-composer__files">[\s\S]*?<\/ul>/, "").replace(/<p class="mw-field__hint mw-composer__restore">[\s\S]*?<\/p>/, "");
    for (const menu of [...specimen.matchAll(/<div class="mw-compose__menu"/g)].map((match) => divAt(specimen, match.index!))) {
      specimen = specimen.replace(menu, '<div class="mw-compose__menu" data-compose-menu hidden></div>');
    }
    const state = /^<div class="mw-composer" data-slot="composer"(?: data-state="([a-z]+)")?/.exec(specimen)![1];
    states.add(state ?? "");
    const status = /class="mw-composer__status"/.test(specimen) ? { caption: "c", text: "t", ...(/mw-composer__status[\s\S]*mw-btn--link/.test(specimen) ? { action: "a" } : {}) } : undefined;
    const expected = !/mw-composer__to/.test(specimen) ? renderComposer({ kind: "plain", labels: LABELS, add: false }) : renderComposer({
      kind: "ai", labels: LABELS, receiver: { label: "r", ...(/data-tag-remove/.test(specimen) ? { resetLabel: "x" } : {}) }, voice: "v",
      ...(state === "disabled" ? { disabled: { caption: "c", reason: "t" } } : state ? { state: state as "running" } : {}),
      ...(status && state !== "disabled" ? { status } : {}),
    });
    assert.deepEqual(skeleton(specimen), skeleton(expected), `specimen ${state ?? "(ordinary)"}`);
  }
  assert.deepEqual([...states].sort(), ["", "disabled", "failed", "running", "sending", "unknown"]);
});
