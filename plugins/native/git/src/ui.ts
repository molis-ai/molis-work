import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { pathLabel } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { renderCompanionBrowserStage, type CompanionStageModel } from "@molis-ai/molis-work-design-system";

import type { GitListItem, GitView } from "./projection.js";
import { GIT_SENTENCE_TABLE, sayHostSentence } from "./sentences.js";

export const GIT_UI_CONTRIBUTION_ID = "io.molis.work.native.git.ui.v1";

/** Composed beside Files; the existing directory/result shell remains the owner. */
export function renderGitBrowserDirectory(text: (key: string) => string): string {
  return `<section class="git-browser mw-dir" data-git-browser hidden><div class="mw-toolbar git-directory-toolbar"><span class="mw-dir__label">${text("git.dir.title")}</span><button class="mw-btn mw-btn--ghost" type="button" data-git-refresh><span class="mw-spinner" hidden></span><span>${text("git.dir.refresh")}</span></button></div>
    <section class="git-sc" data-git-sc aria-label="${text("git.dir.source-control")}" hidden>
      <div class="git-sc-branch"><strong data-git-branch></strong><span class="git-sc-sync" data-git-sync></span><button class="mw-btn mw-btn--ghost" type="button" data-git-branch-toggle aria-expanded="false">${text("git.branch.toggle")}</button></div>
      <form class="git-sc-form" data-git-branch-form hidden>
        <label class="mw-field"><span class="mw-field__label">${text("git.branch.switch-to")}</span><select class="mw-select" data-git-branch-choice aria-label="${text("git.branch.switch-label")}"></select></label>
        <button class="mw-btn mw-btn--secondary" type="button" data-git-branch-switch>${text("git.branch.switch")}</button>
        <label class="mw-field"><span class="mw-field__label">${text("git.branch.new")}</span><input class="mw-input" data-git-branch-name placeholder="${text("git.branch.new-example")}" autocomplete="off" spellcheck="false"></label>
        <label class="mw-check-row"><input class="mw-check" type="checkbox" data-git-branch-checkout checked><span>${text("git.branch.checkout")}</span></label>
        <button class="mw-btn mw-btn--secondary" type="button" data-git-branch-create>${text("git.branch.create")}</button>
        <label class="mw-field"><span class="mw-field__label">${text("git.branch.merge-into")}</span><select class="mw-select" data-git-merge-choice aria-label="${text("git.branch.merge-label")}"></select></label>
        <button class="mw-btn mw-btn--secondary" type="button" data-git-merge>${text("git.branch.merge")}</button>
      </form>
      <label class="mw-sr-only" for="git-commit-message">${text("git.commit.label")}</label>
      <textarea class="mw-textarea git-sc-message" id="git-commit-message" data-git-commit-message rows="3" placeholder="${text("git.commit.placeholder")}" spellcheck="false"></textarea>
      <div class="git-sc-actions"><button class="mw-btn mw-btn--ghost" type="button" data-git-commit-draft>${text("git.commit.draft")}</button><button class="mw-btn mw-btn--primary" type="button" data-git-commit disabled>${text("git.commit.submit")}</button></div>
      <div class="git-sc-actions"><button class="mw-btn mw-btn--secondary" type="button" data-git-pull disabled>${text("git.pull.any")}</button><button class="mw-btn mw-btn--secondary" type="button" data-git-push disabled>${text("git.push.button")}</button><button class="mw-btn mw-btn--ghost" type="button" data-git-pr-toggle aria-expanded="false">${text("git.pr.toggle")}</button></div>
      <form class="git-sc-form" data-git-pr-form hidden>
        <p class="git-sc-note" data-git-pr-support></p>
        <label class="mw-field"><span class="mw-field__label">${text("git.pr.base")}</span><select class="mw-select" data-git-pr-base aria-label="${text("git.pr.base-label")}"></select></label>
        <label class="mw-field"><span class="mw-field__label">${text("git.pr.title")}</span><input class="mw-input" data-git-pr-title maxlength="256"></label>
        <label class="mw-field"><span class="mw-field__label">${text("git.pr.body")}</span><textarea class="mw-textarea" rows="4" data-git-pr-body></textarea></label>
        <label class="mw-check-row"><input class="mw-check" type="checkbox" data-git-pr-draft><span>${text("git.pr.draft")}</span></label>
        <button class="mw-btn mw-btn--secondary" type="button" data-git-pr-create>${text("git.pr.toggle")}</button>
      </form>
      <section class="git-sc-conflicts" data-git-conflicts aria-label="${text("git.conflict.region")}" hidden>
        <p class="git-sc-note" data-git-conflict-note></p>
        <ul class="git-sc-conflict-list" data-git-conflict-list></ul>
        <div class="git-sc-conflict-editor" data-git-conflict-editor hidden>
          <p class="git-sc-note" data-git-conflict-file></p>
          <div class="git-sc-picks" data-git-conflict-picks></div>
          <textarea class="mw-textarea git-sc-conflict-text" rows="14" data-git-conflict-text spellcheck="false" aria-label="${text("git.conflict.text-label")}"></textarea>
          <p class="git-sc-note" data-git-conflict-state role="status"></p>
          <div class="git-sc-actions"><button class="mw-btn mw-btn--primary" type="button" data-git-conflict-resolve disabled>${text("git.conflict.resolve")}</button></div>
        </div>
        <div class="git-sc-actions"><button class="mw-btn mw-btn--ghost" type="button" data-git-merge-abort>${text("git.conflict.abort")}</button></div>
      </section>
      <p class="git-sc-note" data-git-sc-status role="status"></p>
      <ol class="git-sc-log" data-git-operations aria-label="${text("git.ops.label")}"></ol>
    </section>
    <button class="mw-btn mw-btn--ghost" type="button" data-git-history disabled>${text("git.history.title")}</button>
    <button class="mw-btn mw-btn--ghost" type="button" data-git-reopen hidden>${text("git.dir.reopen")}</button>
    <p data-git-status role="status"></p><div class="mw-dir__list" data-git-list></div>
  </section>`;
}
export function renderGitBrowserResult(text: (key: string) => string): string {
  return `<section class="git-results mw-frame" data-slot="frame" data-git-results hidden aria-label="${text("git.diff.label")}">
    <header class="git-reader-head mw-frame__header"><button class="mw-btn mw-btn--ghost" type="button" data-git-close>${text("git.diff.back")}</button><div class="mw-frame__heading"><h2 data-git-title>${text("git.diff.title")}</h2><p data-git-kind>${text("git.diff.kind")}</p></div></header><div class="mw-frame__panel">
    <p data-git-scope></p><p data-git-notice role="status"></p>
    <button class="mw-btn mw-btn--secondary" type="button" data-git-index-action hidden></button>
    <section data-git-saved-results hidden aria-label="${text("git.result.region")}">
      <label class="mw-field"><span class="mw-field__label">${text("git.result.save-label")}</span><select class="mw-select" data-git-result-choice aria-label="${text("git.result.choice-label")}"></select></label>
      <p>${text("git.result.save-help")}</p>
      <p data-git-result-summary></p><p data-git-result-paths></p><p data-git-result-provenance></p>
      <button class="mw-btn" type="button" data-git-result-save disabled>${text("git.result.save")}</button>
      <p data-git-result-status role="status"></p>
    </section>
    <section data-git-reviews aria-label="${text("git.result.reviews")}" hidden></section>
    <div data-git-diff></div></div>
  </section>`;
}

export interface GitUiPrimitives {
  escape(value: unknown): string;
  /** The page's translator: labels and the view's sentences are GIT_MESSAGES keys. */
  text(value: string, values?: Record<string, string | number>): string;
  icon(name: string): string;
}

export interface GitUiModel {
  readonly route_prefix: string;
  readonly view: GitView;
  readonly commit_message: string;
  readonly primitives: GitUiPrimitives;
}

export const gitUiDescriptor: UiContributionDescriptor = {
  contribution_id: GIT_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.git",
  kind: "primary-page",
  navigation_id: "git",
  label: "Git",
  surfaces: [
    { surface_id: "changes", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
    // The browser the Coding page embeds (`ui.embedded_plugins`): the slots are the ones that page opens, by their ids.
    { surface_id: "browser-directory", target_slot_id: "coding.companion-directory", format: "declarative-html" },
    { surface_id: "browser-result", target_slot_id: "coding.companion-result", format: "declarative-html" },
  ],
  slots: [],
};

export const gitUiContribution: UiContribution<GitUiModel | CompanionStageModel> = {
  descriptor: gitUiDescriptor,
  render(request: UiRenderRequest<GitUiModel | CompanionStageModel>): string {
    const model = request.model as CompanionStageModel;
    switch (request.surface) {
      case "workbench": return renderGitStage(model);
      case "browser-directory": return renderGitBrowserDirectory(model.primitives.text);
      case "browser-result": return renderGitBrowserResult(model.primitives.text);
      default: return renderGitChanges(request.model as GitUiModel);
    }
  },
};

/** Git's stage in the project page: its browser beside a note while no change is open. */
export function renderGitStage(model: CompanionStageModel): string {
  const { text } = model.primitives;
  return renderCompanionBrowserStage({ surface: "git", label: "Git", icon: "git-branch", route_prefix: model.route_prefix, manage: text("git.stage.manage"),
    empty: { title: text("git.stage.empty-title"), body: text("git.stage.empty-body") }, directory: renderGitBrowserDirectory(text), result: renderGitBrowserResult(text) });
}

export function renderGitChanges(model: GitUiModel): string {
  const { escape, icon } = model.primitives, p = model.primitives;
  const view = model.view;
  if (view.phase !== "ready") {
    const recovery = view.recovery === undefined
      ? ""
      : `<span class="git-recovery">${escape(p.text(view.recovery))}</span>`;
    return `<section class="git" data-phase="${escape(view.phase)}">`
      + `<p class="git-notice">${escape(p.text(view.message))}${recovery}</p></section>`;
  }
  const header = `<header class="git-head">${icon("git-branch")}`
    + `<span class="git-branch">${escape(sayHostSentence(p.text, GIT_SENTENCE_TABLE, view.head))}</span>`
    + (view.tracking === "" ? "" : `<span class="git-tracking">${escape(sayHostSentence(p.text, GIT_SENTENCE_TABLE, view.tracking))}</span>`)
    + `</header>`;
  const body = view.message !== ""
    ? `<p class="git-clean">${escape(p.text(view.message))}</p>`
    : renderList(p.text("git.group.conflicts"), view.conflicts, model)
      + renderList(p.text("git.group.staged"), view.staged, model)
      + renderList(p.text("git.group.unstaged"), view.changes, model);
  const truncated = view.truncated
    ? `<p class="git-truncated">${escape(p.text("git.group.truncated"))}</p>`
    : "";
  return `<section class="git" data-phase="ready" data-route="${escape(model.route_prefix)}">`
    + `${header}${body}${truncated}${renderCommit(model)}</section>`;
}

function renderList(title: string, items: readonly GitListItem[], model: GitUiModel): string {
  if (items.length === 0) return "";
  const { escape } = model.primitives;
  const selectedLabel = model.view.selected === undefined ? null : pathLabel(model.view.selected.path);
  return `<section class="git-group" data-kind="${escape(items[0]!.kind)}">`
    + `<h3>${escape(title)}</h3><ul>${items.map((item) => {
      const label = pathLabel(item.path);
      return `<li data-code="${escape(item.code)}"${label === selectedLabel ? ` data-selected="true"` : ""}>`
        + `<button type="button" data-action="git.open-change" data-path="${escape(label)}">`
        + `${escape(item.label)}</button></li>`;
    }).join("")}</ul></section>`;
}

function renderCommit(model: GitUiModel): string {
  const { escape } = model.primitives, p = model.primitives;
  return `<form class="git-commit" data-committable="${model.view.committable}">`
    + `<textarea name="message" rows="3" placeholder="${escape(p.text("git.commit.message"))}">${escape(model.commit_message)}</textarea>`
    + `<button type="submit" data-action="git.commit"${model.view.committable ? "" : " disabled"}>${escape(p.text("git.commit.plain"))}</button>`
    + `</form>`;
}
