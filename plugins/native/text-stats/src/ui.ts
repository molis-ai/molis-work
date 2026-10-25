import type {
  UiContribution,
  UiContributionDeclaration,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";

import { renderCompanionListStage, type CompanionStageModel } from "@molis-ai/molis-work-design-system";

import type { TextStatsView } from "./core.js";

export const TEXT_STATS_UI_CONTRIBUTION_ID = "io.molis.work.native.text-stats.ui.v1";

export interface TextStatsUiPrimitives {
  escape(value: unknown): string;
  /** The page's translator: labels and the view's sentences are TEXT_STATS_MESSAGES keys. */
  text(value: string, values?: Record<string, string | number>): string;
  icon(name: string): string;
}

export interface TextStatsUiModel {
  readonly view: TextStatsView;
  readonly primitives: TextStatsUiPrimitives;
}

export const textStatsUiDescriptor: UiContributionDeclaration = {
  contribution_id: TEXT_STATS_UI_CONTRIBUTION_ID,
  kind: "embedded",
  navigation_id: "text-stats",
  label: "Text stats",
  surfaces: [
    { surface_id: "stats", target_slot_id: "workbench.main", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const textStatsUiContribution: UiContribution<TextStatsUiModel | CompanionStageModel> = {
  descriptor: textStatsUiDescriptor,
  render(request: UiRenderRequest<TextStatsUiModel | CompanionStageModel>): string {
    return request.surface === "workbench" ? renderTextStatsStage(request.model as CompanionStageModel) : renderTextStats(request.model as TextStatsUiModel);
  },
};

/** Text Stats' stage in the project page: a refresh, a way to Files, and the counts the page's client fills. */
export function renderTextStatsStage(model: CompanionStageModel): string {
  const { text } = model.primitives;
  return renderCompanionListStage({ surface: "text-stats", label: "Text Stats", refresh: text("text-stats.stage.refresh"),
    files: { enabled: model.shown_plugins?.includes("files") ?? false, open: text("text-stats.stage.open-files"), add: text("text-stats.stage.add-files") } });
}

export function renderTextStats(model: TextStatsUiModel): string {
  const { escape, icon } = model.primitives, p = model.primitives;
  const view = model.view;
  if (view.phase !== "ready" || view.source === undefined) {
    // The shared empty block: the plugin's glyph, what is missing, and what to do about it.
    // Beside the reason in the view, what the page says while it has nothing to count.
    const detail = view.recovery !== undefined ? p.text(view.recovery) : view.phase === "waiting" ? p.text("text-stats.empty.waiting-detail") : undefined;
    // The block is the page's whole content, so the stage centres it like any plugin's empty list.
    return `<div class="mw-empty" data-phase="${escape(view.phase)}"><span class="mw-empty__mark">${icon("hash")}</span><strong>${escape(p.text(view.message))}</strong>`
      + `${detail === undefined ? "" : `<p>${escape(detail)}</p>`}</div>`;
  }
  // The source line is not decoration: two numbers that disagree are only
  // explainable if you can see which version each was counted from.
  return `<section class="text-stats" data-phase="ready">`
    + `<p class="stats-source">${escape(view.source.path)}`
    + `<span class="stats-origin">${escape(view.source.source_plugin_id)} · v${escape(view.source.content_version)}</span></p>`
    + `<dl class="stats-counts">`
    + `<dt>${p.text("text-stats.count.characters")}</dt><dd>${escape(view.characters ?? 0)}</dd>`
    + `<dt>${p.text("text-stats.count.bytes")}</dt><dd>${escape(view.utf8_bytes ?? 0)}</dd>`
    + `<dt>${p.text("text-stats.count.lines")}</dt><dd>${escape(view.lines ?? 0)}</dd>`
    + `</dl></section>`;
}
