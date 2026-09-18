import assert from "node:assert/strict";
import test from "node:test";

import {
  INBOX_NATIVE_PLUGIN_ROUTES,
  INBOX_UI_CONTRIBUTION_ID,
  InboxPluginRouteTable,
  buildInboxUiEntries,
  inboxUiContribution,
  type InboxPluginRouteHandler,
  type InboxUiEntry,
  type InboxUiModel,
} from "@molis-ai/molis-work-plugin-inbox";
import type { AttentionEntryRecord } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { UiContributionError, UiHost } from "@molis-ai/molis-work-ui-host";

const primitives: InboxUiModel["primitives"] = {
  escape: (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
  text: (value, variables) => Object.entries(variables ?? {}).reduce(
    (result, [key, replacement]) => result.replaceAll(`{${key}}`, String(replacement)),
    value,
  ),
  formatDate: (value) => value,
};

function entry(overrides: Partial<InboxUiEntry> = {}): InboxUiEntry {
  return {
    entry_id: "entry-open",
    revision: 1,
    subject_type: "feed_item",
    subject_id: "item-1",
    reason: "manual",
    status: "open",
    kind_label: "Inbox · 手工加入",
    source_label: "GitHub",
    title: "确认对象边界",
    reason_label: "你手工加入",
    relation_label: "GitHub",
    next_action: "查看原消息并处理，或直接完成 / 忽略这条注意力引用。",
    status_label: "待处理",
    updated_at: "2026-09-14T12:00:00.000Z",
    available: true,
    open: { kind: "feed", item_id: "item-1" },
    attention_rank: 2,
    ...overrides,
  };
}

function model(overrides: Partial<InboxUiModel> = {}): InboxUiModel {
  return {
    route_prefix: "/projects/project-test",
    entries: [],
    filter: "active",
    primitives,
    ...overrides,
  };
}

test("Workbench registers the Inbox UI Contribution through the generic UI Host", () => {
  const host = new UiHost();
  host.register(inboxUiContribution);
  assert.deepEqual(host.list().map((item) => item.contribution_id), [INBOX_UI_CONTRIBUTION_ID]);
  assert.throws(
    () => host.register(inboxUiContribution),
    (error) => error instanceof UiContributionError && error.code === "ui_contribution_conflict",
  );

  const directory = host.render({
    contribution_id: INBOX_UI_CONTRIBUTION_ID,
    surface: "directory",
    model: model(),
  });
  assert.equal(directory, "");
  assert.doesNotMatch(directory, /data-directory-panel="inbox"/);
  const workbench = host.render({
    contribution_id: INBOX_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model(),
  });
  assert.match(workbench, /data-inbox-directory/);
  assert.match(workbench, /data-inbox-list/);
  assert.match(workbench, /data-inbox-stage-shell/);
  assert.match(workbench, /现在没有需要你介入的事项/);
  assert.doesNotMatch(workbench, /Goal 待判断、来源故障|会出现在这里/);
  assert.doesNotMatch(workbench, /data-feed-directory|data-feed-list|data-feed-entry-id/);
  assert.doesNotMatch(workbench, /选择一条需要处理的事项/);
});

test("Inbox directory lists Attention reason, related object, and next step without copying a body", () => {
  const host = new UiHost();
  host.register(inboxUiContribution);
  const done = entry({
    entry_id: "entry-done",
    status: "done",
    status_label: "已完成",
    attention_rank: 1,
    next_action: "可以重新打开，原对象仍保留。",
  });
  const goal = entry({
    entry_id: "entry-goal",
    subject_type: "goal_decision",
    subject_id: "goal-1",
    reason: "goal_decision",
    kind_label: "Inbox · Goal 决定",
    source_label: "Molis Work",
    title: "确认高保真边界",
    reason_label: "Molis Work 等待决定",
    relation_label: "Molis Work",
    next_action: "到 Goals 完成判断，Inbox 不内嵌决定表单。",
    open: { kind: "goal", href: "/projects/project-test/goals/goal-1" },
    attention_rank: 3,
  });
  const source = entry({
    entry_id: "entry-source",
    subject_type: "source_fault",
    subject_id: "source-1",
    reason: "source_fault",
    kind_label: "Inbox · 来源故障",
    source_label: "Gmail",
    title: "来源「Gmail」需要处理",
    reason_label: "来源需要人工恢复",
    relation_label: "Gmail",
    next_action: "检查来源配置、授权或拉取范围后重新同步。",
    open: { kind: "source", source_id: "source-1" },
    attention_rank: 3,
  });
  const open = entry();
  const rendered = {
    directory: host.render({
      contribution_id: INBOX_UI_CONTRIBUTION_ID,
      surface: "directory",
      model: model({ entries: [open, done, goal, source] }),
    }),
    workbench: host.render({
      contribution_id: INBOX_UI_CONTRIBUTION_ID,
      surface: "workbench",
      model: model({ entries: [open, done, goal, source] }),
    }),
  };
  assert.match(rendered.workbench, /data-inbox-stage-group="active"/);
  assert.match(rendered.workbench, /data-inbox-stage-group="history"/);
  assert.match(rendered.workbench, /href="#icon-alert"|data-icon="alert"/);
  assert.match(rendered.workbench, /href="#icon-check"|data-icon="check"/);
  assert.match(rendered.workbench, /data-inbox-detail="entry-open"[^>]*hidden|data-inbox-detail="entry-open" hidden/);
  assert.match(rendered.workbench, /data-inbox-row[^>]*data-inbox-entry-id="entry-open"/);
  assert.doesNotMatch(rendered.workbench, /feed-list-item/);
  assert.match(rendered.workbench, /data-inbox-subject-type="goal_decision"[^>]*data-inbox-subject-id="goal-1"/);
  assert.match(rendered.workbench, /你手工加入/);
  assert.match(rendered.workbench, /mw-status--done/);
  assert.match(rendered.workbench, /data-inbox-status="done"/);
  assert.doesNotMatch(rendered.directory, /这条消息的完整正文不应该出现/);
  assert.match(rendered.workbench, /data-inbox-detail="entry-open"/);
  assert.match(rendered.workbench, /data-inbox-open-feed="item-1"/);
  assert.match(rendered.workbench, /data-feed-task-config-open="source-1"/);
  assert.match(rendered.workbench, /href="\/projects\/project-test\/goals\/goal-1"/);
  assert.match(rendered.workbench, /到 Goals 完成判断，Inbox 不内嵌决定表单。/);
  assert.match(rendered.workbench, /data-inbox-action="done"/);
  assert.match(rendered.workbench, /data-inbox-action="dismissed"/);
  assert.ok(
    rendered.workbench.indexOf("feed-detail-header") < rendered.workbench.indexOf("inbox-reference-footer")
    && rendered.workbench.indexOf("inbox-reference-footer") < rendered.workbench.indexOf("inbox-reference-body"),
    "Inbox actions sit under the title, above the scrolling context",
  );
  assert.doesNotMatch(rendered.workbench, /Inbox 只保存这条引用和进入原因/);
  assert.doesNotMatch(rendered.workbench, /data-feed-workbench|data-feed-detail=/);
});

test("Inbox projection keeps references and ranks active entries first", () => {
  const records: AttentionEntryRecord[] = [
    {
      project_id: "p1",
      entry_id: "done-1",
      subject_type: "feed_item",
      subject_id: "item-1",
      reason: "manual",
      status: "done",
      detail: {},
      revision: 2,
      created_at: "2026-09-14T10:00:00.000Z",
      updated_at: "2026-09-14T13:00:00.000Z",
      completed_at: "2026-09-14T13:00:00.000Z",
    },
    {
      project_id: "p1",
      entry_id: "open-1",
      subject_type: "feed_item",
      subject_id: "item-1",
      reason: "source_rule",
      status: "open",
      detail: {},
      revision: 1,
      created_at: "2026-09-14T11:00:00.000Z",
      updated_at: "2026-09-14T11:00:00.000Z",
      completed_at: null,
    },
  ];
  const entries = buildInboxUiEntries(records, () => ({
    available: true,
    title: "确认对象边界",
    source_label: "GitHub",
    open: { kind: "feed", item_id: "item-1" },
  }), (value) => value);
  assert.equal(entries[0]?.entry_id, "open-1");
  assert.equal(entries[0]?.reason_label, "来源规则命中");
  assert.equal(entries[1]?.status, "done");
});

test("Inbox Plugin route table owns matching while the Host supplies handlers", async () => {
  let observed: { entryId: string } | null = null;
  const fallback: InboxPluginRouteHandler = () => ({ status: 204 });
  const handlers = Object.fromEntries(INBOX_NATIVE_PLUGIN_ROUTES.map((definition) => [
    definition.route_id,
    definition.route_id === "inbox.entry.status"
      ? (({ params }) => {
          observed = { entryId: params.entry_id! };
          return { status: 200, body: observed };
        }) satisfies InboxPluginRouteHandler
      : fallback,
  ]));
  const routes = new InboxPluginRouteTable(handlers);
  const result = await routes.handle({
    method: "POST",
    pathname: "/api/inbox/entries/entry%2Fone/status",
    query: new URLSearchParams(),
    body: { status: "done", expected_revision: 1 },
  });
  assert.equal(result?.status, 200);
  assert.deepEqual(observed, { entryId: "entry/one" });
  assert.equal(await routes.handle({
    method: "GET",
    pathname: "/api/feed",
    query: new URLSearchParams(),
    body: {},
  }), null);
});
