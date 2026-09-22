import assert from "node:assert/strict";
import test from "node:test";

import { UiContributionError, UiHost } from "@molis-ai/molis-work-ui-host";
import type { ScheduleJobRecord } from "@molis-ai/molis-work-contracts/services/scheduler";
import {
  SCHEDULE_CLIENT_FACTORY_SCRIPT,
  SCHEDULE_NATIVE_PLUGIN_ROUTES,
  SCHEDULE_UI_CONTRIBUTION_ID,
  SchedulePluginRouteTable,
  createScheduleRouteHandlers,
  scheduleUiContribution,
  type ScheduleConversationTaskView,
  type ScheduleUiModel,
} from "@molis-ai/molis-work-plugin-schedule";
import { railEntries } from "@molis-ai/molis-work-app-workbench";
import { renderMolisWorkWeb, type MolisWorkWebView } from "./workbench-renderer-fixture.js";

const primitives: ScheduleUiModel["primitives"] = {
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

function job(overrides: Partial<ScheduleJobRecord> = {}): ScheduleJobRecord {
  return {
    job_id: "job-1",
    plugin_id: "io.molis.work.test.owner",
    capability_id: "test.wakeup",
    object_ref: "source:alpha",
    title: "拉一次",
    recurrence: { kind: "once" },
    next_due_at: "2026-09-20T03:00:05.000Z",
    enabled: true,
    last_wakeup: {
      wakeup_id: "wakeup-1",
      job_id: "job-1",
      due_at: "2026-09-20T03:00:00.000Z",
      started_at: "2026-09-20T03:00:00.000Z",
      finished_at: "2026-09-20T03:00:00.100Z",
      status: "ok",
      detail: null,
    },
    created_at: "2026-09-20T02:00:00.000Z",
    updated_at: "2026-09-20T03:00:00.100Z",
    ...overrides,
  };
}

function task(overrides: Partial<ScheduleConversationTaskView> = {}): ScheduleConversationTaskView {
  return {
    task_id: "sct_test",
    title: "每天汇总",
    instructions: "把未读收成三条",
    hour: 9,
    minute: 0,
    notify_important: true,
    enabled: true,
    unread: false,
    job_id: "job-task",
    last_run_at: null,
    last_error: null,
    created_at: "2026-09-20T02:00:00.000Z",
    updated_at: "2026-09-20T02:00:00.000Z",
    clock_label: "09:00",
    next_due_at: "2026-09-20T01:00:00.000Z",
    turns: [{
      turn_id: "scturn_1",
      task_id: "sct_test",
      kind: "user",
      text: "把未读收成三条",
      important: false,
      created_at: "2026-09-20T02:00:00.000Z",
    }],
    ...overrides,
  };
}

function model(overrides: Partial<ScheduleUiModel> = {}): ScheduleUiModel {
  return {
    route_prefix: "/projects/project-test",
    jobs: [],
    tasks: [],
    primitives,
    ...overrides,
  };
}

test("Workbench registers the Schedule UI Contribution through the generic UI Host", () => {
  const host = new UiHost();
  host.register(scheduleUiContribution);
  assert.deepEqual(host.list().map((item) => item.contribution_id), [SCHEDULE_UI_CONTRIBUTION_ID]);
  assert.throws(
    () => host.register(scheduleUiContribution),
    (error) => error instanceof UiContributionError && error.code === "ui_contribution_conflict",
  );
  const directory = host.render({
    contribution_id: SCHEDULE_UI_CONTRIBUTION_ID,
    surface: "directory",
    model: model(),
  });
  assert.equal(directory, "");
  assert.doesNotMatch(directory, /data-directory-panel="schedule"/);
  const empty = host.render({
    contribution_id: SCHEDULE_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model(),
  });
  assert.match(empty, /还没有定时任务/);
  assert.match(empty, /新建定时任务/);
  assert.match(empty, /到点会在它自己的对话里跑一轮只读 Agent/);
  assert.match(empty, /data-schedule-create-dialog/);
  assert.doesNotMatch(empty, /这里只负责闹钟/);
  assert.doesNotMatch(empty, /data-directory-panel="schedule"/);
  const populated = host.render({
    contribution_id: SCHEDULE_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model({ jobs: [job()] }),
  });
  assert.match(populated, /data-schedule-row/);
  assert.match(populated, /叫醒成功/);
  assert.match(populated, /其他插件的闹钟/);
  assert.match(populated, /data-work-surface="schedule"/);
  const conversation = host.render({
    contribution_id: SCHEDULE_UI_CONTRIBUTION_ID,
    surface: "workbench",
    model: model({ tasks: [task()] }),
  });
  assert.match(conversation, /每天汇总/);
  assert.match(conversation, /data-schedule-kind="task"/);
  assert.match(conversation, /把未读收成三条/);
  assert.doesNotMatch(conversation, /其他插件的闹钟/);
  assert.match(SCHEDULE_CLIENT_FACTORY_SCRIPT, /queueMicrotask\(\(\) => select\(pending, "task"\)\)/);
});

test("Schedule HTTP 能列出任务并暂停", async () => {
  const jobs = [job()];
  const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({
    listJobs: () => jobs,
    setEnabled: (jobId, enabled) => {
      const current = jobs.find((item) => item.job_id === jobId);
      if (!current) throw new Error("missing");
      const next = { ...current, enabled };
      jobs[0] = next;
      return next;
    },
    listTasks: () => [],
    createTask: () => {
      throw new Error("unused");
    },
    setTaskEnabled: () => {
      throw new Error("unused");
    },
    openTask: () => {
      throw new Error("unused");
    },
    changed: () => undefined,
  }));
  const listed = await routes.handle({
    method: "GET",
    pathname: "/api/schedule",
    query: new URLSearchParams(),
    body: {},
  });
  assert.equal(listed?.status, 200);
  assert.deepEqual((listed?.body as { jobs: ScheduleJobRecord[] }).jobs[0]?.job_id, "job-1");
  const paused = await routes.handle({
    method: "POST",
    pathname: "/api/schedule/jobs/job-1/enabled",
    query: new URLSearchParams(),
    body: { enabled: false },
  });
  assert.equal(paused?.status, 200);
  assert.equal((paused?.body as { job: ScheduleJobRecord }).job.enabled, false);
  assert.equal(SCHEDULE_NATIVE_PLUGIN_ROUTES.length, 6);
});

test("启用 Schedule 后导航出现且没有第二列目录", () => {
  const rail = railEntries(["goals", "inbox", "schedule", "feed"]).map((entry) => [entry.id, entry.label, entry.glyph]);
  assert.deepEqual(rail, [
    ["goals", "Goals", "target"],
    ["inbox", "Inbox", "inbox"],
    ["schedule", "Schedule", "timer"],
    ["feed", "Feed", "rss"],
  ]);
  const view = {
    snapshot: {
      board: {
        board_id: "board-schedule",
        title: "闹钟",
        active_goal_id: null,
        created_at: "2026-09-20T00:00:00.000Z",
        updated_at: "2026-09-20T00:00:00.000Z",
      },
      cursor: 0,
      goals: [],
      relations: [],
      impacts: [],
      risks: [],
      claims: [],
      runs: [],
      evidence: [],
      review_obligations: [],
      reviews: [],
      candidates: [],
      contract_proposals: [],
      rewires: [],
      clarification_sessions: [],
      clarification_turns: [],
      goal_tree_proposals: [],
      planning_method_packs: [],
    },
    project: { project_id: "project-schedule", display_name: "闹钟" },
    projects: [{ project_id: "project-schedule", display_name: "闹钟" }],
    route_prefix: "/projects/project-schedule",
    demo: false,
    active_goal_id: null,
    goals: [],
    archived_goals: [],
    trashed_goals: [],
    counts: {},
    coverage: [],
    input_bindings: [],
    policy_bindings: [],
    events: [],
    feed: {
      sources: [],
      feed_items: [],
      inbox_entries: [],
      runs: [],
      contract_migrations: [],
      out_rules: [],
    },
    enabled_plugins: ["goals", "inbox", "schedule", "feed", "artifacts"],
    schedule_jobs: [job()],
    schedule_tasks: [],
  } as MolisWorkWebView;
  const html = renderMolisWorkWeb(view);
  assert.match(html, /data-plugin-id="schedule"[^>]*data-work-surface-open="schedule"/);
  assert.doesNotMatch(html, /data-directory-open="schedule"/);
  assert.match(html, /data-work-surface="schedule" data-work-surface-label="Schedule"/);
  assert.match(html, /data-schedule-job-id="job-1"/);
});
