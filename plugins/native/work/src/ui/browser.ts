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
  const activateSessionDetailTab = (detail, tabName) => {
    if (!detail || !tabName) return;
    detail.querySelectorAll("[data-session-detail-tab]").forEach((tab) => {
      const active = tab.dataset.sessionDetailTab === tabName;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    detail.querySelectorAll("[data-session-detail-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.sessionDetailPanel !== tabName;
    });
  };
  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-session-detail-tab]");
    if (!tab) return;
    activateSessionDetailTab(tab.closest("[data-operation-detail]"), tab.dataset.sessionDetailTab);
  });
  document.addEventListener("keydown", (event) => {
    const tab = event.target.closest("[data-session-detail-tab]");
    if (!tab || (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End")) return;
    const tabs = [...(tab.closest("[role=tablist]")?.querySelectorAll("[data-session-detail-tab]") || [])];
    const index = tabs.indexOf(tab);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? tabs[0]
      : event.key === "End" ? tabs[tabs.length - 1]
      : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    activateSessionDetailTab(tab.closest("[data-operation-detail]"), next.dataset.sessionDetailTab);
    next.focus();
  });
  document.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));
  document.querySelectorAll('[data-work-surface-open="sessions"]').forEach((button) => button.addEventListener("click", () => {
    queueMicrotask(() => loadSessionContent(document.querySelector('[data-work-surface="sessions"] [data-operation-detail]:not([hidden])')));
  }));
  const deepLink = location.hash.replace(/^#/, "");
  if (deepLink === "sessions" || deepLink === "workspaces") {
    if (deepLink === "workspaces") history.replaceState(null, "", location.pathname + location.search + "#sessions");
    document.querySelector('[data-work-surface-open="sessions"][data-directory-open="sessions"]')?.click();
  }

})();
`;
