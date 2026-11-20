import { externalTool, externalToolIdsWith } from "@molis-ai/molis-work-contracts/platform/external-tools";
import type { StageTerminalPaneModel } from "@molis-ai/molis-work-contracts/platform/ui";
import { t as uiText, escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";

export type TerminalPaneModel = StageTerminalPaneModel;

/** The runtimes a terminal offers. This menu leads with Claude Code; the others keep the register's order. */
const RUNTIME_KINDS: ReadonlyArray<readonly [string, string]> = externalToolIdsWith("terminal")
  .map(id => [id, externalTool(id).display_name] as const)
  .sort(([left], [right]) => Number(right === "claude-code") - Number(left === "claude-code"));

/** The platform object work-terminal pane; `startWorkTerminalClient` drives it in the page against `/api/work-terminals`. */
export function renderTerminalPane(model: TerminalPaneModel): string {
  const { selected, read_only: readOnly, cliAvailability, icon } = model;
  const selectedId = selected?.id ?? "";
  const isReadOnly = Boolean(readOnly);
  const guardHeading = readOnly?.heading || uiText.text("workbench.pane.item-read-only-heading");
  const guardSummary = readOnly?.summary || readOnly?.reason || uiText.text("workbench.pane.item-read-only-summary");
  const guardEmptySummary = readOnly?.empty_summary || guardSummary;
  const guardAddTitle = readOnly?.add_disabled_title || readOnly?.reason || uiText.text("workbench.pane.item-read-only-heading");
  const guardEmptyChoices = readOnly?.empty_choices_text || "";
  const choicesMarkup = (readOnly?.choices ?? []).map((choice) => {
    return `<a class="tui-child-choice" href="${escapeHtml(choice.href)}">
      <span><strong>${escapeHtml(choice.title)}</strong><small>${escapeHtml(choice.subtitle)}</small></span>
      <b>${escapeHtml(choice.action_label)}${icon("chevron-right")}</b>
    </a>`;
  }).join("");
  const runtimeChoices = RUNTIME_KINDS.map(([kind, label]) => {
    const available = cliAvailability[kind] !== false;
    return `<button type="button" data-tui-kind="${kind}"${available ? "" : ` disabled title="${escapeHtml(uiText.text("workbench.pane.install-cli-first"))}"`}>${label}${available ? "" : `<small>${uiText("workbench.pane.not-installed")}</small>`}</button>`;
  }).join("");
  const missingKinds = RUNTIME_KINDS
    .filter(([kind]) => cliAvailability[kind] === false)
    .map(([, label]) => label);
  const missingHint = missingKinds.length
    ? `<p class="tui-menu-missing">${uiText("workbench.pane.these-clis-not-installed-list-install-them-then", { list: missingKinds.join(uiText.text("common.list.separator")) })}</p>`
    : "";
  const readOnlyAttrs = readOnly
    ? ` data-tui-read-only="true" data-tui-read-only-reason="${escapeHtml(readOnly.reason)}" data-tui-read-only-heading="${escapeHtml(guardHeading)}" data-tui-read-only-empty-summary="${escapeHtml(guardEmptySummary)}" data-tui-read-only-add-title="${escapeHtml(guardAddTitle)}"`
    : "";
  return `
      <div class="tui-resizer" role="separator" aria-label="${uiText("workbench.pane.resize-terminal-double-click-collapse")}" aria-orientation="vertical" aria-valuemin="280" aria-valuemax="720" aria-valuenow="480" tabindex="0" data-tui-resizer></div>
      <aside class="tui-pane" id="work-tui-pane" data-tui-pane data-tui-plugin-id="${escapeHtml(model.plugin_id)}" data-tui-subject-kind="${escapeHtml(model.subject_kind)}" data-tui-subject-id="${escapeHtml(selectedId)}"${readOnlyAttrs} aria-label="${uiText("workbench.pane.terminal-pane")}">
        <div class="tui-owner" data-tui-owner>
          <div class="tui-owner-copy">
            <strong data-tui-owner-title>${escapeHtml(selected?.title ?? uiText.text("workbench.pane.no-item-selected"))}</strong>
            <span class="tui-owner-binding"><i aria-hidden="true"></i><b>${uiText("workbench.pane.bound-item")}</b></span>
          </div>
          <div class="tui-owner-actions">
            ${selected?.status_html
              ? selected.status_html
              : `<span class="goal-status" data-tui-owner-status hidden><span data-tui-owner-status-label></span></span>`}
            <button class="tui-focus-return" type="button" data-tui-focus-return>${icon("target")}<span>${uiText("workbench.pane.return-focus")}</span></button>
          </div>
        </div>
        <div class="tui-tabs">
          <span class="tui-mode-label">${uiText("workbench.pane.terminal")}</span>
          <div class="tui-tab-list" data-tui-tabs data-overflow-fade></div>
          <button class="tui-add" type="button" data-tui-add aria-expanded="false" aria-controls="tui-open-menu" aria-haspopup="true" aria-label="${uiText("workbench.pane.add-terminal")}"${isReadOnly ? ` disabled title="${escapeHtml(guardAddTitle)}"` : ""}>${icon("plus")}<span>${uiText("workbench.pane.add-terminal")}</span></button>
        </div>
        <div class="tui-stage">
          <section class="tui-parent-guard" data-tui-read-only-guard${isReadOnly ? "" : " hidden"}>
            <div class="tui-parent-guard-copy">
              ${icon("tree")}
              <div><strong data-tui-read-only-heading>${escapeHtml(guardHeading)}</strong><p data-tui-read-only-summary>${escapeHtml(guardSummary)}</p></div>
            </div>
            <div class="tui-child-choices" data-tui-read-only-choices>${choicesMarkup || (guardEmptyChoices ? `<p>${escapeHtml(guardEmptyChoices)}</p>` : "")}</div>
          </section>
          <div class="tui-chrome">
            <div class="tui-chrome-actions">
              <button class="mw-btn mw-btn--primary tui-advance" type="button" data-tui-advance disabled>${icon("play")}<span>${uiText("workbench.pane.advance-work")}</span></button>
              <button class="mw-btn mw-btn--secondary" type="button" data-tui-copy>${icon("copy")}<span>${uiText("workbench.pane.copy-command")}</span></button>
              <button class="mw-btn mw-btn--ghost" type="button" data-tui-fill disabled>${uiText("workbench.pane.fill-without-sending")}</button>
              <button class="mw-btn mw-btn--ghost" type="button" data-tui-reopen hidden>${icon("refresh")}<span>${uiText("workbench.pane.reopen")}</span></button>
            </div>
            <p class="tui-status" data-tui-status role="status"></p>
          </div>
          <div class="tui-terminal" data-tui-terminal>
            <div class="tui-empty" data-tui-empty>
              <span class="tui-empty-mark" aria-hidden="true">${icon("terminal")}</span>
              <p><strong>${isReadOnly ? escapeHtml(guardHeading) : uiText("workbench.pane.no-terminal-yet")}</strong></p>
              <p>${isReadOnly ? escapeHtml(guardEmptySummary) : uiText("workbench.pane.choose-runtime-custom-command-work-item")}</p>
              <button type="button" class="mw-btn mw-btn--primary" data-tui-empty-add aria-haspopup="true" aria-controls="tui-open-menu" aria-expanded="false"${isReadOnly ? " hidden" : ""}>${icon("plus")}${uiText("workbench.pane.add-terminal")}</button>
            </div>
          </div>
        </div>
        <form class="tui-menu" id="tui-open-menu" data-tui-menu aria-hidden="true" inert>
          <strong>${uiText("workbench.pane.open-terminal-item")}</strong>
          <p>${uiText("workbench.pane.tab-belongs-only-current-item-opening-does-not")}</p>
          <div class="tui-runtime-choices">
            ${runtimeChoices}
            <button type="button" data-tui-kind="generic">${uiText("workbench.pane.custom-command")}</button>
          </div>
          ${missingHint}
          <label data-tui-generic-fields hidden>${uiText("workbench.pane.command")}<input name="command" type="text" autocomplete="off" placeholder="opencode"></label>
          <details class="form-disclosure"><summary>${uiText("workbench.pane.continue-existing-session-optional")}</summary><label>${uiText("workbench.pane.session-id")}<input name="resume_session_id" type="text" autocomplete="off"></label><small>${uiText("workbench.pane.enter-session-id-matching-runtime-first-then-choose")}</small></details>
          <div class="tui-menu-actions">
            <button class="mw-btn mw-btn--secondary" type="button" data-tui-menu-cancel>${uiText("common.control.cancel")}</button>
            <button class="mw-btn mw-btn--primary" type="submit" data-tui-generic-open hidden>${uiText("common.control.open")}</button>
          </div>
        </form>
      </aside>
      `;
}
