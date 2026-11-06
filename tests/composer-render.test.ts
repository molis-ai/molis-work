import assert from "node:assert/strict";
import test from "node:test";
import { renderComposer, type MwComposerAiLabels, type MwComposerLabels } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderPrimitiveCatalog } from "@molis-ai/molis-work-design-system";

// The SDK's first screen of the unified input (specs/unified-input-voice/implementation-plan.md §3.1, §5 slice K0c, UIC-13):
// `renderComposer()` draws the K1 board structure (§3.6) from the caller's words, escapes all of them, keeps the AI layer
// to `kind: "ai"`, says why when unavailable, and the board's `#composer` specimens are this function's output.

const LABELS: MwComposerAiLabels = {
  input: "发给 助理 的话", send: "发送", sendTitle: "发送（⌘↵）", add: "添加文件与资料", voice: "语音输入（还没有接上）",
  to: "发给：", stop: "停止", supplement: "补充", supplementTitle: "补充（⌘↵）", delivery: "选择送达方式", deliveryGroup: "送达方式",
};
const PLAIN_LABELS: MwComposerLabels = { input: "评论", send: LABELS.send, sendTitle: LABELS.sendTitle, add: LABELS.add, voice: LABELS.voice };

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

test("UIC-13: the shell is the K1 structure: receiver row, box, text area, status line, bottom bar", () => {
  const html = renderComposer({ kind: "ai", labels: LABELS, receiver: { label: "助理" }, placeholder: "让助理做点什么…", status: { caption: "运行中", text: "正在做这一轮" }, state: "running", text: "补一句" });
  const order = ["mw-composer\"", "mw-composer__to", "mw-composer__box", "mw-composer__text", "mw-composer__input", "mw-composer__status", "mw-composer__foot", "mw-composer__start", "mw-composer__end"];
  const at = order.map((part) => html.indexOf(`class="${part}`));
  assert.ok(at.every((index) => index >= 0), `every part is drawn: ${order.filter((_, i) => at[i]! < 0).join(", ")}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, "in the K1 order");
  assert.match(html, /^<div class="mw-composer" data-slot="composer" data-state="running">/);
  assert.match(html, /<textarea class="mw-composer__input" data-fit rows="1" aria-label="发给 助理 的话" placeholder="让助理做点什么…">补一句<\/textarea>/);
  // The microphone holds its place first in the end group, never available yet; then stop; then the split button.
  assert.match(html, /<div class="mw-composer__end"><button[^>]* disabled aria-label="语音输入（还没有接上）"[^>]*>(?:(?!<\/button>).)*href="#icon-mic".*?mw-btn--danger-outline.*?<div class="mw-btn-group" role="group" aria-label="送达方式">/s);
  // compose-pattern anchors, not composer children (§3.6); the ▾ menu's container is there, empty, for the client to fill.
  assert.match(html, /<div class="mw-compose__anchor"><button[^>]*data-compose-menu-toggle[^>]*aria-expanded="false" aria-haspopup="menu"[^>]*>.*?<\/button><div class="mw-compose__menu" data-compose-menu hidden><\/div><\/div>/s);
  assert.match(html, /class="mw-composer__status" role="status"><span class="mw-status mw-status--progress"/, "a running status line is in progress by default");
});

test("UIC-13: plain is the editor layer only: no receiver row, no stop, no delivery split button", () => {
  const plain = renderComposer({ kind: "plain", labels: PLAIN_LABELS, text: "评论" });
  assert.doesNotMatch(plain, /mw-composer__to|mw-btn-group|data-compose-menu|danger-outline/);
  assert.match(plain, /mw-composer__text.*mw-composer__foot/s);
  assert.match(plain, /aria-label="发送"[^>]*title="发送（⌘↵）"|title="发送（⌘↵）"[^>]*aria-label="发送"/, "send carries its key in the tooltip");
  assert.doesNotMatch(plain, /data-state=/, "no attribute is the ordinary state");
  const ai = renderComposer({ kind: "ai", labels: LABELS, receiver: { label: "Coding · 注册接口", resetLabel: "改回发给助理" } });
  assert.match(ai, /<div class="mw-composer__to"><span>发给：<\/span><span class="mw-tag"><span>Coding · 注册接口<\/span><button type="button" data-tag-remove aria-label="改回发给助理"/);
  assert.doesNotMatch(ai, /mw-btn-group|danger-outline/, "not running: one send button");
  assert.match(ai, /mw-btn--primary mw-btn--icon mw-btn--icon-only"[^>]* disabled aria-label="发送"/, "nothing written: send cannot be pressed");
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
  const html = renderComposer({
    kind: "ai",
    labels: Object.fromEntries(Object.keys(LABELS).map((key) => [key, `${key}${evil}`])) as Record<keyof MwComposerAiLabels, string>,
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
  const board = renderPrimitiveCatalog();
  const section = board.slice(board.indexOf('<section class="mw-catalog__section" id="composer"'), board.indexOf("</section>", board.indexOf('id="composer"')));
  const starts = [...section.matchAll(/<div class="mw-composer" data-slot="composer"/g)].map((match) => match.index!);
  assert.equal(starts.length, 9);
  const states = new Set<string>();
  for (const start of starts) {
    let specimen = divAt(section, start);
    // The client's parts: the attachment strip, the restored line, the ▾ menu's items; and the board's own markers.
    specimen = specimen.replace(/<ul class="mw-uploads mw-composer__files">[\s\S]*?<\/ul>/, "").replace(/<p class="mw-field__hint mw-composer__restore">[\s\S]*?<\/p>/, "");
    const menuAt = specimen.indexOf('<div class="mw-compose__menu"');
    if (menuAt >= 0) specimen = specimen.replace(divAt(specimen, menuAt), '<div class="mw-compose__menu" data-compose-menu hidden></div>');
    const state = /^<div class="mw-composer" data-slot="composer"(?: data-state="([a-z]+)")?/.exec(specimen)![1];
    states.add(state ?? "");
    const status = /class="mw-composer__status"/.test(specimen) ? { caption: "c", text: "t", ...(/mw-composer__status[\s\S]*mw-btn--link/.test(specimen) ? { action: "a" } : {}) } : undefined;
    const expected = renderComposer({
      kind: "ai", labels: LABELS, receiver: { label: "r", ...(/data-tag-remove/.test(specimen) ? { resetLabel: "x" } : {}) },
      ...(state === "disabled" ? { disabled: { caption: "c", reason: "t" } } : state ? { state: state as "running" } : {}),
      ...(status && state !== "disabled" ? { status } : {}),
    });
    assert.deepEqual(skeleton(specimen), skeleton(expected), `specimen ${state ?? "(ordinary)"}`);
  }
  assert.deepEqual([...states].sort(), ["", "disabled", "failed", "running", "sending", "unknown"]);
});
