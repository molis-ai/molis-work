export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-work",
  packagePath: "plugins/native/work",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2","goal-reorg-wk3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["work.session-application.v1", "work.ui-contribution.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;
export { handleWorkSessionHttp } from "./http/index.js";
export { handleWorkPanelHttp, type WorkPanelHttpContext } from "./http/panels.js";
export { publicSessionRecord, publicSessionHandoff } from "./http/public-records.js";
export type { WorkSessionHttpContext, WorkSessionHttpResources } from "./http/types.js";

export { SessionContentService, searchSessionTimeline, normalizeCodexThreadRead } from "./content.js";
export { SessionDirectoryService, type SessionDirectoryCreateInput, type SessionDirectoryDiscoveryResult } from "./directory.js";
export { SessionHandoffService } from "./handoff.js";
export { buildSessionHandoffPackage } from "./handoff-package.js";
export { RegistryFallbackSessionAdapter } from "./registry-fallback-adapter.js";
export { SessionTuiRecorder, stripTerminalControl } from "./tui-recorder.js";
export { repairProjectWorkspace, unlinkProjectWorkspace, MolisWorkWorkspaceActionError, type ProjectWorkspaceActionRecord } from "./workspace-actions.js";
export type { SessionTimelineEvent, SessionContentMode, SessionContentResult, SessionResumeResult, SessionHandoffGoalContext, PrepareSessionHandoffInput, SendSessionHandoffInput, SessionHandoffResult } from "./types.js";

export { workUiContribution, WORK_UI_CONTRIBUTION_ID } from "./ui/contribution.js";
export { workTerminalUiContribution, WORK_TERMINAL_UI_CONTRIBUTION_ID, type WorkTerminalUiModel } from "./ui/terminal.js";
export { WORK_EN } from "./ui/en.js";
export { buildWorkSessionView, type WorkSessionViewInput } from "./ui/read-model.js";
export { PROJECT_OPERATIONS_STYLES } from "./ui/styles.js";
export { PROJECT_OPERATIONS_CLIENT_SCRIPT } from "./ui/browser.js";
export type { WorkUiModel, WorkUiSurface, ProjectOperationsProject, ProjectOperationsSlice, ProjectOperationsData, ProjectSessionRecord, ProjectWorkspaceRecord } from "./ui/types.js";
export { WORK_PLUGIN_ID, WORK_PROJECT_PLUGIN_ID, workManifest } from "./manifest.js";
