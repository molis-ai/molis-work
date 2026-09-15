/** Goal proposal decisions; Workbench supplies transport and cross-surface refresh/receipts. */
export const GOALS_PROPOSAL_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { translate: L, route, controlHeaders: molisWorkControlHeaders, decisionReceiptContext, refreshBoardWithDecisionReceipt } = host;
    const requireDecisionText = (decisionForm, errorBox, fieldName, message) => {
      const field = decisionForm.querySelector('[name="' + fieldName + '"]');
      if (String(field?.value || "").trim()) {
        field?.removeAttribute("aria-invalid");
        return false;
      }
      errorBox.textContent = L(message);
      errorBox.hidden = false;
      field?.setAttribute("aria-invalid", "true");
      field?.focus();
      const clearError = () => {
        if (!String(field?.value || "").trim()) return;
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
      .replaceAll("Contract Proposal", "目标说明")
      .replaceAll("Contract", "目标说明")
      .replaceAll("Candidate Goal", "新发现的工作")
      .replaceAll("Candidate", "新发现的工作")
      .replaceAll("Goal Spine", "Goal Tree")
      .replaceAll("Rewire", "Goal 关系调整")
      .replaceAll("Review", "结果确认")
      .replaceAll("Risk", "风险")
      .replaceAll("Impact", "影响范围")
      .replaceAll("Policy", "工作规则")
      .replaceAll("Runtime", "执行工具");

    const submitMatchedProposal = async (submittedForm, event) => {
      const goalTreeDecisionForm = submittedForm.closest?.("[data-goal-tree-decision-form]");
      if (!goalTreeDecisionForm) return;
      event.preventDefault();
      const decision = event.submitter?.value;
      const buttons = [...goalTreeDecisionForm.querySelectorAll('button[type="submit"]')];
      const errorBox = goalTreeDecisionForm.querySelector("[data-decision-error]");
      const values = new FormData(goalTreeDecisionForm);
      const reason = String(values.get("reason") || "").trim();
      const itemIds = values.getAll("item_id").map((value) => String(value));
      const receiptContext = decisionReceiptContext(goalTreeDecisionForm);
      if ((decision === "confirm" || decision === "reject") &&
          requireDecisionText(goalTreeDecisionForm, errorBox, "reason", "请填写决定理由或修改意见")) return;
      if (!itemIds.length) {
        errorBox.textContent = L("这份方案已经变化，暂时不能提交。请让 Runtime 按最新状态重新整理。");
        errorBox.hidden = false;
        return;
      }
      const submitLabel = event.submitter?.textContent;
      const buttonStates = buttons.map((button) => button.disabled);
      buttons.forEach((button) => { button.disabled = true; });
      if (event.submitter) event.submitter.textContent = L("正在保存…");
      errorBox.hidden = true;
      try {
        const key = goalTreeDecisionForm.dataset.idempotencyKey || (globalThis.crypto?.randomUUID?.() || (String(Date.now()) + Math.random()));
        goalTreeDecisionForm.dataset.idempotencyKey = key;
        const response = await fetch(route("/api/goal-tree-proposals/" + encodeURIComponent(goalTreeDecisionForm.dataset.goalTreeProposalId) + "/decision"), {
          method: "POST",
          headers: { ...molisWorkControlHeaders(), "x-molis-work-idempotency-key": key },
          body: JSON.stringify({
            ...(decision === "confirm"
              ? { confirm_all_pending: true }
              : { decisions: itemIds.map((itemId) => ({ item_id: itemId, decision, reason })) }),
            reason,
            idempotency_key: key,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("方案决定提交失败"));
        if (Array.isArray(result.conflict_item_ids) && result.conflict_item_ids.length) {
          throw new Error(L("Molis Work 已经发生变化。请让 Runtime 更新方案后再决定。"));
        }
        await refreshBoardWithDecisionReceipt(
          decision === "confirm" ? L("这份 Goal 方案已经采用，相关 Goal 和关系已更新。") : L("这份 Goal 方案已退回，当前 Goal Tree 保持不变。"),
          receiptContext,
        );
        delete goalTreeDecisionForm.dataset.idempotencyKey;
      } catch (error) {
        errorBox.textContent = humanDecisionError(error.message, L("方案决定提交失败，请重试"));
        errorBox.hidden = false;
        buttons.forEach((button, index) => { button.disabled = buttonStates[index]; });
        if (event.submitter) event.submitter.textContent = submitLabel;
      }
    };
    const handleGoalProposalSubmit = (submittedForm, event) => submittedForm.closest?.("[data-goal-tree-decision-form]")
      ? submitMatchedProposal(submittedForm, event) : null;
    return { handleGoalProposalSubmit, requireDecisionText, humanDecisionError };
  }`;
