import { UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { PERSONAL_ACCOUNT_CLIENT_SCRIPT } from "./personal-account.js";

// Compose the shared request client with account/space isolation for every workbench page.
export const CONTROL_CLIENT_SCRIPT = `
  ${UI_REQUEST_CLIENT_SCRIPT}
  // Bind even read-only API requests to the page's original space. A cookie may
  // change in another tab; an old page must not quietly load the new account.
  if (!globalThis.molisWorkScopedFetch) {
    globalThis.molisWorkScopedFetch = true;
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.origin === location.origin && /(?:^|\\/)api\\//.test(url.pathname) && !url.pathname.startsWith('/api/personal/')) {
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        const token = document.querySelector('meta[name="molis-work-control-token"]')?.content;
        if (token && !headers.has('x-molis-work-control-token')) headers.set('x-molis-work-control-token', token);
        return originalFetch(input, {...init, headers});
      }
      return originalFetch(input, init);
    };
  }
  ${PERSONAL_ACCOUNT_CLIENT_SCRIPT}
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
