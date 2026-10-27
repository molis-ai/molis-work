import { FEED_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-feed";
import { inboxContentActions } from "@molis-ai/molis-work-plugin-inbox";
import { lingguangContentActions } from "@molis-ai/molis-work-plugin-lingguang";
import { pagesContentActions } from "@molis-ai/molis-work-plugin-pages";

/** The local Web owner already has access to these native content stores. This is not a plugin-grant mechanism. */
export const NATIVE_CONTENT_PERMISSIONS = [...new Set([
  ...FEED_ACTION_PERMISSIONS,
  ...[...Object.values(pagesContentActions), ...Object.values(lingguangContentActions), ...Object.values(inboxContentActions)].flatMap(definition => definition.action.permissions),
])];
