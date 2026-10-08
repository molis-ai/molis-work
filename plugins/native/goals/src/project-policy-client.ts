export const PROJECT_RULES_CLIENT_SCRIPT = `
  (() => {
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
      submit.textContent = L("正在保存…");
      errorBox.hidden = true;
      try {
        const response = await fetch(routePrefix + "/api/policy-bindings", {
          method: "POST",
          headers: molisWorkControlHeaders(),
          body: JSON.stringify({
            user_confirmed: true,
            idempotency_key: saveKey || (saveKey = crypto.randomUUID()),
            scope: "project_default",
            policy: { human_approval: values.has("human_approval") },
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("项目默认工作规则保存失败"));
        sessionStorage.setItem(receiptKey, JSON.stringify({
          title: L("项目工作规则已保存"),
          detail: L("这个项目的共同规则已更新：用户确认“{human}”。之后收尾的 Goal 会采用这条规则。", {
            human: values.has("human_approval") ? L("需要") : L("不需要"),
          }),
        }));
        if (form.closest("[data-goal-work-rules]") && globalThis.molisWorkOpenGoalWorkRules) {
          globalThis.molisWorkOpenGoalWorkRules();
          return;
        }
        location.reload();
      } catch (error) {
        errorBox.textContent = error instanceof TypeError ? L("无法连接本地服务，输入已保留，请重试。") : error.message || L("项目默认工作规则保存失败，请检查输入后重试");
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
