import { ActionError, type ActionCallContext, type ActionClient, type ActionHandlerBinding, type ActionRegistryPort } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  PLACEMENT_PROVIDER_ID, placementActions, placementGoalActions, type PlacedObject, type PlacementConvertRequest, type PlacementCreateRequest, type PlacementSpaceView,
} from "@molis-ai/molis-work-contracts/services/placement";
import { PlacementService, PLACEMENT_LEDGER_ACCESS, type PlacementPorts } from "@molis-ai/molis-work-service-placement";
import { CONTEXT_LEDGER_SCHEMA, createContextLedger, type ContextLedgerDatabase } from "@molis-ai/molis-work-module-context-ledger";
import { applySqliteBaseline, homeSqlitePath, openHomeSqliteDatabase, type SqliteBaseline, type HomeStoreDeclaration } from "@molis-ai/molis-work-storage";
import { isPersonalSpace, PERSONAL_SPACE_PROJECT_ID } from "./personal-space.js";
import { L } from "./web-locale.js";
import { placementCallPorts } from "./placement-call.js";

type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;

/** The one catalog record a partition needs to be opened. */
export interface PlacementProjectRecord { project_id: string; display_name: string; database_path: string }

export interface PlacementHostPorts {
  homeDirectory: string;
  registry: ActionRegistryPort;
  /** Every project in this Home's catalog, the personal space included once it exists; null before the catalog is configured. */
  projects(): Promise<readonly PlacementProjectRecord[] | null>;
  /** Make the personal space if it does not exist yet. */
  ensurePersonalSpace(): Promise<PlacementProjectRecord>;
  /** Open (when needed) the runtime of one project and return its reference. */
  open(record: PlacementProjectRecord): Promise<LocalHostProjectReference>;
  projectClient(reference: LocalHostProjectReference): ActionClient;
  homeClient(): ActionClient;
  /** The local person's own context over one scope, as the Web uses it. */
  ownerContext(reference: LocalHostProjectReference | undefined): Promise<ActionCallContext>;
}

export interface PlacementHost {
  readonly service: PlacementService;
  close(): void;
}

/** `node:sqlite` in the shape the Ledger's repository expects: one immediate transaction, joined when already inside one. */
function ledgerDatabase(db: DatabaseSync): ContextLedgerDatabase {
  const run = <T>(operation: () => T): T => {
    if (db.isTransaction) return operation();
    db.exec("BEGIN IMMEDIATE");
    try { const value = operation(); db.exec("COMMIT"); return value; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  return {
    exec: sql => db.exec(sql),
    prepare: sql => db.prepare(sql) as unknown as ReturnType<ContextLedgerDatabase["prepare"]>,
    transaction: <T>(operation: () => T) => Object.assign(() => run(operation), { immediate: () => run(operation) }),
  };
}

/**
 * Host wiring for the placement service (specs/archive/work-placement §7.2): its relations live in this Home's own database,
 * every object is read back from its owner in its own partition with the local person's authority, and the service
 * reaches plugins only through the shared directory. Nothing about any plugin is known here.
 */
/** The placement store's one current schema (repository-anti-corruption §4.1): the context ledger's tables and the titles last seen. */
export const PLACEMENT_BASELINE: SqliteBaseline = { version: 1, schema: `${CONTEXT_LEDGER_SCHEMA}
  CREATE TABLE placement_titles (kind TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, seen_at TEXT NOT NULL, PRIMARY KEY (kind, id));
` };

export function createPlacementHost(ports: PlacementHostPorts): PlacementHost {
  const db = openHomeSqliteDatabase(ports.homeDirectory, PLACEMENT_HOME_STORE.path);
  try { applySqliteBaseline(db, homeSqlitePath(ports.homeDirectory, PLACEMENT_HOME_STORE.path), PLACEMENT_BASELINE); } catch (error) { db.close(); throw error; }
  const ledger = createContextLedger(ledgerDatabase(db), { initializeSchema: false,
    authorize: access => access.actor_id === PLACEMENT_LEDGER_ACCESS.actor_id && access.scope.kind === "personal" && access.scope.id === PLACEMENT_LEDGER_ACCESS.scope.id,
  });
  const record = async (projectId: string): Promise<PlacementProjectRecord> => {
    if (projectId === PERSONAL_SPACE_PROJECT_ID) return ports.ensurePersonalSpace();
    const found = (await ports.projects())?.find(project => project.project_id === projectId);
    if (!found) throw new ActionError("placement.project_missing", L("找不到这个项目"));
    return found;
  };
  const servicePorts: PlacementPorts = {
    ledger,
    spaces: async () => {
      const projects = await ports.projects() ?? [];
      const spaces: PlacementSpaceView[] = [{ project_id: PERSONAL_SPACE_PROJECT_ID, title: L("个人空间"), kind: "personal" }];
      for (const project of projects) if (!isPersonalSpace(project)) spaces.push({ project_id: project.project_id, title: project.display_name, kind: "project" });
      return spaces;
    },
    scope: async projectId => {
      if (projectId === null) return { client: ports.homeClient(), caller: await ports.ownerContext(undefined) };
      const reference = await ports.open(await record(projectId));
      return { client: ports.projectClient(reference), caller: await ports.ownerContext(reference) };
    },
    titles: {
      get: (kind, id) => (db.prepare("SELECT title FROM placement_titles WHERE kind = ? AND id = ?").get(kind, id) as { title: string } | undefined)?.title ?? null,
      set: (kind, id, title) => { db.prepare("INSERT INTO placement_titles (kind, id, title, seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET title = excluded.title, seen_at = excluded.seen_at")
        .run(kind, id, title.slice(0, 200), new Date().toISOString()); },
    },
    text: (zh, vars) => L(zh, vars),
  };
  let closed = false;
  const service = new PlacementService(servicePorts);
  const forCall = (caller: Parameters<ActionHandlerBinding["handle"]>[0]) => new PlacementService(placementCallPorts(servicePorts, caller, () => !closed));
  const handlers: ActionHandlerBinding[] = [
    { ...placementActions.describe, handle: (caller, input) => forCall(caller).describe((input as { object: PlacedObject }).object) },
    { ...placementActions.spaces, handle: async (caller) => ({ spaces: await forCall(caller).spaces() }) },
    { ...placementActions.related, handle: async (caller, input) => ({ items: await forCall(caller).related((input as { project_id: string }).project_id) }) },
    { ...placementActions.locate, handle: (caller, input) => forCall(caller).locate((input as { object: PlacedObject }).object) },
    { ...placementActions.link, handle: (caller, input) => { const value = input as { object: PlacedObject; project_id: string }; return forCall(caller).link(value.object, value.project_id); } },
    { ...placementActions.unlink, handle: (caller, input) => forCall(caller).unlink((input as { key: string }).key) },
    { ...placementActions.move, handle: (caller, input) => { const value = input as { object: PlacedObject; to_project_id: string }; return forCall(caller).move(value.object, value.to_project_id); } },
    { ...placementActions.copy, handle: (caller, input) => { const value = input as { object: PlacedObject; to_project_id: string; request_id: string }; return forCall(caller).copy(value.object, value.to_project_id, value.request_id); } },
    { ...placementActions.convert, handle: (caller, input) => forCall(caller).convert(input as PlacementConvertRequest) },
    { ...placementGoalActions.goals, handle: async (caller, input) => ({ goals: await forCall(caller).goals((input as { project_id: string }).project_id) }) },
    { ...placementGoalActions.bindGoal, handle: (caller, input) => { const value = input as { object: PlacedObject; project_id: string; goal_id: string }; return forCall(caller).bindGoal(value.object, value.project_id, value.goal_id); } },
    { ...placementGoalActions.create, handle: (caller, input) => forCall(caller).create(input as PlacementCreateRequest) },
  ];
  const dispose = ports.registry.registerProvider({ provider: { provider_id: PLACEMENT_PROVIDER_ID, title: "放置", kind: "system" },
    definitions: [...Object.values(placementActions), ...Object.values(placementGoalActions)], handlers });
  return { service, close: () => { closed = true; dispose(); db.close(); } };
}

/** This store in the Home's store registry (W4-11). */
export const PLACEMENT_HOME_STORE: HomeStoreDeclaration = { path: "placement", library: { baseline: PLACEMENT_BASELINE } };
