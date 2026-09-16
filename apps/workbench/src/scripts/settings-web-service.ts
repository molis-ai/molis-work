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
      dialog.innerHTML = '<div class="runtime-plan-shell"><header><div><h2 id="web-service-plan-title"></h2><p data-service-message></p></div></header><div class="runtime-plan-body"><ul class="runtime-change-list" data-service-changes></ul><p data-service-confirmation></p></div><footer><button type="button" data-service-cancel></button><button type="button" class="runtime-plan-apply" data-service-apply></button></footer></div>';
      document.body.append(dialog);
      const cancel = dialog.querySelector("[data-service-cancel]");
      const apply = dialog.querySelector("[data-service-apply]");
      cancel.textContent = L("取消");
      const choose = (decision) => { if (settle) { const resolve = settle; settle = null; dialog.close(); resolve(decision); } };
      cancel.addEventListener("click", () => choose("declined"));
      apply.addEventListener("click", () => choose("confirmed"));
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); choose("declined"); });
      dialog.addEventListener("close", () => choose("declined"));
      return dialog;
    };
    const showStatus = (message) => {
      const toast = document.querySelector("[data-settings-toast], [data-toast]");
      if (toast) { toast.textContent = message; toast.classList.add("is-visible"); }
    };
    const waitForRestart = async (previousProcessId) => {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        try {
          const response = await fetch("/health", { cache: "no-store", signal: AbortSignal.timeout(1000) });
          const health = await response.json();
          const pid = health.service_process_id || health.process_id;
          if (response.ok && health.status === "ok" && Number.isSafeInteger(pid) && pid !== previousProcessId) {
            const statusResponse = await fetch("/api/settings/web-service", { cache: "no-store", signal: AbortSignal.timeout(1000) });
            const status = await statusResponse.json();
            if (statusResponse.ok && status.state === "running" && status.owned) return;
          }
        } catch { /* A short disconnect is expected while launchd replaces the process. */ }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error(L("尚未确认服务重启成功，请刷新诊断页检查状态；不要连续重复重启。"));
    };
    const post = async (suffix, body) => {
      const response = await fetch("/api/settings/web-service/" + suffix, { method: "POST", headers: molisWorkControlHeaders(), body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || L("常驻服务操作失败"));
      return result;
    };
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
        if (plan.status !== "ready") throw new Error(plan.message || L("当前不能执行这项常驻服务操作"));
        dialog.querySelector("h2").textContent = button.textContent.trim() + L(" · 常驻服务预览");
        dialog.querySelector("[data-service-message]").textContent = plan.message;
        dialog.querySelector("[data-service-confirmation]").textContent = plan.confirmation;
        const changes = dialog.querySelector("[data-service-changes]");
        changes.replaceChildren();
        for (const change of plan.changes) {
          const row = document.createElement("li");
          const operation = document.createElement("strong");
          operation.textContent = ({ create: L("新增"), start: L("启动"), stop: L("停止"), restart: L("重启"), remove: L("移除") })[change.operation];
          const detail = document.createElement("div");
          const target = document.createElement("p");
          target.textContent = change.target;
          detail.append(target); row.append(operation, detail); changes.append(row);
        }
        apply.textContent = L("确认") + " " + button.textContent.trim();
        const decision = await new Promise((resolve) => { settle = resolve; dialog.showModal(); cancel.focus(); });
        const result = await post("confirm", { plan_id: plan.plan_id, decision });
        if (decision === "confirmed") {
          if (result.status === "restarting") {
            showStatus(L("正在重启常驻服务，等待新进程就绪…"));
            await waitForRestart(result.previous_process_id);
            showStatus(L("常驻服务已重启，连接已恢复"));
          } else showStatus(result.message);
          setTimeout(() => location.reload(), 450);
        }
      } catch (caught) {
        const toast = document.querySelector("[data-settings-toast], [data-toast]");
        if (toast) toast.classList.remove("is-visible");
        if (error) { error.textContent = caught.message || L("常驻服务操作失败"); error.hidden = false; }
      } finally {
        buttons.forEach((item, index) => { item.disabled = disabled[index]; });
        busy = false;
        button.focus();
      }
    });
  })();
`;
