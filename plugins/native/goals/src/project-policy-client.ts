import { GOALS_PLUGIN_API } from "./plugin-api.js";
// These scripts run in the Host page, where the page-wide `L` knows no word only Goals declares: each binds Goals' own translator (`LF`), so what Goals says is English from its own translations.
export const PROJECT_RULES_CLIENT_SCRIPT = `
  (() => {
    const L = (key, vars) => LF("io.molis.work.goals", key, vars);
    const bind = (root = document) => {
    const scope = root && root.querySelector ? root : document;
    // Only the project's rules page: a Goal's own rules form in the same document belongs to the Goal's script.
    const form = scope.matches?.("[data-project-rules-form]") ? scope : scope.querySelector("[data-project-rules-form]");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";
    const routePrefix = (scope.closest && scope.closest("[data-route-prefix]"))?.dataset.routePrefix
      || scope.dataset?.routePrefix
      || document.body.dataset.routePrefix || "";
    const receiptKey = "molis-work-project-rules-receipt:" + routePrefix;
    const receipt = scope.querySelector("[data-project-rules-receipt]");
    const errorBox = form.querySelector("[data-policy-error]");
    const submit = form.querySelector('button[type="submit"]');
    let saveKey = null;
    let saving = false;
    try {
      const savedReceipt = JSON.parse(sessionStorage.getItem(receiptKey) || "null");
      sessionStorage.removeItem(receiptKey);
      if (receipt && savedReceipt?.title && savedReceipt?.detail) {
        receipt.querySelector("[data-project-rules-receipt-title]").textContent = savedReceipt.title;
        receipt.querySelector("[data-project-rules-receipt-detail]").textContent = savedReceipt.detail;
        receipt.hidden = false;
        receipt.focus({ preventScroll: true });
      }
    } catch {}
    form.addEventListener("reset", (event) => {
      if (saving) { event.preventDefault(); return; }
      saveKey = null;
      errorBox.hidden = true;
      form.querySelectorAll("[aria-invalid]").forEach(field => field.removeAttribute("aria-invalid"));
    });
    form.addEventListener("input", (event) => {
      saveKey = null;
      event.target?.removeAttribute?.("aria-invalid");
      errorBox.hidden = true;
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (saving) return;
      const values = new FormData(form);
      const submitLabel = submit.textContent;
      saving = true;
      form.setAttribute("aria-busy", "true");
      const enabledControls = [...form.querySelectorAll("button, input, select, textarea")].filter(control => !control.disabled);
      enabledControls.forEach(control => { control.disabled = true; });
      submit.textContent = globalThis.t.text("goals.project-policy-client.saving");
      errorBox.hidden = true;
      try {
        await molisWorkRequest(routePrefix + "${GOALS_PLUGIN_API}/policy-bindings", {
          method: "POST",
          body: {
            user_confirmed: true,
            idempotency_key: saveKey || (saveKey = crypto.randomUUID()),
            scope: "project_default",
            policy: { human_approval: values.has("human_approval") },
          },
          fallback: globalThis.t.text("goals.project-policy-client.could-not-save-project-default-work-rules"),
        });
        sessionStorage.setItem(receiptKey, JSON.stringify({
          title: globalThis.t.text("goals.project-policy-client.project-work-rules-saved"),
          detail: globalThis.t.text("goals.project-policy-client.project-s-rule-was-updated-user-confirmation-human", {
            human: values.has("human_approval") ? globalThis.t.text("goals.project-policy-client.required") : globalThis.t.text("goals.project-policy-client.not-required"),
          }),
        }));
        if (form.closest("[data-goal-work-rules]") && globalThis.molisWorkOpenGoalWorkRules) {
          globalThis.molisWorkOpenGoalWorkRules();
          return;
        }
        location.reload();
      } catch (error) {
        errorBox.textContent = error instanceof TypeError || error?.code === "ui_host.outcome_unknown" ? globalThis.t.text("goals.project-policy-client.could-not-reach-local-service-input-kept-please") : error.message || globalThis.t.text("goals.project-policy-client.could-not-save-project-default-work-rules-check");
        errorBox.hidden = false;
        saving = false;
        form.removeAttribute("aria-busy");
        enabledControls.forEach(control => { control.disabled = false; });
        submit.focus();
        submit.textContent = submitLabel;
      }
    });
    };
    globalThis.molisWorkBindProjectRules = bind;
    bind(document);
  })();
`;
