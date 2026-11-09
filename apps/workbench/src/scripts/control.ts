import { UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { PERSONAL_ACCOUNT_CLIENT_SCRIPT } from "./personal-account.js";

// Compose the shared request client with account/space isolation for every workbench page.
export const CONTROL_CLIENT_SCRIPT = UI_REQUEST_CLIENT_SCRIPT + PERSONAL_ACCOUNT_CLIENT_SCRIPT;

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
      if(message && typeof message === "object") molisWorkRequest.show(globalError,message); else globalError.textContent = message || "";
      globalError.hidden = !globalError.textContent;
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
        await molisWorkRequest("/api/onboarding/dismiss", {body:{kind,user_confirmed:true},fallback:L("无法保存引导状态")});
        location.assign(returnHref);
      } catch (error) {
        setGlobalError(error);
        dismissButtons.forEach((button) => { button.disabled = false; });
      }
    };
    dismissButtons.forEach((button) => button.addEventListener("click", () => void dismiss(button.dataset.onboardingDismiss || "first_run")));
  })();
`;
