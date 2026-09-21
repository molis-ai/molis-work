export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-pages",
  packagePath: "plugins/native/pages",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["pages.ui-contribution.v1", "pages.http-routes.v1"],
} as const;

export { PAGES_UI_CONTRIBUTION_ID, pagesUiContribution, pagesUiDescriptor, renderPagesWorkbench } from "./ui.js";
export type { PagesUiModel, PagesUiPrimitives, PagesUiSurface } from "./ui.js";
export { PAGES_STYLES } from "./styles.js";
export { PAGES_EN } from "./en.js";
export { PAGES_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { PAGES_NATIVE_PLUGIN_ROUTES, PagesPluginRouteTable } from "./routes.js";
export type { PagesPluginRouteHandler, PagesPluginRouteRequest, PagesPluginRouteResponse } from "./routes.js";
export { createPagesRouteHandlers, pagesRouteErrorResponse } from "./route-handlers.js";
export { PAGES_PLUGIN_ID, PAGES_PROJECT_PLUGIN_ID, pagesManifest } from "./manifest.js";
export { PAGES_MCP_EXPORTS, runPagesMcpTool } from "./mcp.js";
export { openPagesStore, PagesStore } from "./store.js";
export { PagesError } from "./error.js";
export { EMPTY_PAGES_BODY, parsePagesBody } from "./document.js";
export { PAGES_TEMPLATES, pagesTemplateById, pagesTemplateSummaries } from "./templates.js";
export { emptyDoc, nodeFromUnknown, pagesSchema } from "./schema.js";
export { extractFromPagesBody } from "./extract.js";
export { PAGES_AI_COMMANDS, runPagesAi, stubPagesAi } from "./ai.js";
export type { PagesRoutePorts } from "./route-handlers.js";
