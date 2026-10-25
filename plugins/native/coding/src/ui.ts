import { codingUsageSummary } from "./usage.js";
import { CODING_SESSION_MARKS } from "./session-marks.js";
import type {
  SettingsPageModel,
  UiContribution,
  UiContributionDeclaration,
  UiNestedContentModel,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderButton, renderDirectoryHeading, renderDirectoryPanel, renderSidebar } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { AgentRunUsage } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CodingIdentityView } from "./identity.js";
import { codingAgentManifest } from "./roles.js";
import {
  filterSessions,
  groupByGoal,
  type CodingDirectoryFilter,
  type CodingSessionEntry,
  type CodingToolAvailability,
} from "./projection.js";

export const CODING_UI_CONTRIBUTION_ID = "io.molis.work.native.coding.ui.v1";
export const CODING_SETTINGS_UI_CONTRIBUTION_ID = "io.molis.work.native.coding.settings.v1";

/**
 * The two places Coding's page opens for the plugins it embeds (`ui.embedded_plugins`): their browsers' lists go in the directory
 * column, their readers beside the conversation. An embedded plugin fills one by declaring a surface that targets its id.
 */
export const CODING_COMPANION_DIRECTORY_SLOT = "coding.companion-directory";
export const CODING_COMPANION_RESULT_SLOT = "coding.companion-result";

export type CodingUiSurface = "directory" | "workbench";

/**
 * The five navigation faces the directory column switches between. Every face changes the directory column only:
 * the session list, the session's task outline, its Goal, the saved results, or the workspace files. The main area
 * keeps whatever it shows; the full-width TaskBoard is a view of the main area, switched from its own header.
 */
export const CODING_DIRECTORY_FACES = [
  { face: "sessions", label: "coding.face.sessions", icon: "message" },
  { face: "taskboard", label: "TaskBoard", icon: "board" },
  { face: "goals", label: "coding.face.goals", icon: "target" },
  { face: "artifacts", label: "coding.face.artifacts", icon: "package" },
  { face: "files", label: "coding.face.files", icon: "folder" },
] as const;

export type CodingDirectoryFace = (typeof CODING_DIRECTORY_FACES)[number]["face"];

export interface CodingUiPrimitives {
  escape(value: unknown): string;
  icon(name: string): string;
  text(value: string, values?: Record<string, string | number>): string;
  formatDate(value: string): string;
}

export interface CodingUiModel extends UiNestedContentModel {
  readonly route_prefix: string;
  readonly face: CodingDirectoryFace;
  readonly filter: CodingDirectoryFilter;
  readonly sessions: readonly CodingSessionEntry[];
  readonly tools: readonly CodingToolAvailability[];
  /** Host-authorized workspace, or null when this project has none bound. */
  readonly workspace_path: string | null;
  readonly primitives: CodingUiPrimitives;
}

export const codingUiDescriptor: UiContributionDeclaration = {
  contribution_id: CODING_UI_CONTRIBUTION_ID,
  kind: "primary-page",
  navigation_id: "coding",
  label: "Coding",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [
    { slot_id: CODING_COMPANION_DIRECTORY_SLOT, version: 1, accepts: ["declarative-html"] },
    { slot_id: CODING_COMPANION_RESULT_SLOT, version: 1, accepts: ["declarative-html"] },
  ],
};


export const codingUiContribution: UiContribution<CodingUiModel> = {
  descriptor: codingUiDescriptor,
  render(request: UiRenderRequest<CodingUiModel>): string {
    switch (request.surface as CodingUiSurface) {
      case "directory":
        return renderCodingDirectory(request.model);
      case "workbench":
        return renderCodingWorkbench(request.model);
      default:
        throw new Error(`Coding UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

/**
 * What the platform hands any plugin's stage when it renders: the route prefix, the shared primitives and what the plugins this one
 * embeds drew in its slots. The rest of Coding's page is Coding's own: its face, the session directory and the primitives it brings.
 */
export interface CodingUiHostModel extends UiNestedContentModel {
  readonly route_prefix: string;
  readonly primitives: Pick<CodingUiPrimitives, "escape" | "text"> & Partial<CodingUiPrimitives>;
}

const codingIcon = (name: string): string => icon(name as Parameters<typeof icon>[0]);
const codingDate = (value: string): string => value.slice(0, 10);

/**
 * Coding's page as one started plugin gives it: the session directory is read from the plugin's own store (`directory`) each time
 * the page renders, so the Host never reads Coding's tables to draw it (PG-091, V-14). The page opens on the sessions face with every
 * session listed; the tool tabs and the workspace path are drawn by Coding's own client.
 */
export function codingUiView(directory: () => readonly CodingSessionEntry[]): UiContribution<CodingUiHostModel> {
  return {
    descriptor: codingUiDescriptor,
    render: request => codingUiContribution.render({ ...request, model: {
      route_prefix: request.model.route_prefix, face: "sessions", filter: "all", tools: [], workspace_path: null,
      ...(request.model.nested ? { nested: request.model.nested } : {}), sessions: directory(),
      primitives: { icon: codingIcon, formatDate: codingDate, ...request.model.primitives },
    } }),
  };
}

export function renderCodingDirectory(model: CodingUiModel): string {
  const { primitives: p } = model;
  const faces = CODING_DIRECTORY_FACES.map((face) => `<button type="button" class="mw-toggle coding-face" data-coding-face="${face.face}" aria-pressed="${face.face === model.face}" title="${p.escape(p.text(face.label))}" aria-label="${p.escape(p.text(face.label))}">${p.icon(face.icon)}</button>`).join("");
  const filters = (["all", "running", "needs-you"] as const).map((filter) => `<button type="button" class="mw-toggle coding-filter" data-coding-filter="${filter}" aria-pressed="${filter === model.filter}">${p.escape(filterLabel(filter, p))}</button>`).join("");
  const groups = groupByGoal(filterSessions(model.sessions, model.filter))
    .map((group) => renderCodingSessionGroup(group.goal_id, group.goal_id === null ? p.text("coding.directory.no-goal") : group.title, group.entries, p))
    .join("");
  return renderSidebar({className:"coding-directory",attrs:{"data-coding-directory":"","data-coding-current-face":model.face},
    body: renderDirectoryPanel({pluginId:"coding",embedded:true,label:faceLabel(model.face, p),listLabel:p.text("coding.directory.list"),listRole:"none",
      tools: renderButton({label:p.text("coding.directory.search-toggle"),icon:"search",iconOnly:true,variant:"ghost",attrs:{"data-coding-search-toggle":"","aria-expanded":false}}),
      body: `<nav class="coding-faces" aria-label="${p.escape(p.text("coding.directory.faces"))}">${faces}</nav>
      <div class="coding-query" data-coding-query hidden><label class="coding-search"><span class="mw-sr-only">${p.escape(p.text("coding.directory.search-title"))}</span><input class="mw-input" data-coding-search aria-label="${p.escape(p.text("coding.directory.search-sessions"))}" placeholder="${p.escape(p.text("coding.directory.search-sessions"))}"></label><div class="coding-filters mw-toggle-group" role="group" aria-label="${p.escape(p.text("coding.directory.filters"))}">${filters}</div></div>
      <div class="coding-session-list" data-coding-sessions>${groups || renderEmpty(p)}</div>
      <details data-coding-archived><summary>${p.escape(p.text("coding.session.archived-list"))}</summary><div data-coding-archived-list role="status"></div></details>
    <section class="coding-face-panel" data-coding-board-outline hidden aria-label="${p.escape(p.text("coding.outline.label"))}">
      <p class="coding-face-meta" data-coding-outline-meta hidden></p>
      <div class="coding-outline" data-coding-outline-list></div>
      <p class="coding-face-note" data-coding-outline-status role="status"></p>
      ${renderButton({label:p.text("coding.outline.expand"),icon:"maximize",variant:"ghost",disabled:true,attrs:{"data-coding-board-expand":"",title:p.text("coding.outline.expand-title")}})}
    </section>
    <section class="coding-face-panel" data-coding-goal-face hidden aria-label="${p.escape(p.text("coding.goal-face.label"))}">
      <div class="coding-goal-face-current" data-coding-goal-face-current><span>${p.escape(p.text("coding.goal-face.open-session-first"))}</span></div>
      <div class="coding-goal-face-actions">${renderButton({label:p.text("coding.goal.link"),icon:"target",variant:"ghost",disabled:true,attrs:{"data-coding-goal-face-open":""}})}${renderButton({label:p.text("coding.goal-face.visit"),icon:"external",variant:"ghost",attrs:{"data-coding-goal-face-visit":"",hidden:true}})}</div>
      <p class="coding-face-note">${p.escape(p.text("coding.goal-face.note"))}</p>
    </section>
    <section class="coding-face-panel" data-coding-artifact-directory hidden aria-label="${p.escape(p.text("coding.artifacts.label"))}">
      <label class="coding-search"><span class="mw-sr-only">${p.escape(p.text("coding.artifacts.search"))}</span><input class="mw-input" data-coding-artifact-search aria-label="${p.escape(p.text("coding.artifacts.search-fixed"))}" placeholder="${p.escape(p.text("coding.artifacts.search-fixed"))}"></label>
      <p class="coding-face-note" data-coding-artifact-status role="status"></p><div class="coding-outline" data-coding-artifact-list></div>
      ${renderButton({label:p.text("coding.artifacts.refresh"),icon:"refresh",variant:"ghost",attrs:{"data-coding-artifact-refresh":""}})}
    </section>
    ${model.nested?.[CODING_COMPANION_DIRECTORY_SLOT] ?? ""}`,
      add:{label:p.text("coding.directory.new"),attrs:{"data-coding-new":""}}
    })});
}

/**
 * One session's row, the same row the page's live list draws over it (client.ts `renderDirectory`): its title and time, then its
 * state in words with the state ring, so the first paint already has the ring and nothing moves when the list takes over.
 */
export function renderCodingSessionRow(entry: CodingSessionEntry, p: CodingUiPrimitives): string {
  const mark = CODING_SESSION_MARKS[entry.state], id = p.escape(entry.session_id);
  return `<a class="mw-dir-row mw-dir-row--meta coding-session-row" href="#session-${p.escape(encodeURIComponent(entry.session_id))}" data-coding-session="${id}" aria-current="false">`
    + `<span class="mw-dir-row__icon">${p.icon(CODING_DIRECTORY_FACES[0].icon)}</span><span class="mw-dir-row__copy"><span class="mw-dir-row__headline">`
    + `<strong class="coding-session-title" title="${p.escape(entry.title)}">${p.escape(entry.title)}</strong><time class="mw-dir-row__count coding-session-time" datetime="${p.escape(entry.updated_at)}">${p.escape(p.formatDate(entry.updated_at))}</time></span>`
    + `<small class="coding-session-state" data-state="${p.escape(entry.state)}" data-mw-state="${mark.ring}">${p.escape(p.text(mark.label))}</small></span></a>`;
}

/** A Goal's sessions under its heading (or the real group of sessions with no Goal). */
export function renderCodingSessionGroup(goalId: string | null, title: string, entries: readonly CodingSessionEntry[], p: CodingUiPrimitives): string {
  return `<section class="coding-session-group"${goalId === null ? "" : ` data-coding-goal="${p.escape(goalId)}"`}>
    ${renderDirectoryHeading(title)}
    ${entries.map((entry) => renderCodingSessionRow(entry, p)).join("")}
  </section>`;
}

// Matches the client's directory empty state; the add row below and the stage own the create action.
function renderEmpty(p: CodingUiPrimitives): string {
  return `<div class="mw-empty" data-coding-empty><p>${p.escape(p.text("coding.directory.empty"))}</p></div>`;
}

export function renderCodingWorkbench(model: CodingUiModel): string {
  const { primitives: p } = model;
  // Relative global URL survives the host's project-local link prefixing.
  const up = "../".repeat(model.route_prefix.split("/").filter(Boolean).length), project = encodeURIComponent(model.route_prefix.split("/").filter(Boolean).at(-1) ?? "");
  const settingsHref = up + "settings/coding-settings?project=" + project;
  const accessHref = up + "capabilities/access?client=agent%3Aprologue&project=" + project;
  const tools = model.tools.map((tool) => renderToolTab(tool, p)).join("");
  const panels = model.tools.map((tool) => renderToolPanel(tool, p)).join("");
  return `<section class="desktop-work-surface plugin-stage-shell mw-layout-primitives" data-work-surface="coding" data-work-surface-label="Coding" hidden data-coding-workbench data-coding-prefix="${p.escape(model.route_prefix)}">
    <dialog class="mw-dialog mw-dialog--form" data-coding-step-dialog aria-label="${p.escape(p.text("coding.step.title"))}"><div class="mw-form mw-dialog__shell">
      <header class="mw-form__header"><h2>${p.escape(p.text("coding.step.title"))}</h2>${renderButton({label:p.text("coding.common.close"),variant:"ghost",attrs:{"data-coding-step-close":""}})}</header>
      <section class="mw-form__body"><div data-coding-step-detail></div><p>${p.escape(p.text("coding.step.note"))}</p>
      <label class="mw-field"><span>${p.escape(p.text("coding.step.notes-label"))}</span><textarea class="mw-input" rows="4" maxlength="4000" data-coding-step-notes></textarea></label><p data-coding-step-status role="status"></p></section>
      <footer class="mw-form__footer">${renderButton({label:p.text("coding.step.refresh"),variant:"secondary",attrs:{"data-coding-step-refresh":""}})}${renderButton({label:p.text("coding.step.accept"),attrs:{"data-coding-step-accept":""}})}${renderButton({label:p.text("coding.step.reject"),variant:"secondary",attrs:{"data-coding-step-reject":""}})}${renderButton({label:p.text("coding.step.rework"),variant:"secondary",attrs:{"data-coding-step-rework":""}})}</footer>
    </div></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-integration-dialog aria-label="${p.escape(p.text("coding.integration.title"))}"><div class="mw-form mw-dialog__shell">
      <header class="mw-form__header"><h2>${p.escape(p.text("coding.integration.title"))}</h2>${renderButton({label:p.text("coding.common.close"),variant:"ghost",attrs:{"data-coding-integration-close":""}})}</header>
      <section class="mw-form__body"><p data-coding-integration-source></p><p data-coding-integration-target></p>
      <p>${p.escape(p.text("coding.integration.note"))}</p>
      <div data-coding-integration-files></div><p data-coding-integration-status role="status"></p><div data-coding-integration-reviews></div></section>
      <footer class="mw-form__footer">${renderButton({label:p.text("coding.integration.refresh"),variant:"secondary",attrs:{"data-coding-integration-refresh":""}})}${renderButton({label:p.text("coding.integration.prepare"),attrs:{"data-coding-integration-prepare":"",disabled:true}})}</footer>
    </div></dialog>
    <dialog class="mw-dialog coding-palette" data-coding-palette aria-label="${p.escape(p.text("coding.palette.label"))}"><div class="coding-palette-shell">
      <input class="mw-input" data-coding-palette-input placeholder="${p.escape(p.text("coding.palette.placeholder"))}" role="combobox" aria-expanded="true" aria-controls="coding-palette-list" aria-autocomplete="list" aria-label="${p.escape(p.text("coding.palette.search"))}" autocomplete="off">
      <ul class="coding-palette-list" id="coding-palette-list" data-coding-palette-list role="listbox" aria-label="${p.escape(p.text("coding.palette.list"))}"></ul>
      <p class="coding-palette-foot">${p.escape(p.text("coding.palette.foot"))}</p>
    </div></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-delegate-dialog aria-label="${p.escape(p.text("coding.delegate.title"))}"><form class="mw-form mw-dialog__shell">
      <header class="mw-form__header"><h2>${p.escape(p.text("coding.delegate.title"))}</h2></header>
      <section class="mw-form__body"><p>${p.escape(p.text("coding.delegate.note"))}</p>
      <label class="mw-field"><span>${p.escape(p.text("coding.delegate.title-label"))}</span><input class="mw-input" data-coding-delegate-title maxlength="80" placeholder="${p.escape(p.text("coding.delegate.title-placeholder"))}"></label>
      <label class="mw-field"><span>${p.escape(p.text("coding.delegate.task-label"))}</span><textarea class="mw-textarea" rows="5" maxlength="20000" data-coding-delegate-task required></textarea></label>
      <fieldset class="mw-field coding-delegate-outputs"><legend>${p.escape(p.text("coding.delegate.outputs-legend"))}</legend><div data-coding-delegate-outputs></div>${renderButton({label:p.text("coding.delegate.pick"),variant:"secondary",attrs:{"data-coding-delegate-pick":""}})}</fieldset>
      <p data-coding-delegate-status role="status"></p></section>
      <footer class="mw-form__footer">${renderButton({label:p.text("coding.common.cancel"),variant:"secondary",attrs:{"data-coding-delegate-cancel":""}})}<button class="mw-btn mw-btn--primary" type="submit" data-coding-delegate-create>${p.escape(p.text("coding.delegate.create"))}</button></footer>
    </form></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-writer-directories-dialog aria-label="${p.escape(p.text("coding.worktrees.title"))}"><div class="mw-form mw-dialog__shell">
      <header class="mw-form__header"><h2>${p.escape(p.text("coding.worktrees.title"))}</h2>${renderButton({label:p.text("coding.common.close"),variant:"ghost",attrs:{"data-coding-writer-directories-close":""}})}</header>
      <section class="mw-form__body"><div><p data-coding-writer-parent></p><p>${p.escape(p.text("coding.worktrees.note"))}</p>
      <p>${p.escape(p.text("coding.worktrees.note-parallel"))}</p></div>
      <div data-coding-writer-directories-list></div><p data-coding-writer-directories-status role="status"></p><div data-coding-writer-directory-reviews></div></section>
      <footer class="mw-form__footer">${renderButton({label:p.text("coding.worktrees.refresh"),variant:"secondary",attrs:{"data-coding-writer-directories-refresh":""}})}${renderButton({label:p.text("coding.worktrees.save"),variant:"secondary",attrs:{"data-coding-writer-assignments-save":""}})}${renderButton({label:p.text("coding.worktrees.create"),attrs:{"data-coding-writer-directories-create":""}})}</footer>
    </div></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-workspace-dialog aria-label="${p.escape(p.text("coding.workspace.title"))}"><form class="mw-form mw-dialog__shell" data-coding-workspace-form>
      <header class="mw-form__header"><h2>${p.escape(p.text("coding.workspace.title"))}</h2><button class="mw-btn" type="button" data-coding-workspace-close>${p.escape(p.text("coding.common.close"))}</button></header>
      <section class="mw-form__body"><label class="mw-field">${p.escape(p.text("coding.workspace.linked"))}<select class="mw-select" data-coding-workspace-choice></select></label>
      <label class="mw-field">${p.escape(p.text("coding.workspace.link-new"))}<input class="mw-input" data-coding-workspace-path placeholder="${p.escape(p.text("coding.workspace.path-placeholder"))}" autocomplete="off"></label>
      <label class="mw-field"><span><input type="checkbox" data-coding-workspace-confirm> ${p.escape(p.text("coding.workspace.confirm"))}</span></label>
      <p>${p.escape(p.text("coding.workspace.note"))}</p><p data-coding-workspace-error role="alert"></p></section>
      <footer class="mw-form__footer"><button class="mw-btn mw-btn--primary" type="submit">${p.escape(p.text("coding.workspace.use"))}</button></footer>
    </form></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-actions-dialog aria-label="${p.escape(p.text("coding.actions.label"))}"><form class="mw-form mw-dialog__shell" data-coding-actions-form>
      <header class="mw-form__header"><h2>${p.escape(p.text("coding.actions.title"))}</h2>${renderButton({label:p.text("coding.common.cancel"),variant:"ghost",attrs:{"data-coding-actions-close":""}})}</header>
      <section class="mw-form__body"><p>${p.escape(p.text("coding.actions.note"))}</p>
      <p><a href="${p.escape(accessHref)}">${p.escape(p.text("coding.actions.manage-access"))}</a></p><div data-coding-actions-list></div><p role="alert" data-coding-actions-error></p></section>
      <footer class="mw-form__footer">${renderButton({label:p.text("coding.actions.save"),type:"submit",attrs:{"data-coding-actions-save":""}})}</footer>
    </form></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-mcp-dialog aria-label="${p.escape(p.text("coding.mcp.title"))}"><form class="mw-form mw-dialog__shell" data-coding-mcp-form>
      <header class="mw-dialog__header"><h2>${p.escape(p.text("coding.mcp.title"))}</h2>${renderButton({label:p.text("coding.common.cancel"),variant:"ghost",attrs:{"data-coding-mcp-close":""}})}</header>
      <p>${p.escape(p.text("coding.mcp.note"))}</p>
      <p><a data-coding-mcp-settings-link href="${p.escape(settingsHref)}">${p.escape(p.text("coding.mcp.configure"))}</a></p>
      <div data-coding-mcp-list></div><p role="alert" data-coding-mcp-error></p>
      <footer class="mw-dialog__footer">${renderButton({label:p.text("coding.mcp.save"),type:"submit"})}</footer>
    </form></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-goal-dialog aria-label="${p.escape(p.text("coding.goal.link"))}"><form class="mw-form mw-dialog__shell" data-coding-goal-form>
      <header class="mw-form__header"><h2>${p.escape(p.text("coding.goal.title"))}</h2>${renderButton({label:p.text("coding.common.cancel"),variant:"ghost",attrs:{"data-coding-goal-close":""}})}</header>
      <section class="mw-form__body"><p>${p.escape(p.text("coding.goal.note"))}</p>
        ${renderButton({label:p.text("coding.goal.none"),variant:"secondary",attrs:{"data-coding-goal-none":""}})}
        <label class="mw-form__field">${p.escape(p.text("coding.goal.search"))}<input class="mw-input" data-coding-goal-search type="search"></label>
        <div data-coding-goal-list></div>${renderButton({label:p.text("coding.goal.more"),variant:"ghost",attrs:{"data-coding-goal-more":"",hidden:""}})}
        <section class="coding-material" data-coding-goal-preview></section><p data-coding-goal-error role="alert"></p>
      </section><footer class="mw-form__footer">${renderButton({label:p.text("coding.goal.save"),type:"submit",attrs:{"data-coding-goal-save":""}})}</footer>
    </form></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-progress-dialog aria-label="${p.escape(p.text("coding.progress.title"))}"><form class="mw-form mw-dialog__shell" data-coding-progress-form>
      <header class="mw-form__header"><h2>${p.escape(p.text("coding.progress.title"))}</h2>${renderButton({label:p.text("coding.common.close"),variant:"ghost",attrs:{"data-coding-progress-close":""}})}</header>
      <section class="mw-form__body"><p>${p.escape(p.text("coding.progress.note"))}</p>
        <section class="coding-material" data-coding-progress-facts></section>
        <details class="coding-material"><summary>${p.escape(p.text("coding.progress.source"))}</summary><pre data-coding-progress-source></pre></details>
        <label class="mw-form__field">${p.escape(p.text("coding.progress.summary"))}<textarea class="mw-textarea" data-coding-progress-summary maxlength="10000" rows="4" placeholder="${p.escape(p.text("coding.progress.summary-placeholder"))}"></textarea></label>
        <label class="mw-form__field">${p.escape(p.text("coding.progress.next"))}<textarea class="mw-textarea" data-coding-progress-next maxlength="10000" rows="2"></textarea></label>
        <p data-coding-progress-status role="status"></p>
      </section><footer class="mw-form__footer">
        ${renderButton({label:p.text("coding.progress.refresh"),variant:"secondary",attrs:{"data-coding-progress-refresh":""}})}
        ${renderButton({label:p.text("coding.progress.goal"),variant:"secondary",attrs:{"data-coding-progress-goal":"",hidden:""}})}
        ${renderButton({label:p.text("coding.progress.save"),type:"submit",attrs:{"data-coding-progress-save":""}})}
      </footer>
    </form></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-character-dialog aria-label="${p.escape(p.text("coding.character.title"))}"><form class="mw-form mw-dialog__shell" data-coding-character-form>
      <header class="mw-form__header"><h2>${p.escape(p.text("coding.character.title"))}</h2>${renderButton({label:p.text("coding.common.cancel"),variant:"ghost",attrs:{"data-coding-character-close":""}})}</header>
      <section class="mw-form__body"><p>${p.escape(p.text("coding.character.note"))}</p><div data-coding-character-list></div><p data-coding-character-error role="alert"></p></section>
      <footer class="mw-form__footer">${renderButton({label:p.text("coding.character.save"),type:"submit",attrs:{"data-coding-character-save":""}})}</footer>
    </form></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-method-dialog aria-label="${p.escape(p.text("coding.method.title"))}"><form class="mw-form mw-dialog__shell" data-coding-method-form>
      <header class="mw-form__header"><h2>${p.escape(p.text("coding.method.title"))}</h2>${renderButton({label:p.text("coding.common.cancel"),variant:"secondary",attrs:{"data-coding-method-close":""}})}</header>
      <section class="mw-form__body"><label class="mw-field">${p.escape(p.text("coding.method.search"))}<input class="mw-input" data-coding-method-search placeholder="${p.escape(p.text("coding.method.search-placeholder"))}"></label>
      <p>${p.escape(p.text("coding.method.note"))}</p>
      <div data-coding-method-list></div><article data-coding-method-document hidden></article><p data-coding-method-error role="alert"></p></section>
      <footer class="mw-form__footer">${renderButton({label:p.text("coding.method.save"),variant:"primary",type:"submit"})}</footer>
    </form></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-plan-dialog aria-label="${p.escape(p.text("coding.plan.title"))}"><form class="mw-form mw-dialog__shell" data-coding-plan-form>
      <header class="mw-form__header"><h2>${p.escape(p.text("coding.plan.title"))}</h2>${renderButton({label:p.text("coding.common.close"),variant:"secondary",attrs:{"data-coding-plan-close":""}})}</header>
      <section class="mw-form__body"><p data-coding-plan-help>${p.escape(p.text("coding.plan.help"))}</p><div data-coding-plan-fields></div><p role="alert" data-coding-plan-error></p></section>
      <footer class="mw-form__footer">${renderButton({label:p.text("coding.plan.save"),variant:"primary",type:"submit",attrs:{"data-coding-plan-save":""}})}</footer>
    </form></dialog>
    <div class="coding-layout">${renderCodingDirectory(model)}
    <div class="coding-stage" data-coding-stage>
      <section class="coding-start" aria-label="Coding"><div class="coding-start-hero"><span class="coding-start-mark">${p.icon("code")}</span><h2>${p.escape(p.text("coding.start.title"))}</h2><p>${p.escape(p.text("coding.start.lede"))}</p>${renderButton({label:p.text("coding.start.new"),variant:"primary",icon:"plus",attrs:{"data-coding-new":""}})}<small>${p.escape(p.text("coding.start.existing"))}</small></div></section>
      <div class="coding-dialogue mw-frame" data-slot="frame" data-coding-dialogue>
        <header class="coding-dialogue-head mw-frame__header" data-coding-dialogue-head>
          <div class="coding-identity"><button class="mw-btn mw-btn--ghost mw-btn--icon-only coding-directory-back" type="button" data-coding-directory-back aria-label="${p.escape(p.text("coding.dialogue.back-to-list"))}" title="${p.escape(p.text("coding.dialogue.session-list"))}">${p.icon("chevron-left")}</button><div class="coding-identity-copy mw-frame__heading"><h2 data-coding-title>${p.escape(p.text("coding.dialogue.empty-title"))}</h2><p class="coding-workspace-chip" data-coding-workspace-label>${renderWorkspaceLine(model.workspace_path, p)}</p></div></div>
          <div class="coding-head-actions"><div class="mw-toggle-group coding-view-switch" role="group" aria-label="${p.escape(p.text("coding.view.label"))}"><button class="mw-toggle is-current" type="button" data-coding-view="dialogue" aria-pressed="true">${p.escape(p.text("coding.view.dialogue"))}</button><button class="mw-toggle" type="button" data-coding-view="board" aria-pressed="false" title="${p.escape(p.text("coding.view.board-title"))}">${p.escape(p.text("coding.view.board"))}<span class="coding-view-count" data-coding-view-board-count hidden></span></button></div><span class="coding-phase" data-coding-phase hidden></span><button class="mw-btn mw-btn--ghost coding-priority-toggle" type="button" data-coding-priority aria-pressed="false" title="${p.escape(p.text("coding.priority.title"))}" hidden>${p.escape(p.text("coding.priority.mark"))}</button><button class="mw-btn mw-btn--ghost coding-results-toggle" type="button" data-coding-results-open aria-label="${p.escape(p.text("coding.results.title"))}">${p.icon("panel")}<span data-coding-results-label>${p.escape(p.text("coding.results.title"))}</span></button></div>
        </header>
        <section class="coding-delegation-banner" data-coding-delegation-banner aria-label="${p.escape(p.text("coding.delegation.banner"))}" hidden></section>
        <template data-coding-welcome-template><div class="coding-welcome" data-coding-welcome><p class="coding-welcome-kicker">${p.icon("folder")}<span data-coding-welcome-workspace>${p.escape(model.workspace_path ? model.workspace_path.split("/").filter(Boolean).at(-1) ?? model.workspace_path : p.text("coding.welcome.workspace"))}</span></p><h2>${p.escape(p.text("coding.welcome.title"))}</h2><p>${p.escape(p.text("coding.welcome.lede"))}</p><div class="coding-starters">${[
          ["check",p.text("coding.starter.fix-tests"),"execute",p.text("coding.starter.fix-tests-prompt")],
          ["folder-tree",p.text("coding.starter.map-project"),"discuss",p.text("coding.starter.map-project-prompt")],
          ["search",p.text("coding.starter.review-changes"),"review",p.text("coding.starter.review-changes-prompt")],
          ["plus",p.text("coding.starter.add-tests"),"execute",p.text("coding.starter.add-tests-prompt")],
        ].map(([icon,title,intent,prompt])=>`<button class="coding-starter" type="button" data-coding-prompt="${p.escape(prompt)}" data-coding-prompt-intent="${intent}">${p.icon(icon as Parameters<typeof p.icon>[0])}<strong>${p.escape(title)}</strong><small>${p.escape({execute:p.text("coding.board.col.run"),discuss:p.text("coding.intent.discuss"),review:p.text("coding.intent.review")}[intent as "execute"])}</small></button>`).join("")}</div></div></template>
        <div class="coding-turns mw-scroll mw-frame__panel" data-coding-turns tabindex="0" aria-label="${p.escape(p.text("coding.dialogue.turns"))}"></div>
        <section class="coding-turns" data-coding-report-reader aria-label="${p.escape(p.text("coding.report.label"))}" tabindex="0" hidden>
          <header><button class="mw-btn mw-btn--ghost" type="button" data-coding-report-close>${p.icon("chevron-left")}<span>${p.escape(p.text("coding.report.back"))}</span></button><button class="mw-btn mw-btn--primary" type="button" data-coding-report-save>${p.escape(p.text("coding.report.save"))}</button><button class="mw-btn mw-btn--ghost" type="button" data-coding-report-progress hidden>${p.escape(p.text("coding.progress.title"))}</button><button class="mw-btn mw-btn--ghost" type="button" data-coding-report-output hidden>${p.escape(p.text("coding.report.set-output"))}</button></header>
          <p data-coding-report-status role="status"></p><p data-coding-report-output-status role="status" hidden></p><div data-coding-report-body></div>
        </section>
        <section class="coding-board mw-scroll" data-coding-board aria-label="TaskBoard" tabindex="0" hidden>
          <header class="coding-board-head"><div class="coding-board-heading"><h2 data-coding-board-title>TaskBoard</h2><p data-coding-board-meta></p></div><button class="mw-btn mw-btn--ghost" type="button" data-coding-board-close>${p.icon("chevron-left")}<span>${p.escape(p.text("coding.board.back"))}</span></button></header>
          <div class="coding-board-columns" aria-hidden="true"><span>${p.escape(p.text("coding.board.col.task"))}</span><span>${p.escape(p.text("coding.board.col.status"))}</span><span>${p.escape(p.text("coding.board.col.progress"))}</span><span>${p.escape(p.text("coding.board.col.needs"))}</span><span>${p.escape(p.text("coding.board.col.run"))}</span></div>
          <div class="coding-board-list" data-coding-board-list></div>
          <p class="coding-board-note" data-coding-board-status role="status"></p>
        </section>
        <button class="mw-btn coding-jump" type="button" data-coding-latest hidden>${p.icon("chevron-down")}<span>${p.escape(p.text("coding.dialogue.latest"))}</span></button>
        <p class="coding-status" data-coding-status role="status" aria-live="polite"></p>
        <div class="coding-queued" data-coding-queued role="status" hidden></div>
        <form class="coding-composer mw-frame__footer" data-coding-composer><div data-coding-steps hidden></div>
          <div class="coding-context mw-toolbar" data-coding-context hidden aria-label="${p.escape(p.text("coding.context.label"))}">
          ${renderButton({label:p.text("coding.context.workspace"),icon:"folder",variant:"ghost",attrs:{"data-coding-workspace-open":""}})}
          ${renderButton({label:p.text("coding.goal.link"),icon:"target",variant:"ghost",disabled:true,attrs:{"data-coding-goal-open":""}})}
          ${renderButton({label:p.text("coding.worktrees.title"),icon:"git-branch",variant:"ghost",attrs:{"data-coding-writer-directories-open":""}})}${renderButton({label:p.text("coding.context.open-beside"),icon:"columns",iconOnly:true,variant:"ghost",attrs:{"data-coding-open-beside":"",title:p.text("coding.context.open-beside-title")}})}${renderButton({label:p.text("coding.context.rename"),icon:"edit",iconOnly:true,variant:"ghost",attrs:{"data-coding-rename":"",hidden:true,title:p.text("coding.context.rename-title")}})}${renderButton({label:p.text("coding.context.archive"),variant:"ghost",attrs:{"data-coding-archive":"",hidden:true}})}<small data-coding-goal-label></small></div>
          <div class="coding-composer-shell">
            <label class="mw-sr-only" for="coding-task">${p.escape(p.text("coding.composer.task-label"))}</label>
            <textarea class="mw-textarea" id="coding-task" data-coding-task data-fit rows="3" placeholder="${p.escape(p.text("coding.composer.placeholder"))}" aria-describedby="coding-slash-help" disabled></textarea>
            <span class="mw-sr-only" id="coding-slash-help">${p.escape(p.text("coding.composer.slash-help"))}</span>
            <div class="coding-slash" id="coding-slash-menu" data-coding-slash-menu role="listbox" aria-label="${p.escape(p.text("coding.slash.label"))}" hidden></div>
            <div class="coding-composer-bar">
              <div class="coding-composer-leading">
                <div class="coding-attach"><button class="mw-btn mw-btn--ghost mw-btn--icon-only coding-attach-toggle" type="button" data-coding-attach-toggle aria-expanded="false" aria-haspopup="menu" aria-label="${p.escape(p.text("coding.attach.label"))}" title="${p.escape(p.text("coding.attach.title"))}">${p.icon("plus")}</button>
                  <div class="coding-attach-menu" data-coding-attach-menu role="menu" hidden><div class="coding-composer-context" aria-label="${p.escape(p.text("coding.attach.menu"))}">${renderButton({label:p.text("coding.attach.material"),icon:"paperclip",variant:"ghost",attrs:{"data-coding-material-open":"","aria-label":p.text("coding.attach.material-label"),role:"menuitem"}})}${renderButton({label:p.text("coding.attach.character"),icon:"user",variant:"ghost",attrs:{"data-coding-character-open":"","aria-label":p.text("coding.character.title"),role:"menuitem"}})}${renderButton({label:p.text("coding.attach.method"),icon:"list",variant:"ghost",attrs:{"data-coding-method-open":"","aria-label":p.text("coding.method.title"),role:"menuitem"}})}${renderButton({label:p.text("coding.attach.actions"),icon:"workflow",variant:"ghost",attrs:{"data-coding-actions-open":"","aria-label":p.text("coding.actions.label"),role:"menuitem"}})}${renderButton({label:p.text("coding.attach.mcp"),icon:"network",variant:"ghost",attrs:{"data-coding-mcp-open":"","aria-label":p.text("coding.mcp.title"),role:"menuitem"}})}${renderButton({label:p.text("coding.delegate.title"),icon:"share",variant:"ghost",attrs:{"data-coding-delegate-open":"","aria-label":p.text("coding.attach.delegate-label"),role:"menuitem"}})}</div>
                  ${renderButton({label:p.text("coding.attach.context"),icon:"tune",variant:"ghost",attrs:{"data-coding-context-toggle":"","aria-expanded":false,title:p.text("coding.attach.context"),role:"menuitem"}})}</div></div>
                <select class="mw-select" data-coding-intent aria-label="${p.escape(p.text("coding.intent.label"))}"><option value="discuss">${p.escape(p.text("coding.intent.discuss"))}</option><option value="plan">${p.escape(p.text("coding.intent.plan"))}</option><option value="collaborate">${p.escape(p.text("coding.intent.collaborate"))}</option><option value="parallel" disabled>${p.escape(p.text("coding.intent.parallel"))}</option><option value="edit" disabled>${p.escape(p.text("coding.intent.edit-pending"))}</option><option value="execute" disabled>${p.escape(p.text("coding.intent.execute-pending"))}</option><option value="review">${p.escape(p.text("coding.intent.review"))}</option></select>
                <select class="mw-select" data-coding-model aria-label="${p.escape(p.text("coding.model.label"))}"></select><span class="coding-effort" data-coding-effort-wrap hidden><select class="mw-select" data-coding-effort aria-label="${p.escape(p.text("coding.effort.label"))}" title="${p.escape(p.text("coding.effort.title"))}"><option value="">${p.escape(p.text("coding.effort.default"))}</option><option value="low">${p.escape(p.text("coding.effort.low"))}</option><option value="medium">${p.escape(p.text("coding.effort.medium"))}</option><option value="high">${p.escape(p.text("coding.effort.high"))}</option></select></span><button class="mw-btn mw-btn--ghost" type="button" data-coding-model-switch hidden>${p.escape(p.text("coding.model.switch"))}</button>
              </div>
              <div class="coding-composer-trailing"><div class="coding-meter" data-coding-meter hidden>
                  <button class="mw-btn mw-btn--ghost coding-meter-toggle" type="button" data-coding-meter-toggle aria-expanded="false" aria-controls="coding-meter-panel" title="${p.escape(p.text("coding.meter.title"))}"><svg class="coding-meter-ring" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><circle cx="10" cy="10" r="8" data-coding-meter-fill></circle></svg><span data-coding-meter-label>${p.escape(p.text("coding.meter.label"))}</span></button>
                  <div class="coding-meter-panel" id="coding-meter-panel" data-coding-meter-panel role="region" aria-label="${p.escape(p.text("coding.meter.title"))}" hidden></div>
                </div>
                <span data-coding-mode hidden><select class="mw-select" data-coding-send-mode aria-label="${p.escape(p.text("coding.send-mode.label"))}" title="${p.escape(p.text("coding.send-mode.title"))}"><option value="next-boundary">${p.escape(p.text("coding.send-mode.next-boundary"))}</option><option value="interrupt">${p.escape(p.text("coding.send-mode.interrupt"))}</option><option value="after-run">${p.escape(p.text("coding.send-mode.after-run"))}</option></select></span><button class="mw-btn mw-btn--ghost" type="button" data-coding-pause title="${p.escape(p.text("coding.run.pause-title"))}" hidden>${p.escape(p.text("coding.run.pause"))}</button><button class="mw-btn mw-btn--danger-outline" type="button" data-coding-stop title="${p.escape(p.text("coding.run.stop-title"))}" hidden>${p.escape(p.text("coding.run.stop"))}</button><button class="mw-btn mw-btn--primary" type="submit" data-coding-send disabled>${p.escape(p.text("coding.composer.send"))}</button>
              </div>
            </div>
          </div>
          <a class="mw-btn mw-btn--ghost coding-model-setup" data-coding-model-setup href="/settings/models" hidden>${p.escape(p.text("coding.model.open-settings"))}</a><div class="coding-composer-footnote"><small data-coding-draft-status>${p.escape(p.text("coding.composer.draft-note"))}</small><small class="coding-model-note" data-coding-model-note hidden></small><span class="coding-composer-keys"><kbd class="mw-kbd" title="${p.escape(p.text("coding.keys.slash-title"))}">${p.escape(p.text("coding.keys.slash"))}</kbd><kbd class="mw-kbd" title="${p.escape(p.text("coding.keys.palette-title"))}">${p.escape(p.text("coding.keys.palette"))}</kbd><kbd class="mw-kbd" title="${p.escape(p.text("coding.keys.send-title"))}">⌘ / Ctrl ↵</kbd></span></div>
        </form>
      </div>
      <aside class="coding-tools" data-coding-tools>
        <nav class="coding-tool-tabs mw-toolbar" aria-label="${p.escape(p.text("coding.results.tools"))}"><h3 class="coding-tools-title">${p.escape(p.text("coding.results.title"))}</h3>${tools}<button class="mw-btn mw-btn--ghost coding-results-close" type="button" data-coding-results-close aria-label="${p.escape(p.text("coding.results.back"))}" title="${p.escape(p.text("coding.results.back"))}">${p.icon("x")}</button></nav>
        <nav class="coding-results-index" data-coding-results-index aria-label="${p.escape(p.text("coding.results.index"))}" hidden></nav>
        ${model.nested?.[CODING_COMPANION_RESULT_SLOT] ?? ""}
        <section class="coding-result" data-coding-subagents aria-label="${p.escape(p.text("coding.results.subagents"))}" hidden></section>
        <section class="coding-result coding-cooperation" data-coding-cooperation aria-label="${p.escape(p.text("coding.results.cooperation"))}" hidden></section>
        <section class="coding-result coding-background" data-coding-background aria-label="${p.escape(p.text("coding.results.background"))}" hidden></section>
        <section class="coding-result" data-coding-plan aria-label="${p.escape(p.text("coding.results.plan"))}" hidden></section>
        <section class="coding-result" data-coding-recovery hidden aria-label="${p.escape(p.text("coding.results.recovery"))}">
          <h3>${p.escape(p.text("coding.recovery.title"))}</h3>
          <p>${p.escape(p.text("coding.recovery.note"))}</p>
          <button class="mw-btn" type="button" data-coding-recovery-refresh>${p.escape(p.text("coding.recovery.refresh"))}</button>
          <p data-coding-recovery-status role="status"></p><div data-coding-recovery-list></div>
        </section>
        <div data-coding-host-reviews hidden aria-label="${p.escape(p.text("coding.results.reviews"))}"></div><div class="coding-result coding-facts" data-coding-result aria-label="${p.escape(p.text("coding.results.facts"))}"><p>${p.escape(p.text("coding.result.empty"))}</p></div>
        <section class="coding-result coding-outcomes" data-coding-outcomes hidden aria-labelledby="coding-outcomes-title"><h3 id="coding-outcomes-title">${p.escape(p.text("coding.outcomes.title"))}</h3><div data-coding-outcome-list></div></section>
        <section class="coding-change" data-coding-change-reader aria-labelledby="coding-change-title" hidden>
          <header class="coding-change-head">
            <div class="coding-change-heading"><h3 id="coding-change-title">${p.escape(p.text("coding.change.title"))}</h3><p data-coding-change-summary></p></div>
            <div class="coding-change-actions"><div class="mw-toggle-group coding-change-layout" data-slot="toggle-group" role="group" aria-label="${p.escape(p.text("coding.change.layout"))}"><button type="button" class="mw-toggle is-current" aria-pressed="true" data-coding-change-layout="unified">${p.escape(p.text("coding.change.layout.unified"))}</button><button type="button" class="mw-toggle" aria-pressed="false" data-coding-change-layout="split">${p.escape(p.text("coding.change.layout.split"))}</button></div><button class="mw-btn mw-btn--ghost" type="button" data-coding-change-patch disabled title="${p.escape(p.text("coding.change.copy-patch-title"))}">${p.escape(p.text("coding.change.copy-patch"))}</button>
              <span class="coding-change-fixed" data-coding-change-fixed hidden>${p.icon("lock")}<span></span></span>
              <button class="mw-btn mw-btn--primary" type="button" data-coding-change-save>${p.escape(p.text("coding.change.save"))}</button>
              <button class="mw-btn mw-btn--ghost" type="button" data-coding-change-output disabled>${p.escape(p.text("coding.change.set-output"))}</button>
              <button class="mw-btn mw-btn--ghost coding-change-close" type="button" data-coding-change-close aria-label="${p.escape(p.text("coding.change.close"))}" title="${p.escape(p.text("coding.change.close"))}">${p.icon("x")}</button>
            </div>
          </header>
          <p class="coding-change-status" data-coding-change-status role="status"></p>
          <nav class="coding-change-files" data-coding-change-files aria-label="${p.escape(p.text("coding.change.files"))}"></nav>
          <div class="coding-change-body" data-coding-change-body></div>
          <p class="coding-change-note">${p.escape(p.text("coding.change.note"))}</p>
          <section class="coding-change-feedback" aria-labelledby="coding-feedback-title">
            <header><h4 id="coding-feedback-title">${p.escape(p.text("coding.feedback.title"))}</h4><span data-coding-feedback-count></span></header>
            <p data-coding-feedback-hint>${p.escape(p.text("coding.feedback.hint"))}</p>
            <div data-coding-feedback-list></div>
            <div class="coding-change-feedback-foot"><button class="mw-btn mw-btn--primary" type="button" data-coding-feedback-return disabled>${p.escape(p.text("coding.feedback.return"))}</button></div>
          </section>
        </section>
        <section class="coding-result coding-commands" data-coding-commands aria-labelledby="coding-commands-title" hidden><h3 id="coding-commands-title">${p.escape(p.text("coding.commands.title"))}</h3></section>
        <section class="coding-result" data-coding-checkpoints aria-label="${p.escape(p.text("coding.checkpoints.title"))}">
          <details class="coding-checkpoints"><summary>${p.escape(p.text("coding.checkpoints.title"))}</summary><p>${p.escape(p.text("coding.checkpoints.note"))}</p>
          <button class="mw-btn" type="button" data-coding-checkpoints-refresh>${p.escape(p.text("coding.checkpoints.refresh"))}</button>
          <p data-coding-checkpoints-status role="status">${p.escape(p.text("coding.checkpoints.choose-session"))}</p><div data-coding-checkpoints-list></div></details>
        </section>${panels}
      </aside>
    </div></div>
  </section>`;
}

function renderWorkspaceLine(workspacePath: string | null, p: CodingUiPrimitives): string {
  // A project with no workspace bound says so; it never shows a guessed path.
  if (workspacePath === null) {
    return `<span class="mw-status" data-tone="attention" data-mw-state="unavailable">${p.escape(p.text("coding.workspace.unbound"))}</span>`;
  }
  return `<span class="coding-workspace" data-coding-workspace>${p.icon("folder")}${p.escape(workspacePath)}</span>`;
}

function renderToolTab(tool: CodingToolAvailability, p: CodingUiPrimitives): string {
  const label = toolLabel(tool.page, p);
  // An unusable page keeps its tab, disabled, carrying the reason: hiding it
  // would leave the user wondering where it went.
  return `<button type="button" class="coding-tool-tab" data-coding-tool="${tool.page}"${tool.available ? "" : " disabled"}${tool.reason === undefined ? "" : ` title="${p.escape(tool.reason)}"`}>${p.escape(label)}</button>`;
}

function renderToolPanel(tool: CodingToolAvailability, p: CodingUiPrimitives): string {
  if (!tool.available) {
    return `<div class="coding-tool-panel is-unavailable" data-coding-tool-panel="${tool.page}" hidden>
      <div class="mw-empty"><span class="mw-empty__mark">${p.icon("blocked")}</span><p>${p.escape(tool.reason ?? p.text("coding.tool.unavailable"))}</p></div>
    </div>`;
  }
  return `<div class="coding-tool-panel" data-coding-tool-panel="${tool.page}" hidden></div>`;
}

function faceLabel(face: CodingDirectoryFace, p: CodingUiPrimitives): string {
  return p.text(CODING_DIRECTORY_FACES.find((entry) => entry.face === face)?.label ?? face);
}

function filterLabel(filter: CodingDirectoryFilter, p: CodingUiPrimitives): string {
  if (filter === "all") return p.text("coding.filter.all");
  if (filter === "running") return p.text("coding.filter.running");
  return p.text("coding.filter.needs-you");
}

function toolLabel(page: CodingToolAvailability["page"], p: CodingUiPrimitives): string {
  if (page === "result") return p.text("coding.tool.result");
  if (page === "browser") return p.text("coding.tool.browser");
  if (page === "terminal") return p.text("coding.tool.terminal");
  return "Canvas";
}

export interface CodingSettingsModel {
  /** Roles this build offers, from the Agent Manifest. */
  readonly roles: ReadonlyArray<{ role_id: string; name: string; execution: string }>;
  /** Runtimes the Host registered, with whether each can run a writing role. */
  readonly runtimes: ReadonlyArray<{ runtime_id: string; display_name: string; can_write: boolean; can_command?: boolean; methods?: string }>;
  readonly methods?: ReadonlyArray<{ name: string; version: number; summary?: string }>;
  readonly project_href?: string | null;
  readonly project_name?: string;
  readonly projects?: ReadonlyArray<{ project_id: string; name: string }>;
  readonly primitives: Pick<CodingUiPrimitives, "escape" | "text">;
}

export const codingSettingsDescriptor: UiContributionDeclaration = {
  contribution_id: CODING_SETTINGS_UI_CONTRIBUTION_ID,
  kind: "settings-page",
  navigation_id: "coding-settings",
  label: "Coding",
  surfaces: [
    { surface_id: "settings", target_slot_id: "workbench.settings", format: "declarative-html" },
  ],
  slots: [],
};

/**
 * Coding's own settings.
 *
 * It states what this build can actually do rather than offering switches that
 * do nothing: which roles exist, and which Runtimes can carry a role that
 * writes. Model and credential settings belong to the Host and are linked, not
 * duplicated here.
 */
export function renderCodingSettings(model: CodingSettingsModel): string {
  const { primitives: p } = model;
  const roles = model.roles.map((role) => `<div class="settings-setting-row"><div class="setting-copy"><strong>${p.escape(p.text(role.name))}</strong><span>${p.escape(role.role_id === "writers" ? p.text("coding.settings.role.writers") : role.role_id === "coordinator" ? p.text("coding.settings.role.coordinator") : executionLabel(role.execution, p))}</span></div></div>`).join("");
  const runtimes = model.runtimes.length === 0
    ? `<p class="model-field-hint">${p.escape(p.text("coding.settings.no-runtimes"))}</p>`
    : model.runtimes.map((runtime) => `<div class="settings-setting-row"><div class="setting-copy"><strong>${p.escape(runtime.display_name)}</strong><span>${p.escape(runtime.can_write ? runtime.can_command ? p.text("coding.settings.runtime.write-command") : p.text("coding.settings.runtime.write") : p.text("coding.settings.runtime.read-only"))}</span><span>${p.escape(runtime.methods === "partial" ? p.text("coding.settings.runtime.methods-partial") : runtime.methods === "supported" ? p.text("coding.settings.runtime.methods-supported") : p.text("coding.settings.runtime.methods-none"))}</span></div></div>`).join("");
  const methods = (model.methods ?? []).map(method => `<div class="settings-setting-row"><div class="setting-copy"><strong>${p.escape(p.text(method.name))} · v${method.version}</strong><span>${p.escape(method.summary ? p.text(method.summary) : "")}</span></div></div>`).join("");
  return `<section class="settings-document coding-settings" data-coding-settings>
    <header class="settings-heading"><div class="settings-heading-title"><h1>${p.escape("Coding")}</h1></div>
      <p>${p.escape(p.text("coding.settings.lede"))}</p>
      <p><a href="/settings/models">${p.escape(p.text("coding.settings.models"))}</a>${model.project_href ? ` · <a data-settings-return-workbench href="${p.escape(model.project_href)}?returnToWorkbench=1">${p.escape(p.text("coding.settings.back"))}</a>` : ""}</p>
    </header>
    <section class="settings-section" aria-label="${p.escape(p.text("coding.attach.character"))}">
      <h2>${p.escape(p.text("coding.settings.roles"))}</h2>
      ${roles}
    </section>
    <section class="settings-section" aria-label="${p.escape(p.text("coding.settings.runtimes"))}">
      <h2>${p.escape(p.text("coding.settings.runtimes"))}</h2>
      ${runtimes}
    </section>
    <section class="settings-section" aria-label="${p.escape(p.text("coding.attach.method"))}">
      <h2>${p.escape(p.text("coding.attach.method"))}</h2>
      <p>${p.escape(p.text("coding.settings.methods-help"))}</p>
      ${methods}
      <h3>${p.escape(p.text("coding.settings.project-methods"))}</h3>
      ${model.project_href ? `<div data-coding-method-library data-prefix="${p.escape(model.project_href)}">
        <p>${p.escape(p.text("coding.settings.project-line", { name: model.project_name ?? p.text("coding.settings.current-project") }))} · <a href="/settings/coding-settings">${p.escape(p.text("coding.settings.switch-project"))}</a></p>
        <p>${p.escape(p.text("coding.settings.methods-note"))}</p>
        <form data-method-discovery-form class="mw-form-stack">
          <label class="mw-field">${p.escape(p.text("coding.settings.granted-workspace"))}<select class="mw-select" data-method-workspace aria-label="${p.escape(p.text("coding.settings.method-workspace"))}"></select></label>
          <label class="mw-field">${p.escape(p.text("coding.settings.relative-dir"))}<input class="mw-input" data-method-path aria-label="${p.escape(p.text("coding.settings.method-path"))}" value="skills" required maxlength="1000"></label>
          <div>${renderButton({ label: p.text("coding.settings.discover"), type: "submit", disabled: true, attrs: { "data-method-discover": "" } })}</div>
        </form>
        <p data-method-library-status data-method-library-loading role="status">${p.escape(p.text("coding.settings.methods-loading"))}</p>
        <div data-method-candidates></div>
        <h3>${p.escape(p.text("coding.settings.installed"))}</h3><div data-installed-methods></div>
      </div>
      <section data-coding-mcp-settings data-prefix="${p.escape(model.project_href)}">
        <h2>${p.escape(p.text("coding.settings.mcp.title"))}</h2><p>${p.escape(p.text("coding.settings.mcp.note"))}</p>
        <div data-mcp-servers></div>
        <h3 data-mcp-form-title>${p.escape(p.text("coding.settings.mcp.add"))}</h3>
        <form data-mcp-config class="mw-form-stack">
          <label class="mw-field">${p.escape(p.text("coding.settings.mcp.name"))}<input class="mw-input" name="label" required maxlength="128" aria-label="${p.escape(p.text("coding.settings.mcp.name-label"))}"></label>
          <label class="mw-field">${p.escape(p.text("coding.settings.mcp.transport"))}<select class="mw-select" name="transport" aria-label="${p.escape(p.text("coding.settings.mcp.transport-label"))}"><option value="http">${p.escape(p.text("coding.settings.mcp.transport.http"))}</option><option value="stdio">${p.escape(p.text("coding.settings.mcp.transport.stdio"))}</option></select></label>
          <div data-mcp-stdio class="mw-form-stack">
            <label class="mw-field">${p.escape(p.text("coding.settings.granted-workspace"))}<select class="mw-select" name="workspace" aria-label="${p.escape(p.text("coding.settings.mcp.workspace-label"))}"></select></label>
            <label class="mw-field">${p.escape(p.text("coding.settings.mcp.executable"))}<input class="mw-input" name="executable" aria-label="${p.escape(p.text("coding.settings.mcp.executable-label"))}"></label>
            <label class="mw-field">${p.escape(p.text("coding.settings.mcp.argv"))}<textarea class="mw-textarea" name="argv" aria-label="${p.escape(p.text("coding.settings.mcp.argv-label"))}">[]</textarea></label>
            <p>${p.escape(p.text("coding.settings.mcp.stdio-note"))}</p>
          </div>
          <div data-mcp-http class="mw-form-stack" hidden>
            <label class="mw-field">${p.escape(p.text("coding.settings.mcp.endpoint"))}<input class="mw-input" name="endpoint" aria-label="${p.escape(p.text("coding.settings.mcp.endpoint-label"))}" placeholder="https://example.com/mcp"></label>
            <label class="mw-field">${p.escape(p.text("coding.settings.mcp.auth"))}<select class="mw-select" name="auth" aria-label="${p.escape(p.text("coding.settings.mcp.auth-label"))}"><option value="none">${p.escape(p.text("coding.settings.mcp.auth.none"))}</option><option value="connection">${p.escape(p.text("coding.settings.mcp.auth.connection"))}</option><option value="keep-existing">${p.escape(p.text("coding.settings.mcp.auth.keep"))}</option></select></label>
            <label class="mw-field">${p.escape(p.text("coding.settings.mcp.account"))}<select class="mw-select" name="auth_connection_id" aria-label="${p.escape(p.text("coding.settings.mcp.account-label"))}"><option value="">${p.escape(p.text("coding.settings.mcp.choose-connection"))}</option></select></label><p>${p.escape(p.text("coding.settings.mcp.http-note"))}</p><a href="/capabilities/connections">${p.escape(p.text("coding.settings.mcp.connections"))}</a>
          </div>
          <label class="mw-field">${p.escape(p.text("coding.settings.mcp.timeout"))}<input class="mw-input" type="number" name="timeout" value="30000" min="1000" max="600000" aria-label="${p.escape(p.text("coding.settings.mcp.timeout-label"))}"></label>
          <label class="mw-check-row"><input class="mw-check" type="checkbox" name="enabled" checked>${p.escape(p.text("coding.settings.mcp.enabled"))}</label>
          <div>${renderButton({label:p.text("coding.settings.mcp.save"),type:"submit"})} ${renderButton({label:p.text("coding.settings.mcp.reset"),variant:"ghost",attrs:{"data-mcp-reset":""}})}</div>
        </form><p role="status" data-mcp-status>${p.escape(p.text("coding.settings.mcp.loading"))}</p>
      </section>` : `<p>${p.escape(p.text("coding.settings.choose-project"))}</p><ul>${(model.projects ?? []).map(project => `<li><a href="/settings/coding-settings?project=${encodeURIComponent(project.project_id)}">${p.escape(project.name)}</a></li>`).join("")}</ul>`}
    </section>
  </section>`;
}

function executionLabel(execution: string, p: Pick<CodingUiPrimitives, "text">): string {
  if (execution === "read-only") return p.text("coding.settings.execution.read-only");
  if (execution === "text-edit") return p.text("coding.settings.execution.text-edit");
  return p.text("coding.settings.execution.command");
}

/**
 * The page is drawn from the platform's settings context alone (its view declares no `settings_data`): the roles and the methods are
 * this plugin's own, from its Agent Manifest, and the runtimes, projects and the project the page was opened from are the Host's.
 */
export function codingSettingsModel({ context, primitives }: SettingsPageModel): CodingSettingsModel {
  return {
    roles: codingAgentManifest.roles.map(role => ({ ...role, execution: role.execution ?? "read-only" })),
    runtimes: context.runtimes.map(runtime => ({ ...runtime,
      can_write: runtime.capabilities["text-edit"] !== "unsupported",
      can_command: runtime.capabilities.command !== "unsupported",
      methods: runtime.capabilities.skills,
    })),
    methods: codingAgentManifest.skills ?? [],
    projects: context.projects.map(project => ({ project_id: project.project_id, name: project.name })),
    project_name: context.project?.name,
    project_href: context.project?.href ?? null,
    primitives,
  };
}

export const codingSettingsContribution: UiContribution<SettingsPageModel> = {
  descriptor: codingSettingsDescriptor,
  render: (request) => renderCodingSettings(codingSettingsModel(request.model)),
};

export interface CodingPendingReview {
  review_id: string;
  /** What kind of effect is waiting. Shown as-is, never softened. */
  kind: "text-edit" | "command" | "tool-operation" | "mcp" | "rewind";
  /** One safe line describing the effect, prepared by the Host. */
  summary: string;
}

export interface CodingReviewCardModel {
  readonly pending: readonly CodingPendingReview[];
  /** Where the Host's review surface lives. Coding links there; it never decides. */
  readonly review_href: string;
  readonly primitives: CodingUiPrimitives;
}

const REVIEW_KIND_LABEL: Record<CodingPendingReview["kind"], string> = {
  "text-edit": "coding.review.text-edit",
  command: "coding.review.command",
  "tool-operation": "coding.review.tool-operation",
  mcp: "coding.review.mcp",
  rewind: "coding.review.rewind",
};

/**
 * The card that appears in a session when the Run is waiting on approval.
 *
 * It is a summary and a way out, and deliberately nothing else: no approve
 * button, no "allow all", no remembered decision. Approving is the user's
 * action in the Host's own surface, and putting a shortcut here would let
 * Coding release its own side effects — which is the one thing the design says
 * it must not do. An empty list renders nothing rather than a reassuring
 * "no pending approvals", which would be noise in the middle of a conversation.
 */
export function renderPendingReviewCard(model: CodingReviewCardModel): string {
  const { primitives: p } = model;
  if (model.pending.length === 0) return "";
  const items = model.pending.slice(0, 3).map((review) => `<li>
    <span class="coding-review-kind">${p.escape(p.text(REVIEW_KIND_LABEL[review.kind]))}</span>
    <span class="coding-review-summary">${p.escape(review.summary)}</span>
  </li>`).join("");
  const more = model.pending.length > 3
    ? `<li class="coding-review-more">${p.escape(p.text("coding.review.more", { count: model.pending.length - 3 }))}</li>`
    : "";
  return `<aside class="coding-review-card" data-coding-review-card>
    <div class="mw-status" data-tone="attention" data-mw-state="approval">${p.escape(p.text("coding.review.waiting", { count: model.pending.length }))}</div>
    <ul class="coding-review-list">${items}${more}</ul>
    <a class="mw-button mw-button--primary" href="${p.escape(model.review_href)}" data-coding-review-open>${p.escape(p.text("coding.review.open"))}</a>
    <p class="coding-review-note">${p.escape(p.text("coding.review.note"))}</p>
  </aside>`;
}

export interface CodingReportModel {
  readonly title: string;
  /** Already-rendered Markdown. Coding does not parse it itself. */
  readonly body_html: string;
  readonly run_id: string;
  readonly primitives: CodingUiPrimitives;
}

/**
 * A report produced by one run.
 *
 * The body arrives already rendered by the shared Markdown path, so this only
 * frames it and says where it came from. A report with no provenance is just
 * text someone has to take on faith.
 */
export function renderCodingReport(model: CodingReportModel): string {
  const { primitives: p } = model;
  return `<article class="coding-report" data-coding-report="${p.escape(model.run_id)}">
    <header class="coding-report-head">
      <h1>${p.escape(model.title)}</h1>
      <p class="coding-report-source">${p.escape(p.text("coding.report.source", { run: model.run_id }))}</p>
    </header>
    <div class="coding-report-body mw-prose">${model.body_html}</div>
  </article>`;
}

export interface CodingIdentityModel {
  readonly identity: CodingIdentityView;
  readonly primitives: CodingUiPrimitives;
}

/**
 * What this run was frozen with.
 *
 * Every layer is rendered, empty ones included, with the reason they are empty
 * — "this project has stated no conventions" is something the user can act on,
 * while a missing section reads as nothing to see.
 *
 * There is no control here. Editing a frozen run's instructions would edit the
 * thing the Host froze in order to decide what the run may do; changing them is
 * changing the role, for the next run.
 */
export function renderCodingIdentity(model: CodingIdentityModel): string {
  const { primitives: p, identity } = model;
  const layers = identity.layers.map((layer) => {
    const body = layer.absent_reason !== undefined
      ? `<p class="coding-identity-absent">${p.escape(layer.absent_reason)}</p>`
      : `<ul class="coding-identity-entries">${layer.entries.map((entry) =>
        `<li data-prompt="${p.escape(entry.prompt_id)}">`
        + `<span class="coding-identity-id">${p.escape(entry.prompt_id)} · v${p.escape(entry.version)}</span>`
        + (entry.body === undefined ? "" : `<pre class="coding-identity-body">${p.escape(entry.body)}</pre>`)
        + `</li>`).join("")}</ul>`;
    return `<section class="coding-identity-layer" data-layer="${p.escape(layer.layer)}">`
      + `<h3>${p.escape(layer.title)}<span class="coding-identity-owner">${p.escape(layer.owner)}</span></h3>`
      + `${body}</section>`;
  }).join("");
  const tools = identity.host_tools.length === 0
    ? `<span class="coding-identity-tools" data-empty="true">${p.escape(p.text("coding.identity.no-tools"))}</span>`
    : `<span class="coding-identity-tools">${identity.host_tools.map((tool) => p.escape(tool)).join(" · ")}</span>`;
  return `<article class="coding-identity" data-role="${p.escape(identity.role_id)}" data-editable="false">
    <header class="coding-identity-head">
      <h2>${p.escape(identity.role_name)}</h2>
      <span class="coding-identity-execution">${p.escape(identity.execution)}</span>
      ${tools}
    </header>
    ${layers}
  </article>`;
}

export interface CodingUsageModel {
  readonly usage: AgentRunUsage;
  readonly primitives: CodingUiPrimitives;
}

/**
 * What this run cost.
 *
 * When the Runtime did not report usage, this says so. Showing 0 would read as
 * "this run was free", which is a different claim from "we do not know".
 */
export function renderCodingUsage(model: CodingUsageModel): string {
  const { primitives: p, usage } = model;
  const hasKnown = usage.coverage
    ? Object.values(usage.coverage).some(value => value !== "unknown")
    : usage.unavailable_reason === undefined;
  const state = !hasKnown ? "unknown" : usage.unavailable_reason ? "partial" : "known";
  return `<div class="coding-usage" data-coding-usage="${state}">
    ${hasKnown ? "" : `<span class="mw-status" data-tone="idle">${p.icon("help-circle")}${p.escape(p.text("coding.usage.unknown"))}</span>`}
    <span class="coding-usage-why">${p.escape(codingUsageSummary(usage, p.text))}</span>
  </div>`;
}
