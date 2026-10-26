import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { FEED_PLUGIN_ID, type FeedItemRecord, type InboxEntryRecord } from "@molis-ai/molis-work-plugin-feed";
import { createWorkbenchFeedProjectionRenderer } from "./feed-projection-ui.js";
import { inWordsOf } from "./i18n.js";
import { createWorkbenchInboxProjectionRenderer } from "./inbox-projection-ui.js";
import { createWorkbenchScheduleProjectionRenderer } from "./schedule-projection-ui.js";
import type { MolisWorkWebView } from "./page-view.js";
import type { RendererLocale } from "./renderer-helpers.js";

/**
 * Feed, Inbox and Schedule still draw their stage from this page's view; every other declared stage gets the shared primitives.
 * The same model whoever draws the stage: the shell from the catalog, or the Host from the running instance (W5-06).
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
  const { buildScheduleNativePluginModel, renderScheduleNativePluginSurface } = createWorkbenchScheduleProjectionRenderer({ L, dateTimeLocale });
  const stageModels: ReadonlyMap<string, (view: MolisWorkWebView) => unknown> = new Map<string, (view: MolisWorkWebView) => unknown>([
    ["feed", view => buildFeedNativePluginModel(view, "feed", [], false)], ["inbox", buildInboxNativePluginModel], ["schedule", buildScheduleNativePluginModel]]);
  const declaredStageModel = (projectPluginId: string, view: MolisWorkWebView): unknown =>
    stageModels.get(projectPluginId)?.(view) ?? { route_prefix: view.route_prefix, shown_plugins: view.shown_plugins ?? view.enabled_plugins ?? [], primitives: { escape: escapeHtml, text: L } };

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

  function renderScheduleWorkbenchFragment(view: MolisWorkWebView): string {
    return prefixLocalLinks(renderScheduleNativePluginSurface(view, "workbench"), view.route_prefix);
  }

  return {
    declaredStageModel,
    renderFeedNativePluginSurface,
    renderPersistedFeedItemDetail,
    renderFeedWorkbenchFragment,
    renderInboxWorkbenchFragment,
    renderScheduleWorkbenchFragment,
  };
}
