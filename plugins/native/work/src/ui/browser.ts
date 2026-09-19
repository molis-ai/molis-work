import { WORK_CONTENT_CLIENT } from "./content-client.js";
import { WORK_DIRECTORY_CLIENT } from "./directory-client.js";
import { WORK_SESSION_ADD_CLIENT } from "./session-add-client.js";
import { WORK_ASSOCIATIONS_CLIENT } from "./associations-client.js";
import { WORK_HANDOFF_CLIENT } from "./handoff-client.js";

export const PROJECT_OPERATIONS_CLIENT_SCRIPT = `
(() => {
  const toast = document.querySelector("[data-toast]");
  const routePrefix = document.body.dataset.routePrefix || "";
  const route = (pathname) => routePrefix + pathname;
  const L = globalThis.L || ((text, vars) => {
    let value = text;
    if (vars) for (const key of Object.keys(vars)) value = value.split("{" + key + "}").join(String(vars[key]));
    return value;
  });
  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 3200);
  };
  const parseActionResponse = async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || L("Session 操作失败，请重试"));
    return payload;
  };
  const showDialogStatus = (element, message, error = false) => {
    if (!element) return;
    element.hidden = false;
    element.textContent = message;
    element.classList.toggle("is-error", error);
  };

  const shared = { route, parseActionResponse, showDialogStatus, showToast, L };
  const { loadSessionContent } = (${WORK_CONTENT_CLIENT})(shared);
  (${WORK_DIRECTORY_CLIENT})({ loadSessionContent });
  (${WORK_SESSION_ADD_CLIENT})(shared);
  (${WORK_ASSOCIATIONS_CLIENT})(shared);
  (${WORK_HANDOFF_CLIENT})(shared);
  document.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));
  document.querySelectorAll('[data-work-surface-open="sessions"]').forEach((button) => button.addEventListener("click", () => {
    queueMicrotask(() => loadSessionContent(document.querySelector('[data-work-surface="sessions"] [data-operation-detail]:not([hidden])')));
  }));
  const deepLink = location.hash.replace(/^#/, "");
  if (deepLink === "sessions" || deepLink === "workspaces") {
    if (deepLink === "workspaces") history.replaceState(null, "", location.pathname + location.search + "#sessions");
    document.querySelector('[data-plugin-id="sessions"][data-work-surface-open="sessions"]')?.click();
  }

})();
`;
