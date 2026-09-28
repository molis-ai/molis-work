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
export type { PagesImportDocumentsInput } from "./store.js";
export { generatePagesFromMaterials } from "./generate.js";
export { preparePagesImport } from "./import-files.js";
export type { PagesImportFile, PreparedPagesImportDocument, PreparedPagesImport } from "./import-files.js";
export { PagesError } from "./error.js";
export { EMPTY_PAGES_BODY, parsePagesBody } from "./document.js";
export { PAGES_TEMPLATES, pagesTemplateById, pagesTemplateSummaries } from "./templates.js";
export { emptyDoc, nodeFromUnknown, pagesSchema, safePagesColumnShare, safePagesColumnWidth } from "./schema.js";
export { columnDropAnchor, dragRows, nodesInSpan, nudgeSpan, placeCopySpan, previewCopySpan, previewDrop, previewSpan, reorderTopLevel, spanRoots } from "./reorder.js";
export { convertedBlocks, convertedNodes } from "./convert.js";
export { placeFloating, scrollChildIntoView, scrollShouldFollow } from "./floating.js";
export { linkClickOpens, safePagesHref } from "./link.js";
export { blocksFromMarkdown, markdownLooksStructured, nodesForSpanPaste, pasteMarkdown, pastePlain, pasteUrl } from "./paste-markdown.js";
export { nodesToMarkdown } from "./to-markdown.js";
export { blocksFromPaste, pasteHtml } from "./paste-html.js";
export { acceptedImageFile, bookmarkLabel, imageAlt, safePagesBookmarkTitle, safePagesImageCaption, safePagesImageSrc, safePagesImageWidth } from "./link.js";
export { findHits, replaceAllFindHits, replaceFindHit, stepFindHit } from "./find.js";
export { addTableColumn, addTableRow, atLastTableCell, deleteTableColumn, deleteTableRow, moveTableColumn, moveTableEdge, moveTableRow, setColumnWidth, tableEdgeTarget, toggleHeaderRow } from "./table-edit.js";
export { PAGES_TONES, safePagesTone, toneFromCssColor } from "./tone.js";
export { blockPlaceholder } from "./placeholder.js";
export { PAGES_CODE_LANGUAGES, safePagesLanguage } from "./code-language.js";
export { PAGES_CALLOUT_ICONS, calloutIconFor, safePagesCalloutIcon, safePagesCalloutTone } from "./callout.js";
export {
  deleteBlock,
  deleteRow,
  deleteSpan,
  duplicateBlock,
  duplicateRow,
  activeList,
  listKindAt,
  headingLevelAt,
  addColumn,
  nudgeColumnShare,
  applyList,
  applyListSelection,
  applyHeading,
  applyTurn,
  applySlash,
  clearInlineMarks,
  collapseEmptyColumn,
  commentAt,
  setComment,
  columnEdgeTarget,
  commitGap,
  duplicateEnclosingRow,
  duplicateSpan,
  enterHeading,
  enterInToggle,
  exitWrappedBlock,
  indentListItem,
  indentUnderPrevious,
  indentItemGroup,
  insertImage,
  setImageWidth,
  setImageCaption,
  setBookmarkTitle,
  insertHardBreak,
  insertSlashBelow,
  insertCodeIndent,
  leaveCodeDown,
  leaveEmptyCodeLine,
  leaveCodeUp,
  continuePastEnd,
  continueBeforeStart,
  selectNeighborAtom,
  linkAt,
  markdownBlock,
  markdownLink,
  markdownTask,
  markdownWrapMark,
  moveColumnEdge,
  moveBlock,
  moveRow,
  moveSpan,
  copyDragSpan,
  outdentListItem,
  outdentFromContainer,
  removeCodeIndent,
  replaceEnclosingRow,
  revealHeading,
  headingIndexAt,
  replaceSelectedBlock,
  replaceSpan,
  replaceSpanWithNodes,
  deleteSelectedBlock,
  docStart,
  tripleClickSelection,
  moveSelectedBlock,
  collapseSelectedBlock,
  insertAfterSelectedBlock,
  insertAfterSpan,
  hardBreakAtSpanEnd,
  selectBlockThenAll,
  selectEnclosingBlock,
  menuKey,
  hoverMenuIndex,
  blockMenuShortcut,
  blockMenuTarget,
  popEscape,
  blockMenuKey,
  handleAnchor,
  hoverPosAfter,
  blockSpanStep,
  blockSpanFromSelection,
  blockSpanFromRange,
  blockSpanToRow,
  spanIsGroup,
  slashSession,
  dismissedMenuRange,
  splitTaskItem,
  setBlockTone,
  setRowsTone,
  setCalloutStyle,
  setToggleOpen,
  toggleTaskChecked,
  flipTaskAt,
  focusBelowContent,
  toggleTaskGroup,
  setLink,
  setTone,
  toggleInlineMark,
  toggleSpanMark,
  markCovers,
  toneCovers,
  toneAt,
  turnBlockInto,
  turnRowInto,
  turnSpanInto,
  turnGroup,
  clearSpanMarks,
  unwrapAtStart,
  unwrapColumns,
} from "./commands.js";
export { extractFromPagesBody } from "./extract.js";
export { PAGES_AI_COMMANDS, runPagesAi } from "./ai.js";
export type { PagesRoutePorts } from "./route-handlers.js";
export type { PagesPublishArtifactPort, PagesReadArtifactPort } from "./promote.js";

export { pagesContentActions, createPagesContentHandlers } from "./content-actions.js";

export { pagesActions, PAGES_ACTIONS, PAGES_ACTION_PERMISSIONS, createPagesActionHandlers } from "./actions.js";
export type { PagesActionPorts } from "./actions.js";
