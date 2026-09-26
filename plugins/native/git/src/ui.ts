import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { pathLabel } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

import type { AcceptanceView } from "./acceptance.js";
import type { GitListItem, GitView } from "./projection.js";

export const GIT_UI_CONTRIBUTION_ID = "io.molis.work.native.git.ui.v1";

/** Composed beside Files; the existing directory/result shell remains the owner. */
export function renderGitBrowserDirectory(): string {
  return `<section class="git-browser mw-dir" data-git-browser hidden><div class="mw-toolbar git-directory-toolbar"><span class="mw-dir__label">Git 改动</span><button class="mw-btn mw-btn--ghost" type="button" data-git-refresh><span class="mw-spinner" hidden></span>刷新</button></div>
    <section class="git-sc" data-git-sc aria-label="提交与分支" hidden>
      <div class="git-sc-branch"><strong data-git-branch></strong><span class="git-sc-sync" data-git-sync></span><button class="mw-btn mw-btn--ghost" type="button" data-git-branch-toggle aria-expanded="false">分支…</button></div>
      <form class="git-sc-form" data-git-branch-form hidden>
        <label class="mw-field"><span class="mw-field__label">切换到</span><select class="mw-select" data-git-branch-choice aria-label="切换到已有分支"></select></label>
        <button class="mw-btn mw-btn--secondary" type="button" data-git-branch-switch>切换…</button>
        <label class="mw-field"><span class="mw-field__label">新建分支</span><input class="mw-input" data-git-branch-name placeholder="例如 feature/checkin-count" autocomplete="off" spellcheck="false"></label>
        <label class="mw-check-row"><input class="mw-check" type="checkbox" data-git-branch-checkout checked><span>建好后切换过去</span></label>
        <button class="mw-btn mw-btn--secondary" type="button" data-git-branch-create>新建…</button>
        <label class="mw-field"><span class="mw-field__label">合并到当前分支</span><select class="mw-select" data-git-merge-choice aria-label="合并进来的分支"></select></label>
        <button class="mw-btn mw-btn--secondary" type="button" data-git-merge>合并…</button>
      </form>
      <label class="mw-sr-only" for="git-commit-message">提交说明</label>
      <textarea class="mw-textarea git-sc-message" id="git-commit-message" data-git-commit-message rows="3" placeholder="提交说明（第一行是标题）" spellcheck="false"></textarea>
      <div class="git-sc-actions"><button class="mw-btn mw-btn--ghost" type="button" data-git-commit-draft>按暂存内容生成</button><button class="mw-btn mw-btn--primary" type="button" data-git-commit disabled>提交…</button></div>
      <div class="git-sc-actions"><button class="mw-btn mw-btn--secondary" type="button" data-git-pull disabled>拉取…</button><button class="mw-btn mw-btn--secondary" type="button" data-git-push disabled>推送…</button><button class="mw-btn mw-btn--ghost" type="button" data-git-pr-toggle aria-expanded="false">建 PR…</button></div>
      <form class="git-sc-form" data-git-pr-form hidden>
        <p class="git-sc-note" data-git-pr-support></p>
        <label class="mw-field"><span class="mw-field__label">合并到</span><select class="mw-select" data-git-pr-base aria-label="PR 目标分支"></select></label>
        <label class="mw-field"><span class="mw-field__label">标题</span><input class="mw-input" data-git-pr-title maxlength="256"></label>
        <label class="mw-field"><span class="mw-field__label">描述</span><textarea class="mw-textarea" rows="4" data-git-pr-body></textarea></label>
        <label class="mw-check-row"><input class="mw-check" type="checkbox" data-git-pr-draft><span>作为草稿</span></label>
        <button class="mw-btn mw-btn--secondary" type="button" data-git-pr-create>建 PR…</button>
      </form>
      <section class="git-sc-conflicts" data-git-conflicts aria-label="合并冲突" hidden>
        <p class="git-sc-note" data-git-conflict-note></p>
        <ul class="git-sc-conflict-list" data-git-conflict-list></ul>
        <div class="git-sc-conflict-editor" data-git-conflict-editor hidden>
          <p class="git-sc-note" data-git-conflict-file></p>
          <div class="git-sc-picks" data-git-conflict-picks></div>
          <textarea class="mw-textarea git-sc-conflict-text" rows="14" data-git-conflict-text spellcheck="false" aria-label="冲突文件内容，可直接编辑"></textarea>
          <p class="git-sc-note" data-git-conflict-state role="status"></p>
          <div class="git-sc-actions"><button class="mw-btn mw-btn--primary" type="button" data-git-conflict-resolve disabled>标记为已解决…</button></div>
        </div>
        <div class="git-sc-actions"><button class="mw-btn mw-btn--ghost" type="button" data-git-merge-abort>放弃合并…</button></div>
      </section>
      <p class="git-sc-note" data-git-sc-status role="status"></p>
      <ol class="git-sc-log" data-git-operations aria-label="最近的 Git 操作"></ol>
    </section>
    <button class="mw-btn mw-btn--ghost" type="button" data-git-history disabled>Git 操作记录</button>
    <button class="mw-btn mw-btn--ghost" type="button" data-git-reopen hidden>上次查看的固定差异</button>
    <p data-git-status role="status"></p><div class="mw-dir__list" data-git-list></div>
  </section>`;
}
export function renderGitBrowserResult(): string {
  return `<section class="git-results mw-frame" data-slot="frame" data-git-results hidden aria-label="Git 固定差异">
    <header class="git-reader-head mw-frame__header"><button class="mw-btn mw-btn--ghost" type="button" data-git-close>返回执行结果</button><div class="mw-frame__heading"><h2 data-git-title>Git 差异</h2><p data-git-kind>固定差异</p></div></header><div class="mw-frame__panel">
    <p data-git-scope></p><p data-git-notice role="status"></p>
    <button class="mw-btn mw-btn--secondary" type="button" data-git-index-action hidden></button>
    <section data-git-saved-results hidden aria-label="固定操作结果">
      <label class="mw-field"><span class="mw-field__label">保存操作结果</span><select class="mw-select" data-git-result-choice aria-label="选择已结束的 Git 操作"></select></label>
      <p>把这次结论保存为固定版本。保存不会执行 Git，也不代表 Goal 已验收。</p>
      <p data-git-result-summary></p><p data-git-result-paths></p><p data-git-result-provenance></p>
      <button class="mw-btn" type="button" data-git-result-save disabled>保存固定结果</button>
      <p data-git-result-status role="status"></p>
    </section>
    <section data-git-reviews aria-label="Git 操作审查" hidden></section>
    <div data-git-diff></div></div>
  </section>`;
}

export interface GitUiPrimitives {
  escape(value: unknown): string;
  icon(name: string): string;
}

export interface GitUiModel {
  readonly route_prefix: string;
  readonly view: GitView;
  /** Present only while a Run's change set is bound and waiting on a decision. */
  readonly acceptance: AcceptanceView | null;
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
  ],
  slots: [],
};

export const gitUiContribution: UiContribution<GitUiModel> = {
  descriptor: gitUiDescriptor,
  render(request: UiRenderRequest<GitUiModel>): string {
    return renderGitChanges(request.model);
  },
};

export function renderGitChanges(model: GitUiModel): string {
  const { escape, icon } = model.primitives;
  const view = model.view;
  if (view.phase !== "ready") {
    const recovery = view.recovery === undefined
      ? ""
      : `<span class="git-recovery">${escape(view.recovery)}</span>`;
    return `<section class="git" data-phase="${escape(view.phase)}">`
      + `<p class="git-notice">${escape(view.message)}${recovery}</p></section>`;
  }
  const header = `<header class="git-head">${icon("git-branch")}`
    + `<span class="git-branch">${escape(view.head)}</span>`
    + (view.tracking === "" ? "" : `<span class="git-tracking">${escape(view.tracking)}</span>`)
    + `</header>`;
  const body = view.message !== ""
    ? `<p class="git-clean">${escape(view.message)}</p>`
    : renderList("冲突", view.conflicts, model)
      + renderList("已暂存", view.staged, model)
      + renderList("未暂存", view.changes, model);
  const truncated = view.truncated
    ? `<p class="git-truncated">改动太多，只列出了一部分</p>`
    : "";
  return `<section class="git" data-phase="ready" data-route="${escape(model.route_prefix)}">`
    + `${header}${renderAcceptance(model)}${body}${truncated}${renderCommit(model)}</section>`;
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

/**
 * The Run's proposal.
 *
 * When it cannot be taken, the button is absent and the reason is shown — not a
 * disabled button with a tooltip. The reasons here (the file changed since, a
 * conflict is open, it already landed) are things the user must act on, and a
 * greyed-out control invites clicking rather than reading.
 */
function renderAcceptance(model: GitUiModel): string {
  const acceptance = model.acceptance;
  if (acceptance === null) return "";
  const { escape } = model.primitives;
  if (!acceptance.offerable) {
    return `<section class="git-acceptance" data-blocked="${escape(acceptance.blocked?.kind ?? "unknown")}">`
      + `<p>${escape(acceptance.message)}</p></section>`;
  }
  return `<section class="git-acceptance" data-offerable="true"><p>${escape(acceptance.message)}</p>`
    + `<button type="button" data-action="git.accept-run-changes">放进工作区</button></section>`;
}

function renderCommit(model: GitUiModel): string {
  const { escape } = model.primitives;
  return `<form class="git-commit" data-committable="${model.view.committable}">`
    + `<textarea name="message" rows="3" placeholder="提交信息">${escape(model.commit_message)}</textarea>`
    + `<button type="submit" data-action="git.commit"${model.view.committable ? "" : " disabled"}>提交</button>`
    + `</form>`;
}
