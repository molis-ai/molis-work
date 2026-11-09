import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalRelationRecord } from "./contract/goals.js";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { GOALS_RELATION_LABELS as RELATION_LABELS, GOALS_RELATION_TYPES as RELATION_TYPES } from "./relation-presentation.js";
import { sortGoalTreeItems as sortGoals } from "./tree-order.js";
import type { GoalsRelationItem, GoalsRelationView, GoalsRelationUiPrimitives } from "./relation-ui-model.js";

export const GOALS_RELATION_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.relations.v1";
function createRelationRenderer(primitives: GoalsRelationUiPrimitives) {
  const { translate: L, escapeHtml, icon } = primitives;
function relationRow(
  relation: GoalRelationRecord,
  item: GoalsRelationItem,
  view: GoalsRelationView,
  editable = true,
): string {
  const outgoing = relation.from_goal_id === item.goal.goal_id;
  const relatedId = outgoing ? relation.to_goal_id : relation.from_goal_id;
  const related = [...view.goals, ...view.archived_goals].find(
    (candidate) => candidate.goal.goal_id === relatedId,
  );
  const relatedName = related?.goal.title ?? relatedId;
  const rawLabels = RELATION_LABELS[relation.type] ?? { out: relation.type, in: relation.type };
  const labels = { out: L(rawLabels.out), in: L(rawLabels.in) };
  const path = outgoing
    ? uiText.text("goals.relation-ui.current-goal-type-name", { type: labels.out, name: relatedName })
    : uiText.text("goals.relation-ui.name-type-current-goal", { name: relatedName, type: labels.out });
  const deactivated = item.events.find(
    (event) => event.type === "relation.deactivated" && event.object_id === relation.relation_id,
  );
  const stateLabel = relation.state === "active" ? uiText.text("goals.relation-ui.active") : relation.state === "proposed" ? uiText.text("goals.relation-ui.pending-confirmation") : uiText.text("goals.relation-ui.removed");
  const deactivateId = `relation-deactivate-${relation.relation_id}`;
  return `<div class="relation-record relation-record--${escapeHtml(relation.state)}" id="relation-${escapeHtml(relation.relation_id)}" data-relation-id="${escapeHtml(relation.relation_id)}">
    <button class="relation-row" type="button" data-select-goal="${escapeHtml(relatedId)}" aria-label="${uiText("goals.relation-ui.open")} ${escapeHtml(relatedName)}">
      <span class="relation-kind">${escapeHtml(outgoing ? labels.out : labels.in)}</span>
      <span class="relation-copy"><span class="relation-heading"><strong>${escapeHtml(relatedName)}</strong><small class="relation-goal-id">${escapeHtml(relatedId)}</small></span><small class="relation-path">${escapeHtml(path)}</small><small class="relation-reason">${uiText("goals.relation-ui.why-was-created")}${escapeHtml(relation.reason)}${deactivated ? ` · ${uiText.text("goals.relation-ui.why-was-removed")}${escapeHtml(deactivated.reason)}` : ""}</small></span>
      <span class="relation-state relation-state--${escapeHtml(relation.state)}">${escapeHtml(stateLabel)}</span>
      ${icon("chevron-right")}
    </button>
    ${editable && relation.state === "active" && !item.goal.archived_at ? `<button class="relation-deactivate-open" type="button" data-relation-deactivate-open aria-expanded="false" aria-controls="${escapeHtml(deactivateId)}">${uiText("goals.relation-ui.remove")}</button>` : ""}
    ${editable && relation.state === "active" && !item.goal.archived_at ? `<form class="relation-deactivate-form" id="${escapeHtml(deactivateId)}" data-relation-deactivate-form data-live-form="relation-deactivate-${escapeHtml(relation.relation_id)}" data-relation-id="${escapeHtml(relation.relation_id)}" hidden>
      <label><span>${uiText("goals.relation-ui.why-remove")}</span><textarea name="reason" rows="2" required placeholder="${uiText("goals.relation-ui.say-why-relation-no-longer-holds-history-stays")}"></textarea></label>
      <p class="form-error" data-relation-deactivate-error role="alert" hidden></p>
      <footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-relation-deactivate-cancel>${uiText("goals.relation-ui.cancel")}</button><button class="mw-btn mw-btn--danger" type="submit">${uiText("goals.relation-ui.confirm-removal")}</button></footer>
    </form>` : ""}
  </div>`;
}

function relationGroup(
  title: string,
  hint: string,
  relations: GoalRelationRecord[],
  item: GoalsRelationItem,
  view: GoalsRelationView,
  editable = true,
): string {
  return `<section class="relation-group"><header><h3>${escapeHtml(uiText.text(title))} <span>${relations.length}</span></h3><p>${escapeHtml(uiText.text(hint))}</p></header><div>${
    relations.length
      ? relations.map((relation) => relationRow(relation, item, view, editable)).join("")
      : `<p class="empty-row">${uiText("goals.relation-ui.no-relations-yet")}</p>`
  }</div></section>`;
}

function renderRelations(item: GoalsRelationItem, view: GoalsRelationView, editable = true, dependencyHistoryHtml = ""): string {
  const relations = item.relations.filter((relation) => relation.state !== "inactive");
  const inactive = item.relations.filter((relation) => relation.state === "inactive");
  const spineTypes = new Set(["depends_on", "part_of"]);
  const upstream = relations.filter(
    (relation) => relation.from_goal_id === item.goal.goal_id && spineTypes.has(relation.type),
  );
  const downstream = relations.filter(
    (relation) => relation.to_goal_id === item.goal.goal_id && spineTypes.has(relation.type),
  );
  const other = relations.filter(
    (relation) => !upstream.includes(relation) && !downstream.includes(relation),
  );
  return `<div class="relation-layout">
    ${relationGroup("goals.relation-ui.upstream", "goals.relation-ui.where-goal-belongs-what-its-completion-depends", upstream, item, view, editable)}
    ${relationGroup("goals.relation-ui.downstream", "goals.relation-ui.which-goals-wait-contain", downstream, item, view, editable)}
    ${relationGroup("goals.relation-ui.other-links", "goals.relation-ui.extension-replacement-correction-risk-links", other, item, view, editable)}
  </div>
  ${editable ? renderRelationEditor(item, view) : ""}
  ${inactive.length ? `<details class="relation-inactive-history" data-persist-open="inactive-relations-${escapeHtml(item.goal.goal_id)}"><summary><span>${icon("history")}<strong>${uiText("goals.relation-ui.removed-relations")}</strong><small>${inactive.length} ${uiText("goals.relation-ui.kept-direction-reason")}</small></span>${icon("chevron-down")}</summary><div>${inactive.map((relation) => relationRow(relation, item, view, false)).join("")}</div></details>` : ""}
  ${dependencyHistoryHtml}`;
}

function renderRelationForm(item: GoalsRelationItem, view: GoalsRelationView): string {
  if (item.goal.archived_at) return "";
  const targets = sortGoals(view.goals).filter(
    (candidate) => candidate.goal.goal_id !== item.goal.goal_id,
  );
  if (!targets.length) {
    return `<div class="relation-editor-empty">${icon("link")}<span><strong>${uiText("goals.relation-ui.there-no-other-goal-link-yet")}</strong><small>${uiText("goals.relation-ui.create-another-goal-first-then-come-back-add")}</small></span></div>`;
  }
  const targetOptions = targets
    .map(
      (target) =>
        `<option value="${escapeHtml(target.goal.goal_id)}" data-goal-name="${escapeHtml(target.goal.title)}">${escapeHtml(target.goal.title)} · ${escapeHtml(target.goal.goal_id)}</option>`,
    )
    .join("");
  const typeOptions = RELATION_TYPES.map(({ type, label, description }) => {
    const labels = RELATION_LABELS[type];
    return `<option value="${escapeHtml(type)}"${type === "depends_on" ? " selected" : ""} data-out-label="${escapeHtml(L(labels.out))}" data-in-label="${escapeHtml(L(labels.in))}" data-description="${escapeHtml(L(description))}">${escapeHtml(L(label))}</option>`;
  }).join("");
  const firstTarget = targets[0]!.goal;
  return `<form class="relation-form" data-relation-form data-live-form="relation-${escapeHtml(item.goal.goal_id)}" data-goal-id="${escapeHtml(item.goal.goal_id)}" data-current-goal-name="${escapeHtml(item.goal.title)}" novalidate>
      <div class="relation-authority"><span>${icon("shield")}</span><p><strong>${uiText("goals.relation-ui.directly-editing-goal-relationships")}</strong><small>${uiText("goals.relation-ui.changes-made-here-take-effect-immediately-recorded-relationship")}<a href="/" data-work-surface-link="inbox">${L("Inbox")}</a>${uiText("goals.relation-ui.take-effect-only-after-confirm-them")}</small></p></div>
      <div class="relation-builder">
        <label><span>${uiText("goals.relation-ui.what-does-relationship-mean")}</span><select name="relation_intent"><option value="needs">${uiText("goals.relation-ui.current-goal-needs-finish-before-can-close")}</option><option value="belongs">${uiText("goals.relation-ui.current-goal-part")}</option><option value="enables">${uiText("goals.relation-ui.needs-current-goal-finish-before-can-close")}</option><option value="contains">${uiText("goals.relation-ui.part-current-goal")}</option><option value="other">${uiText("goals.relation-ui.another-relationship")}</option></select></label>
        <label><span>${uiText("goals.relation-ui.other-goal")}</span><select name="target_goal_id">${targetOptions}</select></label>
      </div>
      <div class="relation-live-preview" data-relation-live-preview><small>${uiText("goals.relation-ui.after-saving")}</small><strong>${escapeHtml(item.goal.title)} <span>${uiText("goals.relation-ui.depends")}</span> ${escapeHtml(firstTarget.title)}</strong><p>${uiText("goals.relation-ui.current-goal-cannot-close-until-other-goal-done")}</p></div>
      <label class="relation-reason-field"><span>${uiText("goals.relation-ui.why-relationship-needed")}</span><textarea name="reason" rows="3" required placeholder="${uiText("goals.relation-ui.explain-why-these-goals-need-relationship-so-can")}"></textarea></label>
      <details class="factor-advanced" data-progressive-fields>
        <summary><span><strong>${uiText("goals.relation-ui.view-exact-direction-relationship-type")}</strong><small>${uiText("goals.relation-ui.change-these-only-when-common-choices-above-do")}</small></span>${icon("chevron-down")}</summary>
        <div class="factor-advanced-grid">
          <label><span>${uiText("goals.relation-ui.exact-direction")}</span><select name="direction" required><option value="">${uiText("goals.relation-ui.choose-direction")}</option><option value="outgoing" selected>${uiText("goals.relation-ui.current-goal-other-goal")}</option><option value="incoming">${uiText("goals.relation-ui.other-goal-current-goal")}</option></select></label>
          <label><span>${uiText("goals.relation-ui.exact-relationship-type")}</span><select name="type" required><option value="">${uiText("goals.relation-ui.choose-relationship-type")}</option>${typeOptions}</select></label>
        </div>
      </details>
      <p class="form-error" data-relation-error role="alert" hidden></p>
      <footer><p>${uiText("goals.relation-ui.takes-effect-immediately-written-event-ledger-no-runtime")}</p><button class="mw-btn mw-btn--primary" type="submit">${uiText("goals.relation-ui.create-relation")}</button></footer>
    </form>`;
}

function renderRelationEditor(item: GoalsRelationItem, view: GoalsRelationView): string {
  const editorKey = `relation-editor-${item.goal.goal_id}`;
  const form = renderRelationForm(item, view);
  if (!form || form.includes("relation-editor-empty")) return form;
  return `<details class="relation-editor" data-relation-editor data-persist-open="${escapeHtml(editorKey)}" data-live-form="${escapeHtml(editorKey)}">
    <summary><span class="relation-editor-icon">${icon("link")}</span><span><strong>${uiText("goals.relation-ui.maintain-relations")}</strong><small>${uiText("goals.relation-ui.add-relation-remove-one-above")}</small></span><span class="relation-editor-action">${uiText("goals.relation-ui.open-editor")}</span>${icon("chevron-down")}</summary>
    ${form}
  </details>`;
}


  return { renderRelations, renderRelationForm };
}
export type GoalsRelationRenderer = ReturnType<typeof createRelationRenderer>;
export type GoalsRelationUiModel = { primitives: GoalsRelationUiPrimitives } & (
  | { kind: "relations"; args: Parameters<GoalsRelationRenderer["renderRelations"]> }
  | { kind: "form"; args: Parameters<GoalsRelationRenderer["renderRelationForm"]> }
);

/** Which surface each renderer method mounts (W5-06): the shell builds its renderer from this, and the descriptor lists these. */
export const GOALS_RELATION_UI_SURFACES = { renderRelations: "relations", renderRelationForm: "form" } as const satisfies Record<keyof GoalsRelationRenderer, GoalsRelationUiModel["kind"]>;
export const goalsRelationUiContribution: UiContribution<GoalsRelationUiModel> = {
  descriptor: { contribution_id: GOALS_RELATION_UI_CONTRIBUTION_ID, kind: "embedded", label: "Goal relations",
    surfaces: Object.values(GOALS_RELATION_UI_SURFACES).map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })), slots: [] },
  render({ surface, model }) {
    if (surface !== model.kind) throw new Error("Goals relation surface does not match its model");
    const renderer = createRelationRenderer(model.primitives);
    return model.kind === "form" ? renderer.renderRelationForm(...model.args) : renderer.renderRelations(...model.args);
  },
};
