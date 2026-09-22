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
export { dragRows, nudgeSpan, previewDrop, previewSpan, reorderTopLevel, spanRoots } from "./reorder.js";
export { convertedBlocks } from "./convert.js";
export { safePagesHref } from "./link.js";
export { blocksFromMarkdown, pasteMarkdown } from "./paste-markdown.js";
export { addTableColumn, addTableRow, atLastTableCell, deleteTableColumn, deleteTableRow } from "./table-edit.js";
export { PAGES_TONES, safePagesTone } from "./tone.js";
export { blockPlaceholder } from "./placeholder.js";
export { PAGES_CODE_LANGUAGES, safePagesLanguage } from "./code-language.js";
export { PAGES_CALLOUT_ICONS, calloutIconFor, safePagesCalloutIcon, safePagesCalloutTone } from "./callout.js";
export {
  deleteBlock,
  deleteRow,
  deleteSpan,
  duplicateBlock,
  duplicateRow,
  duplicateEnclosingRow,
  duplicateSpan,
  exitWrappedBlock,
  indentListItem,
  leaveCodeDown,
  leaveCodeUp,
  linkAt,
  markdownBlock,
  moveBlock,
  moveRow,
  moveSpan,
  outdentListItem,
  replaceEnclosingRow,
  selectBlockThenAll,
  selectEnclosingBlock,
  setBlockTone,
  setCalloutStyle,
  setLink,
  setTone,
  toneAt,
  turnBlockInto,
  turnRowInto,
  unwrapAtStart,
} from "./commands.js";
export { extractFromPagesBody } from "./extract.js";
export { PAGES_AI_COMMANDS, runPagesAi, stubPagesAi } from "./ai.js";
export type { PagesRoutePorts } from "./route-handlers.js";
export { requirePromoteArtifactPort } from "./promote.js";
export type { PagesPublishArtifactPort } from "./promote.js";
