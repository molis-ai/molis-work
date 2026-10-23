import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { renderDiff, type DiffViewLabels, type DiffViewModel, type DiffViewPrimitives } from "@molis-ai/molis-work-plugin-sdk/diff-view";

import type { DiffInputGroup } from "./comparison.js";

export const DIFF_UI_CONTRIBUTION_ID = "io.molis.work.native.diff.ui.v1";

/** Which of Diff's keys (`DIFF_MESSAGES`) each label of the comparison is. */
export const DIFF_LABELS: DiffViewLabels = {
  before: "diff.sides.before",
  after: "diff.sides.after",
  pinned: "diff.sides.pinned",
  mismatch: "diff.notice.mismatch",
  partial: "diff.notice.partial",
  coarse: "diff.notice.coarse",
  created: "diff.notice.created",
  removed: "diff.notice.removed",
  identical: "diff.notice.identical",
  comment_before: "diff.line.comment-before",
  comment_after: "diff.line.comment-after",
  insert: "diff.sign.insert",
  delete: "diff.sign.delete",
  same: "diff.sign.same",
  reveal: "diff.fold.reveal",
};

/** The comparison is the SDK's (`/diff-view`): one drawing for Diff, Coding and any plugin that shows a change, in Diff's words. */
export type DiffUiPrimitives = DiffViewPrimitives;
export type DiffUiModel = Omit<DiffViewModel<DiffInputGroup>, "labels">;

export const diffUiDescriptor: UiContributionDescriptor = {
  contribution_id: DIFF_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.diff",
  kind: "primary-page",
  navigation_id: "diff",
  label: "Diff",
  surfaces: [
    { surface_id: "comparison", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const diffUiContribution: UiContribution<DiffUiModel> = {
  descriptor: diffUiDescriptor,
  render(request: UiRenderRequest<DiffUiModel>): string {
    return renderDiff({ ...request.model, labels: DIFF_LABELS });
  },
};
