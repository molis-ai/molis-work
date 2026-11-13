import type { RuntimeContextBindingPage } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { createCatalogCommit, type CatalogCommit } from "./catalog-commit.js";
import { preflightMemoryHome, prepareMemoryHome } from "./memory/memory-initialization.js";
import { ModelProviderStore } from "./model-provider-store.js";
import { assertStorageOwner, assertNoPendingHomeRestore, retainStorageOwner, type StorageOwner, ensureStorageSpace, bindDatabaseSpace, createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { acquireUpgradedHomeOwner } from "./home-storage-lifetime.js";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { ManagedProjectFiles } from "./managed-project-files.js";
import { PERSONAL_SPACE_PROJECT_ID } from "./personal-space.js";
import { BUILTIN_PLUGIN_REGISTRY } from "./plugin-registry.js";
import { alwaysOnProjectPlugins } from "./always-on-plugins.js";
import { homePluginsOutsideBuild } from "./home-registration.js";
import { PersonalProjectProvisioner } from './personal-project-provisioner.js';
import {preflightProjectCatalog,projectPluginRequirements} from './project-catalog-replication.js';
import { ManagedProjectDeletion } from "./managed-project-deletion.js";
import { advanceReadCheckGeneration } from "@molis-ai/molis-work-plugin-runtime";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { DemoProjectLifecycle } from "./demo-project-lifecycle.js";
import { exists } from "./project-file-paths.js";
import { type CreateMolisWorkProjectInput } from "./project-catalog-contract.js";
import { type ManageMolisWorkDemoProjectInput } from "./project-catalog-contract.js";
import { type MolisWorkDemoProjectResult } from "./project-catalog-contract.js";
export type { CreateMolisWorkProjectInput } from "./project-catalog-contract.js";
export type { ManageMolisWorkDemoProjectInput } from "./project-catalog-contract.js";
export type { MolisWorkDemoProjectResult } from "./project-catalog-contract.js";
import { assertCurrentCatalog, assertOwnedCatalog, inspectCurrentCatalogSnapshot, initializeCatalog } from "./catalog-schema.js";
import { PluginTerminalPanels } from "./plugin-terminal-panels.js";
import { catalogErrors } from "./project-catalog-contract.js";
export { catalogSchemaCompatibilityError } from "./project-catalog-contract.js";
import { promises as fs, realpathSync } from "node:fs";
import path from "node:path";
import { resolveConfiguredHome } from "./product-home.js";
import { LocalSqliteStorage, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type {
  AddProjectPluginInput,
  ProjectPluginId,
  ProjectPluginMembership,
  ProjectPluginRegistry,
  RemoveProjectPluginInput,
  VersionedProjectPluginMembership,
  AddWorkspaceProjectInput,
  ChangeDirectoriesInput,
  DeleteProjectInput,
  ProjectDeletionRecord,
  ProjectDeletionResult,
  ProjectRecord,
  ProjectSelection,
  ProjectWorkspaceDirectoryRecord,
  ProjectDirectories,
  ProjectWorkspaceMembership,
  ProjectWorkspaceRef,
} from "@molis-ai/molis-work-contracts/modules/projects";
import { directoryInputOnly, projectDirectoryErrors } from "@molis-ai/molis-work-contracts/modules/projects";
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
import { DEMO_PROJECT_ID, seedDemoGoals } from "./demo-seed.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";




export type MolisWorkProjectRecord = ProjectRecord;

export interface MolisWorkProjectCatalogOptions {
  /** Defaults to ~/.molis-work. */
  homeDirectory?: string;
  /** A trusted same-Home parent; only an actual live opaque capability can be retained. */
  storageOwner?: StorageOwner;
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
export type { AddWorkspaceProjectInput, ChangeDirectoriesInput };
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

/** The complete memory preference gate precedes the catalog's first filesystem or SQLite write. */
async function prepareCatalogStorage(options: MolisWorkProjectCatalogOptions) {
  const homeDirectory = resolveConfiguredHome(options.homeDirectory);
  prepareMemoryHome(homeDirectory, options.storageOwner);
  const projectsDirectory = path.join(homeDirectory, "projects");
  await fs.mkdir(projectsDirectory, { recursive: true });
  const databasePath = path.join(projectsDirectory, "catalog.db");
  const existed = await exists(databasePath);
  if (existed) {
    preflightProjectCatalog(databasePath);
    const inspection = new LocalSqliteStorage(databasePath, { readonly: true });
    try {
      assertOwnedCatalog(inspection, databasePath);
      assertCurrentCatalog(inspection, databasePath);
    } finally { inspection.close(); }
  }
  const storage = new LocalSqliteStorage(databasePath);
  return { homeDirectory, databasePath, existed, storage };
}

type ProjectPluginDirectory = () => readonly ProjectPluginId[];
/**
 * The registry a Home's projects validate against. Which Plugins a project may enable comes from what this build ships, not from a list
 * compiled into Projects; which are 常开 is worked out from the install records and the Home's consent ledger each time it is asked. The
 * Home's own registration adds its personal plugins outside the build, so a project can hide those too (#679).
 */
function homeProjectPlugins(homeDirectory: string) {
  let current: ProjectPluginDirectory | undefined;
  const registry: ProjectPluginRegistry = { ...BUILTIN_PLUGIN_REGISTRY, alwaysOn: () => [...(current?.() ?? alwaysOnProjectPlugins(homeDirectory))],
    isPersonal: pluginId => BUILTIN_PLUGIN_REGISTRY.isPersonal?.(pluginId) === true || homePluginsOutsideBuild(homeDirectory).includes(pluginId) };
  // A page may borrow its own directory snapshot only during this synchronous read. Other callers see the live registry.
  const withDirectory = <T>(directory: ProjectPluginDirectory | undefined, read: () => T): T => {
    const previous = current;
    current = directory;
    try { return read(); } finally { current = previous; }
  };
  return { registry, withDirectory };
}

/** Local catalog resource lifetime and explicit composition of Project, Session and platform owners. */
export class MolisWorkProjectCatalog {
  readonly homeDirectory: string;
  readonly projectsDirectory: string;
  readonly databasePath: string;
  private readonly projectFiles: ManagedProjectFiles;
  readonly projectDeletion: ManagedProjectDeletion;
  readonly recycle: ProjectsModule['recycle'];
  readonly setProjectPlugin: ProjectsModule["commands"]["setProjectPlugin"];
  private readonly demoProjects: DemoProjectLifecycle;
  private readonly projects: ProjectsModule;
  private readonly withProjectPluginDirectory: ReturnType<typeof homeProjectPlugins>["withDirectory"];
  private readonly runtimeContexts: ReturnType<typeof createRuntimeContextModule>;
  /** The terminals plugins start through `services.terminal`. */
  readonly terminalPanels: PluginTerminalPanels;
  readonly models: ModelProviderStore;

  readonly commit: CatalogCommit;
  private readonly personalProjects: PersonalProjectProvisioner;
  readonly wasProjectPluginRemoved:(projectId:string,pluginId:string)=>boolean;
  readonly ensureSyncedProject: PersonalProjectProvisioner['ensureSyncedProject'];
  readonly prepareSyncedProjectRestore: PersonalProjectProvisioner['prepareSyncedProjectRestore'];
  readonly projectPluginRequirements:(projectId:string)=>ReturnType<typeof projectPluginRequirements>;

  private constructor(
    private readonly storage: LocalSqliteStorage,
    homeDirectory: string,
    ledger: ContextLedgerApi,
  ) {
    const db = storage.db;
    this.commit = createCatalogCommit(db, () => this.assertCurrentSchema());
    bindDatabaseSpace(db, ensureStorageSpace(homeDirectory));
    this.models = new ModelProviderStore({ db, secrets: {
      get: (ref) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().get(ref)),
    } });
    this.homeDirectory = homeDirectory;
    this.projectsDirectory = path.join(homeDirectory, "projects");
    this.databasePath = path.join(this.projectsDirectory, "catalog.db");
    // `outputs` is derived from the trusted Home each time the catalog opens, never stored: a copied Home reads its own (S-102).
    const space = ensureStorageSpace(homeDirectory), realHome = realpathSync.native(homeDirectory), outputsDirectory = path.join(realHome, "outputs");
    const { registry, withDirectory } = homeProjectPlugins(homeDirectory);
    this.withProjectPluginDirectory = withDirectory;
    this.projects = new ProjectsModule({
      spaceId: space.spaceId,
      db, projects_directory: this.projectsDirectory,
      outputs_directory: outputsDirectory,
      // An account Home is `<root>/spaces/<space_id>`: a folder named for another device's directory stays out of the whole root (SSC-27).
      root_home_directory: space.kind === "local" ? realHome : path.dirname(path.dirname(realHome)),
      plugins: registry,
    });
    this.runtimeContexts = createRuntimeContextModule({
      db, ledger, projects: this.projects, validation: contextBindingValidation,
    });
    this.projectFiles = new ManagedProjectFiles(this.projects, this.projectsDirectory, contextBindingValidation, this.commit);
    this.personalProjects = new PersonalProjectProvisioner(homeDirectory, this.projectFiles, this.projects);
    this.recycle=this.projects.recycle;this.wasProjectPluginRemoved=this.projects.query.wasProjectPluginRemoved;
    this.setProjectPlugin = (projectId, actorId, input) => bumpAnd(this, () => this.projects.commands.setProjectPlugin(projectId, actorId, input));
    this.ensureSyncedProject = this.personalProjects.ensureSyncedProject.bind(this.personalProjects);
    this.prepareSyncedProjectRestore = this.personalProjects.prepareSyncedProjectRestore.bind(this.personalProjects);
    this.projectPluginRequirements=id=>{this.projects.query.getProject(id);return projectPluginRequirements(db,id,p=>BUILTIN_PLUGIN_REGISTRY.has(p)||BUILTIN_PLUGIN_REGISTRY.isPersonal?.(p)===true);};
    this.projectDeletion = new ManagedProjectDeletion(this.projects, this.projectsDirectory, {
      removeBindings: (projectId, actorId, at) => this.runtimeContexts.removeProjectFacts(projectId, actorId, at),
      removePanels: projectId => this.terminalPanels.deleteForProject(projectId),
    }, contextBindingValidation, this.commit, projectDeletedHooksFor(homeDirectory), outputsDirectory);
    this.demoProjects = new DemoProjectLifecycle(
      this.projects,
      this.projectsDirectory,
      { projectId: DEMO_PROJECT_ID, seed: seedDemoGoals },
      this.projectDeletion,
      contextBindingValidation,
      this.commit, projectDeletedHooksFor(homeDirectory),
    );
    // A terminal record binds a runtime's work context and journals into the project.
    this.terminalPanels = new PluginTerminalPanels(db, { bind: terminalContextBinder(this.runtimeContexts),
      appendProjectEvent: (projectId: string, type: string, actorId: string, payload: Record<string, unknown>) => this.projects.lifecycle.appendEvent(projectId, type, actorId, payload) });
  }

  /** Current owner composition in disposable memory authenticates the full archived catalog, without retired desktop tables. */
  static inspectSnapshot(database: SqliteDatabase): Readonly<Record<string, string | number>> {
    return inspectCurrentCatalogSnapshot(database);
  }

  static async open(options: MolisWorkProjectCatalogOptions): Promise<MolisWorkProjectCatalog> {
    const home = resolveConfiguredHome(options.homeDirectory), root = agentRuntimeDirectory(home);
    // Given an owner, that owner's taker has already upgraded this Home.
    const owned = options.storageOwner === undefined ? acquireUpgradedHomeOwner(home, preflightMemoryHome) : undefined;
    const owner = options.storageOwner ?? owned!;
    let retained: ReturnType<typeof retainStorageOwner> | undefined;
    let opened: MolisWorkProjectCatalog | undefined;
    try {
      retained = retainStorageOwner(root, owner);
      opened = await this.openOwned({ ...options, homeDirectory: home, storageOwner: owner });
    } catch (error) { retained?.release(); owned?.release(); throw error; }
    const holding = retained;
    opened.releaseOwner = () => { holding.release(); owned?.release(); };
    opened.checkOwner = () => { assertStorageOwner(root, owner); assertNoPendingHomeRestore(root); };
    return opened;
  }

  private static async openOwned(options: MolisWorkProjectCatalogOptions): Promise<MolisWorkProjectCatalog> {
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
        return new MolisWorkProjectCatalog(storage, homeDirectory, ledger);
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
        if (!initialized) { bindDatabaseSpace(db,ensureStorageSpace(homeDirectory)); initializeCatalog(storage); }
        return new MolisWorkProjectCatalog(storage, homeDirectory, ledger);
      }).immediate();
      return catalog;
    } catch (error) {
      storage.close();
      throw error;
    }
  }

  private releaseOwner?: () => void;
  private checkOwner?: () => void;

  close(): void {
    this.storage.close();
    this.releaseOwner?.(); this.releaseOwner = undefined;
  }

  /** A retained connection must not outlive the owner/schema it was opened for. */
  assertCurrentSchema(): void {
    this.checkOwner?.();
    assertOwnedCatalog(this.storage, this.databasePath);
    assertCurrentCatalog(this.storage, this.databasePath);
  }

  listProjects(): MolisWorkProjectRecord[] {
    return this.projects.query.listProjects();
  }

  projectPluginMembership(projectId: string, directory?: () => readonly ProjectPluginId[]): ProjectPluginMembership {
    return this.withProjectPluginDirectory(directory, () => this.projects.query.projectPluginMembership(projectId));
  }
  projectPluginMembershipWithRevision(projectId: string, directory?: ProjectPluginDirectory): VersionedProjectPluginMembership {
    return this.withProjectPluginDirectory(directory, () => this.projects.query.projectPluginMembershipWithRevision(projectId));
  }

  listProjectPlugins(projectId: string, directory?: () => readonly ProjectPluginId[]): ProjectPluginId[] {
    return this.withProjectPluginDirectory(directory, () => this.projects.query.listProjectPlugins(projectId));
  }

  addProjectPlugin(input: AddProjectPluginInput): ProjectPluginId[] {
    return bumpAnd(this, () => this.projects.commands.addProjectPlugin(input));
  }

  removeProjectPlugin(input: RemoveProjectPluginInput): ProjectPluginMembership {
    return bumpAnd(this, () => this.projects.commands.removeProjectPlugin(input));
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
    context?: RuntimeWorkContext, page?: RuntimeContextBindingPage,
  ): MolisWorkRuntimeContextBindingEvent[] { return this.runtimeContexts.records.listRuntimeContextBindingEvents(context, page); }
  listRuntimeContextBindings(page?: RuntimeContextBindingPage): MolisWorkRuntimeContextBinding[] { return this.runtimeContexts.records.listRuntimeContextBindings(page); }

  /** The project's inputs and output, a folder's state looked at now (`projects.directories.get@1`). */
  projectDirectories(projectId: string): ProjectDirectories {
    return this.projects.query.projectDirectories(projectId);
  }

  /** Where a read, a write or a run that names no folder goes (SSC-17). */
  outputDirectory(projectId: string): ProjectWorkspaceRef {
    return this.projects.query.outputDirectory(projectId);
  }

  /** The id of this project's default output directory, whether or not it is the output now. */
  defaultOutputDirectoryId(projectId: string): string {
    return this.projects.query.defaultOutputDirectoryId(projectId);
  }

  /**
   * Before a folder of the project is touched on disk. Only this project's folders: an id from elsewhere is refused before anything
   * looks at the disk. `write` (a write, a terminal, a Character or an Agent run in it) needs the output role — an input folder is only
   * read (SSC-15, user 2026-11-08) — and makes a default output directory that is not there yet (§3, SSC-24).
   */
  prepareWorkspaceDirectory(projectId: string, workspaceId: string, mode: "read" | "write"): { path: string; exists: boolean } {
    const folder = this.projects.query.projectDirectories(projectId).directories.find(item => item.workspace_id === workspaceId);
    if (!folder) throw projectDirectoryErrors.directory_revoked("这个文件夹已经不是当前项目的目录");
    if (mode === "write" && !folder.roles.includes("output")) throw directoryInputOnly(workspaceId);
    return this.projects.lifecycle.prepareWorkspaceDirectory(workspaceId, mode);
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

  /** One change of `projects.directories.*`, from the revision the person read. */
  changeDirectories(input: ChangeDirectoriesInput): ProjectDirectories {
    return this.projects.commands.changeDirectories(input);
  }
  async createProject(input: CreateMolisWorkProjectInput): Promise<MolisWorkProjectRecord> { return this.projectFiles.createProject(input); }
  /** The personal space exists once it is first used; creating it again returns the same one. */
  async ensurePersonalSpace(actorId = LOCAL_PERSON_ACTOR_ID): Promise<MolisWorkProjectRecord> { return this.personalProjects.ensurePersonalSpace(actorId); }
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

  renameProject(projectId: string, displayName: string, actorId: string, expectedDisplayName: string): MolisWorkProjectRecord {
    if (projectId === PERSONAL_SPACE_PROJECT_ID) throw catalogErrors.personal_space("个人空间不能改名");
    return this.projects.commands.renameProject(projectId, displayName, actorId, expectedDisplayName);
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

/** A terminal's runtime work context belongs to its project for this session; called inside the catalog's transaction. */
function terminalContextBinder(runtimeContexts: ReturnType<typeof createRuntimeContextModule>) {
  return (input: { runtime_id: string; stable_work_context_id: string; project_id: string; actor_id: string; cwd?: string }): void => {
    const workspace = input.cwd ? normalizeRuntimeWorkspaceContext({ canonical_path: input.cwd, realpath_verified: false }) : undefined;
    runtimeContexts.commands.bindRuntimeContextInTransaction({
      normalized: { runtime_id: input.runtime_id, stable_work_context_id: input.stable_work_context_id, ...(workspace ? { workspace } : {}) },
      projectId: input.project_id, actorId: input.actor_id, rebindConfirmed: true, bindingScope: "session",
    });
  };
}

/** Display membership version per Catalog for the N44 short cache; successful membership writes bump it. */
const membershipEpochs = new WeakMap<MolisWorkProjectCatalog, number>();
export function projectPluginEpoch(catalog: MolisWorkProjectCatalog): number {
  return membershipEpochs.get(catalog) ?? 0;
}
function bumpProjectPluginEpoch(catalog: MolisWorkProjectCatalog): void {
  membershipEpochs.set(catalog, projectPluginEpoch(catalog) + 1);
}
function bumpAnd<T>(catalog: MolisWorkProjectCatalog, run: () => T): T {
  const result = run();
  bumpProjectPluginEpoch(catalog);
  advanceReadCheckGeneration();
  return result;
}
