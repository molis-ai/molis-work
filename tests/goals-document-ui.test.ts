import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchGoalsDocumentRenderer, createWorkbenchUiHost } from "@molis-ai/molis-work-app-workbench";
import { GOALS_DOCUMENT_UI_CONTRIBUTION_ID, type GoalsDocumentItem, type GoalsDocumentContext } from "@molis-ai/molis-work-plugin-goals";
import { icon } from "@molis-ai/molis-work-design-system";
import { L, runWithLocale } from "@molis-ai/molis-work-app-local-host";

const escapeHtml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const renderer = createWorkbenchGoalsDocumentRenderer({ translate: L, escapeHtml, icon,
  formatDate: value => value ?? "", renderStatus: status => status, renderVisibleGoalStatus: item => item.display_status,
  sectionHeading: (_icon, title, description = "") => "<header>" + escapeHtml(L(title)) + escapeHtml(L(description)) + "</header>" });
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

test("initial Goal tabs escape user titles and collection placeholders preserve full versus refresh behavior", () => {
  const html = renderer.renderInitialGoalTab({ goal_id: 'id"<a>', title: 'Title " autofocus onfocus="alert(1)' });
  assert.match(html, /data-work-tab="id&quot;&lt;a&gt;"/);
  assert.match(html, /aria-label="关闭 Title &quot; autofocus onfocus=&quot;alert\(1\)"/);
  assert.doesNotMatch(html, /aria-label="关闭 Title "| onfocus="/);
  assert.match(html, /aria-controls="goal-document-pane"/);
  const compact = renderer.renderEmptyGoalCollection(true, false);
  assert.match(compact, /回收站是空的/);
  assert.doesNotMatch(compact, /<p>|<a /);
  const trash = renderer.renderEmptyGoalCollection(true, true);
  assert.match(trash, /移入回收站的 Goal 可以在这里恢复/);
  assert.match(trash, /href="\/"/);
  const archive = runWithLocale("en", () => renderer.renderEmptyGoalCollection(false, true));
  assert.match(archive, /No archived Goal yet/);
  assert.match(archive, /Historical facts are not deleted/);
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
  const english = runWithLocale("en", () => render(empty));
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
  assert.match(details, /<details class="original-goal-criteria"><summary>原 Goal 标准<\/summary>/);
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
  assert.doesNotMatch(empty, /original-goal-criteria|原 Goal 标准/);
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
