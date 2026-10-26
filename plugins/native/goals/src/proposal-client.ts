/** Goal proposal decisions; Workbench supplies transport and cross-surface refresh/receipts. */
export const GOALS_PROPOSAL_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { translate: L, route, decisionReceiptContext, refreshBoardWithDecisionReceipt } = host;
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
      errorBox.textContent = L(message);
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
          requireDecisionText(goalTreeDecisionForm, errorBox, "reason", "请填写决定理由或修改意见")) return;
      if (!itemIds.length) {
        errorBox.textContent = L("这份方案已经变化，暂时不能提交。请让 Runtime 按最新状态重新整理。");
        errorBox.hidden = false;
        return;
      }
      const submitLabel = submitter?.textContent;
      const buttonStates = buttons.map((button) => button.disabled);
      buttons.forEach((button) => { button.disabled = true; });
      if (submitter) submitter.textContent = L("正在保存…");
      errorBox.hidden = true;
      try {
        const key = goalTreeDecisionForm.dataset.idempotencyKey ||= crypto.randomUUID();
        const result = await molisWorkRequest(route("/api/goal-tree-proposals/" + encodeURIComponent(goalTreeDecisionForm.dataset.goalTreeProposalId) + "/decision"), {
          method: "POST",
          key,
          // Only this control, after the person was asked about the whole proposal, says so; the Host reads it from the header, never the body.
          ...(decision === "confirm" ? { headers: { "x-molis-work-whole-confirmation": "1" } } : {}),
          body: {
            ...(decision === "confirm"
              ? { confirm_all_pending: true }
              : { decisions: itemIds.map((itemId) => ({ item_id: itemId, decision, reason })) }),
            reason,
            idempotency_key: key,
          },
          fallback: L("方案决定提交失败"),
        });
        if (result.conflict_item_ids?.length) {
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
        if (submitter) submitter.textContent = submitLabel;
      }
    };
    const handleGoalProposalSubmit = (submittedForm, event) => {
      const form = submittedForm.closest?.("[data-goal-tree-decision-form]");
      return form ? submitMatchedProposal(form, event) : null;
    };
    return { handleGoalProposalSubmit, requireDecisionText, humanDecisionError };
  }`;
