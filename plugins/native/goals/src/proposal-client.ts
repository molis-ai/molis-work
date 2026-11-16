import { goalEntryActions } from "./contract/goal-entry-actions.js";
import { GOALS_PLUGIN_ID } from "./identity.js";
/** Goal proposal decisions; Workbench supplies transport and cross-surface refresh/receipts. */
export const GOALS_PROPOSAL_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { translate: readText, route, decisionReceiptContext, refreshBoardWithDecisionReceipt } = host;
    // The link opens Goals through the common workbench route; only Goals consumes the proposal anchor, once.
    addEventListener("load", () => {
      const entry = document.getElementById(location.hash.slice(1));
      if (!entry?.matches("[data-goal-proposal-entry]")) return;
      document.querySelector('[data-board-view-tab="list"]')?.click();
      entry.open = true;
      const heading = entry.firstElementChild;
      heading.focus();
      heading.scrollIntoView({ block: "center" });
      history.replaceState(history.state, "", location.pathname + location.search);
    }, { once: true });
    const requireDecisionText = (decisionForm, errorBox, fieldName, message) => {
      const field = decisionForm.querySelector('[name="' + fieldName + '"]');
      if (field?.value.trim()) {
        field?.removeAttribute("aria-invalid");
        return false;
      }
      errorBox.textContent = globalThis.t.text(message);
      errorBox.hidden = false;
      field?.setAttribute("aria-invalid", "true");
      field?.focus();
      const clearError = () => {
        if (!field?.value.trim()) return;
        field.removeAttribute("aria-invalid");
        errorBox.hidden = true;
        field.removeEventListener("input", clearError);
        field.removeEventListener("change", clearError);
      };
      field?.addEventListener("input", clearError);
      field?.addEventListener("change", clearError);
      return true;
    };

    const humanDecisionError = (message, fallback) => String(message || fallback)
      .replace(/Contract(?: Proposal)?/g, "目标说明")
      .replaceAll("Goal Spine", "Goal Tree")
      .replaceAll("Policy", "工作规则")
      .replaceAll("Runtime", "执行工具");

    const submitMatchedProposal = async (goalTreeDecisionForm, event) => {
      event.preventDefault();
      const submitter = event.submitter, decision = submitter?.value;
      const buttons = [...goalTreeDecisionForm.querySelectorAll('button[type="submit"]')];
      const errorBox = goalTreeDecisionForm.querySelector("[data-decision-error]");
      const values = new FormData(goalTreeDecisionForm);
      const reason = String(values.get("reason") || "").trim();
      const itemIds = values.getAll("item_id").map(String);
      const receiptContext = decisionReceiptContext(goalTreeDecisionForm);
      if ((decision === "confirm" || decision === "reject") &&
          requireDecisionText(goalTreeDecisionForm, errorBox, "reason", "goals.proposal-client.give-decision-reason-revision-note")) return;
      if (!itemIds.length) {
        errorBox.textContent = globalThis.t.text("goals.proposal-client.plan-has-changed-cannot-be-submitted-ask-runtime");
        errorBox.hidden = false;
        return;
      }
      const submitLabel = submitter?.textContent;
      const buttonStates = buttons.map((button) => button.disabled);
      buttons.forEach((button) => { button.disabled = true; });
      if (submitter) submitter.textContent = globalThis.t.text("goals.proposal-client.saving");
      errorBox.hidden = true;
      try {
        if (!goalTreeDecisionForm.dataset.reviewVersion) throw new Error(globalThis.t.text("goals.proposal-client.molis-work-changed-ask-runtime-update-plan-before"));
        const key = goalTreeDecisionForm.dataset.idempotencyKey ||= crypto.randomUUID();
        const draft = { proposal_id: goalTreeDecisionForm.dataset.goalTreeProposalId, reason, idempotency_key: key,
          observed_version: goalTreeDecisionForm.dataset.reviewVersion,
          ...(decision === "confirm" ? { confirm_all_pending: true }
            : { decisions: itemIds.map(itemId => ({ item_id: itemId, decision, reason })) }) };
        const encoded = JSON.stringify(draft);
        let retained = goalTreeDecisionForm.decisionRequest;
        if (retained?.encoded !== encoded) {
          const { reference } = await molisWorkRequest(route("/api/project-approvals/request"), { method: "POST",
            body: { action: { capability_id: ${JSON.stringify(goalEntryActions.treeDecide.capability_id)}, version: ${JSON.stringify(goalEntryActions.treeDecide.version)},
              provider_id: "${GOALS_PLUGIN_ID}" }, request_id: key, draft } });
          if (!goalTreeDecisionForm.isConnected) return;
          retained = goalTreeDecisionForm.decisionRequest = { encoded, reference };
        }
        const { result } = await molisWorkRequest(route("/api/project-approvals/decide"), { method: "POST",
          body: { reference: retained.reference, choice_id: "apply", request_key: key },
          fallback: globalThis.t.text("goals.proposal-client.could-not-submit-plan-decision") });
        if (result?.conflict_item_ids?.length) {
          throw new Error(globalThis.t.text("goals.proposal-client.molis-work-changed-ask-runtime-update-plan-before"));
        }
        await refreshBoardWithDecisionReceipt(
          decision === "confirm" ? globalThis.t.text("goals.proposal-client.goal-plan-was-used-related-goals-relationships-were") : globalThis.t.text("goals.proposal-client.goal-plan-was-sent-back-current-goal-tree"),
          receiptContext,
        );
        delete goalTreeDecisionForm.dataset.idempotencyKey;
      } catch (error) {
        errorBox.textContent = humanDecisionError(error.message, globalThis.t.text("goals.proposal-client.could-not-submit-plan-decision-try-again"));
        errorBox.hidden = false;
        buttons.forEach((button, index) => { button.disabled = buttonStates[index]; });
        if (submitter) submitter.textContent = submitLabel;
      }
    };
    const handleGoalProposalSubmit = (submittedForm, event) => {
      const form = submittedForm.closest?.("[data-goal-tree-decision-form]");
      return form ? submitMatchedProposal(form, event) : null;
    };
    return { handleGoalProposalSubmit, requireDecisionText, humanDecisionError };
  }`;
