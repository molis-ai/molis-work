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
        submit.textContent = globalThis.t.text("goals.policy-client.saving");
        errorBox.hidden = true;
        try {
          await molisWorkRequest(route("${GOALS_PLUGIN_API}/policy-bindings"), {
            method: "POST",
            body: {
              scope: "project_default",
              policy: { human_approval: values.has("human_approval") },
            },
            fallback: globalThis.t.text("goals.policy-client.could-not-save-work-rules"),
          });
          await refreshBoard(true);
          showToast(globalThis.t.text("goals.policy-client.project-default-work-rules-saved"));
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, globalThis.t.text("goals.policy-client.could-not-save-work-rules-check-input-try"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

`;

export const GOALS_POLICY_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { route, translate: readText,
      requireFormFacts, refreshBoard, showToast, humanDecisionError } = host;
    const submitMatchedPolicy = async (submittedForm, event) => {
${GOALS_POLICY_SUBMIT_SCRIPT}    };
    // The full project rules page owns its submit; this handles only an embedded project-default form.
    const handleGoalPolicySubmit = (submittedForm, event) => submittedForm.closest?.("[data-policy-form]:not([data-project-rules-form])")
      ? submitMatchedPolicy(submittedForm, event) : null;
    return { handleGoalPolicySubmit };
  }`;
