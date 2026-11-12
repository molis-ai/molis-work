import { externalTool, externalToolIdsWith } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { t as uiText, escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";

export interface TerminalPaneModel {
  selected?: { goal_id: string; title: string; decomposition_state: string; fulfillment_state: string; statusHtml: string; event_work?: boolean };
  children: readonly { goal_id: string; title: string; statusLabel: string; nextAction: string }[];
  cliAvailability: Record<string, boolean>;
  /** Where the page reads the prompt that advances the selected Goal, with `:goalId` for its id; given by the surface that owns Goals. */
  promptRoute: string;
  /** Where the page lists, opens and closes the selected Goal's terminals, with `:goalId` for its id; given the same way. */
  terminalsRoute: string;
  text(value: string, vars?: Record<string, string | number>): string;
  icon(name: "chevron-right" | "target" | "plus" | "tree" | "play" | "copy" | "refresh" | "terminal"): string;
}

/** The runtimes a terminal offers. This menu leads with Claude Code; the others keep the register's order. */
const RUNTIME_KINDS: ReadonlyArray<readonly [string, string]> = externalToolIdsWith("terminal")
  .map(id => [id, externalTool(id).display_name] as const)
  .sort(([left], [right]) => Number(right === "claude-code") - Number(left === "claude-code"));

/** The Goal terminal pane beside the Goal document; `startWorkTerminalClient` drives it in the page. */
export function renderTerminalPane(model: TerminalPaneModel): string {
  const { selected, children, cliAvailability, icon } = model;
  const selectedGoalId = selected?.goal_id ?? "";
  const compoundParent = selected?.decomposition_state === "closed_compound" && !selected?.event_work;
  const compoundParentComplete = compoundParent && selected?.fulfillment_state === "satisfied";
  const childChoices = children.map((child) => {
    return `<a class="tui-child-choice" href="/goals/${encodeURIComponent(child.goal_id)}">
      <span><strong>${escapeHtml(child.title)}</strong><small>${escapeHtml(child.statusLabel)} · ${escapeHtml(child.nextAction)}</small></span>
      <b>${uiText("workbench.pane.open-child-goal")}${icon("chevron-right")}</b>
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
    ? `<p class="tui-menu-missing">${uiText("workbench.pane.these-clis-not-installed-list-install-them-then", { list: missingKinds.join("、") })}</p>`
    : "";
  return `
      <div class="tui-resizer" role="separator" aria-label="${uiText("workbench.pane.resize-terminal-double-click-collapse")}" aria-orientation="vertical" aria-valuemin="280" aria-valuemax="720" aria-valuenow="480" tabindex="0" data-tui-resizer></div>
      <aside class="tui-pane" id="goal-tui-pane" data-tui-pane data-goal-id="${escapeHtml(selectedGoalId)}" data-tui-prompt-route="${escapeHtml(model.promptRoute)}" data-tui-terminals-route="${escapeHtml(model.terminalsRoute)}" data-tui-parent-read-only="${compoundParent}"${compoundParent ? ' data-tui-read-only="true"' : ""} aria-label="${uiText("workbench.pane.terminal-pane")}">
        <div class="tui-owner" data-tui-owner>
          <div class="tui-owner-copy">
            <strong data-tui-owner-title>${escapeHtml(selected?.title ?? uiText.text("workbench.pane.no-goal-selected"))}</strong>
            <span class="tui-owner-binding"><i aria-hidden="true"></i><b>${uiText("workbench.pane.bound-goal")}</b></span>
          </div>
          <div class="tui-owner-actions">
            ${selected
              ? selected.statusHtml
              : `<span class="goal-status" data-tui-owner-status hidden><span data-tui-owner-status-label></span></span>`}
            <button class="tui-focus-return" type="button" data-tui-focus-return>${icon("target")}<span>${uiText("workbench.pane.return-focus")}</span></button>
          </div>
        </div>
        <div class="tui-tabs">
          <span class="tui-mode-label">${uiText("workbench.pane.terminal")}</span>
          <div class="tui-tab-list" data-tui-tabs data-overflow-fade></div>
          <button class="tui-add" type="button" data-tui-add aria-expanded="false" aria-controls="tui-open-menu" aria-haspopup="true" aria-label="${uiText("workbench.pane.add-terminal")}"${compoundParent ? ` disabled title="${escapeHtml(uiText.text("workbench.pane.open-specific-child-goal"))}"` : ""}>${icon("plus")}<span>${uiText("workbench.pane.add-terminal")}</span></button>
        </div>
        <div class="tui-stage">
          <section class="tui-parent-guard" data-tui-parent-guard${compoundParent ? "" : " hidden"}>
            <div class="tui-parent-guard-copy">
              ${icon("tree")}
              <div><strong>${uiText("workbench.pane.parent-goal-does-not-use-terminal-directly")}</strong><p>${compoundParentComplete
                ? uiText("workbench.pane.child-goals-have-completed-work-so-parent-goal")
                : uiText("workbench.pane.parent-goal-does-not-complete-its-own-when")}</p></div>
            </div>
            <div class="tui-child-choices" data-tui-child-choices>${childChoices || `<p>${uiText("workbench.pane.there-no-child-goal-ready-work-check-how")}</p>`}</div>
          </section>
          <div class="tui-chrome">
            <div class="tui-chrome-actions">
              <button class="mw-btn mw-btn--primary tui-advance" type="button" data-tui-advance disabled>${icon("play")}<span>${uiText("workbench.pane.advance-goal")}</span></button>
              <button class="mw-btn mw-btn--secondary" type="button" data-tui-copy>${icon("copy")}<span>${uiText("workbench.pane.copy-command")}</span></button>
              <button class="mw-btn mw-btn--ghost" type="button" data-tui-fill disabled>${uiText("workbench.pane.fill-without-sending")}</button>
              <button class="mw-btn mw-btn--ghost" type="button" data-tui-reopen hidden>${icon("refresh")}<span>${uiText("workbench.pane.reopen")}</span></button>
            </div>
            <p class="tui-status" data-tui-status role="status"></p>
          </div>
          <div class="tui-terminal" data-tui-terminal>
            <div class="tui-empty" data-tui-empty>
              <span class="tui-empty-mark" aria-hidden="true">${icon("terminal")}</span>
              <p><strong>${compoundParent ? uiText("workbench.pane.parent-goal-does-not-use-terminal-directly") : uiText("workbench.pane.no-terminal-yet")}</strong></p>
              <p>${compoundParent ? uiText("workbench.pane.open-specific-child-goal-above") : uiText("workbench.pane.choose-runtime-custom-command-work-goal")}</p>
              <button type="button" class="mw-btn mw-btn--primary" data-tui-empty-add aria-haspopup="true" aria-controls="tui-open-menu" aria-expanded="false"${compoundParent ? " hidden" : ""}>${icon("plus")}${uiText("workbench.pane.add-terminal")}</button>
            </div>
          </div>
        </div>
        <form class="tui-menu" id="tui-open-menu" data-tui-menu aria-hidden="true" inert>
          <strong>${uiText("workbench.pane.open-terminal-goal")}</strong>
          <p>${uiText("workbench.pane.tab-belongs-only-current-goal-opening-does-not")}</p>
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
