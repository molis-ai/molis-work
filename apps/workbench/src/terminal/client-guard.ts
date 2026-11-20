import type { StageTerminalChoice, StageTerminalReadOnlyGuard } from "@molis-ai/molis-work-contracts/platform/ui";
import { t as uiText, escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { type TerminalPaneElements, type TerminalStatus, type TerminalTranslate } from "./client-dom.js";
import type { PanelRecord, WorkTerminalSubjectRef } from "./types.js";

export interface TerminalGuardOptions {
  els: TerminalPaneElements;
  text: TerminalTranslate;
  route(path: string): string;
  subject(): WorkTerminalSubjectRef;
  setStatus: TerminalStatus;
  closeMenu(): void;
}

/** Whether this page may drive a terminal: a read-only item stays read-only, and a panel answers only to its own object. */
export function createTerminalGuard(options: TerminalGuardOptions) {
  const { els, route, subject, setStatus } = options;
  const { pane, emptyEl, readOnlyGuardEl, readOnlyHeadingEl, readOnlySummaryEl, readOnlyChoicesEl, addBtn, emptyAddBtn } = els;
  let activeGuard: StageTerminalReadOnlyGuard | null = pane.getAttribute("data-tui-read-only") === "true"
    ? {
      reason: pane.dataset.tuiReadOnlyReason || uiText.text("workbench.client-guard.item-read-only-terminal"),
      heading: pane.dataset.tuiReadOnlyHeading || uiText.text("workbench.pane.item-read-only-heading"),
      summary: readOnlySummaryEl?.textContent || uiText.text("workbench.pane.item-read-only-summary"),
      empty_summary: pane.dataset.tuiReadOnlyEmptySummary || uiText.text("workbench.pane.item-read-only-summary"),
      add_disabled_title: pane.dataset.tuiReadOnlyAddTitle || uiText.text("workbench.pane.item-read-only-heading"),
      empty_choices_text: "",
      choices: [],
    }
    : null;

  const readOnlyMessage = () => activeGuard?.reason || uiText.text("workbench.client-guard.item-read-only-terminal");
  const readOnlyAddTitle = () => activeGuard?.add_disabled_title || readOnlyMessage();

  const panelBelongsHere = (panel: PanelRecord | null | undefined) => {
    const current = subject();
    return Boolean(panel && panel.plugin_id === current.plugin_id && panel.subject_kind === current.subject_kind && panel.subject_id === current.subject_id);
  };

  const canControlPanel = (panel: PanelRecord | null | undefined): panel is PanelRecord => {
    if (activeGuard) {
      setStatus(readOnlyMessage(), "error");
      return false;
    }
    if (!panelBelongsHere(panel)) {
      setStatus(uiText.text("workbench.client-guard.page-has-switched-another-item-terminal-stays-its"), "error");
      return false;
    }
    return true;
  };

  const renderChoices = (choices: readonly StageTerminalChoice[], emptyText: string) => {
    if (!readOnlyChoicesEl) return;
    readOnlyChoicesEl.innerHTML = choices.length
      ? choices.map((choice) => `<a class="tui-child-choice" href="${escapeHtml(route(choice.href))}">
        <span><strong>${escapeHtml(choice.title)}</strong><small>${escapeHtml(choice.subtitle)}</small></span>
        <b>${escapeHtml(choice.action_label)}<svg aria-hidden="true"><use href="#icon-chevron-right"></use></svg></b>
      </a>`).join("")
      : emptyText ? `<p>${escapeHtml(emptyText)}</p>` : "";
  };

  const updateEmptyCopy = (guard: StageTerminalReadOnlyGuard | null) => {
    if (!emptyEl) return;
    const isReadOnly = Boolean(guard);
    if (emptyAddBtn) emptyAddBtn.hidden = isReadOnly;
    const paragraphs = emptyEl.querySelectorAll("p");
    const title = paragraphs[0]?.querySelector("strong");
    if (title) title.textContent = guard ? (guard.heading || uiText.text("workbench.pane.item-read-only-heading")) : uiText.text("workbench.client-guard.no-terminal-yet");
    if (paragraphs[1]) {
      paragraphs[1].textContent = guard
        ? (guard.empty_summary || guard.summary || guard.reason || uiText.text("workbench.pane.item-read-only-summary"))
        : uiText.text("workbench.client-guard.choose-runtime-custom-command-work-item");
    }
  };

  const setReadOnlyGuard = (guard: StageTerminalReadOnlyGuard | null) => {
    activeGuard = guard;
    const isReadOnly = Boolean(guard);
    if (isReadOnly) pane.setAttribute("data-tui-read-only", "true");
    else pane.removeAttribute("data-tui-read-only");
    if (readOnlyGuardEl) readOnlyGuardEl.hidden = !isReadOnly;
    if (guard) {
      if (readOnlyHeadingEl) readOnlyHeadingEl.textContent = guard.heading || uiText.text("workbench.pane.item-read-only-heading");
      if (readOnlySummaryEl) readOnlySummaryEl.textContent = guard.summary || guard.reason || uiText.text("workbench.pane.item-read-only-summary");
      renderChoices(guard.choices ?? [], guard.empty_choices_text ?? "");
    }
    updateEmptyCopy(guard);
    addBtn.disabled = isReadOnly;
    addBtn.title = isReadOnly ? readOnlyAddTitle() : "";
    if (isReadOnly) options.closeMenu();
  };

  return { readOnly: () => Boolean(activeGuard), readOnlyMessage, readOnlyAddTitle, panelBelongsHere, canControlPanel, setReadOnlyGuard };
}

export type TerminalGuard = ReturnType<typeof createTerminalGuard>;
