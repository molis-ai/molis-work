import type { ProjectRecord, DeleteProjectInput, ProjectDeletionResult } from "../modules/projects.js";
import type { AliasDesktopPanelSessionInput, DesktopPanelRecord } from "./app-host.js";
import type { LegacySessionMigrationApi } from "../modules/private-work-context.js";
import type {
  RuntimeWorkContext, RuntimeProjectSuggestionClue, MolisWorkRuntimeContextResolution,
  BindRuntimeWorkContextInput, UnbindRuntimeWorkContextInput, MolisWorkRuntimeContextUnbindResult,
  RejectRuntimeContextSuggestionInput, MolisWorkRuntimeContextSuggestionRejectionResult,
  CreateAndBindRuntimeContextInput,
} from "../modules/private-work-context.js";

/** Host-only identity and configuration; never decoded from model tool arguments. */
export interface MolisWorkRuntimeContextHost {
  homeDirectory?: string;
  runtimeContext: RuntimeWorkContext;
  webBaseUrl?: string;
  molisWorkSessionId?: string | null;
  nativeRuntimeSessionId?: string | null;
  legacyWorkContextId?: string | null;
  goalId?: string | null;
  /**
   * Host-only non-authoritative hints for a fresh Session. They may rank
   * projects, but never establish a binding and are never supplied by a
   * Runtime MCP tool argument.
   */
  projectSuggestionClues?: readonly RuntimeProjectSuggestionClue[];
  /** Desktop TUI panel that launched this MCP process, if any. */
  panelId?: string | null;
}

export interface MolisWorkRuntimeConnection {
  projectId?: string;
  databasePath: string;
  boardId: string;
  webBaseUrl: string;
}

/** Existing project/context operations exposed for a bounded catalog lifetime. */
export interface RuntimeProjectApplicationApi {
  resolveRuntimeContext(context: RuntimeWorkContext, clues?: readonly RuntimeProjectSuggestionClue[]): MolisWorkRuntimeContextResolution;
  listProjects(): ProjectRecord[];
  bindRuntimeContext(input: BindRuntimeWorkContextInput): MolisWorkRuntimeContextResolution;
  unbindRuntimeContext(input: UnbindRuntimeWorkContextInput): MolisWorkRuntimeContextUnbindResult;
  rejectRuntimeContextSuggestion(input: RejectRuntimeContextSuggestionInput): MolisWorkRuntimeContextSuggestionRejectionResult;
  createProjectAndBindRuntimeContext(input: CreateAndBindRuntimeContextInput): Promise<MolisWorkRuntimeContextResolution>;
  deleteProject(input: DeleteProjectInput): Promise<ProjectDeletionResult>;
}

export interface RuntimeProjectCatalogProvider {
  withCatalog<T>(homeDirectory: string | undefined, operation: (catalog: RuntimeProjectApplicationApi) => T | Promise<T>): Promise<T>;
}

export interface RuntimePanelCatalogApi {
  aliasPanelSession(input: AliasDesktopPanelSessionInput): DesktopPanelRecord;
  reconcileSessions(registry: LegacySessionMigrationApi): void;
}

export interface RuntimePanelCatalogProvider {
  withCatalog<T>(homeDirectory: string | undefined, operation: (catalog: RuntimePanelCatalogApi) => T | Promise<T>): Promise<T>;
  isMissingPanel(error: unknown): boolean;
}

/** In-process connection cache only; this is not a persisted project binding. */
export interface RuntimeProjectConnectionState {
  connection: MolisWorkRuntimeConnection | null;
  readonly explicit: boolean;
  observe(context: RuntimeWorkContext): "current" | "refresh_required";
  clear(clearRefresh?: boolean): void;
  accept(connection: MolisWorkRuntimeConnection | null, context: RuntimeWorkContext): void;
}
/** Validated Runtime dialogue fields; Session identity is supplied separately by the host. */
export interface RuntimeGoalTreeConfirmation {
  runtimeActorId: string;
  confirmationSummary: string;
  proposalId: string;
  wholeConfirmationPrompted: boolean;
  idempotencyKey: string;
}
