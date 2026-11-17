import { escapeHtml, icon, renderStatusMark } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ExternalSessionSource } from "@molis-ai/molis-work-contracts/services/sessions";
import { copyPlainText } from "./api.js";

const uiText = globalThis.t;
const GH_SCOPE_CMD = "gh auth refresh -h github.com -s repo";

const STATE_TONES = {
  complete: "done",
  reading: "progress",
  needs_login: "attention",
  version_unreadable: "attention",
  failed: "blocked",
  unsupported: "quiet",
  not_allowed: "quiet",
} as const;

const STATE_LABELS = {
  complete: "workbench.sessions.source-complete",
  reading: "workbench.sessions.source-reading",
  needs_login: "workbench.sessions.source-needs-login",
  version_unreadable: "workbench.sessions.source-unreadable",
  failed: "workbench.sessions.source-failed",
  unsupported: "workbench.sessions.source-unsupported",
  not_allowed: "workbench.sessions.source-not-allowed",
} as const;

const REASON_NOTES = {
  login_expired: "workbench.sessions.reason-login-expired",
  connection_removed: "workbench.sessions.reason-connection-removed",
  account_changed: "workbench.sessions.reason-account-changed",
  version_mismatch: "workbench.sessions.reason-version-mismatch",
  parse_error: "workbench.sessions.reason-parse-error",
  tool_missing: "workbench.sessions.reason-tool-missing",
  timed_out: "workbench.sessions.reason-timed-out",
  read_error: "workbench.sessions.reason-read-error",
  adapter_pending: "workbench.sessions.reason-adapter-pending",
  tool_gap: "workbench.sessions.reason-tool-gap",
} as const;

function renderSourceActions(source: ExternalSessionSource): string {
  const id = escapeHtml(source.entry_id);
  if (source.state === "needs_login" && source.reason === "account_changed") {
    return `<div class="sessions-source-actions"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-source-retry="${id}">${icon("refresh")}<span>${uiText("workbench.sessions.account-switched-back")}</span></button><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-sessions-open-scope="tools">${uiText("workbench.sessions.switch-connection-in-scope")}</button></div>`;
  }
  if (source.state === "needs_login" && source.reason === "login_expired" && source.entry_id === "copilot-coding-agent") {
    return `<div class="sessions-source-code"><code>${GH_SCOPE_CMD}</code><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-source-copy-cmd="${escapeHtml(GH_SCOPE_CMD)}">${icon("copy")}<span>${uiText("workbench.sessions.copy-command")}</span></button></div><div class="sessions-source-actions"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-source-retry="${id}">${icon("refresh")}<span>${uiText("workbench.sessions.recheck-login")}</span></button></div>`;
  }
  if (source.state === "needs_login") {
    return `<div class="sessions-source-actions"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-sessions-open-scope="tools">${uiText("workbench.sessions.open-scope-connections")}</button></div>`;
  }
  if (source.state === "failed") {
    return `<div class="sessions-source-actions"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-source-retry="${id}">${icon("refresh")}<span>${uiText("common.control.retry")}</span></button></div>`;
  }
  return "";
}

function renderSourceRow(source: ExternalSessionSource): string {
  const tone = STATE_TONES[source.state];
  const mark = renderStatusMark({
    label: uiText.text(STATE_LABELS[source.state]),
    tone,
    ...(source.state === "reading" ? { state: "running" as const } : source.state === "failed" ? { state: "failed" as const } : {}),
    plain: true,
  });
  const progress = source.state === "reading" && source.progress
    ? source.progress.total !== null
      ? uiText.text("workbench.sessions.reading-progress-total", { read: source.progress.read, total: source.progress.total })
      : uiText.text("workbench.sessions.reading-progress", { read: source.progress.read })
    : uiText.text("workbench.sessions.source-count", { count: source.session_count });
  const note = source.reason ? `<p class="sessions-source-note">${uiText(REASON_NOTES[source.reason])}</p>` : "";
  return `<div class="sessions-source-item" data-source-entry="${escapeHtml(source.entry_id)}"><div class="sessions-source-top"><strong>${escapeHtml(source.display_name)}</strong>${mark}</div><p class="sessions-source-note">${escapeHtml(progress)}</p>${note}${renderSourceActions(source)}</div>`;
}

export function renderSourcesSection(
  container: HTMLElement,
  sources: readonly ExternalSessionSource[],
  expanded: boolean,
): void {
  const active = sources.filter((item) => item.state !== "not_allowed" && item.state !== "unsupported");
  if (active.length === 0) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  const ready = active.filter((item) => item.state === "complete").length;
  const reading = active.filter((item) => item.state === "reading").length;
  const attention = active.filter((item) => item.state !== "complete" && item.state !== "reading").length;
  const showOpen = expanded || reading > 0 || attention > 0;
  const summary = uiText.text("workbench.sessions.sources-summary", { ready, reading, attention });
  container.hidden = false;
  container.innerHTML = `<button class="sessions-sources-summary" type="button" data-sources-toggle aria-expanded="${String(showOpen)}"><span>${escapeHtml(summary)}</span>${icon(showOpen ? "chevron-up" : "chevron-down")}</button><div class="sessions-sources-list"${showOpen ? "" : " hidden"}>${active.map(renderSourceRow).join("")}</div>`;
}

export function bindSourcesEvents(
  container: HTMLElement,
  handlers: { onToggle: () => void; onRetry: (entryId: string) => void; onToast: (msg: string) => void },
): void {
  container.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("[data-sources-toggle]")) {
      handlers.onToggle();
      return;
    }
    const copyBtn = target.closest<HTMLElement>("[data-source-copy-cmd]");
    if (copyBtn?.dataset.sourceCopyCmd) {
      void copyPlainText(copyBtn.dataset.sourceCopyCmd).then((ok) => {
        if (ok) handlers.onToast(uiText.text("workbench.sessions.copied-command"));
      });
      return;
    }
    const retryBtn = target.closest<HTMLElement>("[data-source-retry]");
    if (retryBtn?.dataset.sourceRetry) handlers.onRetry(retryBtn.dataset.sourceRetry);
  });
}
