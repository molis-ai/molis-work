/** Existing relation browser behavior, composed into the Workbench lexical host. */
import { GOALS_PLUGIN_API } from "./plugin-api.js";
const GOALS_RELATION_PREVIEW_SCRIPT = `    const updateRelationPreviews = () => {
      if (!form) return;
      const parent = form.elements.parent_goal_id?.selectedOptions?.[0];
      const parentPreview = form.querySelector("[data-parent-preview]");
      if (parentPreview) {
        parentPreview.textContent = parent?.value
          ? globalThis.t.text("goals.relation-client.preview-new-goal-part-name-tree-placement-does", { name: parent.dataset.goalName || parent.textContent })
          : globalThis.t.text("goals.relation-client.preview-new-goal-will-appear-tree-its-own");
      }
      const dependencies = [...form.querySelectorAll('[name="dependency_goal_ids"]:checked')];
      const dependencyPreview = form.querySelector("[data-dependency-preview]");
      if (dependencyPreview) {
        const names = dependencies.map((input) => "「" + (input.dataset.goalName || input.value) + "」");
        dependencyPreview.textContent = names.length
          ? globalThis.t.text("goals.relation-client.preview-new-goal-depends-names-new-goal-cannot", { names: names.join(currentLocale() === "en" ? ", " : "、") })
          : globalThis.t.text("goals.relation-client.preview-there-no-execution-prerequisite-goal-can-move");
      }
    };

    const updateRelationFormPreview = (relationForm) => {
      if (!relationForm) return;
      const intent = relationForm.elements.relation_intent?.value || "other";
      const intentMap = {
        needs: ["outgoing", "depends_on"],
        belongs: ["outgoing", "part_of"],
        enables: ["incoming", "depends_on"],
        contains: ["incoming", "part_of"],
      };
      if (intentMap[intent]) {
        relationForm.elements.direction.value = intentMap[intent][0];
        relationForm.elements.type.value = intentMap[intent][1];
      }
      const preview = relationForm.querySelector("[data-relation-live-preview]");
      const type = relationForm.elements.type?.selectedOptions?.[0];
      const target = relationForm.elements.target_goal_id?.selectedOptions?.[0];
      const direction = relationForm.elements.direction?.value || "outgoing";
      if (!preview || !type || !target) return;
      const currentName = relationForm.dataset.currentGoalName || relationForm.dataset.goalId;
      const targetName = target.dataset.goalName || target.textContent;
      const left = direction === "outgoing" ? currentName : targetName;
      const right = direction === "outgoing" ? targetName : currentName;
      const label = type.dataset.outLabel || type.textContent;
      preview.querySelector("strong").textContent = left + " → " + label + " → " + right;
      preview.querySelector("p").textContent = type.dataset.description || "关系方向和原因会进入事件历史";
    };

    const updateAllRelationFormPreviews = () => {
      document.querySelectorAll("[data-relation-form]").forEach(updateRelationFormPreview);
    };

`;

const GOALS_RELATION_CHANGE_SCRIPT = `      const relationForm = changed.closest("[data-relation-form]");
      if (relationForm) {
        if ((changed.name === "direction" || changed.name === "type") && relationForm.elements.relation_intent) {
          relationForm.elements.relation_intent.value = "other";
        } else if (changed.name === "relation_intent" && changed.value === "other") {
          relationForm.elements.direction.value = "";
          relationForm.elements.type.value = "";
          const advanced = relationForm.querySelector("[data-progressive-fields]");
          if (advanced) advanced.open = true;
        }
        updateRelationFormPreview(relationForm);
      }
`;

const GOALS_RELATION_DISCLOSURE_SCRIPT = `      const openRelationDeactivate = target.closest("[data-relation-deactivate-open]");
      if (openRelationDeactivate) {
        const record = openRelationDeactivate.closest("[data-relation-id]");
        const deactivateForm = record?.querySelector("[data-relation-deactivate-form]");
        if (!deactivateForm) return true;
        deactivateForm.hidden = false;
        openRelationDeactivate.hidden = true;
        openRelationDeactivate.setAttribute("aria-expanded", "true");
        deactivateForm.querySelector("textarea")?.focus();
        return true;
      }
      const cancelRelationDeactivate = target.closest("[data-relation-deactivate-cancel]");
      if (cancelRelationDeactivate) {
        if (cancelRelationDeactivate.closest("form")?.getAttribute("aria-busy") === "true") return true;
        const record = cancelRelationDeactivate.closest(".relation-record");
        const deactivateForm = record?.querySelector("[data-relation-deactivate-form]");
        const openButton = record?.querySelector("[data-relation-deactivate-open]");
        if (deactivateForm) deactivateForm.hidden = true;
        if (openButton) {
          openButton.hidden = false;
          openButton.setAttribute("aria-expanded", "false");
          openButton.focus();
        }
        return true;
      }
      return false;
`;

const GOALS_RELATION_SUBMIT_SCRIPT = `      const relationForm = submittedForm.closest?.("[data-relation-form]");
      if (relationForm) {
        event.preventDefault();
        if (relationForm.getAttribute("aria-busy") === "true") return;
        const submit = relationForm.querySelector('button[type="submit"]');
        const errorBox = relationForm.querySelector("[data-relation-error]");
        if (requireFormFacts(relationForm, errorBox)) return;
        const values = new FormData(relationForm);
        const relationSummary = relationForm.querySelector("[data-relation-live-preview] strong")?.textContent?.trim() || globalThis.t.text("goals.relation-client.current-goal-relationship");
        const submitLabel = submit.textContent;
        relationForm.setAttribute("aria-busy", "true");
        const controls = [...relationForm.querySelectorAll("input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)")];
        controls.forEach(control => { control.disabled = true; });
        submit.textContent = globalThis.t.text("goals.relation-client.saving");
        errorBox.hidden = true;
        try {
          await molisWorkRequest(route("${GOALS_PLUGIN_API}/goals/" + encodeURIComponent(relationForm.dataset.goalId) + "/relations"), {
            method: "POST",
            body: {
              idempotency_key: relationForm.dataset.idempotencyKey ||= crypto.randomUUID(),
              direction: values.get("direction"),
              type: values.get("type"),
              target_goal_id: values.get("target_goal_id"),
              reason: String(values.get("reason") || "").trim(),
            },
            fallback: "关系建立失败",
          });
          await refreshBoard(true);
          showFactorReceipt(
            "relations",
            globalThis.t.text("goals.relation-client.relationship-created"),
            globalThis.t.text("goals.relation-client.created-relation-exact-direction-reason-saved-full-record", { relation: relationSummary }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(unreachable(error) ? globalThis.t.text("goals.relation-client.could-not-reach-local-service-input-kept-please") : error.message, globalThis.t.text("goals.relation-client.could-not-create-relationship-check-goal-direction-reason"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        } finally {
          relationForm.removeAttribute("aria-busy");
          controls.forEach(control => { control.disabled = false; });
        }
        return;
      }

      const relationDeactivateForm = submittedForm.closest?.("[data-relation-deactivate-form]");
      if (relationDeactivateForm) {
        event.preventDefault();
        if (relationDeactivateForm.getAttribute("aria-busy") === "true") return;
        const submit = relationDeactivateForm.querySelector('button[type="submit"]');
        const errorBox = relationDeactivateForm.querySelector("[data-relation-deactivate-error]");
        if (requireDecisionText(relationDeactivateForm, errorBox, "reason", "请填写解除原因。说明这条关系为什么不再成立。")) return;
        const reason = String(new FormData(relationDeactivateForm).get("reason") || "").trim();
        const relatedGoal = relationDeactivateForm.closest(".relation-record")?.querySelector(".relation-copy strong")?.textContent?.trim() || globalThis.t.text("goals.relation-client.other-goal");
        relationDeactivateForm.setAttribute("aria-busy", "true");
        const controls = [...relationDeactivateForm.querySelectorAll("input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)")];
        controls.forEach(control => { control.disabled = true; });
        errorBox.hidden = true;
        try {
          await molisWorkRequest(route("${GOALS_PLUGIN_API}/relations/" + encodeURIComponent(relationDeactivateForm.dataset.relationId) + "/deactivate"), {
            method: "POST",
            body: { reason, idempotency_key: relationDeactivateForm.dataset.idempotencyKey ||= crypto.randomUUID() },
            fallback: "关系解除失败",
          });
          await refreshBoard(true);
          showFactorReceipt(
            "relations",
            globalThis.t.text("goals.relation-client.relationship-removed"),
            globalThis.t.text("goals.relation-client.relationship-goal-no-longer-active-its-original-direction", { goal: relatedGoal }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(unreachable(error) ? globalThis.t.text("goals.relation-client.could-not-reach-local-service-input-kept-please") : error.message, globalThis.t.text("goals.relation-client.could-not-remove-relationship-check-reason-try-again"));
          errorBox.hidden = false;
          submit.disabled = false;
        } finally {
          relationDeactivateForm.removeAttribute("aria-busy");
          controls.forEach(control => { control.disabled = false; });
        }
        return;
      }

`;

export const GOALS_RELATION_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { form, currentLocale, route, translate: L,
      refreshBoard, requireFormFacts, requireDecisionText, showFactorReceipt, humanDecisionError } = host;
    // A write the Host never answered: the person's input is still in the form.
    const unreachable = (error) => error instanceof TypeError || error?.code === "ui_host.outcome_unknown";
${GOALS_RELATION_PREVIEW_SCRIPT}
    const handleGoalRelationChange = (changed) => {
${GOALS_RELATION_CHANGE_SCRIPT}    };
    const handleGoalRelationDisclosureClick = (target) => {
${GOALS_RELATION_DISCLOSURE_SCRIPT}    };
    const submitMatchedRelation = async (submittedForm, event) => {
${GOALS_RELATION_SUBMIT_SCRIPT}    };
    const handleGoalRelationSubmit = (submittedForm, event) => submittedForm.closest?.("[data-relation-form], [data-relation-deactivate-form]")
      ? submitMatchedRelation(submittedForm, event) : null;
    return { updateRelationPreviews, updateAllRelationFormPreviews, handleGoalRelationChange,
      handleGoalRelationDisclosureClick, handleGoalRelationSubmit };
  }`;
