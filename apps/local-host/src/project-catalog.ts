import { ModelProviderStore } from "./model-provider-store.js";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { ManagedProjectFiles } from "./managed-project-files.js";
import { BUILTIN_PLUGIN_REGISTRY } from "@molis-ai/molis-work-app-workbench";
import { ManagedProjectDeletion } from "./managed-project-deletion.js";
import { DemoProjectLifecycle } from "./demo-project-lifecycle.js";
import { exists } from "./project-file-paths.js";
import { type CreateMolisWorkProjectInput } from "./project-catalog-contract.js";
import { type ManageMolisWorkDemoProjectInput } from "./project-catalog-contract.js";
import { type MolisWorkDemoProjectResult } from "./project-catalog-contract.js";
export { CreateMolisWorkProjectInput } from "./project-catalog-contract.js";
export { ManageMolisWorkDemoProjectInput } from "./project-catalog-contract.js";
export { MolisWorkDemoProjectResult } from "./project-catalog-contract.js";
import { initializeCatalog } from "./catalog-migrations.js";
import { assertOwnedCatalog } from "./catalog-migrations.js";
import { migrateCatalog } from "./catalog-migrations.js";
import { MolisWorkProjectCatalogError } from "./project-catalog-contract.js";
export { MolisWorkProjectCatalogError } from "./project-catalog-contract.js";
export { catalogSchemaCompatibilityError } from "./project-catalog-contract.js";
export { type MolisWorkProjectCatalogErrorDetails } from "./project-catalog-contract.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveConfiguredHome } from "./product-home.js";
import { LocalSqliteStorage, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { PersonalPlanningMethods } from "@molis-ai/molis-work-module-goals";
import {
  type DesktopPanelCatalogApi,
  type DesktopPanelContextPort,
  type DesktopPanelErrorCode,
  type AliasDesktopPanelSessionInput,
  type DesktopPanelRecord,
  type OpenDesktopPanelInput,
} from "@molis-ai/molis-work-contracts/platform/app-host";
import type {
  AddProjectPluginInput,
  ProjectPluginId,
  AddWorkspaceProjectInput,
  ChangeWorkspaceProjectInput,
  DeleteProjectInput,
  ProjectDeletionRecord,
  ProjectDeletionResult,
  ProjectRecord,
  ProjectSelection,
  ProjectWorkspaceDirectoryRecord,
  ProjectWorkspaceMembership,
  RepairWorkspaceProjectInput,
} from "@molis-ai/molis-work-contracts/modules/projects";
import {
  normalizeProjectWorkspace,
  ProjectsModule,
} from "@molis-ai/molis-work-module-projects";
import type {
  RuntimeContextBindingEventRecord,
  RuntimeContextBindingRecord,
} from "@molis-ai/molis-work-contracts/modules/private-work-context";
import {
  RuntimeContextBindingRepository, RuntimeProjectResolution, RuntimeProjectBindingCommands, createRuntimeProjectSetup, createRuntimeProjectBindingValidation,
} from "@molis-ai/molis-work-module-private-work-context";
import { DEMO_BOARD_ID, seedDemoBoard } from "./demo-seed.js";




export type MolisWorkProjectRecord = ProjectRecord;

export interface MolisWorkProjectCatalogOptions {
  /** Defaults to ~/.molis-work. */
  homeDirectory?: string;
}

/**
 * An identity supplied by the Runtime host for the work entry the user is
 * currently using. `stable_work_context_id` is deliberately opaque: Molis Work
 * never derives it from a repository, directory, or conversation. Reusing an
 * ID resumes the same host Session/work entry; a fresh Session must receive a
 * fresh ID from its host.
 */
export type RuntimeWorkContext = import("@molis-ai/molis-work-contracts/modules/private-work-context").RuntimeWorkContext;

export type NormalizedRuntimeWorkContext = import("@molis-ai/molis-work-contracts/modules/private-work-context").NormalizedRuntimeWorkContext;

export type RuntimeWorkspaceContext = import("@molis-ai/molis-work-contracts/modules/private-work-context").RuntimeWorkspaceContext;

export type NormalizedRuntimeWorkspaceContext = import("@molis-ai/molis-work-contracts/modules/private-work-context").NormalizedRuntimeWorkspaceContext;

export type MolisWorkProjectBindingScope = import("@molis-ai/molis-work-contracts/modules/private-work-context").MolisWorkProjectBindingScope;

export type MolisWorkWorkspaceMembership = ProjectWorkspaceMembership;
export type MolisWorkWorkspaceDirectoryRecord = ProjectWorkspaceDirectoryRecord;
export type { AddWorkspaceProjectInput, RepairWorkspaceProjectInput, ChangeWorkspaceProjectInput };
export type MolisWorkProjectSelection = ProjectSelection;

/**
 * A non-authoritative, host-owned clue that can rank existing projects for a
 * fresh Session. It is never an identity and is never accepted from a Runtime
 * MCP tool argument.
 */
export type RuntimeProjectSuggestionClueKind = import("@molis-ai/molis-work-contracts/modules/private-work-context").RuntimeProjectSuggestionClueKind;

export type RuntimeProjectSuggestionClue = import("@molis-ai/molis-work-contracts/modules/private-work-context").RuntimeProjectSuggestionClue;

export type MolisWorkProjectSuggestion = import("@molis-ai/molis-work-contracts/modules/private-work-context").MolisWorkProjectSuggestion;

export type MolisWorkRuntimeContextBinding = RuntimeContextBindingRecord;

export type MolisWorkDesktopPanelRecord = DesktopPanelRecord;
export type OpenMolisWorkDesktopPanelInput = OpenDesktopPanelInput;
export type AliasMolisWorkDesktopPanelSessionInput = AliasDesktopPanelSessionInput;

export type MolisWorkRuntimeContextBindingEvent = RuntimeContextBindingEventRecord;

export type MolisWorkProjectConnection = import("@molis-ai/molis-work-contracts/modules/private-work-context").MolisWorkProjectConnection;

export type MolisWorkRuntimeContextResolution = import("@molis-ai/molis-work-contracts/modules/private-work-context").MolisWorkRuntimeContextResolution;

export type BindRuntimeWorkContextInput = import("@molis-ai/molis-work-contracts/modules/private-work-context").BindRuntimeWorkContextInput;

export type UnbindRuntimeWorkContextInput = import("@molis-ai/molis-work-contracts/modules/private-work-context").UnbindRuntimeWorkContextInput;

export type MolisWorkRuntimeContextUnbindResult = import("@molis-ai/molis-work-contracts/modules/private-work-context").MolisWorkRuntimeContextUnbindResult;

export type RejectRuntimeContextSuggestionInput = import("@molis-ai/molis-work-contracts/modules/private-work-context").RejectRuntimeContextSuggestionInput;

export type MolisWorkRuntimeContextSuggestionRejectionResult = import("@molis-ai/molis-work-contracts/modules/private-work-context").MolisWorkRuntimeContextSuggestionRejectionResult;

export type DeleteMolisWorkProjectInput = DeleteProjectInput;
export type MolisWorkProjectDeletionRecord = ProjectDeletionRecord;
export type MolisWorkProjectDeletionResult = ProjectDeletionResult;

/**
 * Creates a new Molis Work project and binds it to the host-declared work
 * entry in one recoverable operation. Call this only after the user has
 * explicitly asked for a new project in the current Runtime conversation.
 */
export type CreateAndBindRuntimeContextInput = import("@molis-ai/molis-work-contracts/modules/private-work-context").CreateAndBindRuntimeContextInput;

export interface LocalCatalogPlatform {
  createPanelSchema(db: SqliteDatabase): void;
  createPanels(db: SqliteDatabase, ports: {
    context: DesktopPanelContextPort;
    errorFactory(code: DesktopPanelErrorCode, message: string): Error;
  }): DesktopPanelCatalogApi;
}

/** Local catalog resource lifetime and explicit composition of Project, Session and platform owners. */
export class MolisWorkProjectCatalog {
  readonly homeDirectory: string;
  readonly projectsDirectory: string;
  readonly databasePath: string;
  private readonly projectFiles: ManagedProjectFiles;
  private readonly projectDeletion: ManagedProjectDeletion;
  private readonly demoProjects: DemoProjectLifecycle;
  private readonly projects: ProjectsModule;
  private readonly workContexts: RuntimeContextBindingRepository;
  private readonly contextBindings: RuntimeProjectBindingCommands;
  private readonly contextResolution: RuntimeProjectResolution;
  readonly desktopPanels: DesktopPanelCatalogApi;
  readonly personalPlanningMethods: PersonalPlanningMethods;
  readonly models: ModelProviderStore;

  private constructor(
    private readonly storage: LocalSqliteStorage,
    homeDirectory: string,
    ledger: ContextLedgerApi,
    platform: LocalCatalogPlatform,
  ) {
    const db = storage.db;
    this.personalPlanningMethods = new PersonalPlanningMethods(db);
    this.models = new ModelProviderStore({ db, secrets: {
      put: (ref, value) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().put(ref, value)),
      get: (ref) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().get(ref)),
      delete: (ref) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().delete(ref)),
    } });
    this.homeDirectory = homeDirectory;
    this.projectsDirectory = path.join(homeDirectory, "projects");
    this.databasePath = path.join(this.projectsDirectory, "catalog.db");
    this.projects = new ProjectsModule({
      db,
      errorFactory: (code, message) =>
        new MolisWorkProjectCatalogError(code as MolisWorkProjectCatalogError["code"], message),
      // Which Plugins a project may enable comes from what this build ships, not
      // from a list compiled into Projects.
      plugins: BUILTIN_PLUGIN_REGISTRY,
    });
    this.workContexts = new RuntimeContextBindingRepository(db, {
      ledger, assertProject: (projectId) => { this.projects.query.getProject(projectId); },
    });
    this.contextResolution = new RuntimeProjectResolution(this.projects.query, this.workContexts);
    this.contextBindings = new RuntimeProjectBindingCommands(
      this.workContexts, this.contextResolution, this.projects, contextBindingValidation,
      (code, message) => new MolisWorkProjectCatalogError(code, message),
      operation => db.transaction(operation)(),
    );
    this.projectFiles = new ManagedProjectFiles(this.projects, this.projectsDirectory, contextBindingValidation);
    this.projectDeletion = new ManagedProjectDeletion(this.projects, this.projectsDirectory, {
      removeBindings: (projectId, actorId, at) => this.workContexts.removeProjectFacts(projectId, actorId, at),
      removePanels: projectId => this.desktopPanels.deleteForProject(projectId),
    }, contextBindingValidation);
    this.demoProjects = new DemoProjectLifecycle(
      this.projects,
      this.homeDirectory,
      this.projectsDirectory,
      { boardId: DEMO_BOARD_ID, seed: seedDemoBoard },
      this.projectDeletion,
      contextBindingValidation,
    );
    this.desktopPanels = platform.createPanels(db, {
      errorFactory: (code, message) => new MolisWorkProjectCatalogError(code, message),
      context: {
        assertProject: (projectId) => { this.getProject(projectId); },
        bind: (input) => {
          const workspace = input.cwd
            ? normalizeRuntimeWorkspaceContext({ canonical_path: input.cwd, realpath_verified: false })
            : undefined;
          this.contextBindings.bindRuntimeContextInTransaction({
            normalized: {
              runtime_id: input.runtime_id,
              stable_work_context_id: input.stable_work_context_id,
              ...(workspace ? { workspace } : {}),
            },
            projectId: input.project_id,
            actorId: input.actor_id,
            rebindConfirmed: true,
            bindingScope: "session",
          });
        },
        appendProjectEvent: (projectId, type, actorId, payload) => {
          this.appendEvent(projectId, type, actorId, payload);
        },
      },
    });
  }

  static async open(options: MolisWorkProjectCatalogOptions, platform: LocalCatalogPlatform): Promise<MolisWorkProjectCatalog> {
    const homeDirectory = path.resolve(options.homeDirectory ?? resolveConfiguredHome());
    const projectsDirectory = path.join(homeDirectory, "projects");
    await fs.mkdir(projectsDirectory, { recursive: true });
    const databasePath = path.join(projectsDirectory, "catalog.db");
    const existed = await exists(databasePath);
    const storage = new LocalSqliteStorage(databasePath);
    const db = storage.db;
    try {
      const catalog = db.transaction(() => {
        if (existed) assertOwnedCatalog(storage, databasePath);
        const ledger = createContextLedger(db, {
          authorize: (access) => access.scope.kind === "personal" && access.scope.id === "private-work-context",
        });
        if (existed) migrateCatalog(storage, databasePath, ledger, platform.createPanelSchema);
        else initializeCatalog(storage, platform.createPanelSchema);
        return new MolisWorkProjectCatalog(storage, homeDirectory, ledger, platform);
      }).immediate();
      return catalog;
    } catch (error) {
      storage.close();
      throw error;
    }
  }

  close(): void {
    this.storage.close();
  }

  listProjects(): MolisWorkProjectRecord[] {
    return this.projects.query.listProjects();
  }

  listProjectPlugins(projectId: string): ProjectPluginId[] {
    return this.projects.query.listProjectPlugins(projectId);
  }

  addProjectPlugin(input: AddProjectPluginInput): ProjectPluginId[] {
    return this.projects.commands.addProjectPlugin(input);
  }

  getProject(projectId: string): MolisWorkProjectRecord {
    return this.projects.query.getProject(projectId);
  }
  resolveRuntimeContext(context: RuntimeWorkContext, suggestionClues: readonly RuntimeProjectSuggestionClue[] = []): MolisWorkRuntimeContextResolution {
    return this.contextResolution.resolveRuntimeContext(normalizeRuntimeWorkContext(context), suggestionClues);
  }
  rejectRuntimeContextSuggestion(
    input: RejectRuntimeContextSuggestionInput,
  ): MolisWorkRuntimeContextSuggestionRejectionResult { return this.contextBindings.rejectRuntimeContextSuggestion(input); }
  bindRuntimeContext(input: BindRuntimeWorkContextInput): MolisWorkRuntimeContextResolution { return this.contextBindings.bindRuntimeContext(input); }
  unbindRuntimeContext(input: UnbindRuntimeWorkContextInput): MolisWorkRuntimeContextUnbindResult { return this.contextBindings.unbindRuntimeContext(input); }
  async createProjectAndBindRuntimeContext(input: CreateAndBindRuntimeContextInput): Promise<MolisWorkRuntimeContextResolution> {
    return createRuntimeProjectSetup({
      bindings: this.contextBindings, validation: contextBindingValidation,
      error: (code, message) => new MolisWorkProjectCatalogError(code, message),
      getProject: projectId => this.getProject(projectId),
      registerProject: (record, eventType, actorId) => this.insertProjectInTransaction(record, eventType, actorId),
      insertSetupRequest: input => this.workContexts.insertSetupRequest(input),
      transaction: operation => this.storage.db.transaction(operation)(),
      provisionCreatedProject: (input, commit) => this.projectFiles.provisionCreatedProject(input, commit),
    })(input);
  }
  listRuntimeContextBindingEvents(
    context?: RuntimeWorkContext,
  ): MolisWorkRuntimeContextBindingEvent[] { return this.contextBindings.listRuntimeContextBindingEvents(context); }
  listRuntimeContextBindings(): MolisWorkRuntimeContextBinding[] { return this.contextBindings.listRuntimeContextBindings(); }

  openDesktopPanel(input: OpenMolisWorkDesktopPanelInput): MolisWorkDesktopPanelRecord {
    return this.desktopPanels.open(input);
  }

  listDesktopPanels(projectId: string, goalId?: string): MolisWorkDesktopPanelRecord[] {
    return this.desktopPanels.list(projectId, goalId);
  }

  getDesktopPanel(panelId: string): MolisWorkDesktopPanelRecord {
    return this.desktopPanels.get(panelId);
  }

  markDesktopPanelExited(panelId: string): MolisWorkDesktopPanelRecord {
    return this.desktopPanels.markExited(panelId);
  }

  markDesktopPanelOpen(panelId: string): MolisWorkDesktopPanelRecord {
    return this.desktopPanels.markOpen(panelId);
  }

  closeDesktopPanel(panelId: string, actorId: string): void {
    this.desktopPanels.close(panelId, actorId);
  }

  aliasDesktopPanelSession(input: AliasMolisWorkDesktopPanelSessionInput): MolisWorkDesktopPanelRecord {
    return this.desktopPanels.aliasSession(input);
  }

  findDesktopPanelByWorkContext(
    runtimeId: string,
    workContextId: string,
  ): MolisWorkDesktopPanelRecord | null {
    return this.desktopPanels.findByWorkContext(runtimeId, workContextId);
  }

  preferredWorkspacePath(projectId: string): string | null {
    return this.projects.query.preferredWorkspacePath(projectId);
  }

  /** Safe Web/settings view: deliberately omits the canonical filesystem path. */
  listWorkspaceMemberships(): MolisWorkWorkspaceMembership[] {
    return this.projects.query.listWorkspaceMemberships();
  }

  /** Project-scoped management view. The canonical path never enters global settings. */
  listWorkspaceDirectory(projectId?: string): MolisWorkWorkspaceDirectoryRecord[] {
    return this.projects.query.listWorkspaceDirectory(projectId);
  }

  addWorkspaceProject(input: AddWorkspaceProjectInput): MolisWorkWorkspaceDirectoryRecord {
    return this.projects.commands.addWorkspaceProject(input);
  }

  repairWorkspaceProject(input: RepairWorkspaceProjectInput): MolisWorkWorkspaceDirectoryRecord {
    return this.projects.commands.repairWorkspaceProject(input);
  }

  setWorkspaceDefault(input: ChangeWorkspaceProjectInput): MolisWorkWorkspaceMembership[] {
    return this.projects.commands.setWorkspaceDefault(input);
  }

  removeWorkspaceMembership(input: ChangeWorkspaceProjectInput): MolisWorkWorkspaceMembership[] {
    return this.projects.commands.removeWorkspaceMembership(input);
  }
  async createProject(input: CreateMolisWorkProjectInput): Promise<MolisWorkProjectRecord> { return this.projectFiles.createProject(input); }
  async ensureDemoProject(input: ManageMolisWorkDemoProjectInput): Promise<MolisWorkDemoProjectResult> { return this.demoProjects.ensureDemoProject(input); }
  async resetDemoProject(input: ManageMolisWorkDemoProjectInput): Promise<MolisWorkDemoProjectResult> { return this.demoProjects.resetDemoProject(input); }
  async removeDemoProject(input: DeleteMolisWorkProjectInput): Promise<MolisWorkProjectDeletionResult> { return this.demoProjects.removeDemoProject(input); }

  listProjectDeletions(): MolisWorkProjectDeletionRecord[] {
    return this.projects.query.listProjectDeletions();
  }
  async deleteProject(input: DeleteMolisWorkProjectInput): Promise<MolisWorkProjectDeletionResult> { return this.projectDeletion.deleteProject(input); }

  renameProject(projectId: string, displayName: string, actorId: string): MolisWorkProjectRecord {
    return this.projects.commands.renameProject(projectId, displayName, actorId);
  }

  private insertProjectInTransaction(record: MolisWorkProjectRecord, eventType: string, actorId: string): void {
    this.projects.lifecycle.register(record, eventType, actorId);
  }

  private appendEvent(projectId: string, type: string, actorId: string, payload: Record<string, unknown>): void {
    this.projects.lifecycle.appendEvent(projectId, type, actorId, payload);
  }
}

const contextBindingValidation = createRuntimeProjectBindingValidation({
  error: (code, message) => new MolisWorkProjectCatalogError(code, message),
  normalizeProjectWorkspace,
});
export const { normalizeRuntimeWorkContext } = contextBindingValidation;
const { normalizeRuntimeWorkspaceContext } = contextBindingValidation;
