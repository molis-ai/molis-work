import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { defineHomeEventsAction, defineSubjectContextAction, subjectContext, type ActionCallContext, type HomeEvent } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantService } from "../apps/local-host/src/assistant/assistant-service.js";

/**
 * A project with Goals and a Feed: items the Feed shows carry the Goals they belong to, as owners report them. The
 * Assistant needs no model for this — relevance is a shared Goal, read from the owners.
 */
test("new material that shares a Goal with a live work raises one merged notice; unrelated, repeated, its own and old items raise nothing", async () => {
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", storage_key: "memory:project" };
  const goals = new Map([["g-q4", "Q4 计划"], ["g-other", "别的目标"]]);
  const notes = new Map([["n1", ["g-q4"]]]);
  const feed: Array<HomeEvent & { goal_ids: string[] }> = [];
  const goalReader = defineSubjectContextAction("fixture.goal.read", "goal", "目标", []);
  const noteReader = defineSubjectContextAction("fixture.note.read", "note", "笔记", []);
  const itemReader = defineSubjectContextAction("fixture.item.read", "feed_item", "Feed 条目", []);
  const events = defineHomeEventsAction("fixture.feed.events", ["feed_item"], "Feed 首页事项", []);
  local.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture.feed", kind: "plugin", title: "Feed" }, definitions: [goalReader, noteReader, itemReader, events], handlers: [
    { ...goalReader, handle: (_c, input) => { const id = (input as { subject_id: string }).subject_id; return subjectContext({ subject: { kind: "goal", id }, revision: "1", title: goals.get(id)!, content: "", goal_ids: [id], session_id: null }); } },
    { ...noteReader, handle: (_c, input) => { const id = (input as { subject_id: string }).subject_id; return subjectContext({ subject: { kind: "note", id }, revision: "1", title: id, content: "", goal_ids: notes.get(id) ?? [], session_id: null }); } },
    { ...itemReader, handle: (_c, input) => { const id = (input as { subject_id: string }).subject_id; const item = feed.find(row => row.subject.id === id)!; return subjectContext({ subject: { kind: "feed_item", id }, revision: "1", title: item.title, content: "", goal_ids: item.goal_ids, session_id: null }); } },
    { ...events, handle: (_c, input) => { const window = input as { from: string; to: string };
      return { source: { surface: "feed", title: "Feed", icon: "rss" }, events: feed.filter(item => item.occurred_at >= window.from && item.occurred_at < window.to).map(({ goal_ids: _goals, ...event }) => event) }; } },
  ] });
  const person: ActionCallContext = { actor_id: "web-user", project_id: "project", audience: "user", permissions: [] };
  let clock = new Date("2026-09-29T09:00:00.000Z");
  const store = new AssistantStore(new DatabaseSync(":memory:"), () => clock);
  const service = new AssistantService(store, { host: async () => { throw new Error("no rounds here"); }, authority: async () => { throw new Error("no rounds here"); },
    scopeActions: async () => ({ discover: () => local.actionClient(project).discover(person), invoke: (action, input) => local.actionClient(project).invoke(person, action, input) }) }, "web-user", () => clock);
  const item = (id: string, title: string, at: string, goalIds: string[]): HomeEvent & { goal_ids: string[] } => ({ event_id: `feed:${id}`, subject: { kind: "feed_item", id }, occurred_at: at,
    placement: "occurred", category: "personal", title, summary: "", content: "", facts: [], needs_attention: false, open: null, goal_ids: goalIds });
  try {
    // A live work about note n1, which belongs to the Q4 goal.
    const work = store.create({ actor_id: "web-user", title: "整理 Q4 计划", scope: { kind: "project", project_id: "project" }, origin: null, project_ref: project });
    store.relations.link({ work_id: work.work_id, project_id: "project" }, "material", { kind: "note", id: "n1", revision: "1" }, "测试");
    // What was already there when the Assistant first looks is not news.
    feed.push(item("old", "早就在的 Q4 旧文", "2026-09-29T08:30:00.000Z", ["g-q4"]));
    assert.equal(await service.scanNewMaterial(), 0, "the first look only learns what is there");

    clock = new Date("2026-09-29T09:05:00.000Z");
    feed.push(item("a", "竞品发布了 Q4 路线图", "2026-09-29T09:01:00.000Z", ["g-q4"]), item("b", "午餐菜单", "2026-09-29T09:02:00.000Z", []),
      item("c", "另一个项目的周报", "2026-09-29T09:03:00.000Z", ["g-other"]));
    assert.equal(await service.scanNewMaterial(), 1, "only the item that shares the work's Goal");
    // Each look leaves a record of how far it got in each project, for diagnostics; looks never overlap.
    const record = JSON.parse(store.setting("web-user", "material_scan") ?? "{}");
    assert.equal(record.raised, 1);
    assert.ok(record.finished_at && record.projects[0].sources >= 1 && record.projects[0].goals >= 1 && record.projects[0].events >= 1, JSON.stringify(record));
    const overlapping = [service.scanNewMaterial(), service.scanNewMaterial()];
    assert.equal((await Promise.all(overlapping))[1], 0, "a look already running is not joined by another");
    const [notice] = service.notices(null);
    assert.equal(notice!.kind, "material");
    assert.match(notice!.text, /Feed 有新内容「竞品发布了 Q4 路线图」，和这项工作的目标「Q4 计划」有关/);

    // Looked at again: the same items raise nothing; a second relevant one merges into the same notice.
    clock = new Date("2026-09-29T09:10:00.000Z");
    assert.equal(await service.scanNewMaterial(), 0, "already seen");
    // Dated before the last look but turning up only now (its source is slow): still new.
    feed.push(item("d", "Q4 预算调整", "2026-09-29T09:06:00.000Z", ["g-q4"]));
    clock = new Date("2026-09-29T09:15:00.000Z");
    assert.equal(await service.scanNewMaterial(), 1);
    const merged = service.notices(null);
    assert.equal(merged.length, 1, "one notice per work");
    assert.match(merged[0]!.text, /Q4 预算调整.*另有 1 条/);

    // What the Assistant produced itself is not news to it.
    store.relations.link({ work_id: work.work_id, project_id: "project" }, "result", { kind: "feed_item", id: "e", revision: "1" }, "助理产出");
    feed.push(item("e", "助理自己写的 Q4 摘要", "2026-09-29T09:16:00.000Z", ["g-q4"]));
    clock = new Date("2026-09-29T09:20:00.000Z");
    assert.equal(await service.scanNewMaterial(), 0, "its own result raises nothing");

    // Settling the merged notice settles all of that work's; a rule can keep new material quiet.
    assert.equal(service.settleNotices({ notice_id: merged[0]!.notice_id }, "seen"), 2);
    assert.deepEqual(service.notices(null), []);
    service.saveRule({ kind: "quiet", surfaces: ["pages"], except: [], label: "写文档时不要提醒" });
    feed.push(item("f", "Q4 客户反馈", "2026-09-29T09:21:00.000Z", ["g-q4"]));
    clock = new Date("2026-09-29T09:25:00.000Z");
    await service.scanNewMaterial();
    assert.equal(service.notices("pages")[0]!.held?.reason, "写文档时不要提醒");

    // A work idle for more than a week is not watched; the Host being away for long does not replay the backlog.
    clock = new Date("2026-10-07T09:30:00.000Z");
    feed.push(item("g", "Q4 迟到的消息", "2026-10-07T09:29:00.000Z", ["g-q4"]));
    assert.equal(await service.scanNewMaterial(), 0);
  } finally { await local.close(); }
});
