import { inboxContentActions } from "@molis-ai/molis-work-plugin-inbox";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { feedManifest, createFeedContentHandlers, type FeedApplication } from "@molis-ai/molis-work-plugin-feed";
import { pagesContentActions } from "@molis-ai/molis-work-plugin-pages";
import { lingguangContentActions } from "@molis-ai/molis-work-plugin-lingguang";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MolisWorkProjectRuntime } from "./project-host.js";
import { hydrateFeedItemContent } from "./feed-content.js";

/** Native composition only supplies stores; protocol behavior and definitions belong to each plugin. */
export function nativeContentProviders(runtime: MolisWorkProjectRuntime, feed: FeedApplication, home?: string): ActionProviderRegistration[] {
  const provider = (manifest: PluginManifest, handlers: ActionProviderRegistration["handlers"]): ActionProviderRegistration => ({
    provider: { provider_id: manifest.plugin_id, plugin_id: manifest.plugin_id, title: manifest.name, kind: "plugin", project_id: runtime.project_id },
    definitions: manifest.actions!, handlers,
  });
  const providers = [provider(feedManifest, createFeedContentHandlers(feed, runtime.board_id,
    item => home ? runWithMolisWorkHome(home, () => hydrateFeedItemContent(item)) : hydrateFeedItemContent(item)))];
  return providers;
}

/** The local Web owner already has access to these native content stores. This is not a plugin-grant mechanism. */
export const NATIVE_CONTENT_PERMISSIONS = [...new Set([
  ...feedManifest.actions!, ...Object.values(pagesContentActions), ...Object.values(lingguangContentActions), ...Object.values(inboxContentActions),
].flatMap(definition => definition.action.permissions))];
