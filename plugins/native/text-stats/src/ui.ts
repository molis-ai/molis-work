import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";

import type { TextStatsView } from "./core.js";

export const TEXT_STATS_UI_CONTRIBUTION_ID = "io.molis.work.native.text-stats.ui.v1";

export interface TextStatsUiPrimitives {
  escape(value: unknown): string;
  icon(name: string): string;
}

/** What the page says while it has nothing to count, beside the reason in the view. */
const WAITING_DETAIL = "统计 Files 中固定为对比前的文本快照。重新固定后更新，磁盘变化不会改写已保存的内容。";

export interface TextStatsUiModel {
  readonly view: TextStatsView;
  readonly primitives: TextStatsUiPrimitives;
}

export const textStatsUiDescriptor: UiContributionDescriptor = {
  contribution_id: TEXT_STATS_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.text-stats",
  kind: "embedded",
  navigation_id: "text-stats",
  label: "Text stats",
  surfaces: [
    { surface_id: "stats", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const textStatsUiContribution: UiContribution<TextStatsUiModel> = {
  descriptor: textStatsUiDescriptor,
  render(request: UiRenderRequest<TextStatsUiModel>): string {
    return renderTextStats(request.model);
  },
};

export function renderTextStats(model: TextStatsUiModel): string {
  const { escape, icon } = model.primitives;
  const view = model.view;
  if (view.phase !== "ready" || view.source === undefined) {
    // The shared empty block: the plugin's glyph, what is missing, and what to do about it.
    const detail = view.recovery ?? (view.phase === "waiting" ? WAITING_DETAIL : undefined);
    // The block is the page's whole content, so the stage centres it like any plugin's empty list.
    return `<div class="mw-empty" data-phase="${escape(view.phase)}"><span class="mw-empty__mark">${icon("hash")}</span><strong>${escape(view.message)}</strong>`
      + `${detail === undefined ? "" : `<p>${escape(detail)}</p>`}</div>`;
  }
  // The source line is not decoration: two numbers that disagree are only
  // explainable if you can see which version each was counted from.
  return `<section class="text-stats" data-phase="ready">`
    + `<p class="stats-source">${escape(view.source.path)}`
    + `<span class="stats-origin">${escape(view.source.source_plugin_id)} · v${escape(view.source.content_version)}</span></p>`
    + `<dl class="stats-counts">`
    + `<dt>字符</dt><dd>${escape(view.characters ?? 0)}</dd>`
    + `<dt>UTF-8 字节</dt><dd>${escape(view.utf8_bytes ?? 0)}</dd>`
    + `<dt>行</dt><dd>${escape(view.lines ?? 0)}</dd>`
    + `</dl></section>`;
}
