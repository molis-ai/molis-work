import { GOALS_PLUGIN_API } from "./plugin-api.js";
/** Existing browser handlers inserted by Workbench into its shared lexical host. */
const GOALS_POLICY_SUBMIT_SCRIPT = `      const policyForm = submittedForm.closest?.("[data-policy-form]");
      if (policyForm?.querySelector('[name="scope"]')?.value === "project_default") {
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
          await molisWorkRequest(route("${GOALS_PLUGIN_API}/policy-bindings"), {
            method: "POST",
            body: {
              scope: "project_default",
              policy: { human_approval: values.has("human_approval") },
            },
            fallback: L("工作规则保存失败"),
          });
          await refreshBoard(true);
          showToast(L("项目默认工作规则已保存"));
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
    const { route, translate: L,
      requireFormFacts, refreshBoard, showToast, humanDecisionError } = host;
    const submitMatchedPolicy = async (submittedForm, event) => {
${GOALS_POLICY_SUBMIT_SCRIPT}    };
    // The full project rules page owns its submit; this handles only an embedded project-default form.
    const handleGoalPolicySubmit = (submittedForm, event) => submittedForm.closest?.("[data-policy-form]:not([data-project-rules-form])")
      ? submitMatchedPolicy(submittedForm, event) : null;
    return { handleGoalPolicySubmit };
  }`;
