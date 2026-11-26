import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchRenderer, renderMolisWorkNavigationSpecimen, renderMolisWorkPrimitiveCatalog } from "@molis-ai/molis-work-app-workbench";
import { installHostUiText, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";

// 事项线的部件在组件板上的标本：/__ui/catalog/navigation?sheet=work-line。第 32 批定样（docs/design/work-line-32，方案 E）起的头，
// 第 36A 批按底栏第十三版（specs/screen-polish 第九节、docs/design/screen-polish/helm.html 第 34 屏）换成两栏的对话：对话栏
// 一行小标题、信息栏的四个标签、三张清单、任务的卡、卡叠。标本经产品要调的同一组函数（apps/workbench/src/work-line-parts.ts）画，
// 所以这里验的是部件自己的合同：读屏名字、状态区分、一行不折、两种语言。界面在浏览器里的样子由走查和 e2e 看，不在这里断言。

installHostUiText();

const frame = (locale: "zh" | "en") => runWithLocale(locale, () => renderMolisWorkNavigationSpecimen(t, locale === "zh" ? "zh-CN" : "en", "work-line"));
const main = (html: string) => html.slice(html.indexOf("<main"), html.indexOf("</main>"));
const tags = (html: string, pattern: RegExp) => [...html.matchAll(pattern)].map(match => match[0]);
const attr = (tag: string, name: string) => new RegExp(` ${name}="([^"]*)"`, "u").exec(tag)?.[1];
const IDS = ["wl-event", "wl-stack", "wl-lists", "wl-task-panel", "wl-reply", "wl-event-card", "wl-event-page", "wl-hand", "wl-line", "wl-dialog"] as const;
/** One specimen's markup: from its marker to the next specimen's. */
const part = (html: string, id: (typeof IDS)[number]) => { const next = IDS[IDS.indexOf(id) + 1]; return html.slice(html.indexOf(`data-nav-specimen="${id}"`), next ? html.indexOf(`data-nav-specimen="${next}"`) : undefined); };
const bare = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/gu, "");

test("the board has a 事项线 section whose frame is the navigation frame with the work-line sheet", () => {
  const board = runWithLocale("zh", () => renderMolisWorkPrimitiveCatalog());
  assert.match(board, /<section class="mw-catalog__section" id="work-line"/u);
  assert.match(board, /<a href="#work-line"/u, "the index links to the section");
  assert.match(board, /data-nav-frame src="\/__ui\/catalog\/navigation\?lang=zh&amp;sheet=work-line"/u);
  const html = frame("zh");
  assert.match(html, /<link rel="stylesheet" href="\/assets\/molis-work-workbench\.css">/u, "drawn by the sheet the product loads");
  assert.deepEqual([...html.matchAll(/data-nav-specimen="(wl-[a-z-]+)"/gu)].map(match => match[1]), [...IDS]);
});

test("WLN-17: an event's accessible name says who registered it, what kind it is, its name and where it stands", () => {
  const html = main(frame("zh"));
  const events = tags(html, /<button type="button" class="work-event"[^>]*>/gu);
  assert.ok(events.length >= 14);
  for (const tag of events) {
    const label = attr(tag, "aria-label") ?? "";
    assert.ok(label.length > 0, tag);
    if (attr(tag, "data-state") !== "unreadable") assert.match(label, /^(Roadmap|Notebook|Workshop|Digest|Agenda|Checklist) · (文档|周报|代码改动|目标|待办|日程) · /u, label);
    assert.doesNotMatch(tag, / aria-current="false"/u, "aria-current is only written when it is true");
  }
  const waiting = events.find(tag => attr(tag, "data-state") === "wait")!;
  assert.equal(attr(waiting, "aria-label"), "Checklist · 待办 · 回复供应商报价 · 等你定 · 选哪一家");
  const denied = events.find(tag => attr(tag, "data-state") === "denied")!;
  assert.equal(attr(denied, "aria-label"), "Roadmap · 目标 · 无权查看", "WLN-28: an event the person may not view has no name");
  const states = new Set(events.map(tag => attr(tag, "data-state")));
  for (const state of ["", "queued", "running", "wait", "failed", "stopped", "verify", "done", "gone", "denied", "unreadable"]) assert.ok(states.has(state), `state ${state}`);
  // A state that asks for attention is a word on the row, not only a colour (WLN-17); the quiet ones keep theirs for the reader.
  for (const [state, word] of [["wait", "等你定"], ["failed", "失败"], ["stopped", "已停止"], ["verify", "结果待核对"], ["gone", "已不在"], ["denied", "无权查看"]] as const) {
    assert.match(html, new RegExp(`data-state="${state}" data-attn[^>]*>(?:(?!</button>)[\\s\\S])*?<span class="work-event-note">${word}[ <]`, "u"), state);
  }
  assert.doesNotMatch(html, /data-state="running" data-attn/u);
});

test("POLISH-43 (the parts): the card stack's card answers one question in place, says how many are behind it, and has a card for the main conversation, one for what wants a look, and one quiet line when nothing waits", () => {
  for (const locale of ["zh", "en"] as const) {
    const stack = part(main(frame(locale)), "wl-stack");
    assert.deepEqual([...stack.matchAll(/data-work-stack-card="([a-z]+)"/gu)].map(match => match[1]), ["quote", "talk", "main", "look"], locale);
    const [direct, behind, mainCard, look] = stack.split('<article class="work-stack-card"').slice(1) as [string, string, string, string];
    // One question with at most two answers is answered on the card: the same decision as on the event's card (the page's one handler for [data-task-decision]).
    assert.match(direct, /data-task-decision="d-quote" data-task="t-quote"[\s\S]*data-decision-answer="approve"[\s\S]*data-decision-answer="reject"[\s\S]*data-work-stack-open="quote"/u);
    assert.doesNotMatch(direct, /data-work-stack-next/u, "with nothing behind it the corner only says it is your turn");
    assert.match(behind, /data-behind="2"[\s\S]*<button type="button" class="work-stack-more" data-work-stack-next>/u, "with more behind it the corner turns to the next");
    assert.match(bare(behind), locale === "zh" ? /该你 · 还有 2 件/u : /2 more/u);
    // 等你的八种 (specs/screen-polish 第九节): the Assistant's main conversation waiting for a confirmation is one card with 打开 and no answer on it (user 2026-11-21, 方案 A).
    assert.match(mainCard, /^[^>]* data-main [^>]*>[\s\S]*class="work-stack-dot"[\s\S]*data-work-stack-main/u);
    assert.doesNotMatch(mainCard, /data-decision-answer|data-task-decision/u, "the answer is given in that conversation, where the confirmation card is");
    // …and the objects that want a look (the bell's objects, user 2026-11-17 第 19 条) are one card whose 打开 lists them.
    assert.match(look, /^[^>]* data-look [^>]*>[\s\S]*data-work-stack-look aria-haspopup="true"/u);
    assert.match(bare(look), locale === "zh" ? /有 3 样东西要你看/u : /3 things for you to look at/u);
    assert.match(stack, /<p class="work-stack-empty">/u);
  }
});

test("WLN-37 (as specs/work-line §16 rewrote it), POLISH-16: the three lists are keys inside the input's slot; in the open list a source that cannot be read stands above what scrolls, the rest reads, and 办完 ends in 更早 N (their behaviour: tests/work-line-layout.e2e.test.ts)", () => {
  const html = main(frame("zh"));
  const lines = part(html, "wl-line").split('<div class="work-line" data-work-line').slice(1);
  assert.equal(lines.length, 4);
  for (const line of lines) {
    assert.match(line, /^ role="region" aria-label="底栏"/u);
    // 办完, 在办 and 接下来 are inside the input's top right, after the input itself; the expand key carries the dot.
    const slot = line.indexOf("data-work-line-slot"), counts = line.indexOf("data-work-counts"), composer = line.indexOf("data-slot=\"composer\"");
    assert.ok(slot >= 0 && composer > slot && counts > composer, "the counts are in the input's slot, after the composer");
    assert.deepEqual([...line.matchAll(/data-work-list="([a-z]+)"/g)].map(match => match[1]), ["done", "now", "next"]);
    assert.doesNotMatch(line, /class="work-lists"|data-work-lists\b/u, "POLISH-69: the foot holds no list of its own; the lists are the information column's");
  }
  assert.deepEqual(tags(lines[0]!, /<button type="button" class="work-count"[^>]*>/gu).map(tag => attr(tag, "aria-label")), ["办完 · 3 件", "在办 · 2 件", "接下来 · 4 件"], "each key says its list and how many");
  // POLISH-20 / 第九节: the expand key shows one dot for a reply that came while closed, amber while the main conversation waits; no words stay above the input.
  assert.deepEqual(lines.map(line => /data-work-expand-dot data-waits/u.test(line)), [false, false, true, false]);
  for (const line of lines) assert.doesNotMatch(line, /work-reply-mini|work-reply-peek|data-task-mark/u);
  // The disconnected conversation shows 在办 with a source that cannot be read.
  const offline = part(html, "wl-dialog").split('<section class="assistant-panel"').at(-1)!;
  assert.match(offline, /<section class="work-lists"[^>]*\bdata-work-lists\b[^>]*>/u);
  assert.doesNotMatch(offline, /<section class="work-lists"[^>]*\bhidden>/u, "the list is open");
  const sources = offline.indexOf("data-work-lists-sources"), retry = offline.indexOf("data-work-line-retry"), body = offline.indexOf("data-work-lists-body");
  assert.ok(sources > 0 && retry > sources && body > retry, "an unreadable source stands in the strip above what scrolls, not among the rows");
  assert.ok((offline.slice(body).match(/class="work-event"/g) ?? []).length >= 2, "the rest of the list reads as usual");
  assert.match(part(html, "wl-lists"), /data-work-lists-earlier>更早 5</u, "办完 ends in 更早 N");
});

test("WLN-35, WLN-36, POLISH-69: background tasks have one way in, 在办: a task is a row under its event with its step and who does it, a sub-agent's step a row under its task, tasks of no event close the list; there is no task mark and no panel", () => {
  const html = main(frame("zh"));
  assert.doesNotMatch(html, /work-task-mark|data-task-mark|work-task-banner|work-task-group|work-task-empty|data-task-panel-list/u, "the mark above the dialog and the panel's own list are gone");
  const now = part(html, "wl-lists").split('<section class="work-lists">')[2]!;
  // An event is one row; what is done for it is indented under it (data-level 1), and a sub-agent's step under its task (2).
  assert.deepEqual([...now.matchAll(/data-level="(\d)"[^>]*><button type="button" class="work-task-row-main" data-(task|subtask)-open="([^"]+)"/gu)].map(match => [match[1], match[2], match[3]]),
    [["1", "task", "t-fix"], ["2", "subtask", "s-shots"], ["1", "task", "t-talk"], ["1", "task", "t-notes"]]);
  assert.ok(now.indexOf('data-work-event="fix"') < now.indexOf('data-task-open="t-fix"') && now.indexOf('data-task-open="t-fix"') < now.indexOf('data-work-event="goal"'), "a task stands under its event");
  assert.match(now, /class="work-task-row-step">跑测试 · 第 3\/4 步 · Workshop</u, "the step comes first, then who");
  assert.match(now, /<p class="work-list-group">不属于事件<\/p><div class="work-task-row" data-level="1"[^>]*><button[^>]*data-task-open="t-notes"/u, "tasks that belong to no event close 在办 as their own group");
  assert.match(now, /data-task-control="stop" data-task="t-fix"[\s\S]*data-task-control="retry" data-task="t-talk"/u, "stop or retry in place");
  // A row opens the task's card (in the float that takes the information column's place), which leads back to what the column showed.
  const card = part(html, "wl-task-panel");
  assert.match(card, /<section class="work-task-panel" id="work-task-panel" data-task-panel data-task-card="t-fix" role="dialog" aria-label="修首屏布局">[\s\S]*aria-label="返回"[^>]*data-task-panel-close/u);
  assert.match(card, /<dt>状态<\/dt><dd>[\s\S]*?进行中 · 第 3\/4 步/u, "a task's state stands with its facts, not squeezed into the head");
  assert.match(card, /<dt>为哪个事件<\/dt>[\s\S]*?data-place-change="t-fix" aria-haspopup="menu"/u, "改 for where it belongs");
  assert.deepEqual([...card.matchAll(/data-step="([a-z]+)"/gu)].map(match => match[1]), ["done", "done", "current", "todo"]);
  // POLISH-54 (the part): while the connection is lost each row says 正在核对 and offers nothing to press.
  const offline = part(html, "wl-dialog").split('<section class="assistant-panel"').at(-1)!;
  const rows = tags(offline.slice(offline.indexOf("data-work-lists-body")), /<div class="work-task-row"[^>]*>[\s\S]*?<\/div>/gu);
  assert.ok(rows.length >= 3);
  for (const row of rows) { assert.match(row, /class="work-task-row-main"[^>]* disabled/u); assert.match(row, /class="work-task-row-step">正在核对</u); assert.doesNotMatch(row, /data-task-control/u); }
});

test("WLN-32: a reply says where the work went in one of five ways, each with a way to change it", () => {
  const reply = part(main(frame("zh")), "wl-reply");
  for (const [kind, words] of [["new-event", "新事件「修首屏布局」"], ["none", "不属于事件 · 在后台任务里"], ["supplement", "补充给「回复供应商报价」"], ["for-event", "为「周五评审」办"], ["other-item", "放到事项「品牌规范落地」"]] as const) {
    assert.match(reply, new RegExp(`data-placed="${kind}">[\\s\\S]*?<span class="work-reply-placed-where" title="${words}">${words}</span><button[^>]*data-place-change=`, "u"), kind);
  }
  assert.match(reply, /class="work-reply-returned" data-state="failed">[\s\S]*?任务失败 · 写讲稿提纲[\s\S]*?data-task-control="retry"[\s\S]*?data-task-open="t-talk"/u, "a failed task says so and offers retry and the task");
});

test("WLN-06: a task that waits on the person is the platform's own row in the conversation, with 「去处理」, folded with nothing to press once it no longer waits", () => {
  for (const locale of ["zh", "en"] as const) {
    const reply = part(main(frame(locale)), "wl-reply");
    const rows = tags(reply, /<div class="work-reply-waiting"[^>]*>[\s\S]*?<\/div>/gu);
    const open = rows.find(row => row.includes('data-waiting="open"')), settled = rows.find(row => row.includes('data-waiting="settled"'));
    assert.ok(open && settled, locale);
    assert.match(open, /role="status"/u);
    assert.match(open, new RegExp(`<button[^>]*data-waiting-go="t-quote"[^>]*>[\\s\\S]*?${locale === "zh" ? "去处理" : "Handle"}`, "u"), "the one button says 「去处理」");
    assert.doesNotMatch(open, /去定|>Decide</u);
    assert.doesNotMatch(settled, /<button/u, "a folded row offers nothing to press");
    assert.match(settled, locale === "zh" ? /不再等你了/u : /no longer needs you/u, "and says so in words");
  }
});

test("WLN-08, WLN-09, WLN-11: what is known about an event is said in a fixed order — what is asked of you, how it stands — in its three forms: work in progress, a decision asked for, a result to accept", () => {
  const cards = part(main(frame("zh")), "wl-event-card");
  assert.deepEqual([...cards.matchAll(/data-event-card="([^"]+)"/gu)].map(match => match[1]), ["fix", "quote", "plan"]);
  const [live, decision, acceptance] = cards.split('<article class="work-card"').slice(1) as [string, string, string];
  for (const card of [live, decision, acceptance]) {
    assert.ok(card.indexOf("data-card-ask") < card.indexOf("work-card-now"), "该你做的 comes before 这件事现在怎样");
    // POLISH-46 (as rewritten): the column's order is what is asked of you, then how it stands; there is no 「到现在为止」 part.
    assert.deepEqual([...card.matchAll(/class="work-card-part (work-card-[a-z]+)/gu)].map(match => match[1]).slice(0, 2), ["work-card-ask", "work-card-now"]);
    assert.doesNotMatch(card, /到现在为止/u);
    assert.match(card, /data-event-park=/u, "every form can be parked in the side panel");
  }
  assert.match(live, /data-card-ask hidden>/u, "nothing is asked while it is only being worked on");
  assert.match(live, /class="work-card-quote">把首屏错位修了[\s\S]*data-level="1"[^>]*><button[^>]*data-task-open="t-fix"[\s\S]*class="work-task-row-step">跑测试 · 第 3\/4 步 · Workshop<[\s\S]*data-level="2"[^>]*><button[^>]*data-subtask-open="s-shots"/u, "the words asked, the task behind it with its step and who does it, and the step it gave a sub-agent under it");
  assert.equal(live.split(">停止<").length - 1, 1, "one way to stop the work: on its task's row");
  assert.match(decision, /data-card-ask>[\s\S]*data-task-decision="d-quote"[\s\S]*data-task-open="t-quote"/u, "the question heads the card, the task that asks stands below");
  assert.match(acceptance, /class="work-card-source"[\s\S]*已核对 v3[\s\S]*等你看[\s\S]*>认可<[\s\S]*>再改改<[\s\S]*>逐项审阅<[\s\S]*aria-label="打开成标签"[\s\S]*aria-label="放到 Shelf"/u);
});

test("WLN-07, POLISH-22 (the parts): the page the platform draws for an event that has none of its own says what is asked first, then what its owner registered — its words and its facts — beside who registered it, how it stands and the tasks done for it", () => {
  const page = part(main(frame("zh")), "wl-event-page");
  assert.match(page, /<article class="work-event-page" data-event-card="quote" data-event-page>/u);
  const ask = page.indexOf("data-card-ask>"), own = page.indexOf("data-card-own>"), side = page.indexOf('class="work-event-page-side"');
  assert.ok(ask > 0 && own > ask && side > own, "asked of you, then the owner's part, then the facts column");
  assert.match(page.slice(ask, own), /data-task-decision="d-quote"[\s\S]*data-decision-answer="approve"[\s\S]*data-decision-answer="revise"[\s\S]*data-decision-answer="reject"/u);
  assert.equal((page.match(/mw-btn--primary/gu) ?? []).length, 1, "POLISH-51: one primary on the page, the first answer");
  assert.match(page.slice(own, side), /<p class="work-card-own-words">第一家 4\.2 万[^<]*<\/p><dl class="work-card-own-facts"><dt>截止<\/dt><dd title="周五 18:00">周五 18:00<\/dd><\/dl>/u, "the owner's own words and facts, as registered");
  assert.match(page.slice(side), /<dd data-fact-owner[^>]*>Checklist<\/dd>[\s\S]*<dd data-fact-state[^>]*>等你定<\/dd>[\s\S]*data-card-tasks>[\s\S]*data-task-open="t-quote"/u);
});

test("WLN-03: what goes with the next message stands in the product's own strip above the one composer", () => {
  const hand = part(main(frame("zh")), "wl-hand");
  assert.match(hand, /<div class="assistant-context-strip" role="group" aria-label="这次发送带上的">/u);
  assert.equal([...hand.matchAll(/class="assistant-strip-chip"/gu)].length, 3);
  assert.equal([...hand.matchAll(/class="assistant-strip-act" aria-label="不带上：[^"]+"/gu)].length, 3, "each can be left out");
});

test("POLISH-11, POLISH-18, POLISH-68, POLISH-69, WLN-07: the conversation is two columns — one line that names what is talked about with three keys, then only what was said; the information column's four tabs, one thing at a time; no tab row, no list in the conversation column", () => {
  for (const locale of ["zh", "en"] as const) {
    const dialogs = part(main(frame(locale)), "wl-dialog").split('<section class="assistant-panel"').slice(1);
    assert.equal(dialogs.length, 5, "main, a list, an event, a page that takes the words, disconnected");
    for (const dialog of dialogs) {
      assert.doesNotMatch(dialog, /assistant-tabbar|class="assistant-tab\b|data-assistant-tabs/u, "there is no tab row above the conversation");
      const head = dialog.slice(dialog.indexOf('<header class="assistant-head">'), dialog.indexOf("</header>"));
      assert.match(head, /<h2 class="assistant-head-title">[^<]+<\/h2><span class="assistant-head-note">[^<]+<\/span>/u, "the title line names what is talked about and whose it is");
      assert.deepEqual(tags(head, /<button class="dock-window-action"[^>]*>/gu).map(tag => attr(tag, "aria-label")), locale === "zh" ? ["最大化", "更多", "最小化"] : ["Maximize", "More", "Minimize"], "three keys: maximise, more, close");
      const mainColumn = dialog.slice(dialog.indexOf('class="assistant-main"'), dialog.indexOf('<aside class="assistant-side"'));
      assert.doesNotMatch(mainColumn, /class="work-lists"|class="work-event"|class="info-tab"/u, "the conversation column holds only what was said");
      const tabs = tags(dialog, /<button[^>]*class="info-tab"[^>]*>/gu);
      for (const tab of tabs) assert.equal(attr(tab, "role"), "tab");
      assert.deepEqual(tabs.map(tag => attr(tag, "data-info-tab")), ["info", "done", "now", "next"]);
      assert.equal(tabs.filter(tag => attr(tag, "aria-selected") === "true").length, 1, "one thing at a time");
      assert.deepEqual(tabs.map(tag => attr(tag, "tabindex")), tabs.map(tag => attr(tag, "aria-selected") === "true" ? "0" : "-1"), "the selected tab is the one stop of the row");
    }
    const [mainTalk, list, event, takes] = dialogs as [string, string, string, string, string];
    // The main conversation is no event: 信息 says how the place stands, and the tasks handed out from it.
    assert.match(mainTalk, /<aside class="assistant-side" data-info="info"[\s\S]*class="work-card work-place-card"[\s\S]*class="work-place-n" data-waits[\s\S]*data-place-list="now"[\s\S]*data-place-list="next"[\s\S]*data-place-list="done"[\s\S]*data-task-open="t-notes"/u);
    assert.doesNotMatch(mainTalk.slice(mainTalk.indexOf('<aside class="assistant-side"')), /data-event-card=/u);
    assert.match(list, /<aside class="assistant-side" data-info="now"[\s\S]*data-info-tab="now" aria-selected="true"[\s\S]*data-work-list-rows="now"/u, "a list takes the column while the conversation stays");
    assert.match(event, /class="assistant-head-mark"[^>]*><span class="work-event-mark"[\s\S]*<aside class="assistant-side" data-info="info"[\s\S]*data-event-card="quote"/u, "an event's conversation carries its owner's mark and its information");
    assert.match(takes, /class="assistant-main" data-page-takes>[\s\S]*<p class="assistant-page-takes"><span>[^<]+<\/span><button/u, "a page that takes the words itself says so once, with the way to ask the Assistant instead");
  }
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
  assert.match(en, /aria-label="In progress · 2"/u);
  assert.match(en, /New event “Fix/u);
  assert.match(en, /The Assistant is waiting for you to confirm/u);
  assert.doesNotMatch(en.replace(/林夏|Lin Xia/gu, ""), /[一-鿿]/u, "the English frame has no Chinese left");
});

test("work-line CSS keeps static fallbacks before CSS Anchor Positioning overrides", () => {
  const css = createWorkbenchRenderer({
    locale: {
      readText: key => key,
      currentLocale: () => "zh",
      htmlLang: () => "zh-CN",
      dateTimeLocale: () => "zh-CN",
      listJoin: items => items.join("、"),
      localeSwitchHref: () => "/",
    },
    desktop: {
      appendDesktopQueryToLocalHrefs: html => html,
      withDesktopQuery: path => path,
      bootstrapScript: "",
    },
    catalogTextPacks: () => [],
  }).renderMolisWorkWorkbenchStylesheet();
  assert.match(css, /\.work-event-page-facts>dd\[data-g="you"\]\{color:var\(--amber\)\}/u, "POLISH-41: event page state fact uses amber only for your-turn glyph");
  assert.match(css, /\.work-event-page-facts>dd\[data-g="bad"\]\{color:var\(--red\)\}/u, "POLISH-41: event page state fact uses red for failed glyph");
  assert.doesNotMatch(css, /\.work-event-page-facts>dd\[data-wing="next"\]/u, "POLISH-41: upcoming 'next' wing must not be coloured amber");
  assert.match(css, /\.work-counts\{[^}]*top:calc\(var\(--counts-top,0px\) \+ 6px\);/u, "desktop .work-counts has --counts-top fallback before anchor()");
  assert.match(css, /@media \(max-width:760px\),\(pointer:coarse\)\{[^@]*\.work-counts\{[^}]*top:calc\(var\(--counts-top,0px\) \+ 4px\);/u, "compact .work-counts has --counts-top fallback before anchor()");
  assert.match(css, /@media \(max-width:540px\)\{[^@]*\.work-counts\{[^}]*left:calc\(var\(--counts-left,0px\) \+ 10px\);/u, "narrow .work-counts offsets left by --counts-left for non-anchor column-1 bell");
  assert.match(css, /\.assistant-composer:has\(> \.mw-composer ~ \.assistant-attention:not\(\[hidden\]\)\)\s*\{[^}]*display:\s*grid/u, "non-anchor fallback puts .assistant-attention in column 1 for both rest and active composer");
  assert.match(css, /@supports \(anchor-name:\s*--x\)\s*\{[\s\S]*?\.mw-composer:not\(\[data-rest\]\) ~ \.assistant-attention\s*\{[^}]*position-anchor:\s*--assistant-receiver/u, "active composer .assistant-attention anchor positioning is guarded by @supports");
  assert.match(css, /@supports \(anchor-name:--x\)\{[\s\S]*?\.assistant-attention\{[^}]*position-anchor:--assistant-receiver/u, "resting work-line .assistant-attention anchor positioning is guarded by @supports");
  assert.match(css, /@supports \(anchor-name:--x\)\{[^}]*\.work-counts\{[^}]*top:calc\(anchor\(top,0px\) \+ 6px\)/u, "desktop anchor() for .work-counts is guarded by @supports");
  assert.match(css, /@supports \(anchor-name:--x\)\{[^}]*\.work-counts\{[^}]*top:calc\(anchor\(top,0px\) \+ 4px\)/u, "compact anchor() for .work-counts is guarded by @supports");
  assert.match(css, /body\.immersive-workbench > \.mw-env-badge\s*\{\s*bottom:\s*calc\(var\(--dock-h,\s*0px\) \+ 12px\);/u, ".mw-env-badge clears --dock-h on immersive workbench");
  // Every CSS Anchor declaration in the stylesheet must live inside an @supports (anchor-name: ...) block.
  let withoutAnchorSupports = "";
  for (let i = 0; i < css.length; ) {
    const match = /^@supports\s*\(\s*anchor-name\s*:[^)]*\)\s*\{/u.exec(css.slice(i));
    if (match) {
      i += match[0].length;
      let depth = 1;
      while (i < css.length && depth > 0) {
        if (css[i] === "{") depth += 1;
        else if (css[i] === "}") depth -= 1;
        i += 1;
      }
    } else {
      withoutAnchorSupports += css[i];
      i += 1;
    }
  }
  assert.doesNotMatch(withoutAnchorSupports, /\b(?:anchor-name|position-anchor)\s*:|\banchor\(/u, "no CSS Anchor property or function leaks outside @supports (anchor-name: ...)");
});
