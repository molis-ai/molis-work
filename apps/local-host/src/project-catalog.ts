import { createCatalogCommit, type CatalogCommit } from "./catalog-commit.js";
import { prepareMemoryHome } from "./memory/memory-adoption.js";
import { ModelProviderStore } from "./model-provider-store.js";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { ManagedProjectFiles } from "./managed-project-files.js";
import { isPersonalSpace, PERSONAL_SPACE_PROJECT_ID, PERSONAL_SPACE_TITLE } from "./personal-space.js";
import { BUILTIN_PLUGIN_REGISTRY } from "./plugin-registry.js";
import { alwaysOnProjectPlugins } from "./always-on-plugins.js";
import { homePluginsOutsideBuild } from "./home-registration.js";
import { ManagedProjectDeletion } from "./managed-project-deletion.js";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { DemoProjectLifecycle } from "./demo-project-lifecycle.js";
import { exists } from "./project-file-paths.js";
import { type CreateMolisWorkProjectInput } from "./project-catalog-contract.js";
import { type ManageMolisWorkDemoProjectInput } from "./project-catalog-contract.js";
import { type MolisWorkDemoProjectResult } from "./project-catalog-contract.js";
export type { CreateMolisWorkProjectInput } from "./project-catalog-contract.js";
export type { ManageMolisWorkDemoProjectInput } from "./project-catalog-contract.js";
export type { MolisWorkDemoProjectResult } from "./project-catalog-contract.js";
import { assertCurrentCatalog, assertOwnedCatalog, initializeCatalog } from "./catalog-schema.js";
import { catalogErrors, catalogFailure } from "./project-catalog-contract.js";
export { catalogSchemaCompatibilityError } from "./project-catalog-contract.js";
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
  ProjectPluginMembership,
  ProjectPluginRegistry,
  RemoveProjectPluginInput,
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
  createRuntimeContextModule, createRuntimeProjectBindingValidation,
} from "@molis-ai/molis-work-module-private-work-context";
import { DEMO_PROJECT_ID, seedDemoBoard } from "./demo-seed.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";




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

/** The Home adoption gate precedes the catalog's first filesystem or SQLite write. */
async function prepareCatalogStorage(options: MolisWorkProjectCatalogOptions) {
  const homeDirectory = resolveConfiguredHome(options.homeDirectory);
  prepareMemoryHome(homeDirectory);
  const projectsDirectory = path.join(homeDirectory, "projects");
  await fs.mkdir(projectsDirectory, { recursive: true });
  const databasePath = path.join(projectsDirectory, "catalog.db");
  const existed = await exists(databasePath);
  const storage = new LocalSqliteStorage(databasePath);
  return { homeDirectory, databasePath, existed, storage };
}

/** Local catalog resource lifetime and explicit composition of Project, Session and platform owners. */
/**
 * The registry a Home's projects validate against. Which Plugins a project may enable comes from what this build ships, not from a list
 * compiled into Projects; which are 常开 is worked out from the install records and the Home's consent ledger each time it is asked. The
 * Home's own registration adds its personal plugins outside the build, so a project can hide those too (#679).
 */
function homeProjectPlugins(homeDirectory: string): ProjectPluginRegistry {
  return { ...BUILTIN_PLUGIN_REGISTRY, alwaysOn: () => alwaysOnProjectPlugins(homeDirectory),
    isPersonal: pluginId => BUILTIN_PLUGIN_REGISTRY.isPersonal?.(pluginId) === true || homePluginsOutsideBuild(homeDirectory).includes(pluginId) };
}

export class MolisWorkProjectCatalog {
  readonly homeDirectory: string;
  readonly projectsDirectory: string;
  readonly databasePath: string;
  private readonly projectFiles: ManagedProjectFiles;
  readonly projectDeletion: ManagedProjectDeletion;
  private readonly demoProjects: DemoProjectLifecycle;
  private readonly projects: ProjectsModule;
  private readonly runtimeContexts: ReturnType<typeof createRuntimeContextModule>;
  readonly desktopPanels: DesktopPanelCatalogApi;
  readonly personalPlanningMethods: PersonalPlanningMethods;
  readonly models: ModelProviderStore;

  readonly commit: CatalogCommit;

  private constructor(
    private readonly storage: LocalSqliteStorage,
    homeDirectory: string,
    ledger: ContextLedgerApi,
    platform: LocalCatalogPlatform,
  ) {
    const db = storage.db;
    this.commit = createCatalogCommit(db, () => this.assertCurrentSchema());
    this.personalPlanningMethods = new PersonalPlanningMethods(db);
    this.models = new ModelProviderStore({ db, secrets: {
      get: (ref) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().get(ref)),
    } });
    this.homeDirectory = homeDirectory;
    this.projectsDirectory = path.join(homeDirectory, "projects");
    this.databasePath = path.join(this.projectsDirectory, "catalog.db");
    this.projects = new ProjectsModule({
      db,
      plugins: homeProjectPlugins(homeDirectory),
    });
    this.runtimeContexts = createRuntimeContextModule({
      db, ledger, projects: this.projects, validation: contextBindingValidation,
    });
    this.projectFiles = new ManagedProjectFiles(this.projects, this.projectsDirectory, contextBindingValidation, this.commit);
    this.projectDeletion = new ManagedProjectDeletion(this.projects, this.projectsDirectory, {
      removeBindings: (projectId, actorId, at) => this.runtimeContexts.removeProjectFacts(projectId, actorId, at),
      removePanels: projectId => this.desktopPanels.deleteForProject(projectId),
    }, contextBindingValidation, this.commit, projectDeletedHooksFor(homeDirectory));
    this.demoProjects = new DemoProjectLifecycle(
      this.projects,
      this.projectsDirectory,
      { projectId: DEMO_PROJECT_ID, seed: seedDemoBoard },
      this.projectDeletion,
      contextBindingValidation,
      this.commit, projectDeletedHooksFor(homeDirectory),
    );
    this.desktopPanels = platform.createPanels(db, {
      errorFactory: catalogFailure,
      context: {
        assertProject: (projectId) => { this.getProject(projectId); },
        bind: (input) => {
          const workspace = input.cwd
            ? normalizeRuntimeWorkspaceContext({ canonical_path: input.cwd, realpath_verified: false })
            : undefined;
          this.runtimeContexts.commands.bindRuntimeContextInTransaction({
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
          this.projects.lifecycle.appendEvent(projectId, type, actorId, payload);
        },
      },
    });
  }

  static async open(options: MolisWorkProjectCatalogOptions, platform: LocalCatalogPlatform): Promise<MolisWorkProjectCatalog> {
    const { homeDirectory, databasePath, existed, storage } = await prepareCatalogStorage(options);
    const db = storage.db;
    try {
      if (existed) {
        assertOwnedCatalog(storage, databasePath);
        assertCurrentCatalog(storage, databasePath);
        const ledger = createContextLedger(db, {
          initializeSchema: false,
          authorize: (access) => access.scope.kind === "personal" && access.scope.id === "private-work-context",
        });
        return new MolisWorkProjectCatalog(storage, homeDirectory, ledger, platform);
      }
      const catalog = db.transaction(() => {
        // The async existence check can predate another connection's initialization.
        // Re-read under the write transaction, and never initialize over an unknown nonempty database.
        const initialized = existed || Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' LIMIT 1").get());
        if (initialized) {
          assertOwnedCatalog(storage, databasePath);
          assertCurrentCatalog(storage, databasePath);
        }
        const ledger = createContextLedger(db, {
          initializeSchema: !initialized,
          authorize: (access) => access.scope.kind === "personal" && access.scope.id === "private-work-context",
        });
        if (!initialized) initializeCatalog(storage, platform.createPanelSchema);
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

  /** A retained connection must not outlive the owner/schema it was opened for. */
  assertCurrentSchema(): void {
    assertOwnedCatalog(this.storage, this.databasePath);
    assertCurrentCatalog(this.storage, this.databasePath);
  }

  listProjects(): MolisWorkProjectRecord[] {
    return this.projects.query.listProjects();
  }

  projectPluginMembership(projectId: string): ProjectPluginMembership {
    return this.projects.query.projectPluginMembership(projectId);
  }

  listProjectPlugins(projectId: string): ProjectPluginId[] {
    return this.projects.query.listProjectPlugins(projectId);
  }

  addProjectPlugin(input: AddProjectPluginInput): ProjectPluginId[] {
    return this.projects.commands.addProjectPlugin(input);
  }

  removeProjectPlugin(input: RemoveProjectPluginInput): ProjectPluginMembership {
    return this.projects.commands.removeProjectPlugin(input);
  }

  getProject(projectId: string): MolisWorkProjectRecord {
    return this.projects.query.getProject(projectId);
  }
  resolveRuntimeContext(context: RuntimeWorkContext, suggestionClues: readonly RuntimeProjectSuggestionClue[] = []): MolisWorkRuntimeContextResolution {
    return this.runtimeContexts.commands.resolveRuntimeContext(context, suggestionClues);
  }
  rejectRuntimeContextSuggestion(
    input: RejectRuntimeContextSuggestionInput,
  ): MolisWorkRuntimeContextSuggestionRejectionResult { return this.runtimeContexts.commands.rejectRuntimeContextSuggestion(input); }
  bindRuntimeContext(input: BindRuntimeWorkContextInput): MolisWorkRuntimeContextResolution { return this.runtimeContexts.commands.bindRuntimeContext(input); }
  unbindRuntimeContext(input: UnbindRuntimeWorkContextInput): MolisWorkRuntimeContextUnbindResult { return this.runtimeContexts.commands.unbindRuntimeContext(input); }
  async createProjectAndBindRuntimeContext(input: CreateAndBindRuntimeContextInput, beforeEffect: () => void = () => undefined): Promise<MolisWorkRuntimeContextResolution> {
    return this.runtimeContexts.createProjectAndBindRuntimeContext(input, {
      registerProject: (record, eventType, actorId) => { beforeEffect(); this.projects.lifecycle.register(record, eventType, actorId); },
      provisionCreatedProject: (input, commit) => this.projectFiles.provisionCreatedProject(input, commit, beforeEffect),
    });
  }
  listRuntimeContextBindingEvents(
    context?: RuntimeWorkContext,
  ): MolisWorkRuntimeContextBindingEvent[] { return this.runtimeContexts.commands.listRuntimeContextBindingEvents(context); }
  listRuntimeContextBindings(): MolisWorkRuntimeContextBinding[] { return this.runtimeContexts.commands.listRuntimeContextBindings(); }

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
  /** The personal space exists once it is first used; creating it again returns the same one. */
  async ensurePersonalSpace(actorId = LOCAL_PERSON_ACTOR_ID): Promise<MolisWorkProjectRecord> {
    const existing = this.listProjects().find(isPersonalSpace);
    if (existing) return existing;
    try {
      return await this.projectFiles.provisionCreatedProject({ displayName: PERSONAL_SPACE_TITLE, actorId, projectId: PERSONAL_SPACE_PROJECT_ID }, (record) => {
        this.projects.lifecycle.register(record, "project.created", actorId);
        return record;
      });
    } catch (error) {
      // Another request made it first.
      const made = this.listProjects().find(isPersonalSpace);
      if (made) return made;
      throw error;
    }
  }
  async ensureDemoProject(input: ManageMolisWorkDemoProjectInput): Promise<MolisWorkDemoProjectResult> { return this.demoProjects.ensureDemoProject(input); }
  async resetDemoProject(input: ManageMolisWorkDemoProjectInput): Promise<MolisWorkDemoProjectResult> { return this.demoProjects.resetDemoProject(input); }
  async removeDemoProject(input: DeleteMolisWorkProjectInput): Promise<MolisWorkProjectDeletionResult> { return this.demoProjects.removeDemoProject(input); }

  listProjectDeletions(): MolisWorkProjectDeletionRecord[] {
    return this.projects.query.listProjectDeletions();
  }
  async deleteProject(input: DeleteMolisWorkProjectInput): Promise<MolisWorkProjectDeletionResult> {
    if (input.project_id === PERSONAL_SPACE_PROJECT_ID) throw catalogErrors.personal_space("个人空间不能删除；可以把里面的内容移到项目或逐个删除");
    return this.projectDeletion.deleteProject(input);
  }

  renameProject(projectId: string, displayName: string, actorId: string): MolisWorkProjectRecord {
    if (projectId === PERSONAL_SPACE_PROJECT_ID) throw catalogErrors.personal_space("个人空间不能改名");
    return this.projects.commands.renameProject(projectId, displayName, actorId);
  }

  /** Persisted page projection; callers must keep using listProjectPlugins for availability and command guards. */
  storedProjectPluginMembership(projectId: string) {
    return this.projects.query.storedProjectPluginMembership(projectId);
  }
}

const contextBindingValidation = createRuntimeProjectBindingValidation({
  normalizeProjectWorkspace,
});
export const { normalizeRuntimeWorkContext } = contextBindingValidation;
const { normalizeRuntimeWorkspaceContext } = contextBindingValidation;
