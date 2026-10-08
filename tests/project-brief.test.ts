import assert from "node:assert/strict";
import test from "node:test";
import {
  composeProjectBrief,
  createBriefTime,
  createWorkbenchProjectBriefRenderer,
  currentBriefGoal,
  summarizeProjectBrief,
  type BriefEvent,
  type BriefGoal,
  type ProjectBriefInput,
} from "../apps/workbench/src/arrival/project-brief.js";

// The project brief (specs/archive/project-arrival-flow): what the chooser's sheet says about a project, decided from what the
// public readers returned. It never fills a gap with a guess, so each test is a gap or a rule about one.

const NOW = "2026-10-01T10:00:00.000Z";
const hours = (n: number) => new Date(Date.parse(NOW) - n * 3_600_000).toISOString();

const goal = (id: string, status: BriefGoal["work_status"], hoursAgo: number, extra: Partial<BriefGoal> = {}): BriefGoal =>
  ({ goal_id: id, title: `目标 ${id}`, work_status: status, next_hint: "", pending_decision_count: 0, updated_at: hours(hoursAgo), ...extra });
const event = (id: string, placement: BriefEvent["placement"], hoursAgo: number, extra: Partial<BriefEvent> = {}): BriefEvent =>
  ({ event_id: id, title: `事项 ${id}`, summary: "", occurred_at: hours(hoursAgo), placement, needs_attention: false, open: null, source_title: "来源", ...extra });
const input = (extra: Partial<ProjectBriefInput> = {}): ProjectBriefInput =>
  ({ project_id: "p1", name: "项目一", personal: false, demo: false, opened_at: null, description: null, goals: [], events: [], workspace_path: null, now: NOW, ...extra });

const L = (text: string, values: Record<string, string | number> = {}) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const renderer = createWorkbenchProjectBriefRenderer({ L, escapeHtml, dateTimeLocale: () => "zh-CN" });

test("the current goal is the open one touched last, and none when nothing is open", () => {
  assert.equal(currentBriefGoal([goal("a", "open", 5), goal("b", "open", 1), goal("c", "completed", 0)])?.goal_id, "b");
  assert.equal(currentBriefGoal([goal("a", "completed", 1), goal("b", "cancelled", 2)]), null);
  assert.equal(currentBriefGoal([]), null);
});

test("the goal track runs finished goals oldest first, then the open ones with the current one in play", () => {
  const model = composeProjectBrief(input({ goals: [goal("open-old", "open", 30), goal("done-new", "completed", 10), goal("done-old", "completed", 50), goal("open-new", "open", 2), goal("gone", "cancelled", 1)] }));
  assert.deepEqual(model.goals?.track.map(item => [item.title, item.state]), [
    ["目标 done-old", "done"], ["目标 done-new", "done"], ["目标 open-new", "doing"], ["目标 open-old", "todo"],
  ]);
  assert.equal(model.goals?.total, 4, "a cancelled goal is not part of the count");
  assert.equal(model.goals?.done, 2);
  assert.equal(model.goals?.current?.goal_id, "open-new");
  assert.deepEqual(model.issues, []);
});

test("a long history keeps the newest finished goals beside every open one, and the count still says how many in all", () => {
  const done = Array.from({ length: 20 }, (_, index) => goal(`d${String(index).padStart(2, "0")}`, "completed", 100 - index));
  const open = [goal("o1", "open", 2), goal("o2", "open", 3)];
  const model = composeProjectBrief(input({ goals: [...done, ...open] }));
  assert.equal(model.goals?.track.length, 12);
  assert.equal(model.goals?.total, 22);
  assert.deepEqual(model.goals?.track.slice(-2).map(item => item.state), ["doing", "todo"]);
  assert.equal(model.goals?.track[0]?.title, "目标 d10", "the oldest finished goals fall off the front");
  const crowded = composeProjectBrief(input({ goals: Array.from({ length: 15 }, (_, index) => goal(`o${index}`, "open", index)) }));
  assert.equal(crowded.goals?.track.length, 12, "open goals alone are capped too");
});

test("goals that could not be read are an issue, not an empty project", () => {
  const model = composeProjectBrief(input({ goals: null }));
  assert.equal(model.goals, null);
  assert.deepEqual(model.issues, ["goals"]);
  const empty = composeProjectBrief(input({ goals: [] }));
  assert.deepEqual(empty.goals, { total: 0, done: 0, current: null, track: [] });
  assert.deepEqual(empty.issues, []);
});

test("what is ahead comes first, what waits on the person before the rest, and what just happened follows", () => {
  const events = [
    event("past-1", "occurred", 1), event("past-2", "occurred", 3), event("past-3", "occurred", 5), event("past-4", "occurred", 7),
    event("today", "today", 2), event("active", "active", 4), event("late", "occurred", 9, { needs_attention: true }),
    event("also", "today", 6), event("more", "active", 8),
  ];
  const model = composeProjectBrief(input({ events }));
  assert.deepEqual(model.next.map(item => item.title), ["事项 late", "事项 today", "事项 active"], "needs-attention first, then newest, three at most");
  assert.equal(model.next[0]?.attention, true);
  assert.deepEqual(model.recent.map(item => item.title), ["事项 past-1", "事项 past-2", "事项 past-3"], "occurred, newest first, three at most, none of them already shown above");
  const caption = composeProjectBrief(input({ events: [event("x", "today", 1, { summary: "", source_title: "待办" }), event("y", "today", 2, { summary: "明早九点前", source_title: "日程" })] }));
  assert.deepEqual(caption.next.map(item => item.caption), ["待办", "明早九点前"], "a summary wins over the source's name");
});

test("events that could not be read leave the lists empty and say so", () => {
  const model = composeProjectBrief(input({ events: null }));
  assert.deepEqual([model.next, model.recent, model.issues], [[], [], ["events"]]);
});

test("the row summary reads the waiting count from Home's events, and from the goals only when the events are unreadable", () => {
  const goals = [goal("a", "open", 1, { pending_decision_count: 2 }), goal("b", "open", 2, { pending_decision_count: 1 }), goal("c", "completed", 3, { pending_decision_count: 5 })];
  const events = [event("e1", "today", 1, { needs_attention: true }), event("e2", "today", 2), event("e3", "occurred", 3, { needs_attention: true })];
  const withEvents = composeProjectBrief(input({ goals, events, opened_at: hours(4) }));
  assert.deepEqual(summarizeProjectBrief(withEvents, events, goals), { project_id: "p1", goals_done: 1, goals_total: 3, current: "目标 a", waiting: 2, opened_at: hours(4) });
  const noEvents = composeProjectBrief(input({ goals, events: null }));
  assert.equal(summarizeProjectBrief(noEvents, null, goals).waiting, 3, "decisions of open goals only");
  const noGoals = composeProjectBrief(input({ goals: null, events: null }));
  assert.deepEqual(summarizeProjectBrief(noGoals, null, null), { project_id: "p1", goals_done: null, goals_total: null, current: null, waiting: 0, opened_at: null }, "unreadable stays null, never zero");
});

test("time reads as people say it: just now, minutes, hours, yesterday, days, then a date", () => {
  const time = createBriefTime({ L, dateTimeLocale: () => "zh-CN" }, "2026-10-01T10:00:00");
  const ago = (iso: string) => time.ago(iso);
  assert.equal(ago("2026-10-01T09:59:40"), "刚刚");
  assert.equal(ago("2026-10-01T09:30:00"), "30 分钟前");
  assert.equal(ago("2026-10-01T07:00:00"), "3 小时前");
  assert.equal(ago("2026-09-30T23:00:00"), "昨天");
  assert.equal(ago("2026-09-28T09:00:00"), "3 天前");
  assert.match(ago("2026-09-10T09:00:00"), /9月10日|9\/10/);
  assert.equal(time.ago(null), "");
  assert.equal(time.ago("not a date"), "");
  assert.equal(time.when("2026-10-01T08:05:00"), "今天 08:05");
  assert.equal(time.when("2026-09-30T22:14:00"), "昨天 22:14");
});

test("the brief reads title, description, the goal in play and what is next, and escapes what a person typed", () => {
  const goals = [goal("g1", "completed", 50), goal("g2", "open", 2, { title: "整理 <b>发布</b> 清单", next_hint: "先核对版本号" }), goal("g3", "open", 20)];
  const events = [event("e1", "today", 1, { title: "周五前回复邮件", needs_attention: true, open: { surface: "inbox", id: "m 1", title: "邮件" } })];
  const html = renderer.renderProjectBrief(composeProjectBrief(input({ name: "A & B <项目>", description: "把发布流程梳理清楚。", goals, events, opened_at: hours(3), workspace_path: "~/code/a" })));
  assert.match(html, /<h1 class="mw-brief__title"[^>]*>A &amp; B &lt;项目&gt;<\/h1>/);
  assert.match(html, /把发布流程梳理清楚。/);
  assert.match(html, /进行中/);
  assert.match(html, /最近打开 <time datetime="[^"]+" data-relative>3 小时前<\/time>/);
  assert.match(html, /当前目标/);
  assert.match(html, /整理 &lt;b&gt;发布&lt;\/b&gt; 清单/);
  assert.doesNotMatch(html, /<b>发布<\/b>/);
  assert.match(html, /先核对版本号/, "the goal's own next hint is the body when nothing more is known");
  assert.match(html, /1<\/b> \/ 3 完成/);
  assert.match(html, /等你确认/);
  assert.match(html, /href="\/projects\/p1\/\?openPlugin=inbox&amp;openItem=m\+1&amp;openTitle=%E9%82%AE%E4%BB%B6"/);
  assert.match(html, /工作目录 ~\/code\/a/);
  // The recorded progress outranks the hint when the host read one.
  const detailed = renderer.renderProjectBrief(composeProjectBrief(input({ goals, current_detail: "已完成两项，剩发布说明。" })));
  assert.match(detailed, /已完成两项，剩发布说明。/);
  assert.doesNotMatch(detailed, /先核对版本号/);
});

test("a project with no description or goals says what is missing instead of inventing it", () => {
  const html = renderer.renderProjectBrief(composeProjectBrief(input({ goals: [], events: [] })));
  assert.match(html, /还没有项目描述/);
  assert.match(html, /还没有目标/);
  assert.match(html, /data-text="帮我为这个项目起草几个目标"/);
  assert.doesNotMatch(html, /未设目标|目标进行中|目标已完成/, "a project with no goals claims no state of its own");
  assert.match(html, /各插件有要推进或等你确认的事时，会出现在这里。/);
  assert.match(html, /还没有动静。/);
  assert.doesNotMatch(html, /工作目录/);
});

test("a brief that could not read says which part, and the rest of the sheet still stands", () => {
  const html = renderer.renderProjectBrief(composeProjectBrief(input({ goals: null, events: null, description: "一句话。" })));
  assert.match(html, /暂时读不到事项，进入项目可以看到。/);
  assert.match(html, /暂时读不到动静。/);
  assert.doesNotMatch(html, /当前目标|还没有目标/, "no goal focus is drawn for goals nobody read");
  assert.match(html, /一句话。/);
});

test("when every goal is done the focus says so, and a demo project says it can be rebuilt", () => {
  const html = renderer.renderProjectBrief(composeProjectBrief(input({ demo: true, goals: [goal("a", "completed", 3), goal("b", "completed", 2)] })));
  assert.match(html, /已完成/);
  assert.match(html, /目标全部完成/);
  assert.match(html, /2 个目标都完成了/);
  assert.match(html, /演示数据，可随时重建/);
});

test("the personal space reads as a place, with no goals drawn and no description to write", () => {
  const html = renderer.renderProjectBrief(composeProjectBrief(input({ project_id: "personal", name: "personal", personal: true, goals: [goal("a", "open", 1)], events: [] })));
  assert.match(html, /<h1 class="mw-brief__title"[^>]*>个人空间<\/h1>/);
  assert.match(html, /只有你能看到/);
  assert.match(html, /不属于任何项目的资料和工作/);
  assert.doesNotMatch(html, /当前目标|还没有项目描述|还没有目标/);
});

test("the loading and error sheets keep the name and the project they stand for", () => {
  const loading = renderer.renderProjectBriefLoading('A "B"', "p<1>");
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /data-id="p&lt;1&gt;"/);
  assert.match(loading, /A &quot;B&quot;/);
  const failed = renderer.renderProjectBriefError("项目一", "p1", "timeout");
  assert.match(failed, /role="alert"|mw-empty--error/);
  assert.match(failed, /项目简介暂时读不到/);
  assert.match(failed, /项目一/);
});
