/** Existing browser handlers inserted by Workbench into its shared lexical host. */
const GOALS_POLICY_SUBMIT_SCRIPT = `      const policyForm = submittedForm.closest?.("[data-policy-form]");
      if (policyForm) {
        event.preventDefault();
        const submit = policyForm.querySelector('button[type="submit"]');
        const errorBox = policyForm.querySelector("[data-policy-error]");
        if (requireFormFacts(policyForm, errorBox)) return;
        const minimumViolation = [...policyForm.querySelectorAll("[data-policy-min]")].find((field) => Number(field.value) < Number(field.dataset.policyMin));
        const maximumViolation = [...policyForm.querySelectorAll("[data-policy-max]")].find((field) => Number(field.value) > Number(field.dataset.policyMax));
        const policyLimitViolation = minimumViolation || maximumViolation;
        if (policyLimitViolation) {
          let disclosure = policyLimitViolation.closest("details");
          while (disclosure) {
            disclosure.open = true;
            disclosure = disclosure.parentElement?.closest("details");
          }
          const label = policyLimitViolation.closest("label")?.querySelector("strong")?.textContent?.trim() || L("这项规则");
          errorBox.textContent = minimumViolation
            ? L("{label}不能低于项目共同规则要求的 {value}。", { label, value: minimumViolation.dataset.policyMin })
            : L("{label}不能超过项目共同规则允许的 {value} 秒。", { label, value: maximumViolation.dataset.policyMax });
          errorBox.hidden = false;
          policyLimitViolation.setAttribute("aria-invalid", "true");
          policyLimitViolation.focus();
          return;
        }
        const values = new FormData(policyForm);
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        const capabilities = String(values.get("required_capabilities") || "")
          .split(/[\\n,，]/)
          .map((item) => item.trim())
          .filter(Boolean);
        try {
          const response = await fetch(route("/api/policy-bindings"), {
            method: "POST",
            headers: molisWorkControlHeaders(),
            body: JSON.stringify({
              scope: values.get("scope"),
              goal_id: values.get("goal_id") || undefined,
              reason: String(values.get("reason") || "").trim(),
              policy: {
                goal_mode: values.get("goal_mode"),
                self_verification: values.has("self_verification"),
                cross_reviewers: Number(values.get("cross_reviewers")),
                adversarial_reviewers: Number(values.get("adversarial_reviewers")),
                human_approval: values.has("human_approval"),
                required_capabilities: [...new Set(capabilities)],
                max_lease_seconds: Number(values.get("max_lease_seconds")),
              },
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("工作规则保存失败"));
          await refreshBoard(true);
          if (values.get("scope") === "goal") {
            const policy = result?.resolved_policy || {
              goal_mode: values.get("goal_mode"),
              self_verification: values.has("self_verification"),
              human_approval: values.has("human_approval"),
            };
            const modeLabels = { disabled: L("不要求"), preferred: L("建议使用"), required: L("必须使用") };
            showFactorReceipt(
              "rules",
              L("工作规则已保存"),
              L("最终生效：按 Goal 工作“{mode}”，推进者自检“{self}”，用户确认“{human}”。", {
                mode: modeLabels[policy.goal_mode] || String(policy.goal_mode || ""),
                self: policy.self_verification ? L("需要") : L("不需要"),
                human: policy.human_approval ? L("需要") : L("不需要"),
              }),
            );
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
    const handleGoalPolicySubmit = (submittedForm, event) => submittedForm.closest?.("[data-policy-form]")
      ? submitMatchedPolicy(submittedForm, event) : null;
    return { handleGoalPolicySubmit };
  }`;
