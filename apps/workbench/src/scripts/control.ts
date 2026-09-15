export const CONTROL_CLIENT_SCRIPT = `
  globalThis.molisWorkControlHeaders = () => {
    const token = document.querySelector('meta[name="molis-work-control-token"]')?.content || "";
    const requestKey = globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));
    return {
      "content-type": "application/json",
      "x-molis-work-control-token": token,
      "x-molis-work-idempotency-key": requestKey,
    };
  };
`;

export const ONBOARDING_CLIENT_SCRIPT = `
  (() => {
    const L = globalThis.L || ((text) => text);
    const form = document.querySelector("[data-onboarding-form]");
    const globalError = document.querySelector("[data-onboarding-error]");
    const dismissButtons = [...document.querySelectorAll("[data-onboarding-dismiss]")];
    const setGlobalError = (message) => {
      if (!globalError) return;
      globalError.textContent = message || "";
      globalError.hidden = !message;
    };
    const dismiss = async (kind) => {
      const mode = document.body.dataset.onboardingMode || "update";
      const returnHref = new URLSearchParams(location.search).get("desktop") === "1"
        || document.body.dataset.nativeDesktop === "true" ? "/?desktop=1" : "/";
      if (mode === "new_project") {
        location.assign(returnHref);
        return;
      }
      dismissButtons.forEach((button) => { button.disabled = true; });
      setGlobalError("");
      try {
        const response = await fetch("/api/onboarding/dismiss", {
          method: "POST",
          headers: globalThis.molisWorkControlHeaders(),
          body: JSON.stringify({ kind, user_confirmed: true }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || L("无法保存引导状态"));
        location.assign(returnHref);
      } catch (error) {
        setGlobalError(error instanceof Error ? error.message : String(error));
        dismissButtons.forEach((button) => { button.disabled = false; });
      }
    };
    dismissButtons.forEach((button) => button.addEventListener("click", () => void dismiss(button.dataset.onboardingDismiss || "first_run")));
    if (!form) return;

    const steps = [...form.querySelectorAll("[data-onboarding-step]")];
    const progress = form.querySelector("[data-onboarding-progress]");
    const back = form.querySelector("[data-onboarding-back]");
    const next = form.querySelector("[data-onboarding-next]");
    const submit = form.querySelector("[data-onboarding-submit]");
    const nextLabel = form.querySelector("[data-onboarding-next-label]");
    const submitLabel = form.querySelector("[data-onboarding-submit-label]");
    const runtimeFrame = form.querySelector("[data-onboarding-runtime-frame]");
    const runtimeStatus = form.querySelector("[data-onboarding-runtime-status]");
    const runtimeRetry = form.querySelector("[data-onboarding-runtime-retry]");
    const intentInput = form.elements.intent_frame;
    const intentPicker = form.querySelector("[data-onboarding-intent]");
    const intentTrigger = form.querySelector("[data-onboarding-intent-trigger]");
    const intentCurrent = form.querySelector("[data-onboarding-intent-current]");
    const intentOptions = [...form.querySelectorAll("[data-onboarding-intent-option]")];
    const outcomeInput = form.elements.outcome;
    let currentStep = 0;
    let transitionTimer = 0;
    let runtimeReady = false;
    let runtimeBootstrap = null;
    let projectDestination = "";
    const meaningful = (value) => /\\p{L}/u.test(String(value || "").trim());
    const values = () => {
      const data = new FormData(form);
      const intentOption = intentOptions.find((option) => option.getAttribute("aria-selected") === "true");
      const intentPrefix = intentOption?.dataset.intentLabel || L("我想");
      const outcome = String(data.get("outcome") || "").trim();
      const sentenceGap = document.documentElement.lang.startsWith("zh") ? "" : " ";
      return {
        outcome,
        outcomeSentence: intentPrefix + sentenceGap + outcome,
        intentFrame: String(data.get("intent_frame") || "open"),
        projectName: String(data.get("project_name") || "").trim(),
        workspacePath: String(data.get("workspace_path") || "").trim(),
        runtimeKind: String(data.get("runtime_kind") || "").trim(),
        confirmed: data.get("user_confirmed") === "on",
      };
    };
    const fieldError = (step, message) => {
      const error = form.querySelector('[data-step-error="' + step + '"]');
      if (error) {
        error.textContent = message || "";
        error.hidden = !message;
      }
      const input = step === 0
        ? form.elements.outcome
        : step === 1
          ? form.elements.project_name
          : step === 2
            ? form.elements.workspace_path
            : form.elements.user_confirmed;
      input?.setAttribute("aria-invalid", message ? "true" : "false");
    };
    const validate = (step) => {
      const data = values();
      fieldError(step, "");
      if (step === 0 && !meaningful(data.outcome)) {
        fieldError(step, L("先告诉我们，你想看到什么变化。"));
        return false;
      }
      if (step === 1 && !meaningful(data.projectName)) {
        fieldError(step, L("给这个项目取个名字吧。"));
        return false;
      }
      if (step === 2 && data.runtimeKind && !data.workspacePath) {
        fieldError(step, L("如果现在打开 TUI，需要先选择一个存在的工作目录；也可以这次先跳过。"));
        return false;
      }
      if (step === 3 && !data.confirmed) {
        fieldError(step, L("确认这些内容没问题后，我们再保存。"));
        return false;
      }
      return true;
    };
    const updateReview = () => {
      const data = values();
      form.querySelectorAll("[data-onboarding-outcome]").forEach((node) => { node.textContent = data.outcomeSentence; });
      form.querySelectorAll("[data-onboarding-project]").forEach((node) => { node.textContent = data.projectName; });
      const runtime = form.querySelector('input[name="runtime_kind"]:checked')?.closest("label")?.querySelector("strong")?.textContent || L("这次先跳过");
      const assignments = [
        ["[data-review-project]", data.projectName],
        ["[data-review-outcome]", data.outcomeSentence],
        ["[data-review-workspace]", data.workspacePath || L("之后再选")],
        ["[data-review-runtime]", data.runtimeKind ? runtime + L(" · 先填入，等你自己发送") : L("先进入 Goal 工作台，之后再打开 TUI")],
      ];
      assignments.forEach(([selector, value]) => {
        const node = form.querySelector(selector);
        if (node) node.textContent = value;
      });
    };
    const updateNavigation = () => {
      const stepLabels = [L("说说想法"), L("取个名字"), L("选择工具"), L("确认一下"), L("一起安排")];
      const hasRuntime = Boolean(values().runtimeKind);
      const visibleStepCount = hasRuntime ? 5 : 4;
      if (progress) {
        progress.textContent = String(currentStep + 1).padStart(2, "0") + " / " + String(visibleStepCount).padStart(2, "0") + " · " + stepLabels[currentStep];
      }
      if (back) back.hidden = currentStep === 0 || currentStep === 4;
      if (next) {
        next.hidden = currentStep === 3;
        next.disabled = currentStep === 4 && !runtimeReady;
      }
      if (submit) submit.hidden = currentStep !== 3;
      if (nextLabel) {
        nextLabel.textContent = currentStep === 4 ? L("安排好了，进入 Molis Work") : L("下一步");
      }
      document.body.dataset.onboardingTone = String(currentStep);
      if (currentStep === 3) updateReview();
    };
    const showStep = (step) => {
      const targetStep = Math.max(0, Math.min(steps.length - 1, step));
      const previousStep = currentStep;
      const outgoing = steps[previousStep];
      const incoming = steps[targetStep];
      if (!incoming) return;
      window.clearTimeout(transitionTimer);
      currentStep = targetStep;
      updateNavigation();
      if (targetStep === previousStep || !outgoing) {
        steps.forEach((section, index) => {
          section.hidden = index !== currentStep;
          section.classList.toggle("is-current", index === currentStep);
          section.classList.remove("is-entering", "is-leaving");
        });
        requestAnimationFrame(() => incoming.querySelector("h1")?.focus({ preventScroll: true }));
        return;
      }
      const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      form.dataset.stepDirection = targetStep > previousStep ? "forward" : "backward";
      outgoing.classList.remove("is-current", "is-entering");
      incoming.hidden = false;
      incoming.classList.remove("is-leaving");
      incoming.classList.add("is-current");
      if (reducedMotion) {
        outgoing.hidden = true;
        incoming.classList.remove("is-entering");
        requestAnimationFrame(() => incoming.querySelector("h1")?.focus({ preventScroll: true }));
        return;
      }
      form.dataset.transitioning = "true";
      outgoing.classList.add("is-leaving");
      incoming.classList.add("is-entering");
      [back, next, submit].forEach((button) => { if (button) button.disabled = true; });
      transitionTimer = window.setTimeout(() => {
        outgoing.hidden = true;
        outgoing.classList.remove("is-leaving");
        incoming.classList.remove("is-entering");
        delete form.dataset.transitioning;
        [back, next, submit].forEach((button) => { if (button) button.disabled = false; });
        updateNavigation();
        incoming.querySelector("h1")?.focus({ preventScroll: true });
      }, 320);
    };
    next?.addEventListener("click", () => {
      if (currentStep === 4) {
        if (runtimeReady && projectDestination) location.assign(projectDestination);
        return;
      }
      if (!validate(currentStep)) return;
      updateReview();
      showStep(currentStep + 1);
    });
    back?.addEventListener("click", () => showStep(currentStep - 1));
    const closeIntentPicker = (restoreFocus = false) => {
      if (!intentPicker || !intentTrigger) return;
      intentPicker.classList.remove("is-open");
      intentTrigger.setAttribute("aria-expanded", "false");
      if (restoreFocus) intentTrigger.focus();
    };
    const openIntentPicker = () => {
      if (!intentPicker || !intentTrigger) return;
      intentPicker.classList.add("is-open");
      intentTrigger.setAttribute("aria-expanded", "true");
    };
    const selectIntent = (option) => {
      if (!option) return;
      intentOptions.forEach((candidate) => candidate.setAttribute("aria-selected", candidate === option ? "true" : "false"));
      if (intentInput) intentInput.value = option.dataset.onboardingIntentOption || "open";
      if (intentCurrent) intentCurrent.textContent = option.dataset.intentLabel || L("我想");
      if (outcomeInput && option.dataset.placeholder) outcomeInput.placeholder = option.dataset.placeholder;
      closeIntentPicker(true);
    };
    intentTrigger?.addEventListener("click", () => {
      const shouldOpen = intentTrigger.getAttribute("aria-expanded") !== "true";
      if (shouldOpen) openIntentPicker();
      else closeIntentPicker();
    });
    intentTrigger?.addEventListener("keydown", (event) => {
      if (!intentOptions.length || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      openIntentPicker();
      const selectedIndex = Math.max(0, intentOptions.findIndex((option) => option.getAttribute("aria-selected") === "true"));
      intentOptions[event.key === "ArrowUp" ? Math.max(0, selectedIndex - 1) : Math.min(intentOptions.length - 1, selectedIndex + 1)]?.focus();
    });
    intentOptions.forEach((option, optionIndex) => {
      option.addEventListener("click", () => selectIntent(option));
      option.addEventListener("keydown", (event) => {
        if (["Enter", " "].includes(event.key)) {
          event.preventDefault();
          selectIntent(option);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeIntentPicker(true);
          return;
        }
        if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
        event.preventDefault();
        const offset = event.key === "ArrowDown" ? 1 : -1;
        intentOptions[(optionIndex + offset + intentOptions.length) % intentOptions.length]?.focus();
      });
    });
    document.addEventListener("pointerdown", (event) => {
      if (intentPicker && !intentPicker.contains(event.target)) closeIntentPicker();
    });
    form.addEventListener("keydown", (event) => {
      if (event.target.closest?.("[data-onboarding-intent]")) return;
      if (event.key !== "Enter" || event.shiftKey || event.target instanceof HTMLTextAreaElement) return;
      if (form.dataset.transitioning === "true") return;
      if (currentStep >= 3) return;
      event.preventDefault();
      next?.click();
    });
    const setRuntimeStatus = (message, state = "busy") => {
      if (!runtimeStatus) return;
      runtimeStatus.textContent = message || "";
      runtimeStatus.dataset.state = state;
    };
    const sendRuntimeBootstrap = () => {
      if (!runtimeBootstrap || !runtimeFrame?.contentWindow) return;
      runtimeFrame.contentWindow.postMessage({ type: "molis-work:onboarding-runtime-bootstrap", ...runtimeBootstrap }, location.origin);
    };
    runtimeFrame?.addEventListener("load", () => {
      setRuntimeStatus(L("正在把项目上下文交给 Runtime…"), "busy");
      sendRuntimeBootstrap();
    });
    window.addEventListener("message", (event) => {
      if (event.origin !== location.origin || event.source !== runtimeFrame?.contentWindow) return;
      if (!runtimeBootstrap || event.data?.goalId !== runtimeBootstrap.goalId) return;
      if (event.data?.type === "molis-work:onboarding-runtime-ready") {
        runtimeReady = true;
        setRuntimeStatus(L("提示已经填好。和 Runtime 把项目安排清楚后，再进入 Molis Work。"), "ready");
        if (runtimeRetry) runtimeRetry.hidden = true;
        updateNavigation();
      }
      if (event.data?.type === "molis-work:onboarding-runtime-waiting") {
        runtimeReady = false;
        setRuntimeStatus(L("先在 Runtime 里完成启动确认；之后会自动填入项目提示。"), "busy");
        if (runtimeRetry) runtimeRetry.hidden = true;
        updateNavigation();
      }
      if (event.data?.type === "molis-work:onboarding-runtime-error") {
        runtimeReady = false;
        setRuntimeStatus(event.data.message || L("Runtime 没有成功打开。"), "error");
        if (runtimeRetry) runtimeRetry.hidden = false;
        updateNavigation();
      }
    });
    runtimeRetry?.addEventListener("click", () => {
      if (!runtimeFrame?.src) return;
      runtimeReady = false;
      runtimeRetry.hidden = true;
      setRuntimeStatus(L("正在重新打开 Runtime…"), "busy");
      updateNavigation();
      runtimeFrame.contentWindow?.location.reload();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validate(3)) return;
      const data = values();
      setGlobalError("");
      submit.disabled = true;
      if (submitLabel) submitLabel.textContent = L("正在建立…");
      try {
        const response = await fetch("/api/onboarding/initialize", {
          method: "POST",
          headers: globalThis.molisWorkControlHeaders(),
          body: JSON.stringify({
            project_name: data.projectName,
            outcome: data.outcome,
            intent_frame: data.intentFrame,
            workspace_path: data.workspacePath || null,
            runtime_kind: data.runtimeKind || null,
            user_confirmed: true,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || L("项目初始化失败"));
        if (data.runtimeKind && payload.goal_id) {
          sessionStorage.setItem("molis-work-onboarding-runtime-autofill:" + payload.goal_id, JSON.stringify({
            runtimeKind: data.runtimeKind,
            workspacePath: data.workspacePath,
            at: Date.now(),
          }));
        }
        const destination = new URL(payload.goal_path || payload.project_path || "/", location.origin);
        destination.searchParams.set("onboarding", "1");
        if (document.body.hasAttribute("data-native-desktop")) destination.searchParams.set("desktop", "1");
        projectDestination = destination.pathname + destination.search + destination.hash;
        if (!data.runtimeKind || !payload.goal_id) {
          location.assign(projectDestination);
          return;
        }
        const embeddedDestination = new URL(payload.goal_path || payload.project_path || "/", location.origin);
        embeddedDestination.searchParams.set("onboarding", "1");
        embeddedDestination.searchParams.set("onboarding-runtime", "1");
        embeddedDestination.searchParams.set("onboarding-embed", "1");
        runtimeBootstrap = {
          goalId: payload.goal_id,
          runtimeKind: data.runtimeKind,
          workspacePath: data.workspacePath,
        };
        runtimeReady = false;
        setRuntimeStatus(L("正在打开 Runtime…"), "busy");
        if (runtimeRetry) runtimeRetry.hidden = true;
        showStep(4);
        if (runtimeFrame) runtimeFrame.src = embeddedDestination.pathname + embeddedDestination.search + embeddedDestination.hash;
      } catch (error) {
        setGlobalError(error instanceof Error ? error.message : String(error));
        submit.disabled = false;
        if (submitLabel) submitLabel.textContent = L("创建项目");
      }
    });
    showStep(0);
  })();
`;

export const PROJECT_INDEX_CLIENT_SCRIPT = `
  (() => {
    const projectSearch = document.querySelector("[data-project-search]");
    const projectSearchEmpty = document.querySelector("[data-project-search-empty]");
    const applyProjectSearch = () => {
      if (!projectSearch) return;
      const query = projectSearch.value.trim().toLocaleLowerCase();
      const rows = [...document.querySelectorAll("[data-project-search-row]")];
      let visible = 0;
      rows.forEach((row) => {
        row.hidden = Boolean(query) && !String(row.dataset.projectSearchRow || "").includes(query);
        if (!row.hidden) visible += 1;
      });
      if (projectSearchEmpty) projectSearchEmpty.hidden = visible > 0;
    };
    projectSearch?.addEventListener("input", applyProjectSearch);
    projectSearch?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !projectSearch.value) return;
      projectSearch.value = "";
      applyProjectSearch();
      event.preventDefault();
    });
    const dialog = document.querySelector("[data-project-migration-dialog]");
    const form = document.querySelector("[data-project-migration-form]");
    const errorBox = document.querySelector("[data-project-migration-error]");
    const resetMigrationDialog = () => {
      form?.reset();
      if (errorBox) {
        errorBox.hidden = true;
        errorBox.textContent = "";
      }
      const submit = form?.querySelector("[data-project-migration-submit]");
      if (submit) submit.disabled = false;
    };
    const open = () => {
      if (!dialog) return;
      resetMigrationDialog();
      dialog.showModal();
      requestAnimationFrame(() => form?.elements.legacy_database_path?.focus());
    };
    document.querySelectorAll("[data-open-project-migration]").forEach((button) => {
      button.addEventListener("click", open);
    });
    document.querySelectorAll("[data-close-project-migration]").forEach((button) => {
      button.addEventListener("click", () => dialog?.close());
    });
    dialog?.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog?.addEventListener("close", resetMigrationDialog);
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const confirmed = values.get("user_confirmed") === "on";
      if (!confirmed) {
        errorBox.textContent = L("请先确认你要迁移这份已有 Molis Work 数据。");
        errorBox.hidden = false;
        return;
      }
      const submit = form.querySelector("[data-project-migration-submit]");
      submit.disabled = true;
      errorBox.hidden = true;
      try {
        const response = await fetch("/api/projects/migrate", {
          method: "POST",
          headers: molisWorkControlHeaders(),
          body: JSON.stringify({
            legacy_database_path: String(values.get("legacy_database_path") || "").trim(),
            display_name: String(values.get("display_name") || "").trim(),
            user_confirmed: true,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("迁移失败，请检查来源 DB 后重试"));
        location.assign(globalThis.molisWorkNavigationUrl(result.project_path));
      } catch (error) {
        errorBox.textContent = error.message || L("迁移失败，请检查来源 DB 后重试");
        errorBox.hidden = false;
        submit.disabled = false;
      }
    });
  })();
`;


