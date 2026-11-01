import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { INBOX_ACTIONS, INBOX_ACTION_PERMISSIONS, createInboxActionHandlers, inboxActions } from "@molis-ai/molis-work-plugin-inbox";
import assert from "node:assert/strict";
import test from "node:test";

import {
  INBOX_UI_CONTRIBUTION_ID,
  buildInboxUiEntries,
  createInboxRouteHandlers,
  inboxManifest,
  inboxUiContribution,
  type InboxUiEntry,
  type InboxUiModel,
} from "@molis-ai/molis-work-plugin-inbox";
import type { AttentionEntryRecord } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginRouteMatcher } from "@molis-ai/molis-work-plugin-runtime";

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
    suggested_behavior_ids: [],
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
    (error) => error instanceof ActionError && error.code === "ui_host.contribution_conflict",
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
  assert.doesNotMatch(workbench, /data-inbox-judgment/);
  assert.doesNotMatch(workbench, /inbox-scene-bind/);
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
  assert.doesNotMatch(rendered.workbench, /data-inbox-row[^>]*tabindex="-1"/);
  assert.doesNotMatch(rendered.workbench, /role="option"/);
  assert.match(rendered.workbench, /role="listitem"/);
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
    rendered.workbench.indexOf("plugin-stage-detail-bar") < rendered.workbench.indexOf("feed-detail-kicker")
    && rendered.workbench.indexOf("feed-detail-kicker") < rendered.workbench.indexOf("feed-detail-header")
    && rendered.workbench.indexOf("feed-detail-header") < rendered.workbench.indexOf("inbox-reference-footer")
    && rendered.workbench.indexOf("inbox-reference-footer") < rendered.workbench.indexOf("inbox-reference-body"),
    "Inbox kicker sits on the shared stage bar with back; title then actions then scrolling context",
  );
  assert.match(rendered.workbench, /plugin-stage-detail-bar[\s\S]*feed-detail-kicker[\s\S]*feed-detail-header/);
  assert.doesNotMatch(rendered.workbench, /Inbox 只保存这条引用和进入原因/);
  assert.doesNotMatch(rendered.workbench, /data-feed-workbench|data-feed-detail=/);
});

test("Inbox recommends an action while preserving the person's other choices", () => {
  const host = new UiHost();
  host.register(inboxUiContribution);
  const open = entry();
  const suggested = entry({
    entry_id: "entry-suggested",
    suggested_behavior_ids: ["inbox.done"],
  });
  const illegal = entry({
    entry_id: "entry-illegal",
    suggested_behavior_ids: ["invented.behavior", "invented.other"],
  });
  const defaults = host.render({
    contribution_id: INBOX_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model({ entries: [open] }),
  });
  assert.match(defaults, /data-inbox-detail="entry-open"[\s\S]*data-inbox-action="done"/);
  assert.match(defaults, /data-inbox-detail="entry-open"[\s\S]*data-inbox-action="dismissed"/);
  assert.match(defaults, /data-inbox-open-feed="item-1"/);

  const judged = host.render({
    contribution_id: INBOX_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model({ entries: [suggested] }),
  });
  assert.match(judged, /data-inbox-detail="entry-suggested"[\s\S]*data-inbox-action="done"/);
  assert.match(judged, /data-inbox-detail="entry-suggested"[\s\S]*data-inbox-action="dismissed"/);
  assert.match(judged, /data-inbox-open-feed="item-1"/);

  const fallback = host.render({
    contribution_id: INBOX_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model({ entries: [illegal] }),
  });
  assert.match(fallback, /data-inbox-detail="entry-illegal"[\s\S]*data-inbox-action="done"/);
  assert.match(fallback, /data-inbox-detail="entry-illegal"[\s\S]*data-inbox-action="dismissed"/);
});

test("Inbox separates preparation, verification and uncertain judgment without completing items", () => {
  const render = (outcome: "ok" | "needs_review") => inboxUiContribution.render({ surface: "workbench", model: model({
    entries: [entry({ suggested_behavior_ids: outcome === "ok" ? ["inbox.verify"] : [], next_judgment: {
      judgment_id: "j1", function_key: "next", function_version: 1, outcome, suggested_behavior_ids: outcome === "ok" ? ["inbox.verify"] : [],
      subject: { kind: "inbox_entry", id: "entry-open", project_id: "p" }, scene_id: "inbox.next", error_code: null, created_at: "2026-09-22T08:00:00Z",
    } })],
  }) } as Parameters<typeof inboxUiContribution.render>[0]);
  const html = render("ok");
  assert.match(html, /建议：先核查，由你确认执行/);
  assert.match(html, /data-inbox-compose-mode="verify"/);
  assert.match(html, /data-inbox-compose-mode="compose"/);
  assert.match(html, /data-inbox-action="dismissed"/);
  assert.match(render("needs_review"), /判断未完成，请人工复核或重试/);
});

test("Inbox list does not paint a board-level judgment binder", () => {
  const host = new UiHost();
  host.register(inboxUiContribution);
  const workbench = host.render({
    contribution_id: INBOX_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model({
      entries: [entry()],
    }),
  });
  assert.doesNotMatch(workbench, /data-inbox-judgment/);
  assert.doesNotMatch(workbench, /下一步判断/);
  assert.doesNotMatch(workbench, /inbox-scene-bind/);
});

test("Inbox judgment routes bind and unbind through Host ports", async () => {
  let key: string | null = null;
  let changed = 0;
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: "inbox-test", kind: "plugin", title: "Inbox", project_id: "project-one" },
    definitions: INBOX_ACTIONS, handlers: createInboxActionHandlers({
    listEntries: () => [],
    setStatus: () => {
      throw new Error("unused");
    },
    readJudgment: () => ({
      function_key: key,
      functions: [{ function_key: "system_pick_inbox_next", name: "挑 Inbox 下一步" }],
    }),
    writeJudgment: (next) => {
      key = next;
      return { function_key: next };
    },
  }) });
  const handlers = createInboxRouteHandlers({
    actions: bindActionClient(service, () => ({ actor_id: "test", project_id: "project-one", audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS] })),
    changed() { changed += 1; },
  });
  const judgment = (method: "GET" | "POST", payload: Record<string, unknown> = {}) => handlers[method === "GET" ? "inbox.judgment.read" : "inbox.judgment.write"]!({
    params: {}, request: { method, pathname: "/api/plugins/io.molis.work.inbox/judgment", query: new URLSearchParams(), body: payload },
  });
  const listed = await judgment("GET");
  assert.equal(listed.status, 200);
  assert.equal((listed.body as { function_key: string | null }).function_key, null);

  const bound = await judgment("POST", { function_key: "system_pick_inbox_next" });
  assert.equal(bound.status, 200);
  assert.equal((bound.body as { function_key: string }).function_key, "system_pick_inbox_next");
  assert.equal(changed, 1);

  const reread = await judgment("GET");
  assert.equal((reread.body as { function_key: string }).function_key, "system_pick_inbox_next");

  const unbound = await judgment("POST", { function_key: null });
  assert.equal((unbound.body as { function_key: string | null }).function_key, null);
  assert.equal(changed, 2);
});

test("Inbox projection keeps references and ranks active entries first", () => {
  const records: AttentionEntryRecord[] = [
    {
      project_id: "p1",
      entry_id: "done-1",
      owner_plugin_id: null,
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
      owner_plugin_id: null,
      subject_type: "feed_item",
      subject_id: "item-1",
      reason: "source_rule",
      status: "open",
      detail: {},
      revision: 1,
      created_at: "2026-09-14T11:00:00.000Z",
      updated_at: "2026-09-14T11:00:00.000Z",
      completed_at: null,
      suggested_behavior_ids: ["inbox.done"],
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
  assert.deepEqual(entries[0]?.suggested_behavior_ids, ["inbox.done"]);
  assert.equal(entries[1]?.status, "done");
  assert.deepEqual(entries[1]?.suggested_behavior_ids, []);
});

test("Inbox declares its page routes in the Manifest, the Runtime matches them, and each has a handler", async () => {
  const handlers = createInboxRouteHandlers({ actions: { discover: async () => [], invoke: async () => { throw new Error("unused"); } }, changed() {} });
  const routes = inboxManifest.routes ?? [];
  assert.ok(routes.length > 0);
  assert.deepEqual(routes.filter(route => !handlers[route.route_id]).map(route => route.route_id), []);
  assert.deepEqual(Object.keys(handlers).filter(id => !routes.some(route => route.route_id === id)), [], "a handler without a declared route is unreachable");
  const match = pluginRouteMatcher(inboxManifest);
  const status = match("POST", "/api/plugins/io.molis.work.inbox/entries/entry%2Fone/status");
  assert.equal(status?.route_id, "inbox.entry.status");
  assert.deepEqual(status?.params, { entry_id: "entry/one" });
  assert.equal(match("GET", "/api/plugins/io.molis.work.inbox/entries/entry-1/status"), null, "the status route answers POST only");
  assert.equal(match("GET", "/api/plugins/io.molis.work.inbox/workbench"), null, "the stage fragment is the shell's, not a route of the plugin");
  assert.equal(match("GET", "/api/inbox"), null);
});


test("RAC-2511 RAC-2514 Inbox stage retains missing subjects and filters their recommendations without swallowing failures", async t => {
  const record = (id: string, subject_type: AttentionEntryRecord["subject_type"]): AttentionEntryRecord => ({ entry_id: id, owner_plugin_id: null, project_id: "owner-stage", subject_type,
    subject_id: id + "-subject", reason: subject_type === "source_fault" ? "source_fault" : subject_type === "goal_decision" ? "goal_decision" : "manual", status: "open", revision: 1, detail: {},
    created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", completed_at: null });
  const records = [record("present", "feed_item"), record("missing-item", "feed_item"), record("missing-source", "source_fault"), record("missing-goal", "goal_decision")];
  let failure: Error | undefined, allMissing = false;
  let reached: ReadonlySet<string> | undefined;
  const service = new ActionService();
  const dispose = service.registerProvider({ provider: { provider_id: inboxManifest.plugin_id, plugin_id: inboxManifest.plugin_id, kind: "plugin", title: "Inbox", project_id: "owner-stage" }, definitions: INBOX_ACTIONS,
    handlers: createInboxActionHandlers({ listEntries: () => records, setStatus: () => { throw new Error("No write belongs to a stage read"); },
      stageSubjects: async entries => { if (failure) throw failure; return entries.map(entry => ({ entry_id: entry.entry_id, title: !allMissing && entry.entry_id === "present" ? "Readable owner item" : null, source_label: "Feed" })); },
      readJudgment: () => ({ function_key: null, functions: [], summary: { name: null, enabled: false, available: false, reason: "尚未绑定规则" } }),
      recommendations: async (_caller, ids) => { reached = ids; return { judgments: [] }; } }) });
  t.after(dispose);
  const caller = { actor_id: "stage-owner", audience: "user" as const, project_id: "owner-stage", permissions: [...INBOX_ACTION_PERMISSIONS] };
  const data = await service.invoke(caller, inboxActions.stage, {});
  assert.deepEqual(data.entries, records); assert.deepEqual([...reached!], ["present"]);
  const ui = new UiHost(); ui.register(inboxUiContribution);
  const render = (value: typeof data) => ui.render({ contribution_id: INBOX_UI_CONTRIBUTION_ID, surface: "workbench", model: {
    route_prefix: "/projects/owner-stage", shown_plugins: ["inbox"], data: value, primitives,
  } });
  const html = render(data);
  assert.match(html, /Readable owner item/); assert.match(html, /原 Feed Item 已不可用/); assert.match(html, /原来源已不可用/); assert.match(html, /原 Goal 已不可用/);
  for (const entry of records) assert.ok(html.includes(`data-inbox-entry-id="${entry.entry_id}"`));
  allMissing = true;
  assert.match(render(await service.invoke(caller, inboxActions.stage, {})), /原 Feed Item 已不可用/);
  assert.equal(reached?.size, 0);
  failure = new Error("The subject owner failed while reading");
  await assert.rejects(service.invoke(caller, inboxActions.stage, {}), error => error === failure);
  assert.deepEqual(data.entries, records);
});
