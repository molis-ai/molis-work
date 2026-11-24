import { GOALS_DECISION_ACTIONS, type RetainedDecision } from "./decision-actions.js";
import { messageOf } from "./dom.js";
import type { Route } from "./types.js";

export interface ProposalHost {
  readonly route: Route;
  readonly decisionReceiptContext: (form: HTMLFormElement) => unknown;
  readonly refreshBoardWithDecisionReceipt: (message: string, context: unknown) => Promise<unknown>;
}

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Goal tree proposals and their decisions. */
export function proposalClient(host: ProposalHost) {
  const { route, decisionReceiptContext, refreshBoardWithDecisionReceipt } = host;
  const retained = new WeakMap<HTMLFormElement, RetainedDecision>();
  // The link opens Goals through the common workbench route; only Goals consumes the proposal anchor, once.
  addEventListener("load", () => {
    const entry = document.getElementById(location.hash.slice(1));
    if (!(entry instanceof HTMLDetailsElement) || !entry.matches("[data-goal-proposal-entry]")) return;
    document.querySelector<HTMLElement>('[data-board-view-tab="list"]')?.click();
    entry.open = true;
    const heading = entry.firstElementChild;
    if (heading instanceof HTMLElement) heading.focus();
    heading?.scrollIntoView({ block: "center" });
    history.replaceState(history.state, "", location.pathname + location.search);
  }, { once: true });
  const requireDecisionText = (decisionForm: Element, errorBox: HTMLElement, fieldName: string, message: string) => {
    const field = decisionForm.querySelector<TextField>('[name="' + fieldName + '"]');
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

  const humanDecisionError = (message: string | undefined, fallback: string) => String(message || fallback);

  const submitMatchedProposal = async (goalTreeDecisionForm: HTMLFormElement, event: SubmitEvent) => {
    event.preventDefault();
    const submitter = event.submitter instanceof HTMLButtonElement ? event.submitter : null, decision = submitter?.value;
    const buttons = [...goalTreeDecisionForm.querySelectorAll<HTMLButtonElement>('button[type="submit"]')];
    const errorBox = goalTreeDecisionForm.querySelector<HTMLElement>("[data-decision-error]");
    if (!errorBox) return;
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
    const submitLabel = submitter?.textContent ?? null;
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
      let kept = retained.get(goalTreeDecisionForm);
      if (kept?.encoded !== encoded) {
        const { reference } = await molisWorkRequest<{ reference: unknown }>(route("/api/project-approvals/request"), { method: "POST",
          body: { action: GOALS_DECISION_ACTIONS.treeDecide, request_id: key, draft } });
        if (!goalTreeDecisionForm.isConnected) return;
        kept = { encoded, reference };
        retained.set(goalTreeDecisionForm, kept);
      }
      const { result } = await molisWorkRequest<{ result?: { conflict_item_ids?: readonly string[] } }>(route("/api/project-approvals/decide"), { method: "POST",
        body: { reference: kept.reference, choice_id: "apply", request_key: key },
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
      errorBox.textContent = humanDecisionError(messageOf(error), globalThis.t.text("goals.proposal-client.could-not-submit-plan-decision-try-again"));
      errorBox.hidden = false;
      buttons.forEach((button, index) => { button.disabled = buttonStates[index]; });
      if (submitter) submitter.textContent = submitLabel;
    }
  };
  const handleGoalProposalSubmit = (submittedForm: EventTarget | null, event: SubmitEvent) => {
    const form = submittedForm instanceof Element ? submittedForm.closest<HTMLFormElement>("[data-goal-tree-decision-form]") : null;
    return form ? submitMatchedProposal(form, event) : null;
  };
  return { handleGoalProposalSubmit, requireDecisionText, humanDecisionError };
}
