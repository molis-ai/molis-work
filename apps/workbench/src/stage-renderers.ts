import type { StagePageModel, StagePagePrimitives } from "@molis-ai/molis-work-contracts/platform/ui";
import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { FEED_PLUGIN_ID, type FeedItemRecord, type InboxEntryRecord } from "@molis-ai/molis-work-plugin-feed";
import { createWorkbenchFeedProjectionRenderer } from "./feed-projection-ui.js";
import { inWordsOf } from "./i18n.js";
import { createWorkbenchInboxProjectionRenderer } from "./inbox-projection-ui.js";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";
import { declaredStageContributionId, stageDataAction } from "./declared-stages.js";
import type { MolisWorkWebView } from "./page-view.js";
import type { RendererLocale } from "./renderer-helpers.js";
import { renderWorkbenchContribution } from "./ui-composition.js";

/**
 * Feed and Inbox still draw their stage from this page's view; every other declared stage gets the shared model, with the answer of
 * its `stage_data` action when it declares one (T-133). The same model whoever draws the stage: the shell from the catalog, or the
 * Host from the running instance (W5-06).
 */
export function createWorkbenchStageRenderers(ports: {
  L: RendererLocale["L"];
  dateTimeLocale: RendererLocale["dateTimeLocale"];
  prefixLocalLinks(html: string, routePrefix: string): string;
}) {
  const { L, dateTimeLocale, prefixLocalLinks } = ports;
  const feedL = inWordsOf(FEED_PLUGIN_ID, L);
  const { buildFeedNativePluginModel, renderFeedNativePluginPersistedDetail, renderFeedNativePluginSurface } = createWorkbenchFeedProjectionRenderer({ L: feedL, dateTimeLocale });
  const { buildInboxNativePluginModel, renderInboxNativePluginSurface } = createWorkbenchInboxProjectionRenderer({ L, dateTimeLocale });
  const stageModels: ReadonlyMap<string, (view: MolisWorkWebView) => unknown> = new Map<string, (view: MolisWorkWebView) => unknown>([
    ["feed", view => buildFeedNativePluginModel(view, "feed", [], false)], ["inbox", buildInboxNativePluginModel]]);
  const primitives: StagePagePrimitives = {
    escape: escapeHtml, text: L, icon,
    formatDate(value) {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return new Intl.DateTimeFormat(dateTimeLocale(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
    },
  };
  const declaredStageModel = (projectPluginId: string, view: MolisWorkWebView): unknown => stageModels.get(projectPluginId)?.(view) ?? {
    route_prefix: view.route_prefix, shown_plugins: view.shown_plugins ?? view.enabled_plugins ?? [],
    ...(view.stage_data && projectPluginId in view.stage_data ? { data: view.stage_data[projectPluginId] } : {}), primitives,
  } satisfies StagePageModel;

  /**
   * `GET /api/stage/<plugin>` for a plugin whose stage declares its data (`stage_data`): its stage drawn again from a fresh view, the same
   * `workbench` surface the page mounted. Undefined for any other plugin, so the Host has no stage to offer for it. No plugin is named here.
   */
  function declaredStageFragment(projectPluginId: string): ((view: MolisWorkWebView) => string) | undefined {
    const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.project_plugin_id === projectPluginId);
    const contributionId = entry && stageDataAction(entry.manifest) ? declaredStageContributionId(entry) : undefined;
    if (!contributionId) return undefined;
    return view => prefixLocalLinks(renderWorkbenchContribution(contributionId, "workbench", declaredStageModel(projectPluginId, view)), view.route_prefix);
  }

  function renderPersistedFeedItemDetail(
    item: FeedItemRecord,
    routePrefix = "",
    options: { entryId?: string; inboxActive?: boolean; promoteAvailable?: boolean; inboxEntry?: InboxEntryRecord | null; surface?: "frame-block" } = {},
  ): string {
    return renderFeedNativePluginPersistedDetail(item, routePrefix, options);
  }

  function renderFeedWorkbenchFragment(view: MolisWorkWebView): string {
    return prefixLocalLinks(renderFeedNativePluginSurface(
      view,
      "workbench-fragment",
      "feed",
      [],
      true,
    ), view.route_prefix);
  }

  function renderInboxWorkbenchFragment(view: MolisWorkWebView): string {
    return prefixLocalLinks(renderInboxNativePluginSurface(view, "workbench"), view.route_prefix);
  }

  return {
    declaredStageModel,
    declaredStageFragment,
    renderFeedNativePluginSurface,
    renderPersistedFeedItemDetail,
    renderFeedWorkbenchFragment,
    renderInboxWorkbenchFragment,
  };
}
