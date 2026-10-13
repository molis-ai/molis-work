/** Existing browser handlers inserted by Workbench into its shared lexical host. */
const GOALS_POLICY_SUBMIT_SCRIPT = `      const policyForm = submittedForm.closest?.("[data-policy-form]");
      if (policyForm) {
        event.preventDefault();
        const submit = policyForm.querySelector('button[type="submit"]');
        const errorBox = policyForm.querySelector("[data-policy-error]");
        if (requireFormFacts(policyForm, errorBox)) return;
        const values = new FormData(policyForm);
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/policy-bindings"), {
            method: "POST",
            headers: molisWorkControlHeaders(),
            body: JSON.stringify({
              scope: values.get("scope"),
              goal_id: values.get("goal_id") || undefined,
              reason: String(values.get("reason") || "").trim(),
              policy: { human_approval: values.has("human_approval") },
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("工作规则保存失败"));
          await refreshBoard(true);
          if (values.get("scope") === "goal") {
            const policy = result?.resolved_policy || { human_approval: values.has("human_approval") };
            showFactorReceipt("rules", L("工作规则已保存"),
              L("最终生效：用户确认“{human}”。", { human: policy.human_approval ? L("需要") : L("不需要") }));
          } else {
            showToast(L("项目默认工作规则已保存"));
          }
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("工作规则保存失败，请检查输入后重试"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

`;

export const GOALS_POLICY_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { route, controlHeaders: molisWorkControlHeaders, translate: L,
      requireFormFacts, refreshBoard, showFactorReceipt, showToast, humanDecisionError } = host;
    const submitMatchedPolicy = async (submittedForm, event) => {
${GOALS_POLICY_SUBMIT_SCRIPT}    };
    // The project's rules page has its own script (project-policy-client); this one saves a Goal's rules.
    const handleGoalPolicySubmit = (submittedForm, event) => submittedForm.closest?.("[data-policy-form]:not([data-project-rules-form])")
      ? submitMatchedPolicy(submittedForm, event) : null;
    return { handleGoalPolicySubmit };
  }`;
