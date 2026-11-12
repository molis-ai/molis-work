/** HTML dialog works in both browsers and the desktop WKWebView. */
export const WEB_SERVICE_SETTINGS_SCRIPT = `
  (() => {
    let dialog;
    let busy = false;
    let settle = null;
    const ensureDialog = () => {
      if (dialog) return dialog;
      dialog = document.createElement("dialog");
      dialog.className = "runtime-plan-dialog";
      dialog.setAttribute("aria-labelledby", "web-service-plan-title");
      dialog.innerHTML = '<div class="runtime-plan-shell"><header><div><h2 id="web-service-plan-title"></h2><p data-service-message></p></div></header><div class="runtime-plan-body"><ul class="runtime-change-list" data-service-changes></ul><p data-service-confirmation></p></div><footer><button class="mw-btn mw-btn--secondary" type="button" data-service-cancel></button><button class="mw-btn mw-btn--primary runtime-plan-apply" type="button" data-service-apply></button></footer></div>';
      document.body.append(dialog);
      const cancel = dialog.querySelector("[data-service-cancel]");
      const apply = dialog.querySelector("[data-service-apply]");
      cancel.textContent = globalThis.t.text("common.control.cancel");
      const choose = (decision) => { if (settle) { const resolve = settle; settle = null; dialog.close(); resolve(decision); } };
      cancel.addEventListener("click", () => choose("declined"));
      apply.addEventListener("click", () => choose("confirmed"));
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); choose("declined"); });
      dialog.addEventListener("close", () => choose("declined"));
      return dialog;
    };
    const showStatus = (message, state = "done") => {
      const toast = document.querySelector("[data-settings-toast], [data-toast]");
      if (toast) { toast.textContent = message; toast.dataset.mwState = state; toast.classList.remove("is-error"); toast.classList.add("is-visible"); }
    };
    const waitForRestart = async (previousProcessId) => {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        try {
          const health = await molisWorkRequest("/health", { signal: AbortSignal.timeout(1000) });
          const pid = health.service_process_id || health.process_id;
          if (health.status === "ok" && Number.isSafeInteger(pid) && pid !== previousProcessId) {
            const status = await molisWorkRequest("/api/settings/web-service", { signal: AbortSignal.timeout(1000) });
            if (status.state === "running" && status.owned) return;
          }
        } catch { /* A short disconnect is expected while launchd replaces the process. */ }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error(globalThis.t.text("workbench.settings-web-service.restart-has-not-been-verified-refresh-diagnostics-check"));
    };
    const post = (suffix, body) => molisWorkRequest("/api/settings/web-service/" + suffix, { body, fallback: globalThis.t.text("workbench.settings-web-service.persistent-service-action-failed") });
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-web-service-action]");
      if (!button || busy) return;
      ensureDialog();
      const cancel = dialog.querySelector("[data-service-cancel]");
      const apply = dialog.querySelector("[data-service-apply]");
      const error = document.querySelector("[data-web-service-error]");
      const buttons = [...document.querySelectorAll("[data-web-service-action]")];
      busy = true;
      const disabled = buttons.map((item) => item.disabled);
      buttons.forEach((item) => { item.disabled = true; });
      if (error) error.hidden = true;
      try {
        const plan = await post("plan", { action: button.dataset.webServiceAction });
        if (plan.status === "no_change") { showStatus(plan.message); return; }
        if (plan.status !== "ready") throw new Error(plan.message || globalThis.t.text("workbench.settings-web-service.persistent-service-action-cannot-run-now"));
        dialog.querySelector("h2").textContent = button.textContent.trim() + globalThis.t.text("workbench.settings-web-service.service-preview");
        dialog.querySelector("[data-service-message]").textContent = plan.message;
        dialog.querySelector("[data-service-confirmation]").textContent = plan.confirmation;
        const changes = dialog.querySelector("[data-service-changes]");
        changes.replaceChildren();
        for (const change of plan.changes) {
          const row = document.createElement("li");
          const operation = document.createElement("strong");
          operation.textContent = ({ create: globalThis.t.text("workbench.settings-web-service.add"), start: globalThis.t.text("workbench.settings-web-service.start"), stop: globalThis.t.text("workbench.settings-web-service.stop"), restart: globalThis.t.text("workbench.settings-web-service.restart"), remove: globalThis.t.text("workbench.settings-web-service.remove") })[change.operation];
          const detail = document.createElement("div");
          const target = document.createElement("p");
          target.textContent = change.target;
          detail.append(target); row.append(operation, detail); changes.append(row);
        }
        apply.textContent = globalThis.t.text("workbench.settings-web-service.confirm") + " " + button.textContent.trim();
        const decision = await new Promise((resolve) => { settle = resolve; dialog.showModal(); cancel.focus(); });
        const result = await post("confirm", { plan_id: plan.plan_id, decision });
        if (decision === "confirmed") {
          if (result.status === "restarting") {
            showStatus(globalThis.t.text("workbench.settings-web-service.restarting-service-waiting-new-process"), "running");
            await waitForRestart(result.previous_process_id);
            showStatus(globalThis.t.text("workbench.settings-web-service.service-restarted-connection-restored"));
          } else showStatus(result.message);
          setTimeout(() => location.reload(), 450);
        }
      } catch (caught) {
        const toast = document.querySelector("[data-settings-toast], [data-toast]");
        if (toast) toast.classList.remove("is-visible");
        if (error) { molisWorkRequest.show(error, caught); error.hidden = false; }
      } finally {
        buttons.forEach((item, index) => { item.disabled = disabled[index]; });
        busy = false;
        button.focus();
      }
    });
  })();
`;
