export const PROJECT_RULES_CLIENT_SCRIPT = `
  (() => {
    const bind = (root = document) => {
    const scope = root && root.querySelector ? root : document;
    const form = scope.querySelector("[data-policy-form]");
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
    const reveal = (field) => {
      let parent = field.parentElement;
      while (parent && parent !== form) {
        if (parent.tagName === "DETAILS") parent.open = true;
        parent = parent.parentElement;
      }
    };
    const fail = (field, message) => {
      reveal(field);
      field.setAttribute("aria-invalid", "true");
      errorBox.textContent = message;
      errorBox.hidden = false;
      field.focus();
    };
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
      const reason = String(values.get("reason") || "").trim();
      if (!reason) {
        fail(form.elements.reason, L("请说明为什么要调整项目默认规则。"));
        return;
      }
      const crossReviewers = Number(values.get("cross_reviewers"));
      const adversarialReviewers = Number(values.get("adversarial_reviewers"));
      const leaseSeconds = Number(values.get("max_lease_seconds"));
      if (!Number.isInteger(crossReviewers) || crossReviewers < 0) {
        fail(form.elements.cross_reviewers, L("独立复核人数需要是 0 或正整数。"));
        return;
      }
      if (!Number.isInteger(adversarialReviewers) || adversarialReviewers < 0) {
        fail(form.elements.adversarial_reviewers, L("反例检查人数需要是 0 或正整数。"));
        return;
      }
      if (!Number.isInteger(leaseSeconds) || leaseSeconds <= 0) {
        fail(form.elements.max_lease_seconds, L("一次领取时长需要是正整数秒数。"));
        return;
      }
      const capabilities = String(values.get("required_capabilities") || "")
        .split(/[\\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
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
            reason,
            policy: {
              goal_mode: values.get("goal_mode"),
              self_verification: values.has("self_verification"),
              cross_reviewers: crossReviewers,
              adversarial_reviewers: adversarialReviewers,
              human_approval: values.has("human_approval"),
              required_capabilities: [...new Set(capabilities)],
              max_lease_seconds: leaseSeconds,
            },
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("项目默认工作规则保存失败"));
        const modeLabels = { disabled: L("不要求"), preferred: L("建议使用"), required: L("必须使用") };
        sessionStorage.setItem(receiptKey, JSON.stringify({
          title: L("项目工作规则已保存"),
          detail: L("这个项目的共同规则已更新：按 Goal 工作“{mode}”，执行者自检“{self}”，用户确认“{human}”。之后开始或重新领取的 Goal 会采用这些规则。", {
            mode: modeLabels[values.get("goal_mode")] || String(values.get("goal_mode") || ""),
            self: values.has("self_verification") ? L("需要") : L("不需要"),
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
