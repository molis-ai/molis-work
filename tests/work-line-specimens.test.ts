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
  for (const id of ["wl-event", "wl-head", "wl-task-mark", "wl-task-panel", "wl-reply", "wl-event-card", "wl-peek", "wl-line", "wl-dialog"]) {
    assert.ok(html.includes(`data-nav-specimen="${id}"`), `specimen ${id}`);
  }
});

test("WLN-17: an event's accessible name says who registered it, its name and where it stands", () => {
  const events = tags(main(frame("zh")), /<button type="button" class="work-event"[^>]*>/gu);
  assert.ok(events.length >= 9);
  for (const tag of events) {
    const label = attr(tag, "aria-label") ?? "";
    assert.ok(label.length > 0, tag);
    if (attr(tag, "data-state") !== "unreadable") assert.match(label, /^(Goals|Pages|Coding|Feed|Jelly|Todo) · /u, label);
  }
  const waiting = events.find(tag => attr(tag, "data-state") === "wait")!;
  assert.match(attr(waiting, "aria-label")!, /^Todo · 回复供应商报价 · 等你定$/u);
  const states = new Set(events.map(tag => attr(tag, "data-state")));
  for (const state of ["", "running", "wait", "failed", "done", "stale", "unreadable"]) assert.ok(states.has(state), `state ${state}`);
});

test("WLN-19: the head says the work item, and how many of its events wait", () => {
  const heads = tags(main(frame("zh")), /<button type="button" class="work-line-head"[^>]*>/gu);
  assert.ok(heads.some(tag => attr(tag, "aria-label") === "网站改版"));
  assert.ok(heads.some(tag => /· 2 件等你$/u.test(attr(tag, "aria-label") ?? "")));
  for (const tag of heads) assert.equal(attr(tag, "aria-haspopup"), "menu");
});

test("WLN-35: the task mark tells in progress, needs you, failed and disconnected apart, and names itself", () => {
  const marks = tags(main(frame("zh")), /<button type="button" class="task-mark"[^>]*>/gu);
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
  assert.match(list, /data-serves="none"/u, "a task that belongs to no event says so");
  assert.match(list, /class="task-panel-empty"/u);
  assert.match(list, /class="task-panel-banner" role="status"/u);
  assert.match(list, /data-task-reconnect/u);
  assert.match(list, /data-task-card="t-fix"[\s\S]*data-task-panel-list/u);
  assert.match(list, /data-step="current"/u);
});

test("every button in the specimens has a name, in both languages, and no key is shown raw", () => {
  for (const locale of ["zh", "en"] as const) {
    const html = main(frame(locale));
    for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gu)) {
      const text = match[2]!.replace(/<svg[\s\S]*?<\/svg>/gu, "").replace(/<[^>]+>/gu, "").trim();
      assert.ok(/ aria-label="[^"]+"/u.test(match[1]!) || text.length > 0, `unnamed button: ${match[0].slice(0, 160)}`);
    }
    assert.doesNotMatch(html, /workbench\.work-line/u);
  }
  const en = main(frame("en"));
  assert.match(en, /Background tasks · 2 in progress/u);
  assert.match(en, /Placed in/u);
  assert.doesNotMatch(en.replace(/林夏|Lin Xia/gu, ""), /[一-鿿]/u, "the English frame has no Chinese left");
});
