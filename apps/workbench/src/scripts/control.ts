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

/**
 * The update page's only program: the button that records the update notice as seen. The first-run and new-project
 * journey is `context-onboarding.ts`.
 */
export const ONBOARDING_DISMISS_CLIENT_SCRIPT = `
  (() => {
    const L = globalThis.L || ((text) => text);
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
  })();
`;
