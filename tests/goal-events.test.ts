import { GovernanceRecordStore } from "@molis-ai/molis-work-module-governance-collaboration";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  GoalsCommandError,
  GoalsModule,
} from "@molis-ai/molis-work-module-goals";
import { GoalEventApplication } from "@molis-ai/molis-work-plugin-goals";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

import type {
  GoalEventFieldDefinition,
  GoalEventTypeDefinitionInput,
  ReportGoalWorkEventInput,
} from "@molis-ai/molis-work-contracts/modules/goals";

const BOARD = "board-events";
const GOAL = "goal-events";
const OTHER_BOARD = "board-other";
const OTHER_GOAL = "goal-other";

function hooks(db: LocalProjectDatabase["db"]) {
  return {
    supersedePendingContractProposals: (...args: Parameters<GovernanceRecordStore["supersedePendingContractProposals"]>) =>
      new GovernanceRecordStore(db).supersedePendingContractProposals(...args),
    currentActionToken: () => "unused",
    authorizeRiskUpdate: () => undefined,
    authorizeRiskState: () => undefined,
    transitionRevisionDependents: () => undefined,
    reconcileLifecycle: () => undefined,
  };
}

function openModule(store: LocalProjectDatabase) {
  return new GoalsModule(store.db, hooks(store.db));
}

function fixture(options: { human?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goal-events-"));
  const databasePath = join(directory, "project.db");
  const store = new LocalProjectDatabase(databasePath);
  const module = openModule(store);
  module.commands.initializeBoard({
    board_id: BOARD,
    title: "事件事实",
    actor_id: "user-1",
    idempotency_key: "init-board",
  });
  const requirements = [
    { requirement_id: "playable-scene", statement: "有一段能从开始体验到结束的故事" },
    { requirement_id: "choice-response", statement: "不同选择带来可观察的不同回应" },
    ...(options.human
      ? [{ requirement_id: "human-signoff", statement: "用户亲自确认可以内部试用", human_decision_required: true }]
      : []),
  ];
  new GoalEventApplication({
    query: module.query,
    commands: module.commands,
    events: module.events,
    planning: module.planning,
  }).createIntent({
    board_id: BOARD,
    goal_id: GOAL,
    title: "互动故事片段",
    outcome: "玩家能体验一段会回应选择的故事",
    why: "验证局部事件事实",
    business_logic: "先登记类型再上报观察。",
    requirements,
    actor_id: "user-1",
    idempotency_key: "create-goal",
    source_kind: "web",
  });
  return { directory, databasePath, store, module };
}

function close(data: { directory: string; store: LocalProjectDatabase }) {
  data.store.close();
  rmSync(data.directory, { recursive: true, force: true });
}

function storyDelivery(version: 1 | 2): GoalEventTypeDefinitionInput {
  const fields: GoalEventFieldDefinition[] = [
    { field_id: "piece", name: "交付了什么片段", purpose: "说明可体验内容", format: "text", required: true },
    { field_id: "limits", name: "已知缺口", purpose: "尚未完成的部分", format: "longtext", required: false },
  ];
  if (version === 2) {
    fields.push({
      field_id: "entry",
      name: "怎样体验",
      purpose: "告诉后来的人从哪里开始",
      format: "text",
      required: false,
    });
  }
  return {
    type_id: "story-delivery",
    version,
    name: "故事片段交付",
    purpose: "说明可以体验的片段、体验方式和范围。",
    semantic_family: "delivery",
    source: { kind: "runtime", label: "Runtime 为当前 Goal 设计" },
    fields,
  };
}

function reportDelivery(input: Partial<ReportGoalWorkEventInput> & Pick<ReportGoalWorkEventInput, "fields">): ReportGoalWorkEventInput {
  return {
    type_id: "story-delivery",
    type_version: 1,
    title: "做出了开场片段",
    ...input,
  };
}

function storyObservation(): GoalEventTypeDefinitionInput {
  return {
    type_id: "story-observation",
    version: 1,
    name: "玩家观察",
    purpose: "留下玩家的行为和感受。",
    semantic_family: "observation",
    source: { kind: "runtime", label: "Runtime 为当前 Goal 设计" },
    fields: [
      { field_id: "behavior", name: "观察到什么", purpose: "记录行为", format: "longtext", required: true },
    ],
  };
}

function count(store: LocalProjectDatabase, sql: string, ...params: unknown[]): number {
  return Number((store.db.prepare(sql).get(...params) as { count: number }).count);
}

function ownText(record: Record<string, unknown>, key: string): string | undefined {
  return Object.getOwnPropertyDescriptor(record, key)?.value as string | undefined;
}

test("registers fields, reports work, and reopens the same facts from SQLite", () => {
  const data = fixture();
  try {
    const configured = data.module.events.configure({
      board_id: BOARD,
      goal_id: GOAL,
      actor_id: "runtime-1",
      actor_kind: "runtime",
      expected_version: 0,
      idempotency_key: "cfg-v1",
      types: [storyDelivery(1)],
      adopted_planning: [],
    });
    assert.equal(configured.replayed, false);
    assert.equal(configured.config.version, 1);
    assert.equal(configured.config.types[0]?.fields.length, 2);
    assert.equal(configured.config.types[0]?.source.kind, "runtime");

    const reported = data.module.events.report({
      board_id: BOARD,
      goal_id: GOAL,
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "report-1",
      events: [reportDelivery({
        fields: {
          piece: "开场洞穴，玩家可以选择帮助旅人",
          limits: "还没有第二幕；注释含 <b>HTML</b> & 原文",
        },
      })],
    });
    assert.equal(reported.events.length, 1);
    assert.equal(reported.events[0]?.payload.limits, "还没有第二幕；注释含 <b>HTML</b> & 原文");
    assert.deepEqual(reported.events[0]?.type?.fields.map((field) => field.field_id), ["piece", "limits"]);

    const beforeClose = data.module.events.listEvents(BOARD, GOAL);
    assert.deepEqual(beforeClose.events.map((item) => item.kind), ["system", "configuration", "report"]);
    assert.ok(beforeClose.events[1]!.journal_seq < beforeClose.events[2]!.journal_seq);

    data.store.close();
    const reopened = new LocalProjectDatabase(data.databasePath);
    try {
      const events = openModule(reopened).events;
      const config = events.readConfig(BOARD, GOAL);
      assert.equal(config.version, 1);
      assert.equal(config.types[0]?.version, 1);
      assert.equal(config.types[0]?.source.label, "Runtime 为当前 Goal 设计");
      const page = events.listEvents(BOARD, GOAL);
      assert.deepEqual(page.events.map((item) => item.kind), ["system", "configuration", "report"]);
      const report = events.readEvent(BOARD, GOAL, reported.events[0]!.event_id);
      assert.equal(report.payload.piece, "开场洞穴，玩家可以选择帮助旅人");
      assert.equal(report.payload.limits, "还没有第二幕；注释含 <b>HTML</b> & 原文");
      assert.equal(report.type?.version, 1);
      assert.equal(report.actor_id, "runtime-1");
      assert.equal(report.journal_seq, reported.events[0]?.journal_seq);
    } finally {
      reopened.close();
    }
  } finally {
    try { data.store.close(); } catch { /* closed in the happy path */ }
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("old and new type versions keep their own field definitions after a second config", () => {
  const data = fixture();
  try {
    data.module.events.configure({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      expected_version: 0, idempotency_key: "cfg-v1", types: [storyDelivery(1)],
    });
    const first = data.module.events.report({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "report-v1",
      events: [reportDelivery({ fields: { piece: "第一版交付", limits: "" } })],
    });
    data.module.events.configure({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      expected_version: 1, idempotency_key: "cfg-v2", types: [storyDelivery(2)],
    });
    const second = data.module.events.report({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "report-v2",
      events: [reportDelivery({
        type_version: 2,
        title: "补上体验入口",
        fields: { piece: "第一版交付", limits: "第二幕仍缺", entry: "从洞穴门口开始" },
      })],
    });

    data.store.close();
    const reopened = new LocalProjectDatabase(data.databasePath);
    try {
      const events = openModule(reopened).events;
      const oldReport = events.readEvent(BOARD, GOAL, first.events[0]!.event_id);
      const newReport = events.readEvent(BOARD, GOAL, second.events[0]!.event_id);
      assert.equal(oldReport.type?.version, 1);
      assert.deepEqual(oldReport.type?.fields.map((field) => field.field_id), ["piece", "limits"]);
      assert.equal(oldReport.payload.entry, undefined);
      assert.equal(newReport.type?.version, 2);
      assert.deepEqual(newReport.type?.fields.map((field) => field.field_id), ["piece", "limits", "entry"]);
      assert.equal(newReport.payload.entry, "从洞穴门口开始");
      assert.equal(events.readConfig(BOARD, GOAL).version, 2);
    } finally {
      reopened.close();
    }
  } finally {
    try { data.store.close(); } catch { /* reopened path already closed the first handle */ }
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("latest related report updates only that requirement; human_decision stays an actor report", () => {
  const data = fixture({ human: true });
  try {
    data.module.events.configure({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      expected_version: 0, idempotency_key: "cfg-v1", types: [storyDelivery(1)],
      requirement_bindings: [
        { type_id: "story-delivery", requirement_id: "playable-scene" },
        { type_id: "story-delivery", requirement_id: "choice-response" },
      ],
    });
    const support = data.module.events.report({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "support-all",
      events: [reportDelivery({
        fields: { piece: "开场可玩", limits: "" },
        judgments: [
          { requirement_id: "playable-scene", verdict: "supports" },
          { requirement_id: "choice-response", verdict: "supports" },
          { requirement_id: "human-signoff", verdict: "supports" },
        ],
      })],
    });
    const contradict = data.module.events.report({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "contradict-choice",
      events: [reportDelivery({
        title: "第二选择没有不同回应",
        fields: { piece: "同一洞穴", limits: "选择尚未分叉" },
        judgments: [{ requirement_id: "choice-response", verdict: "contradicts" }],
      })],
    });

    let current = data.module.events.readCurrentRequirements(BOARD, GOAL);
    const byId = Object.fromEntries(current.map((item) => [item.requirement_id, item]));
    assert.equal(byId["playable-scene"]?.current_report?.verdict, "supports");
    assert.equal(byId["playable-scene"]?.current_report?.event_id, support.events[0]?.event_id);
    assert.equal(byId["choice-response"]?.current_report?.verdict, "contradicts");
    assert.equal(byId["choice-response"]?.current_report?.event_id, contradict.events[0]?.event_id);
    assert.equal(byId["human-signoff"]?.current_report?.verdict, "supports");
    assert.equal(byId["human-signoff"]?.human_decision_required, true);
    assert.equal(byId["human-signoff"]?.current_report?.independent_verification, false);
    assert.equal(byId["human-signoff"]?.current_report?.substitutes_human_decision, false);

    data.module.events.report({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "unknown-choice",
      events: [reportDelivery({
        title: "还无法判断分叉",
        fields: { piece: "同一洞穴", limits: "需要更多玩家样本" },
        judgments: [{ requirement_id: "choice-response", verdict: "unknown" }],
      })],
    });
    current = data.module.events.readCurrentRequirements(BOARD, GOAL);
    const afterUnknown = Object.fromEntries(current.map((item) => [item.requirement_id, item]));
    assert.equal(afterUnknown["playable-scene"]?.current_report?.verdict, "supports");
    assert.equal(afterUnknown["choice-response"]?.current_report?.verdict, "unknown");
    assert.equal(afterUnknown["human-signoff"]?.current_report?.verdict, "supports");
    assert.equal(afterUnknown["human-signoff"]?.current_report?.substitutes_human_decision, false);

    const oldEvent = data.module.events.readEvent(BOARD, GOAL, support.events[0]!.event_id);
    assert.deepEqual(oldEvent.judgments, [
      { requirement_id: "choice-response", verdict: "supports" },
      { requirement_id: "human-signoff", verdict: "supports" },
      { requirement_id: "playable-scene", verdict: "supports" },
    ]);
  } finally {
    close(data);
  }
});

test("invalid structure, missing required fields, cross-goal refs and a later batch item roll back", () => {
  const data = fixture();
  try {
    data.module.commands.initializeBoard({
      board_id: OTHER_BOARD, title: "另一个项目", actor_id: "user-1", idempotency_key: "init-other",
    });
    data.module.commands.createGoal(OTHER_BOARD, {
      goal_id: OTHER_GOAL, title: "其他 Goal", outcome: "隔离", why: "跨引用", business_logic: "不可借用。",
      acceptance_criteria: [{
        criterion_id: "other-criterion",
        statement: "别的项目的要求",
        decision_method: "inspection",
        pass_condition: "不相关",
      }],
    }, { actor_id: "user-1", idempotency_key: "create-other" });
    data.module.events.configure({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", expected_version: 0, idempotency_key: "cfg-v1",
      types: [storyDelivery(1)],
    });
    data.module.events.configure({
      board_id: OTHER_BOARD, goal_id: OTHER_GOAL, actor_id: "runtime-1", expected_version: 0, idempotency_key: "cfg-other",
      types: [{ ...storyDelivery(1), type_id: "other-delivery" }],
    });

    const before = data.module.events.listEvents(BOARD, GOAL).events.length;
    const beforeJournal = Number(data.store.db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE board_id = ?",
    ).get(BOARD)?.count);

    assert.throws(
      () => data.module.events.report({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "bad-field",
        events: [reportDelivery({ fields: { piece: "有内容", unknown_field: "nope" } as Record<string, string> })],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_report.unknown_field",
    );
    assert.throws(
      () => data.module.events.report({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "missing-required",
        events: [reportDelivery({ fields: { piece: "   ", limits: "可选" } })],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_report.missing_required_field",
    );
    assert.throws(
      () => data.module.events.report({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "wrong-version",
        events: [reportDelivery({ type_version: 9, fields: { piece: "有内容" } })],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_type.version_not_found",
    );
    assert.throws(
      () => data.module.events.report({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "cross-req",
        events: [reportDelivery({
          fields: { piece: "有内容" },
          judgments: [{ requirement_id: "other-criterion", verdict: "supports" }],
        })],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_report.cross_goal_reference",
    );
    assert.throws(
      () => data.module.events.report({
        board_id: OTHER_BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "cross-board",
        events: [reportDelivery({ fields: { piece: "有内容" } })],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "goal.not_found",
    );
    assert.throws(
      () => data.module.events.configure({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", expected_version: 1, idempotency_key: "bad-format",
        types: [{
          ...storyDelivery(2),
          fields: [
            ...storyDelivery(1).fields,
            { field_id: "score", name: "分数", purpose: "数值", format: "number" as "text", required: false },
          ],
        }],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_config.unsupported_field_format",
    );
    assert.throws(
      () => data.module.events.configure({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", expected_version: 1, idempotency_key: "script",
        types: [{
          type_id: "xss",
          version: 1,
          name: "<script>alert(1)</script>",
          purpose: "不该保存",
          fields: [{ field_id: "body", name: "正文", purpose: "说明", format: "text", required: true }],
        }],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_config.executable_content",
    );
    assert.throws(
      () => data.module.events.report({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "batch-partial",
        events: [
          reportDelivery({ title: "合法前项", fields: { piece: "前项可保存" } }),
          reportDelivery({ title: "后项缺必填", fields: { limits: "只有可选" } }),
        ],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_report.missing_required_field",
    );

    assert.equal(data.module.events.listEvents(BOARD, GOAL).events.length, before);
    assert.equal(Number(data.store.db.prepare("SELECT COUNT(*) AS count FROM events WHERE board_id = ?").get(BOARD)?.count), beforeJournal);
    assert.equal(data.module.events.readConfig(BOARD, GOAL).version, 1);
    assert.equal(data.store.db.prepare("SELECT COUNT(*) AS count FROM goal_work_events WHERE board_id = ? AND kind = 'report'").get(BOARD)?.count, 0);

    data.module.lifecycle.setTrashed(BOARD, { goal_id: GOAL, trashed: true, reason: "先放回收站" }, {
      actor_id: "user-1", idempotency_key: "trash-goal",
    });
    assert.throws(
      () => data.module.events.report({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "trashed-write",
        events: [reportDelivery({ fields: { piece: "不该写入" } })],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "goal.trashed",
    );
  } finally {
    close(data);
  }
});

test("retries replay without duplicates; reused keys conflict; stale config version cannot overwrite", () => {
  const data = fixture();
  try {
    const first = data.module.events.configure({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", expected_version: 0, idempotency_key: "cfg-v1",
      types: [storyDelivery(1)],
    });
    const replayedConfig = data.module.events.configure({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", expected_version: 0, idempotency_key: "cfg-v1",
      types: [storyDelivery(1)],
    });
    assert.equal(replayedConfig.replayed, true);
    assert.equal(replayedConfig.event_id, first.event_id);
    assert.equal(data.module.events.readConfig(BOARD, GOAL).version, 1);
    assert.equal(data.store.db.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'goal.event_config.updated' AND board_id = ?").get(BOARD)?.count, 1);

    assert.throws(
      () => data.module.events.configure({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", expected_version: 0, idempotency_key: "cfg-v1",
        types: [{ ...storyDelivery(1), purpose: "不同请求" }],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "request.idempotency_key_reused",
    );

    const reported = data.module.events.report({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "report-1",
      events: [reportDelivery({ fields: { piece: "开场" } })],
    });
    const replayedReport = data.module.events.report({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "report-1",
      events: [reportDelivery({ fields: { piece: "开场" } })],
    });
    assert.equal(replayedReport.replayed, true);
    assert.equal(replayedReport.events[0]?.event_id, reported.events[0]?.event_id);
    assert.equal(data.store.db.prepare("SELECT COUNT(*) AS count FROM goal_work_events WHERE kind = 'report' AND board_id = ?").get(BOARD)?.count, 1);
    assert.throws(
      () => data.module.events.report({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "report-1",
        events: [reportDelivery({ fields: { piece: "另一份内容" } })],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "request.idempotency_key_reused",
    );

    data.store.close();
    const firstHandle = new LocalProjectDatabase(data.databasePath);
    const secondHandle = new LocalProjectDatabase(data.databasePath);
    try {
      const firstEvents = openModule(firstHandle).events;
      const secondEvents = openModule(secondHandle).events;
      const advanced = firstEvents.configure({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", expected_version: 1, idempotency_key: "cfg-from-a",
        types: [storyDelivery(2)],
      });
      assert.equal(advanced.config.version, 2);
      assert.throws(
        () => secondEvents.configure({
          board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", expected_version: 1, idempotency_key: "cfg-from-b",
          types: [{
            type_id: "story-observation",
            version: 1,
            name: "玩家观察",
            purpose: "旧连接仍以为配置是第 1 版",
            fields: [{ field_id: "behavior", name: "观察到什么", purpose: "记录行为", format: "longtext", required: true }],
          }],
        }),
        (error: unknown) => error instanceof GoalsCommandError && error.code === "event_config.version_conflict",
      );
      const current = secondEvents.readConfig(BOARD, GOAL);
      assert.equal(current.version, 2);
      assert.deepEqual(current.types.map((item) => item.type_id), ["story-delivery"]);
      assert.equal(current.types[0]?.version, 2);
    } finally {
      firstHandle.close();
      secondHandle.close();
    }
  } finally {
    try { data.store.close(); } catch { /* already closed before dual-handle reopen */ }
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("existing non-empty databases upgrade idempotently; fresh databases get the same event capability", () => {
  const data = fixture();
  try {
    const originalGoal = data.module.query.getGoal(BOARD, GOAL);
    const originalJournal = data.store.db.prepare(
      "SELECT event_id, type, seq FROM events WHERE board_id = ? ORDER BY seq",
    ).all(BOARD);
    const originalGoalCount = Number(data.store.db.prepare("SELECT COUNT(*) AS count FROM goals").get()?.count);
    data.store.close();

    const raw = new Database(data.databasePath);
    raw.pragma("foreign_keys = OFF");
    raw.exec(`
      DROP TABLE IF EXISTS goal_work_event_judgments;
      DROP TABLE IF EXISTS goal_work_events;
      DROP TABLE IF EXISTS goal_event_requirement_bindings;
      DROP TABLE IF EXISTS goal_event_requirements;
      DROP TABLE IF EXISTS goal_event_types;
      DROP TABLE IF EXISTS goal_event_config_versions;
      DROP TABLE IF EXISTS goal_event_configs;
      DELETE FROM schema_migrations WHERE migration_id = 32;
    `);
    raw.pragma("foreign_keys = ON");
    raw.close();

    const upgraded = new LocalProjectDatabase(data.databasePath);
    try {
      assert.equal(upgraded.db.prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 32").get()?.migration_id, 32);
      assert.ok(upgraded.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'goal_work_events'").get());
      const module = openModule(upgraded);
      assert.equal(module.query.getGoal(BOARD, GOAL)?.title, originalGoal?.title);
      assert.deepEqual(
        upgraded.db.prepare("SELECT event_id, type, seq FROM events WHERE board_id = ? ORDER BY seq").all(BOARD),
        originalJournal,
      );
      assert.equal(Number(upgraded.db.prepare("SELECT COUNT(*) AS count FROM goals").get()?.count), originalGoalCount);
      const configured = module.events.configure({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", expected_version: 0, idempotency_key: "after-upgrade",
        types: [storyDelivery(1)],
      });
      assert.equal(configured.config.version, 1);
      module.events.report({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "after-upgrade-report",
        events: [reportDelivery({ fields: { piece: "升级后仍可上报" } })],
      });
    } finally {
      upgraded.close();
    }

    const upgradedAgain = new LocalProjectDatabase(data.databasePath);
    try {
      assert.equal(upgradedAgain.db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE migration_id = 32").get()?.count, 1);
      const module = openModule(upgradedAgain);
      assert.equal(module.events.readConfig(BOARD, GOAL).version, 1);
      assert.equal(module.events.listEvents(BOARD, GOAL).events.filter((item) => item.kind === "report").length, 1);
      assert.deepEqual(
        upgradedAgain.db.prepare("SELECT type FROM events WHERE board_id = ? AND type IN ('goal.created', 'board.created') ORDER BY seq").all(BOARD),
        originalJournal.filter((row: { type: string }) => row.type === "goal.created" || row.type === "board.created").map((row: { type: string }) => ({ type: row.type })),
      );
    } finally {
      upgradedAgain.close();
    }

    const freshDir = mkdtempSync(join(tmpdir(), "molis-work-goal-events-fresh-"));
    const freshPath = join(freshDir, "fresh.db");
    const fresh = new LocalProjectDatabase(freshPath);
    try {
      assert.equal(fresh.db.prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 32").get()?.migration_id, 32);
      const module = openModule(fresh);
      module.commands.initializeBoard({
        board_id: BOARD, title: "新库", actor_id: "user-1", idempotency_key: "fresh-board",
      });
      module.commands.createGoal(BOARD, {
        goal_id: GOAL, title: "新库 Goal", outcome: "同样能力", why: "建库路径", business_logic: "新库直接可用。",
        acceptance_criteria: [],
      }, { actor_id: "user-1", idempotency_key: "fresh-goal" });
      const configured = module.events.configure({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", expected_version: 0, idempotency_key: "fresh-cfg",
        types: [storyDelivery(1)],
      });
      assert.equal(configured.config.types[0]?.type_id, "story-delivery");
    } finally {
      fresh.close();
      rmSync(freshDir, { recursive: true, force: true });
    }
  } finally {
    try { data.store.close(); } catch { /* closed before raw rewrite */ }
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("bound requirements reject incompatible types in a batch; unbound and bound-matching types still report", () => {
  const data = fixture();
  try {
    data.module.events.configure({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      expected_version: 0, idempotency_key: "cfg-types",
      types: [storyDelivery(1), storyObservation()],
      requirement_bindings: [{ type_id: "story-delivery", requirement_id: "playable-scene" }],
    });
    data.module.events.setAgreement({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "cfg-types-req",
      expected_config_version: 1,
      expected_agreement_version: data.module.events.readWorkState(BOARD, GOAL).agreement.version,
      new_requirements: [{
        requirement_id: "ready",
        statement: "开场已经可以交给别人玩",
        bound_type_id: "story-delivery",
      }],
    });
    const beforeJournal = count(data.store, "SELECT COUNT(*) AS count FROM events WHERE board_id = ?", BOARD);
    const beforeWork = count(data.store, "SELECT COUNT(*) AS count FROM goal_work_events WHERE board_id = ?", BOARD);
    const beforeJudgments = count(data.store, "SELECT COUNT(*) AS count FROM goal_work_event_judgments");

    assert.throws(
      () => data.module.events.report({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "batch-incompatible",
        events: [
          {
            type_id: "story-observation", type_version: 1, title: "先记下玩家卡住了",
            fields: { behavior: "在洞穴门口停住" },
            judgments: [{ requirement_id: "choice-response", verdict: "unknown" }],
          },
          {
            type_id: "story-observation", type_version: 1, title: "观察不能冒充交付",
            fields: { behavior: "有人走完了开场" },
            judgments: [{ requirement_id: "ready", verdict: "supports" }],
          },
        ],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_report.incompatible_requirement",
    );
    assert.throws(
      () => data.module.events.report({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "criterion-incompatible",
        events: [{
          type_id: "story-observation", type_version: 1, title: "观察不能绑定验收",
          fields: { behavior: "看起来能玩" },
          judgments: [{ requirement_id: "playable-scene", verdict: "supports" }],
        }],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_report.incompatible_requirement",
    );

    assert.equal(count(data.store, "SELECT COUNT(*) AS count FROM events WHERE board_id = ?", BOARD), beforeJournal);
    assert.equal(count(data.store, "SELECT COUNT(*) AS count FROM goal_work_events WHERE board_id = ?", BOARD), beforeWork);
    assert.equal(count(data.store, "SELECT COUNT(*) AS count FROM goal_work_event_judgments"), beforeJudgments);
    assert.equal(data.module.events.readCurrentRequirements(BOARD, GOAL).find((item) => item.requirement_id === "ready")?.current_report, null);

    const compatible = data.module.events.report({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "bound-ok",
      events: [reportDelivery({
        fields: { piece: "开场可玩" },
        judgments: [
          { requirement_id: "playable-scene", verdict: "supports" },
          { requirement_id: "ready", verdict: "supports" },
        ],
      })],
    });
    const unbound = data.module.events.report({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "unbound-ok",
      events: [{
        type_id: "story-observation", type_version: 1, title: "选择分叉还不清楚",
        fields: { behavior: "两次选择看起来差不多" },
        judgments: [{ requirement_id: "choice-response", verdict: "unknown" }],
      }],
    });
    assert.equal(compatible.events[0]?.judgments.find((item) => item.requirement_id === "ready")?.verdict, "supports");
    assert.equal(unbound.events[0]?.type?.type_id, "story-observation");

    data.store.close();
    const reopened = new LocalProjectDatabase(data.databasePath);
    try {
      const events = openModule(reopened).events;
      const current = Object.fromEntries(events.readCurrentRequirements(BOARD, GOAL).map((item) => [item.requirement_id, item]));
      assert.equal(current.ready?.current_report?.verdict, "supports");
      assert.equal(current.ready?.current_report?.event_id, compatible.events[0]?.event_id);
      assert.equal(current["playable-scene"]?.current_report?.verdict, "supports");
      assert.equal(current["choice-response"]?.current_report?.verdict, "unknown");
      assert.equal(current["choice-response"]?.current_report?.event_id, unbound.events[0]?.event_id);
      assert.equal(events.readEvent(BOARD, GOAL, unbound.events[0]!.event_id).payload.behavior, "两次选择看起来差不多");
    } finally {
      reopened.close();
    }
  } finally {
    try { data.store.close(); } catch { /* closed before reopen */ }
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("constructor and __proto__ field ids keep own text through save and reopen", () => {
  const data = fixture();
  try {
    data.module.events.configure({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", expected_version: 0, idempotency_key: "cfg-own",
      types: [{
        type_id: "shape-note",
        version: 1,
        name: "结构说明",
        purpose: "字段 ID 按普通文本保存",
        fields: [
          { field_id: "constructor", name: "构造", purpose: "怎么构造", format: "text", required: true },
          { field_id: "__proto__", name: "原型备注", purpose: "补充说明", format: "text", required: false },
        ],
      }],
    });
    const missing = JSON.parse("{}") as Record<string, string>;
    assert.throws(
      () => data.module.events.report({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "missing-constructor",
        events: [{ type_id: "shape-note", type_version: 1, title: "缺必填", fields: missing }],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_report.missing_required_field",
    );
    const onlyProto = JSON.parse("{\"__proto__\":\"只有可选\"}") as Record<string, string>;
    assert.throws(
      () => data.module.events.report({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "proto-without-constructor",
        events: [{ type_id: "shape-note", type_version: 1, title: "仍缺构造", fields: onlyProto }],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_report.missing_required_field",
    );

    const payload = JSON.parse("{\"constructor\":\"工厂方法\",\"__proto__\":\"原文 <b>仍保留</b>\"}") as Record<string, string>;
    const reported = data.module.events.report({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "own-fields",
      events: [{ type_id: "shape-note", type_version: 1, title: "记下结构", fields: payload }],
    });
    assert.equal(ownText(reported.events[0]!.payload, "constructor"), "工厂方法");
    assert.equal(ownText(reported.events[0]!.payload, "__proto__"), "原文 <b>仍保留</b>");

    data.store.close();
    const reopened = new LocalProjectDatabase(data.databasePath);
    try {
      const event = openModule(reopened).events.readEvent(BOARD, GOAL, reported.events[0]!.event_id);
      assert.equal(ownText(event.payload, "constructor"), "工厂方法");
      assert.equal(ownText(event.payload, "__proto__"), "原文 <b>仍保留</b>");
      assert.equal(event.payload.constructor, "工厂方法");
    } finally {
      reopened.close();
    }
  } finally {
    try { data.store.close(); } catch { /* closed before reopen */ }
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("event pages keep server order without gaps or duplicates; bad cursor, limit and cross-goal reads fail", () => {
  const data = fixture();
  try {
    data.module.commands.createGoal(BOARD, {
      goal_id: "goal-sibling",
      title: "同项目另一个 Goal",
      outcome: "隔离读取",
      why: "跨 Goal",
      business_logic: "不能读到别人的事件。",
      acceptance_criteria: [],
    }, { actor_id: "user-1", idempotency_key: "create-sibling" });
    data.module.events.configure({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", expected_version: 0, idempotency_key: "cfg-pages",
      types: [storyDelivery(1)],
    });
    for (const title of ["一", "二", "三", "四", "五"]) {
      data.module.events.report({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: `page-${title}`,
        events: [reportDelivery({ title: `进展 ${title}`, fields: { piece: title } })],
      });
    }
    const all = data.module.events.listEvents(BOARD, GOAL).events;
    assert.deepEqual(all.map((item) => item.kind === "report" ? { kind: item.kind, title: item.title } : { kind: item.kind }), [
      { kind: "system" },
      { kind: "configuration" },
      { kind: "report", title: "进展 一" },
      { kind: "report", title: "进展 二" },
      { kind: "report", title: "进展 三" },
      { kind: "report", title: "进展 四" },
      { kind: "report", title: "进展 五" },
    ]);
    const page1 = data.module.events.listEvents(BOARD, GOAL, { limit: 2 });
    const page2 = data.module.events.listEvents(BOARD, GOAL, { after_cursor: page1.next_cursor ?? undefined, limit: 2 });
    const page3 = data.module.events.listEvents(BOARD, GOAL, { after_cursor: page2.next_cursor ?? undefined, limit: 2 });
    const page4 = data.module.events.listEvents(BOARD, GOAL, { after_cursor: page3.next_cursor ?? undefined, limit: 2 });
    const paged = [...page1.events, ...page2.events, ...page3.events, ...page4.events];
    assert.deepEqual(paged.map((item) => item.event_id), all.map((item) => item.event_id));
    assert.deepEqual(paged.map((item) => item.journal_seq), all.map((item) => item.journal_seq));
    assert.equal(new Set(paged.map((item) => item.event_id)).size, all.length);
    assert.equal(page1.next_cursor, page1.events[1]?.journal_seq);
    assert.equal(page4.events.length, 1);
    assert.equal(page4.next_cursor, null);

    assert.throws(
      () => data.module.events.listEvents(BOARD, GOAL, { after_cursor: -1 }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_list.invalid_cursor",
    );
    assert.throws(
      () => data.module.events.listEvents(BOARD, GOAL, { after_cursor: 1.5 }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_list.invalid_cursor",
    );
    assert.throws(
      () => data.module.events.listEvents(BOARD, GOAL, { limit: 0 }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_list.invalid_limit",
    );
    assert.throws(
      () => data.module.events.listEvents(BOARD, GOAL, { limit: 101 }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_list.invalid_limit",
    );
    const foreign = all.find((item) => item.kind === "report");
    assert.ok(foreign);
    assert.throws(
      () => data.module.events.readEvent(BOARD, "goal-sibling", foreign.event_id),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event.not_found",
    );

    const latest1 = data.module.events.listLatestEvents(BOARD, GOAL, { limit: 2 });
    assert.equal(latest1.events.length, 2);
    assert.ok(latest1.events[0]!.journal_seq > latest1.events[1]!.journal_seq);
    const latest2 = data.module.events.listLatestEvents(BOARD, GOAL, { before_cursor: latest1.next_cursor ?? undefined, limit: 2 });
    const latest3 = data.module.events.listLatestEvents(BOARD, GOAL, { before_cursor: latest2.next_cursor ?? undefined, limit: 2 });
    const latest4 = data.module.events.listLatestEvents(BOARD, GOAL, { before_cursor: latest3.next_cursor ?? undefined, limit: 2 });
    const latestPaged = [...latest1.events, ...latest2.events, ...latest3.events, ...latest4.events];
    assert.deepEqual(latestPaged.map((item) => item.event_id).sort(), all.map((item) => item.event_id).sort());
    assert.equal(new Set(latestPaged.map((item) => item.event_id)).size, all.length);
    const timeline = data.module.events.listLatestTimeline(BOARD, GOAL, { limit: 3 });
    assert.equal(timeline.items.length, 3);
    assert.equal(timeline.items[0]!.event_id, latest1.events[0]!.event_id);
    assert.equal("payload" in timeline.items[0]!, false);
    const forwardAfterLatest = data.module.events.listEvents(BOARD, GOAL, { after_cursor: page1.next_cursor ?? undefined, limit: 2 });
    assert.deepEqual(forwardAfterLatest.events.map((item) => item.event_id), page2.events.map((item) => item.event_id));
    assert.throws(
      () => data.module.events.listLatestEvents(BOARD, GOAL, { before_cursor: 0 }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_list.invalid_cursor",
    );
  } finally {
    close(data);
  }
});

function eventApp(module: GoalsModule<unknown>) {
  return new GoalEventApplication({
    query: module.query,
    commands: module.commands,
    events: module.events,
    planning: module.planning,
  });
}

test("bounded latest reports are the actual newest reports, not the first history page", () => {
  const data = fixture();
  try {
    const app = eventApp(data.module);
    app.configure({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", expected_version: 0, idempotency_key: "cfg-latest",
      types: [storyDelivery(1)],
    });
    data.module.events.report({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", idempotency_key: "reports-1-55",
      events: Array.from({ length: 55 }, (_, index) => reportDelivery({
        title: `report ${index + 1}`,
        fields: { piece: `片段 ${index + 1}` },
      })),
    });
    const state = app.readState(BOARD, GOAL);
    assert.equal(state.latest_reports[0]?.title, "report 55");
    assert.deepEqual(state.latest_reports.map((item) => item.title), ["report 55", "report 54", "report 53", "report 52", "report 51"]);
    const page = data.module.events.listEvents(BOARD, GOAL, { limit: 50 });
    assert.equal(page.events.length, 50);
    assert.equal(page.events[0]?.kind, "system");
    assert.equal(page.events[1]?.kind, "configuration");
    assert.deepEqual(
      page.events.slice(2).map((item) => item.title),
      Array.from({ length: 48 }, (_, index) => `report ${index + 1}`),
    );
    const latest = data.module.events.listLatestReports(BOARD, GOAL, { limit: 5 });
    assert.equal(latest.reports[0]?.title, "report 55");
    data.store.close();
    const reopened = new LocalProjectDatabase(data.databasePath);
    try {
      const persisted = openModule(reopened).events.listLatestReports(BOARD, GOAL, { limit: 1 });
      assert.equal(persisted.reports[0]?.title, "report 55");
    } finally {
      reopened.close();
    }
  } finally {
    try { data.store.close(); } catch { /* closed in the happy path */ }
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("Runtime supports on a human_decision criterion still leaves a user-confirmation gap", () => {
  const data = fixture();
  try {
    const app = eventApp(data.module);
    app.createIntent({
      board_id: BOARD,
      goal_id: "accepted-human",
      title: "需要用户确认的交付",
      outcome: "用户亲自确认可以内部试用",
      why: "验证报告不能代替确认",
      business_logic: "Runtime 可报告支持，正式确认仍待用户。",
      requirements: [{
        requirement_id: "accepted-human-signoff",
        statement: "用户亲自确认可以内部试用",
        human_decision_required: true,
      }],
      actor_id: "user-1",
      idempotency_key: "create-accepted-human",
      source_kind: "web",
    });
    app.configure({
      board_id: BOARD, goal_id: "accepted-human", actor_id: "runtime-1", expected_version: 0, idempotency_key: "cfg-human",
      types: [storyDelivery(1)],
    });
    app.report({
      board_id: BOARD, goal_id: "accepted-human", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "report-human",
      events: [reportDelivery({
        fields: { piece: "可玩片段" },
        judgments: [{ requirement_id: "accepted-human-signoff", verdict: "supports" }],
      })],
    });
    const requirements = data.module.events.readCurrentRequirements(BOARD, "accepted-human");
    const human = requirements.find((item) => item.requirement_id === "accepted-human-signoff");
    assert.equal(human?.human_decision_required, true);
    assert.equal(human?.current_report?.verdict, "supports");
    assert.equal(human?.current_report?.substitutes_human_decision, false);
    const state = app.readState(BOARD, "accepted-human");
    const gap = state.gaps.find((item) => item.requirement_id === "accepted-human-signoff");
    assert.ok(gap);
    assert.equal(gap.human_decision_required, true);
    assert.equal(gap.current_verdict, "supports");
  } finally {
    close(data);
  }
});

test("type v2 can rename and drop fields while old events stay on v1", () => {
  const data = fixture();
  try {
    data.module.events.configure({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      expected_version: 0, idempotency_key: "cfg-rename-v1", types: [storyDelivery(1)],
    });
    const first = data.module.events.report({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "report-rename-v1",
      events: [reportDelivery({ fields: { piece: "第一版交付", limits: "当时缺口" } })],
    });
    data.module.events.configure({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      expected_version: 1, idempotency_key: "cfg-rename-v2",
      types: [{
        ...storyDelivery(1),
        version: 2,
        name: "交付内容",
        fields: [
          { field_id: "piece", name: "交付内容", purpose: "可体验结果", format: "longtext", required: true },
        ],
      }],
    });
    const second = data.module.events.report({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "report-rename-v2",
      events: [{
        type_id: "story-delivery", type_version: 2, title: "按新版本记录",
        fields: { piece: "只要这段可体验内容" },
      }],
    });
    const oldReport = data.module.events.readEvent(BOARD, GOAL, first.events[0]!.event_id);
    const newReport = data.module.events.readEvent(BOARD, GOAL, second.events[0]!.event_id);
    assert.equal(oldReport.type?.version, 1);
    assert.equal(oldReport.type?.fields.find((field) => field.field_id === "piece")?.name, "交付了什么片段");
    assert.equal(oldReport.payload.limits, "当时缺口");
    assert.equal(newReport.type?.version, 2);
    assert.equal(newReport.type?.fields.length, 1);
    assert.equal(newReport.type?.fields[0]?.name, "交付内容");
    assert.equal(newReport.payload.limits, undefined);
    assert.throws(
      () => data.module.events.configure({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
        expected_version: 2, idempotency_key: "cfg-rewrite-v2",
        types: [{ ...storyDelivery(1), version: 2, name: "偷偷改同一版" }],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_config.cannot_rewrite_type",
    );
  } finally {
    close(data);
  }
});

test("extra requirement unknown control fields are rejected and human_decision_required persists", () => {
  const data = fixture();
  try {
    data.module.events.configure({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      expected_version: 0, idempotency_key: "cfg-human-extra", types: [storyDelivery(1)],
    });
    const before = data.module.events.listEvents(BOARD, GOAL).events.length;
    assert.throws(
      () => data.module.events.setAgreement({
        board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
        idempotency_key: "unknown-field",
        expected_config_version: 1,
        expected_agreement_version: data.module.events.readWorkState(BOARD, GOAL).agreement.version,
        new_requirements: [{
          requirement_id: "human-extra",
          statement: "用户必须亲自确认购买体验",
          human_decision_required: true,
          independently_verified: true,
        } as never],
      }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "event_config.unsupported_property",
    );
    assert.equal(data.module.events.listEvents(BOARD, GOAL).events.length, before);
    data.module.events.setAgreement({
      board_id: BOARD, goal_id: GOAL, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "human-extra-ok",
      expected_config_version: 1,
      expected_agreement_version: data.module.events.readWorkState(BOARD, GOAL).agreement.version,
      new_requirements: [{
        requirement_id: "human-extra",
        statement: "用户必须亲自确认购买体验",
        human_decision_required: true,
      }],
    });
    const extra = data.module.events.readCurrentRequirements(BOARD, GOAL).find((item) => item.requirement_id === "human-extra");
    assert.equal(extra?.human_decision_required, true);
    assert.equal(extra?.currently_satisfied, false);
  } finally {
    close(data);
  }
});
