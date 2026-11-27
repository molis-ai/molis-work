import assert from "node:assert/strict";
import { createWorkbenchUiHost } from "@molis-ai/molis-work-app-workbench";
import { goalsRenderers, testGoalUi as test, withGoalLocale } from "./goals-page-mount.js";
import {
  GOALS_DOCUMENT_UI_CONTRIBUTION_ID,
  mapJournalHistoryItems,
  mergeGoalHistoryItems,
  renderHistoryItemBody,
  renderWorkEventBody,
  type GoalsDocumentContext,
  type GoalsDocumentItem,
} from "@molis-ai/molis-work-plugin-goals";
import type { GoalEventTimelineItem, GoalWorkEventRecord } from "@molis-ai/molis-work-plugin-goals/contract";
import { icon, t } from "@molis-ai/molis-work-plugin-sdk/ui";

const escapeHtml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const renderer = goalsRenderers.document({ translate: t.text, escapeHtml, icon,
  formatDate: value => value ?? "", renderStatus: status => status, renderVisibleGoalStatus: item => item.display_status,
  sectionHeading: (_icon, title, description = "") => "<header>" + escapeHtml(t.text(title)) + escapeHtml(t.text(description)) + "</header>" });
const context: GoalsDocumentContext = { activeGoalId: null, decisionCount: 0,
  relatedWorkHtml: "", artifactHtml: "", coverageHtml: "" };
const item = (): GoalsDocumentItem => ({
  goal: { goal_id: "goal-a", title: '保留用户标题 "<title>', priority: 7, created_at: "2026-09-05", updated_at: "2026-09-05",
    fulfillment_state: "unmet", definition_state: "accepted", outcome: 'Result "<safe>', why: "Why", business_logic: "Behavior",
    in_scope: ["Scope"], out_of_scope: [], constraints: [], required_inputs: [], promised_outputs: [],
    accepted_by: "user-confirmed-via:codex", archived_at: null, trashed_at: null, trashed_by: null,
    acceptance_criteria: Array.from({ length: 6 }, (_, index) => ({ criterion_id: "c" + index, statement: "Requirement " + index,
      pass_condition: "Result " + index, decision_method: "inspection", target: null, required_evidence: [] })) },
  status: "execution_pending", display_status: "continue", passed_criteria: ["c1", "c1", "unknown"], relations: [],
  main_action_label: 'Continue "<safe>', action_summary: "Next action",
  evidence: [], events: [],
});
const render = (value: GoalsDocumentItem, overrides: Partial<GoalsDocumentContext> = {}) => renderer.renderGoalDocument(value, { ...context, ...overrides }, true);

test("collection placeholders preserve full versus refresh behavior", () => {
  const compact = renderer.renderEmptyGoalCollection(true, false);
  assert.match(compact, /回收站是空的/);
  assert.doesNotMatch(compact, /<p>|<a /);
  const trash = renderer.renderEmptyGoalCollection(true, true);
  assert.match(trash, /移入回收站的目标不会干扰日常列表，需要时可随时在这里恢复/);
  assert.match(trash, /href="\/"/);
  const archive = withGoalLocale("en", () => renderer.renderEmptyGoalCollection(false, true));
  assert.match(archive, /No archived Goals yet/);
  assert.match(archive, /while keeping full history/);
  assert.doesNotMatch(archive, /Trash is empty/);
});

test("document contribution keeps Goal facts in the timeline layout and escapes titles", () => {
  assert.ok(createWorkbenchUiHost().list().some(entry => entry.contribution_id === GOALS_DOCUMENT_UI_CONTRIBUTION_ID));
  const value = item(), html = render(value);
  assert.match(html, /保留用户标题 &quot;&lt;title&gt;/);
  assert.match(html, /Result &quot;&lt;safe&gt;/);
  assert.match(html, /data-goal-event-document/);
  assert.match(html, /data-event-timeline/);
  assert.match(html, /data-current-summary/);
  assert.doesNotMatch(html, /data-goal-tab="overview"/);
  assert.doesNotMatch(html, /data-open-quick-record/);
  assert.doesNotMatch(html, /data-set-active-goal/);
  assert.doesNotMatch(render(value, { activeGoalId: "goal-a" }), /data-set-active-goal/);
  assert.match(renderer.renderGoalDocument(value, context, false), /data-goal-view="goal-a"[^>]* hidden/);
});

test("document next action no longer follows Claim/Run projection for the new reading surface", () => {
  const html = render(item());
  assert.match(html, /data-goal-event-document/);
  assert.doesNotMatch(html, /data-open-goal-tui/);
  assert.doesNotMatch(html, /class="goal-primary-action"/);
});

test("archived and trashed documents keep restore/history behavior and localized empty copy", () => {
  const value = item();
  const archived = render({ ...value, goal: { ...value.goal, archived_at: "2026-09-05" }, display_status: "completed" });
  assert.match(archived, /data-goal-archive="false"/);
  assert.doesNotMatch(archived, /data-open-quick-record|data-set-active-goal|data-goal-archive="true"|class="goal-mode-switch"/);
  const trashed = renderer.renderTrashGoalDocument({ ...value, goal: { ...value.goal, trashed_at: "2026-09-05" },
    events: [{ type: "goal.trashed", actor_id: 'Actor "<x>', reason: 'Reason "<y>' }] }, true);
  assert.match(trashed, /data-open-goal-restore/);
  assert.match(trashed, /Actor &quot;&lt;x&gt;/);
  assert.match(trashed, /Reason &quot;&lt;y&gt;/);
  assert.doesNotMatch(trashed, /data-open-quick-record|data-open-goal-tui|data-set-active-goal/);
  const empty = { ...value, goal: { ...value.goal, acceptance_criteria: [] } };
  const english = withGoalLocale("en", () => render(empty));
  assert.match(english, /保留用户标题 &quot;&lt;title&gt;/);
  assert.match(english, /data-goal-event-document/);
});

test("accepted Goal description keeps original constraints, inputs and outputs without a draft editor", () => {
  const value = item();
  value.goal = {
    ...value.goal,
    constraints: ["原约束：只修改已确认的文案"],
    required_inputs: ["原输入：用户已确认的发布说明"],
    promised_outputs: ["原输出：可读的最终说明文档"],
  };
  const html = render(value);
  const description = html.slice(html.indexOf('data-event-panel="description"'), html.indexOf('data-event-panel="requirements"'));
  assert.match(description, /原约束：只修改已确认的文案/);
  assert.match(description, /原输入：用户已确认的发布说明/);
  assert.match(description, /原输出：可读的最终说明文档/);
  assert.doesNotMatch(html, /data-draft-form|data-open-goal-edit/);
});

test("accepted Goal requirements keep original criterion details expandable without becoming current completion", () => {
  const value = item();
  value.goal.acceptance_criteria = [
    { criterion_id: "legacy-read-criterion", statement: "能够查看原字段", decision_method: "inspection",
      pass_condition: "原约束、输入和输出逐项显示", target: { value: 90, unit: "分" }, required_evidence: ["inspection", "original-report"] },
    { criterion_id: "c-object", statement: "Object target", decision_method: "measurement", pass_condition: "Verified",
      target: { min: 1, max: 3 }, required_evidence: [] },
  ];
  const html = render(value, { artifactHtml: "<h3>关联结果</h3><article>Artifact owner</article>" });
  const requirements = html.slice(html.indexOf('data-event-panel="requirements"'));
  const detailsStart = requirements.indexOf("<details");
  const detailsEnd = requirements.indexOf("</details>");
  assert.ok(detailsStart >= 0 && detailsEnd > detailsStart);
  const details = requirements.slice(detailsStart, detailsEnd + "</details>".length);
  assert.match(details, /<details class="original-goal-criteria"><summary>初始完成标准<\/summary>/);
  assert.match(details, /legacy-read-criterion/);
  assert.match(details, /inspection/);
  assert.match(details, /90 分/);
  assert.match(details, /original-report/);
  assert.match(details, /\{&quot;min&quot;:1,&quot;max&quot;:3\}/);
  assert.doesNotMatch(details, /当前满足|尚未满足|data-locate-event/);
  assert.match(requirements, /还没有完成要求。/);
  assert.match(requirements, /<h3>关联结果<\/h3><article>Artifact owner<\/article>/);
  assert.ok(detailsEnd < requirements.indexOf("Artifact owner"));
  const empty = render({ ...value, goal: { ...value.goal, acceptance_criteria: [] } });
  assert.doesNotMatch(empty, /original-goal-criteria|初始完成标准/);
});

test("event-owned documents keep the note entry and do not restore a draft editor", () => {
  const owned = render({ ...item(), event_work: true });
  assert.match(owned, /data-event-form-open="note"/);
  assert.match(owned, /data-event-form="note"/);
  assert.doesNotMatch(owned, /data-open-goal-edit/);
  assert.doesNotMatch(owned, /data-draft-editor/);
});

test("unowned historical documents hide write triggers and keep reading", () => {
  const html = render(item());
  assert.doesNotMatch(html, /data-open-goal-edit|data-draft-editor|data-event-form-open="note"|data-event-form="note"|data-event-form="type"|data-event-form="agreement"|data-event-form="closure"|data-event-form="continue"/);
  assert.match(html, /data-event-reader="planning"/);
  assert.match(html, /data-event-reader="description"/);
  assert.match(html, /data-event-reader="requirements"/);
  assert.match(html, /data-open-goal-trash/);
});

test("F-goals-08: history timeline and bodies localize all types, effects, concerns, relations and entities across zh/en/ja", () => {
  const operations = [
    "progress_summary", "observation_note", "concern_opened", "concern_resolved",
    "concern_accepted", "concern_overturned", "decision_requested", "user_decision",
    "decision_cited", "agreement_set", "closure_submitted", "completion_reopened",
    "work_resumed", "event_owner_continued", "input_acknowledged",
  ] as const;
  const workItems: GoalEventTimelineItem[] = [
    ...operations.map((op, index) => ({
      event_id: `ev-${op}`,
      kind: "system" as const,
      title: `Title ${op}`,
      actor_id: "actor-1",
      actor_kind: "runtime" as const,
      received_at: `2026-11-26T00:${String(index).padStart(2, "0")}:00.000Z`,
      journal_seq: index + 1,
      system_operation: op,
      type_id: null,
      type_name: null,
      semantic_family: null,
      lane: "other" as const,
    })),
    {
      event_id: "ev-report", kind: "report", title: "Title report", actor_id: "actor-1", actor_kind: "runtime",
      received_at: "2026-11-26T00:20:00.000Z", journal_seq: 20, system_operation: null,
      type_id: "t1", type_name: null, semantic_family: "delivery", lane: "result",
    },
    {
      event_id: "ev-config", kind: "configuration", title: "Title config", actor_id: "actor-1", actor_kind: "runtime",
      received_at: "2026-11-26T00:21:00.000Z", journal_seq: 21, system_operation: null,
      type_id: null, type_name: null, semantic_family: null, lane: "other",
    },
    {
      event_id: "ev-system-other", kind: "system", title: "Title sys", actor_id: "actor-1", actor_kind: "runtime",
      received_at: "2026-11-26T00:22:00.000Z", journal_seq: 22, system_operation: "unknown_op",
      type_id: null, type_name: null, semantic_family: null, lane: "other",
    },
  ];
  const journalEvents = [
    { event_id: "j-1", seq: 1, type: "goal.created", object_type: "goal", object_id: "goal-a", actor_id: "actor-1", at: "2026-11-26T00:23:00.000Z", reason: "", payload: {} },
    { event_id: "j-2", seq: 2, type: "goal.updated", object_type: "goal", object_id: "goal-a", actor_id: "actor-1", at: "2026-11-26T00:24:00.000Z", reason: "", payload: {} },
    { event_id: "j-3", seq: 3, type: "goal.accepted", object_type: "goal", object_id: "goal-a", actor_id: "actor-1", at: "2026-11-26T00:25:00.000Z", reason: "", payload: {} },
    { event_id: "j-4", seq: 4, type: "relation.added", object_type: "relation", object_id: "rel-1", actor_id: "actor-1", at: "2026-11-26T00:26:00.000Z", reason: "Dependency", payload: { from_goal_id: "goal-a", to_goal_id: "goal-b", type: "depends_on" } },
    { event_id: "j-5", seq: 5, type: "relation.deactivated", object_type: "relation", object_id: "rel-1", actor_id: "actor-1", at: "2026-11-26T00:27:00.000Z", reason: "Removed", payload: { from_goal_id: "goal-a", to_goal_id: "goal-b", type: "depends_on" } },
    { event_id: "j-6", seq: 6, type: "goal.custom_event", object_type: "goal", object_id: "goal-a", actor_id: "actor-1", at: "2026-11-26T00:28:00.000Z", reason: "", payload: {} },
  ];
  const journalItems = mapJournalHistoryItems(journalEvents, new Set(), {
    goals: [{ goal_id: "goal-a", title: "Goal A" }, { goal_id: "goal-b", title: "Goal B" }] as never,
    relations: [{ relation_id: "rel-1", from_goal_id: "goal-a", to_goal_id: "goal-b", type: "depends_on" }] as never,
  });
  const merged = mergeGoalHistoryItems({ work: { items: workItems, observed_event_cursor: 30 }, journal: journalItems });
  assert.equal(merged.length, 24);
  const enDocItem = item();
  enDocItem.goal = { ...enDocItem.goal, title: "Goal A", outcome: "Outcome A" };
  const enHtml = withGoalLocale("en", () => render(enDocItem, {
    eventDocument: {
      state: {
        goal_id: "goal-a", owner: { kind: "event_work", source: "web", adopted_at: "2026-11-26T00:00:00.000Z", adopted_by: "actor-1" },
        work_status: "open", can_record: true, completion_effect: false, observed_event_cursor: 30, goal_event_cursor: 30,
        intent: { title: "Goal A", source_kind: "web" }, config: { version: 1 },
        agreement: { version: 1, outcome: "Outcome A", has_minimum_result_agreement: true },
        requirements: [], concerns: [],
        pending_decisions: [{
          request_id: "req-1", event_id: "ev-decision_requested", question: "Proceed?", purpose: "action",
          options: [], scope: { requirement_ids: [], event_ids: [], concern_ids: [], action: "publish" },
          proposed_change: null, commitment: null, status: "pending", created_at: "2026-11-26T00:06:00.000Z",
        }],
        applied_decisions: [], current_decisions: [], latest_reports: [], gaps: [], progress_summary: null, closure: null,
      },
      timeline: { items: merged, next_cursor: null, observed_event_cursor: 30 },
      types: [], description: { outcome: "Outcome A", why: "Why", business_logic: "Logic", in_scope: [], out_of_scope: [], constraints: [], required_inputs: [], promised_outputs: [] },
      transfer: { kind: "none" }, acceptance: null,
    } as never,
  }));
  const navStart = enHtml.indexOf("<nav data-event-timeline");
  const navEnd = enHtml.indexOf("</nav>", navStart);
  const enTimeline = enHtml.slice(navStart, navEnd);
  assert.doesNotMatch(enTimeline, /\p{Script=Han}/u, `English timeline must not leak Chinese labels: ${enTimeline}`);
  assert.match(enTimeline, /Needs your decision/, "decision_requested must match via type_key in English");

  // user_decision body: authorize_agreement_change, concern_ids label, and single HTML escaping of '&'.
  const decisionEvent: GoalWorkEventRecord = {
    event_id: "ev-dec", project_id: "p1", goal_id: "goal-a", kind: "system", type: null,
    title: "Decision", actor_id: "web-user", actor_kind: "user", received_at: "2026-11-26T00:10:00.000Z", journal_seq: 10, config_version: 1,
    payload: {
      operation: "user_decision",
      decision_id: "d-1", governance_decision_id: "gd-1", request_id: null, selected_option_id: null,
      conclusion: "Approved", accepts_requirements: false,
      effects: [{ kind: "authorize_agreement_change" }, { kind: "authorize_action", action: "build & deploy" }],
      scope: { requirement_ids: [], event_ids: [], concern_ids: ["c-1"], action: null },
      authorized_change: null,
      config_version: 1,
      agreement_version: 1,
    },
  };
  for (const [locale, expectedEffect, expectedConcern] of [
    ["zh", "批准约定变更", "问题"],
    ["en", "Approve agreement change", "Issue"],
    ["ja", "合意変更を承認", "問題"],
  ] as const) {
    const body = withGoalLocale(locale, () => renderWorkEventBody(decisionEvent, t.text, escapeHtml));
    assert.ok(body.includes(expectedEffect), `${locale} must localize authorize_agreement_change: ${body}`);
    assert.ok(body.includes(expectedConcern), `${locale} must localize concern scope label: ${body}`);
    assert.ok(!body.includes("authorize_agreement_change"), `${locale} must not leak raw enum name`);
    assert.ok(!body.includes("&amp;amp;"), `${locale} must not double-escape ampersand`);
    assert.ok(body.includes("build &amp; deploy"), `${locale} must escape ampersand once`);
    if (locale !== "en") assert.ok(!body.includes("Concern"), `${locale} must not hardcode English Concern`);
    if (locale === "en") assert.doesNotMatch(body, /\p{Script=Han}/u, `en decision body must not leak Chinese: ${body}`);
  }

  // Journal body rendering in English must localize type and relation without leaking Chinese.
  const journalCreatedBody = withGoalLocale("en", () => renderHistoryItemBody(
    journalItems[0]!,
    { journal: journalEvents[0] as never },
    { translate: t.text, escapeHtml },
  ));
  assert.doesNotMatch(journalCreatedBody, /\p{Script=Han}/u, `en journal body must not leak Chinese: ${journalCreatedBody}`);
  const journalRelationBody = withGoalLocale("en", () => renderHistoryItemBody(
    journalItems[3]!,
    { journal: journalEvents[3] as never },
    { translate: t.text, escapeHtml },
  ));
  assert.doesNotMatch(journalRelationBody, /\p{Script=Han}/u, `en relation journal body must not leak Chinese: ${journalRelationBody}`);
});
