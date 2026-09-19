import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { pathLabel } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

import type { AcceptanceView } from "./acceptance.js";
import type { GitListItem, GitView } from "./projection.js";

export const GIT_UI_CONTRIBUTION_ID = "io.molis.work.native.git.ui.v1";

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
