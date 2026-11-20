import type { StageTerminalReadOnlyGuard } from "@molis-ai/molis-work-contracts/platform/ui";
import type { TerminalPaneElements } from "./client-dom.js";
import type { TerminalGuard } from "./client-guard.js";
import type { createTerminalPanels } from "./panels.js";
import type { WorkTerminalSubjectRef } from "./types.js";

type SubjectChangedDetail = {
  pluginId?: string;
  subjectKind?: string;
  subjectId?: string;
  title?: string;
  status?: string;
  statusLabel?: string;
  statusMeaning?: string;
  statusIconMarkup?: string;
  readOnly?: StageTerminalReadOnlyGuard | null;
};

type SubjectReadyDetail = {
  pluginId?: string;
  subjectKind?: string;
  subjectId?: string;
};

function paintOwnerStatus(ownerStatusEl: HTMLElement, detail: SubjectChangedDetail | undefined) {
  const status = detail?.status ?? "";
  const label = ownerStatusEl.querySelector("[data-tui-owner-status-label]");
  if (label) label.textContent = detail?.statusLabel ?? "";
  ownerStatusEl.hidden = !detail?.statusLabel;
  ownerStatusEl.title = detail?.statusMeaning ?? "";
  Array.from(ownerStatusEl.classList)
    .filter((className) => className.startsWith("goal-status--"))
    .forEach((className) => ownerStatusEl.classList.remove(className));
  if (/^[a-z_]+$/.test(status)) ownerStatusEl.classList.add(`goal-status--${status}`);
  if (detail?.statusIconMarkup) {
    const template = document.createElement("template");
    template.innerHTML = detail.statusIconMarkup.trim();
    const nextIcon = template.content.firstElementChild;
    const currentIcon = ownerStatusEl.querySelector(":scope > svg");
    if (nextIcon?.tagName.toLowerCase() === "svg") {
      if (currentIcon) currentIcon.replaceWith(nextIcon);
      else ownerStatusEl.prepend(nextIcon);
    }
  }
}

export interface SubjectEventsOptions {
  els: TerminalPaneElements;
  subject(): WorkTerminalSubjectRef;
  guard: TerminalGuard;
  panelController: ReturnType<typeof createTerminalPanels>;
  resetPrompt(): void;
}

/** Follow any plugin surface that drives the work-terminal pane: a subject switch empties the pane; ready loads its panels. */
export function listenSubjectEvents(options: SubjectEventsOptions) {
  const { els: { pane, ownerTitleEl, ownerStatusEl }, subject, guard, panelController } = options;
  const { loadPanels } = panelController;
  document.addEventListener("molis-work:work-terminal-subject-changed", (event) => {
    const detail = (event as CustomEvent<SubjectChangedDetail>).detail;
    if (detail?.pluginId !== undefined) pane.dataset.tuiPluginId = detail.pluginId;
    if (detail?.subjectKind !== undefined) pane.dataset.tuiSubjectKind = detail.subjectKind;
    if (detail?.subjectId !== undefined) pane.dataset.tuiSubjectId = detail.subjectId;
    if (ownerTitleEl && detail?.title) ownerTitleEl.textContent = detail.title;
    if (ownerStatusEl) paintOwnerStatus(ownerStatusEl, detail);
    options.resetPrompt();
    guard.setReadOnlyGuard(detail?.readOnly ?? null);
    panelController.resetSubject();
  });

  document.addEventListener("molis-work:work-terminal-subject-ready", (event) => {
    const detail = (event as CustomEvent<SubjectReadyDetail>).detail;
    const current = subject();
    if (!detail?.subjectId || detail.subjectId !== current.subject_id) return;
    if (detail.pluginId && detail.pluginId !== current.plugin_id) return;
    if (detail.subjectKind && detail.subjectKind !== current.subject_kind) return;
    void loadPanels();
  });
}
