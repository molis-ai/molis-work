import assert from "node:assert/strict";
import test from "node:test";
import type { SurfaceFocus, SurfaceLanding } from "@molis-ai/molis-work-contracts/services/contextual";
import { judgmentState } from "@molis-ai/molis-work-kernel/contextual";

// RAC-2020 to RAC-2024 (T-237): the judgment's material is cut by UTF-16 units; a cut between the two halves of a character drops the lone half.
const PAIR = "\u{1F600}"; // 😀: two UTF-16 units, one character
const a = (count: number) => "a".repeat(count);
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/; // a half with no other half beside it

const focus = (over: Partial<SurfaceFocus> = {}): SurfaceFocus => ({
  context_id: "ctx-1", plugin_id: "pages", activity: "selecting", granularity: "range", object: { kind: "doc", id: "d1", version: 3, title: "计划" },
  targets: [{ kind: "text_range", role: "paragraph", text: "我们认为主因是上手困难。" }], ...over,
});
const landing = (over: Partial<SurfaceLanding> = {}): SurfaceLanding => ({
  pane_id: "main", plugin_id: "pages", object: { kind: "pages_document", id: "d1", title: "计划" }, position: "selection", version: 7,
  targets: [{ kind: "text_range", text: "选中的", anchor: 4, head: 7 }], surroundings: { heading_path: ["核心判断"], before: "我们认为", after: "转化率低" }, ...over,
});
/** The text after a line's head, or undefined when there is no such line. */
const lineOf = (text: string, head: string): string | undefined => text.split("\n").find(line => line.startsWith(head))?.slice(head.length);

test("RAC-2020 a selected part is cut at 2000 units without leaving half a character, and it is still named in the receipt", () => {
  const part = (text: string) => judgmentState(focus({ targets: [{ kind: "text_range", role: "paragraph", text }] }));
  const split = part(a(1999) + PAIR);
  assert.equal(lineOf(split.text, "【选中内容 1（paragraph）】"), a(1999) + "…", "2001 units, the cut falls between the halves: the half goes");
  assert.deepEqual(split.clipped, ["选中内容 1"], "the receipt still says it was cut");
  const whole = part(a(1998) + PAIR + PAIR);
  assert.equal(lineOf(whole.text, "【选中内容 1（paragraph）】"), a(1998) + PAIR + "…", "2002 units, the cut falls between two whole characters: the first one stays whole");
  const fits = part(a(1998) + PAIR);
  assert.equal(lineOf(fits.text, "【选中内容 1（paragraph）】"), a(1998) + PAIR, "exactly 2000 units: untouched, no ellipsis");
  assert.deepEqual(fits.clipped, []);
});

test("RAC-2021 a name, title or heading is cut at 120 units without leaving half a character, at every place it is read", () => {
  const places = (text: string) => {
    const state = judgmentState(
      focus({ object: { kind: text, id: "d1", title: text }, goal: { id: "g1", title: text }, surroundings: { heading_path: [text] }, place: "side", side_tab: text }),
      { landing: landing({ object: { kind: text, id: "d1", title: text }, surroundings: { heading_path: [text] } }) }).text;
    return [lineOf(state, "【对象】"), lineOf(state, "【所在位置】"), lineOf(state, "【当前目标】"), lineOf(state, "【手上的东西在】右栏 · "), lineOf(state, "【落点】"), lineOf(state, "【落点所在位置】")];
  };
  for (const half of [PAIR, "\u{10000}", "\u{10FFFF}"]) {
    const cut = a(119) + "…";
    assert.deepEqual(places(a(119) + half), [`${cut} · ${cut}`, cut, cut, cut, `${cut} · ${cut} · 选中的文字`, cut], `120 units and a pair (high half ${half.charCodeAt(0).toString(16)}): the half goes`);
  }
  const cut = a(118) + PAIR + "…";
  assert.deepEqual(places(a(118) + PAIR + "b").slice(1, 4), [cut, cut, cut], "121 units, the cut falls after a whole character: it stays");
  const fits = a(118) + PAIR;
  assert.deepEqual(places(fits).slice(1, 4), [fits, fits, fits], "exactly 120 units: untouched");
});

test("RAC-2022 the text around, a recent action, a preference, the Goal's state and what a landing would replace are cut without leaving half a character", () => {
  const state = judgmentState(
    focus({ surroundings: { heading_path: [], before: a(299) + PAIR, after: a(299) + PAIR }, goal: { id: "g1", title: "目标", state: a(39) + PAIR } }),
    { recent: [a(39) + PAIR, a(39) + PAIR, a(39) + PAIR, a(39) + PAIR], memory: [{ kind: "preference", text: a(159) + PAIR }], landing: landing({ targets: [{ kind: "text_range", text: a(1999) + PAIR, anchor: 4, head: 7 }], surroundings: { heading_path: [], before: a(299) + PAIR, after: a(299) + PAIR } }) });
  assert.equal(lineOf(state.text, "【前文】"), a(299) + "…");
  assert.equal(lineOf(state.text, "【后文】"), a(299) + "…");
  assert.equal(lineOf(state.text, "【当前目标】"), "目标（" + a(39) + "…）");
  assert.equal(lineOf(state.text, "【最近操作】"), [a(39) + "…", a(39) + "…", a(39) + "…"].join("；"), "three recent actions are read, each cut");
  assert.equal(lineOf(state.text, "【用户偏好与约定】"), a(159) + "…");
  assert.equal(lineOf(state.text, "【落点处的文字】"), a(1999) + "…");
  assert.equal(lineOf(state.text, "【落点前文】"), a(299) + "…");
  assert.equal(lineOf(state.text, "【落点后文】"), a(299) + "…");
});

test("RAC-2023 no part of the judgment ends in half a character; a half the page itself sent within the limit is left as it came", () => {
  const everywhere = (text: string, long: string) => judgmentState(
    focus({ object: { kind: text, id: "d1", title: text }, targets: [{ kind: "text_range", role: "paragraph", text: long }], goal: { id: "g1", title: text, state: text },
      surroundings: { heading_path: [text], before: long, after: long }, place: "side", side_tab: text }),
    { recent: [text], memory: [{ kind: "preference", text }], landing: landing({ object: { kind: text, id: "d1", title: text }, targets: [{ kind: "text_range", text: long, anchor: 1, head: 2 }], surroundings: { heading_path: [text], before: long, after: long } }) });
  for (const half of [PAIR, "\u{10000}", "\u{10FFFF}"]) {
    // Every limit (40, 120, 160, 300, 2000) meets text whose cut can fall between the halves.
    for (const size of [39, 119, 159, 299, 1999]) {
      const state = everywhere(a(size) + half, a(size) + half);
      assert.equal(LONE.test(state.text), false, `nothing the judgment reads carries a half character (${size} units and a pair)`);
    }
  }
  const own = judgmentState(focus({ object: { kind: "doc", id: "d1", title: a(119) + "\uD83D" } })).text;
  assert.equal(lineOf(own, "【对象】"), "doc · " + a(119) + "\uD83D", "exactly 120 units: the lone half the page sent is not the Host's cut, left as it came");
});

test("RAC-2024 text without two-unit characters is cut exactly as before", () => {
  // The formula before T-237, kept here as the reference for every cut point.
  const before = (raw: string, max: number) => { const text = raw.replace(/\s+/g, " ").trim(); return text.length <= max ? text : text.slice(0, max) + "…"; };
  const sources = [a(1), "中", "很长 的\t文字\n第二行"];
  const cases: Array<[string, number, (text: string) => ReturnType<typeof judgmentState>, string]> = [
    ["选中内容 1", 2000, text => judgmentState(focus({ targets: [{ kind: "text_range", role: "paragraph", text }] })), "【选中内容 1（paragraph）】"],
    ["对象标题", 120, text => judgmentState(focus({ object: { kind: "doc", id: "d1", title: text } })), "【对象】doc · "],
    ["前文", 300, text => judgmentState(focus({ surroundings: { heading_path: [], before: text } })), "【前文】"],
    ["最近操作", 40, text => judgmentState(focus(), { recent: [text] }), "【最近操作】"],
    ["偏好", 160, text => judgmentState(focus(), { memory: [{ kind: "preference", text }] }), "【用户偏好与约定】"],
  ];
  for (const [label, max, read, head] of cases) {
    for (const source of sources) {
      for (const length of [max - 1, max, max + 1, max + 2]) {
        const raw = source.repeat(Math.ceil(length / source.length)).slice(0, length);
        const state = read(raw);
        assert.equal(lineOf(state.text, head), before(raw, max), `${label}, ${JSON.stringify(source)} at ${length} units`);
        // Only the parts that name themselves in the receipt: recent actions and preferences never do.
        if (label !== "最近操作" && label !== "偏好") assert.deepEqual(state.clipped, raw.replace(/\s+/g, " ").trim().length > max ? [label] : [], `${label} is named in the receipt only when it was cut`);
      }
    }
  }
  assert.equal(lineOf(judgmentState(focus({ object: { kind: "doc", id: "d1", title: "  很   长  " } })).text, "【对象】doc · "), "很 长", "whitespace is folded and the ends trimmed");
});
