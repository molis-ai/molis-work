import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";

import type { TextStatsView } from "./core.js";

export const TEXT_STATS_UI_CONTRIBUTION_ID = "io.molis.work.native.text-stats.ui.v1";

export interface TextStatsUiPrimitives {
  escape(value: unknown): string;
}

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
  const { escape } = model.primitives;
  const view = model.view;
  if (view.phase !== "ready" || view.source === undefined) {
    const recovery = view.recovery === undefined
      ? ""
      : `<span class="stats-recovery">${escape(view.recovery)}</span>`;
    return `<section class="text-stats" data-phase="${escape(view.phase)}">`
      + `<p class="stats-notice">${escape(view.message)}${recovery}</p></section>`;
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
