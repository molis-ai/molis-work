import type { HostSurfaceRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { PLUGIN_COMPONENT_STYLES } from "@molis-ai/molis-work-design-system";
import { builderManifest, builderUiContribution, AGENT_STUDIO_STYLES, AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT } from "./index.js";

import { BUILDER_CONTENT_REPLICA_ID, builderPrivateValueReplicationOwner, builderSyncProjection } from "./index.js";
import { createSyncJsonContent } from "@molis-ai/molis-work-plugin-sdk";
/**
 * The studio as the platform draws it (47-1 C, user 2026-11-22): not a plugin, so not in the plugin catalog, Settings › 插件, the market
 * or a project's plugins. The shell gives it its button beside the market; its stage is framed like any page, with the requests,
 * sheet and program declared here; its drafts sync as the platform's own collection, under the identity they always had.
 */
export const studioSurface: HostSurfaceRegistration = {
  sync:{authoring:{scope:'project-private-values',kind:BUILDER_CONTENT_REPLICA_ID,namespace:'builder',owner:builderPrivateValueReplicationOwner,content:context=>createSyncJsonContent({...context,...builderSyncProjection})}},
  project_plugin_id: "plugin-builder",
  manifest: builderManifest,
  workbench: {
    pageRequests: [
      { method: "GET", path: "/api/plugin-builder/studio/state" },
      { method: "GET", path: "/api/plugin-builder/studio/image-services" },
      { method: "POST", path: "/api/plugin-builder/studio/settings" },
      { method: "POST", path: "/api/plugin-builder/studio/builds" },
      { method: "GET", path: "/api/plugin-builder/studio/builds/:id" },
      { method: "GET", path: "/api/plugin-builder/studio/builds/:id/events" },
      { method: "GET", path: "/api/plugin-builder/studio/builds/:id/download" },
      { method: "GET", path: "/api/plugin-builder/studio/builds/:id/mockups/:picture" },
      { method: "POST", path: "/api/plugin-builder/studio/builds/:id/action" },
      { method: "POST", path: "/api/plugin-builder/studio/builds/:id/call" },
    ],
    order: 1,
    contributions: [builderUiContribution],
    // The studio is drawn in the plugin's stage; generated plugin parts in its canvas use the plugin components.
    stylesheet: AGENT_STUDIO_STYLES + PLUGIN_COMPONENT_STYLES,
    // The studio's own classes predate its id (`as-`, `pb-`); the components every generated plugin shares (`pc-`) are not its
    // own and stay in the shared sheet, as does the class the Host's preview page draws (PG-070).
    stylesheetPrefixes: ["as-", "pb-"],
    stylesheetShared: ["as-preview-page"],
    clientFactory: AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT,
  },
};
