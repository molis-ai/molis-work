import assert from "node:assert/strict";
import test from "node:test";
import { renderMolisWorkNavigationSpecimen, renderMolisWorkPrimitiveCatalog } from "@molis-ai/molis-work-app-workbench";
import { installHostUiText, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";

// 第 32 批定样（docs/design/work-line-32，方案 E）的新增部件在组件板上的标本：/__ui/catalog/navigation?sheet=work-line。
// 标本经产品要调的同一组函数（apps/workbench/src/work-line-parts.ts）画，所以这里验的是部件自己的合同：读屏名字、状态区分、
// 一行不折、两种语言。界面在浏览器里的样子由走查看，不在这里断言。

installHostUiText();

const frame = (locale: "zh" | "en") => runWithLocale(locale, () => renderMolisWorkNavigationSpecimen(t, locale === "zh" ? "zh-CN" : "en", "work-line"));
const main = (html: string) => html.slice(html.indexOf("<main"), html.indexOf("</main>"));
const tags = (html: string, pattern: RegExp) => [...html.matchAll(pattern)].map(match => match[0]);
const attr = (tag: string, name: string) => new RegExp(` ${name}="([^"]*)"`, "u").exec(tag)?.[1];

test("the board has a 事项线 section whose frame is the navigation frame with the work-line sheet", () => {
  const board = runWithLocale("zh", () => renderMolisWorkPrimitiveCatalog());
  assert.match(board, /<section class="mw-catalog__section" id="work-line"/u);
  assert.match(board, /<a href="#work-line"/u, "the index links to the section");
  assert.match(board, /data-nav-frame src="\/__ui\/catalog\/navigation\?lang=zh&amp;sheet=work-line"/u);
  const html = frame("zh");
  assert.match(html, /<link rel="stylesheet" href="\/assets\/molis-work-workbench\.css">/u, "drawn by the sheet the product loads");
  for (const id of ["wl-event", "wl-head", "wl-task-mark", "wl-task-panel", "wl-reply", "wl-event-card", "wl-peek", "wl-hand", "wl-line", "wl-dialog"]) {
    assert.ok(html.includes(`data-nav-specimen="${id}"`), `specimen ${id}`);
  }
});

test("WLN-17: an event's accessible name says who registered it, what kind it is, its name and where it stands", () => {
  const html = main(frame("zh"));
  const events = tags(html, /<button type="button" class="work-event"[^>]*>/gu);
  assert.ok(events.length >= 14);
  for (const tag of events) {
    const label = attr(tag, "aria-label") ?? "";
    assert.ok(label.length > 0, tag);
    if (attr(tag, "data-state") !== "unreadable") assert.match(label, /^(Goals|Pages|Coding|Feed|Jelly|Todo) · (文档|周报|代码改动|目标|待办|日程) · /u, label);
    assert.doesNotMatch(tag, / aria-current="false"/u, "aria-current is only written when it is true");
  }
  const waiting = events.find(tag => attr(tag, "data-state") === "wait")!;
  assert.equal(attr(waiting, "aria-label"), "Todo · 待办 · 回复供应商报价 · 等你定 · 选哪一家");
  const denied = events.find(tag => attr(tag, "data-state") === "denied")!;
  assert.equal(attr(denied, "aria-label"), "Goals · 目标 · 无权查看", "WLN-28: an event the person may not view has no name");
  const states = new Set(events.map(tag => attr(tag, "data-state")));
  for (const state of ["", "queued", "running", "wait", "failed", "stopped", "verify", "done", "gone", "denied", "unreadable"]) assert.ok(states.has(state), `state ${state}`);
  // A state that asks for attention is a word on the capsule, not only a colour (WLN-17); the quiet ones keep theirs for the reader.
  for (const [state, word] of [["wait", "等你定"], ["failed", "失败"], ["stopped", "已停止"], ["verify", "结果待核对"], ["gone", "已不在"], ["denied", "无权查看"]] as const) {
    assert.match(html, new RegExp(`data-state="${state}" data-attn[^>]*>[\\s\\S]*?<span class="work-event-state">${word}</span>`, "u"), state);
  }
  assert.doesNotMatch(html, /data-state="running"[^>]*>(?:(?!<\/button>)[\s\S])*work-event-state/u);
});

test("WLN-19: the head says the work item, and how many of its events wait", () => {
  const heads = tags(main(frame("zh")), /<button type="button" class="work-line-head"[^>]*>/gu);
  assert.ok(heads.some(tag => attr(tag, "aria-label") === "网站改版"));
  assert.ok(heads.some(tag => /· 2 件等你$/u.test(attr(tag, "aria-label") ?? "")));
  for (const tag of heads) {
    assert.equal(attr(tag, "aria-haspopup"), "menu");
    assert.equal(attr(tag, "title"), attr(tag, "aria-label"), "where the name is not drawn it is still in the tooltip");
  }
});

test("WLN-37: a source that cannot be read is in the line's lead, outside what scrolls, and the way back to earlier events is drawn (their behaviour: tests/work-line-layout.e2e.test.ts)", () => {
  const html = main(frame("zh"));
  const whole = html.slice(html.indexOf('data-nav-specimen="wl-line"'), html.indexOf('data-nav-specimen="wl-dialog"'));
  const lines = whole.split('<div class="work-line" data-work-line').slice(1);
  assert.equal(lines.length, 4);
  for (const line of lines) {
    assert.match(line, /^ role="region" aria-label="事项线"/u);
    const run = line.indexOf('class="work-line-run"');
    const earlier = line.indexOf("data-work-line-earlier");
    assert.ok(earlier > 0 && earlier < run, "the way back to earlier events stands before the run, after the head");
    assert.match(line, /data-work-line-earlier data-label="更早的事件 · \{n\} 件" data-label-attn="更早的事件 · \{n\} 件，其中 \{m\} 件要留意" aria-label="更早的事件" hidden>/u);
    assert.match(line, /<div class="work-line-lead"><button type="button" class="work-line-head"/u, "the head leads the line");
    const retry = line.indexOf("data-work-line-retry");
    assert.ok(retry < earlier, "an unreadable source stands in the lead, before the way back and outside what scrolls");
  }
  assert.ok(lines[3]!.includes("data-work-line-retry"));
});

test("WLN-35: the task mark tells in progress, needs you, failed and disconnected apart, and names itself", () => {
  const marks = tags(main(frame("zh")), /<button type="button" class="work-task-mark"[^>]*>/gu);
  assert.ok(marks.some(tag => tag.includes(" data-needs-you")));
  assert.ok(marks.some(tag => tag.includes(" data-failed")));
  const offline = marks.find(tag => tag.includes(" data-offline"))!;
  assert.match(attr(offline, "aria-label")!, /连接断开/u);
  assert.ok(marks.some(tag => attr(tag, "aria-label") === "后台任务"), "with nothing running it is still named");
  assert.ok(marks.some(tag => attr(tag, "aria-label") === "后台任务 · 2 个在办"));
  for (const tag of marks) assert.ok(["true", "false"].includes(attr(tag, "aria-expanded") ?? ""));
});

test("WLN-36: the panel lists what needs you first, has an empty and a disconnected state, and a task's card leads back to the list", () => {
  const html = main(frame("zh"));
  const list = html.slice(html.indexOf('data-nav-specimen="wl-task-panel"'), html.indexOf('data-nav-specimen="wl-reply"'));
  const rows = [...list.slice(0, list.indexOf("data-task-card")).matchAll(/data-task-open="([^"]+)"/gu)].map(match => match[1]);
  assert.deepEqual(rows, ["t-quote", "t-talk", "t-fix", "t-notes", "t-plan"]);
  assert.match(list, /role="img" aria-label="1 个等你"[\s\S]*aria-label="1 个失败"[\s\S]*aria-label="2 个在办"/u, "the head counts what the list holds");
  assert.match(list, /class="work-task-row-step" title="跑测试 · 第 3\/4 步 · Coding"/u, "the step comes first, then who");
  assert.match(list, /data-serves="none"/u, "a task that belongs to no event says so");
  assert.match(list, /class="work-task-empty"/u);
  assert.match(list, /data-task-card="t-fix"[\s\S]*data-task-panel-list/u);
  assert.match(list, /<dt>状态<\/dt><dd>[\s\S]*?进行中 · 第 3\/4 步/u, "a task's state stands with its facts, not squeezed into the head");
  assert.match(list, /data-step="current"/u);
  // Disconnected: every state is only what was last heard, and nothing can be stopped or retried until it reconnects.
  const offline = list.slice(list.lastIndexOf('<section class="work-task-panel"'));
  assert.match(offline, /class="work-task-banner" role="status"/u);
  assert.match(offline, /data-task-reconnect/u);
  assert.equal([...offline.matchAll(/状态待核对 · 断开前：/gu)].length, 4, "two rows, each in its text and its tooltip");
  assert.doesNotMatch(offline, /data-task-control/u);
});

test("WLN-32: a reply says where the work went in one of five ways, each with a way to change it", () => {
  const html = main(frame("zh"));
  const reply = html.slice(html.indexOf('data-nav-specimen="wl-reply"'), html.indexOf('data-nav-specimen="wl-event-card"'));
  for (const [kind, words] of [["new-event", "新事件「修首屏布局」"], ["none", "不属于事件 · 在后台任务里"], ["supplement", "补充给「回复供应商报价」"], ["for-event", "为「周五评审」办"], ["other-item", "放到事项「品牌规范落地」"]] as const) {
    assert.match(reply, new RegExp(`data-placed="${kind}">[\\s\\S]*?<span class="work-reply-placed-where" title="${words}">${words}</span><button[^>]*data-place-change=`, "u"), kind);
  }
  assert.match(reply, /class="work-reply-returned" data-state="failed">[\s\S]*?任务失败 · 写讲稿提纲[\s\S]*?data-task-control="retry"[\s\S]*?data-task-open="t-talk"/u, "a failed task says so and offers retry and the task");
});

test("WLN-35: the panel is placed by the product's rule next to the dialog it belongs to, and the mark names it", () => {
  const html = main(frame("zh"));
  const floats = [...html.matchAll(/<div class="work-task-float" data-work-task-float="([^"]+)"><section class="work-task-panel" id="([^"]+)"/gu)];
  assert.deepEqual(floats.map(match => match[1]), ["wl-dialog-main", "wl-dialog-narrow", "wl-dialog-offline"]);
  for (const [, dialog, panel] of floats) {
    assert.ok(html.includes(`<section class="assistant-panel" id="${dialog}"`), dialog!);
    assert.ok(html.includes(`aria-controls="${panel}"`), `the mark names the panel it opens: ${panel}`);
  }
});

test("WLN-08, WLN-09, WLN-11: the event card has its three forms: work in progress, a decision asked for, a result to accept", () => {
  const html = main(frame("zh"));
  const cards = html.slice(html.indexOf('data-nav-specimen="wl-event-card"'), html.indexOf('data-nav-specimen="wl-peek"'));
  assert.deepEqual([...cards.matchAll(/data-event-card="([^"]+)"/gu)].map(match => match[1]), ["fix", "quote", "plan"]);
  const [live, decision, acceptance] = cards.split('<article class="work-card"').slice(1) as [string, string, string];
  assert.match(live, /class="work-card-quote">把首屏错位修了[\s\S]*data-task-open="t-fix"[\s\S]*class="work-task-step-who">Coding<[\s\S]*class="work-task-step-who">助理</u, "the words asked, the task behind it, and who does each step");
  assert.deepEqual([live.includes("data-task-control"), live.split(">停止<").length - 1], [false, 1], "one way to stop the work, on the card, not a second one on its only task");
  assert.match(decision, /data-task-open="t-quote"[\s\S]*选第一家[\s\S]*选第二家/u);
  assert.match(acceptance, /class="work-card-source"[\s\S]*已核对 v3[\s\S]*等你看[\s\S]*>认可<[\s\S]*>再改改<[\s\S]*>逐项审阅<[\s\S]*aria-label="打开成标签"[\s\S]*aria-label="放到 Shelf"/u);
  for (const card of [live, decision, acceptance]) assert.match(card, /data-event-park=/u, "every form can be parked in the side panel");
});

test("WLN-03: what goes with the next message stands in the product's own strip above the one composer", () => {
  const html = main(frame("zh"));
  const hand = html.slice(html.indexOf('data-nav-specimen="wl-hand"'), html.indexOf('data-nav-specimen="wl-line"'));
  assert.match(hand, /<div class="assistant-context-strip" role="group" aria-label="这次发送带上的">/u);
  assert.equal([...hand.matchAll(/class="assistant-strip-chip"/gu)].length, 3);
  assert.equal([...hand.matchAll(/class="assistant-strip-act" aria-label="不带上：[^"]+"/gu)].length, 3, "each can be left out");
});

test("every button in the specimens has a name, in both languages, and no key is shown raw", () => {
  for (const locale of ["zh", "en"] as const) {
    const html = main(frame(locale));
    for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gu)) {
      const text = match[2]!.replace(/<svg[\s\S]*?<\/svg>/gu, "").replace(/<[^>]+>/gu, "").trim();
      assert.ok(/ aria-label="[^"]+"/u.test(match[1]!) || text.length > 0, `unnamed button: ${match[0].slice(0, 160)}`);
    }
    assert.doesNotMatch(html, /workbench\.work-line/u);
    assert.doesNotMatch(html, /class="(?:task|reply|event-card)[-"]/u, "every class of these parts starts with work-");
  }
  const en = main(frame("en"));
  assert.match(en, /Background tasks · 2 in progress/u);
  assert.match(en, /New event “Fix/u);
  assert.match(en, /aria-label="1 needs you"/u);
  assert.doesNotMatch(en.replace(/林夏|Lin Xia/gu, ""), /[一-鿿]/u, "the English frame has no Chinese left");
});
