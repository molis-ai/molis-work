export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-todo",
  packagePath: "plugins/native/todo",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["todo.ui-contribution.v1", "todo.http-routes.v1"],
} as const;

export { TODO_UI_CONTRIBUTION_ID, todoUiContribution, todoUiDescriptor, renderTodoWorkbench } from "./ui.js";
export type { TodoUiModel, TodoUiPrimitives, TodoUiSurface } from "./ui.js";
export { TODO_STYLES } from "./styles.js";
export { TODO_EN } from "./en.js";
export { TODO_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { TODO_NATIVE_PLUGIN_ROUTES, TodoPluginRouteTable } from "./routes.js";
export type { TodoPluginRouteHandler, TodoPluginRouteRequest, TodoPluginRouteResponse } from "./routes.js";
export { createTodoRouteHandlers, todoRouteErrorResponse } from "./route-handlers.js";
export type { TodoRoutePorts } from "./route-handlers.js";
export { TODO_PLUGIN_ID, TODO_PROJECT_PLUGIN_ID, todoManifest } from "./manifest.js";
export { openTodoStore, TodoStore, TODO_STORE_BASELINE } from "./store.js";
export { purgeTodoProject } from "./project-data.js";
export type { TodoAccess, TodoBatchChange, TodoCreateInput, TodoFields, TodoLinkInput } from "./store.js";
export { TodoError } from "./error.js";
export { todoActions, TODO_ACTIONS, TODO_ACTION_PERMISSIONS, createTodoActionHandlers, todoAccess } from "./actions.js";
export type { TodoActionPorts, TodoListItem, TodoListResult } from "./actions.js";
export { todoSearchActions, todoText } from "./search.js";
export { todoHomeEventsAction, todoHomeEvents } from "./home-events.js";
export { TODO_INSTRUCTIONS, TODO_ORGANIZE_BASIC, TODO_ORGANIZE_ORGANIZER } from "./prompts.js";
export { TODO_ORGANIZER_ROLE, todoAgentManifest, todoMethods, todoPrompts } from "./roles.js";
export { todoOrganizeActions, createTodoOrganizeHandlers, batchText, TODO_BATCH_SUBJECT_KIND } from "./organize-actions.js";
export type { TodoOrganizePorts } from "./organize-actions.js";
export { TodoOrganizer, materialSourceKey } from "./organize.js";
export type { TodoApplyResult, TodoCandidateDecision } from "./organize.js";
export { phraseWrittenAt, readDatePhrase, organizeJson, organizeParts, organizePrompt, parseOrganizeOutput, passageFound, normalizeForMatch } from "./organize-model.js";
export type { TodoCandidateDraft, TodoOrganizeMaterial, TodoOrganizeParse } from "./organize-model.js";
export { parseTodoQuickText } from "./quick-parse.js";
export type { TodoQuickParse, TodoQuickPart } from "./quick-parse.js";
export { inView, selectView, todoFlags, viewCounts } from "./views.js";
export type { TodoFlag } from "./views.js";
export { addDays, isTodoDate, isTodoInstant, isTodoTime, localDate } from "./dates.js";
