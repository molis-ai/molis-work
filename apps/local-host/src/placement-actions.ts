import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ledgerDatabase } from "./context-ledger-database.js";
import { ActionError, type ActionCallContext, type ActionClient, type ActionHandlerBinding, type ActionRegistryPort } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import {
  PLACEMENT_PROVIDER_ID, placementActions, placementAttachActions, type PlacedObject, type PlacementConvertRequest, type PlacementCreateRequest, type PlacementSpaceView,
} from "@molis-ai/molis-work-contracts/services/placement";
import { CarrySettling, PlacementService, PLACEMENT_LEDGER_ACCESS, placementRelationsFor, type PlacementPorts } from "@molis-ai/molis-work-service-placement";
import { CONTEXT_LEDGER_SCHEMA, createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { applySqliteBaseline, homeSqlitePath, openHomeSqliteDatabase, type SqliteBaseline, type HomeStoreDeclaration } from "@molis-ai/molis-work-storage";
import { isPersonalSpace, PERSONAL_SPACE_PROJECT_ID } from "./personal-space.js";
import { surfacePlacementCallPorts } from "./placement-surface-call.js";


/** The one catalog record a partition needs to be opened. */
export interface PlacementProjectRecord { project_id: string; display_name: string; database_path: string }

interface PlacementHostPorts {
  homeDirectory: string;
  registry: ActionRegistryPort;
  /** Every project in this Home's catalog, the personal space included once it exists; null before the catalog is configured. */
  projects(): Promise<readonly PlacementProjectRecord[] | null>;
  /** Open (when needed) the runtime of one project and return its reference. */
  open(record: PlacementProjectRecord): Promise<LocalHostProjectReference>;
  projectClient(reference: LocalHostProjectReference): ActionClient;
  homeClient(): ActionClient;
  /** The local person's own context over one scope, as the Web uses it. */
  ownerContext(reference: LocalHostProjectReference | undefined): Promise<ActionCallContext>;
}

export interface PlacementHost {
  readonly service: PlacementService;
  relationsFor(projectId: string, candidates: readonly PlacedObject[]): ReturnType<typeof placementRelationsFor>;
  close(): Promise<void>;
}

/**
 * Host wiring for the placement service (specs/archive/work-placement §7.2): its relations live in this Home's own database,
 * every object is read back from its owner in its own partition with the local person's authority, and the service
 * reaches plugins only through the shared directory. Nothing about any plugin is known here.
 */
/** The placement store's one current schema (repository-anti-corruption §4.1): the context ledger's tables and the titles last seen. */
export const PLACEMENT_BASELINE: SqliteBaseline = { version: /* @version database.placement_baseline */ 1, schema: `${CONTEXT_LEDGER_SCHEMA}
  CREATE TABLE placement_titles (kind TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, seen_at TEXT NOT NULL, PRIMARY KEY (kind, id));
`, upgrades: [] };

export function createPlacementHost(ports: PlacementHostPorts): PlacementHost {
  const db = openHomeSqliteDatabase(ports.homeDirectory, PLACEMENT_HOME_STORE.path);
  try { applySqliteBaseline(db, homeSqlitePath(ports.homeDirectory, PLACEMENT_HOME_STORE.path), PLACEMENT_BASELINE); } catch (error) { db.close(); throw error; }
  const ledger = createContextLedger(ledgerDatabase(db), { initializeSchema: false,
    authorize: access => access.actor_id === PLACEMENT_LEDGER_ACCESS.actor_id && access.scope.kind === "personal" && access.scope.id === PLACEMENT_LEDGER_ACCESS.scope.id,
  });
  let closed = false;
  let closing: Promise<void> | undefined;
  const assertOpen = () => {
    if (closed || !db.isOpen) throw new ActionError("actions.expired", "原放置服务已关闭");
  };
  const record = async (projectId: string): Promise<PlacementProjectRecord> => {
    assertOpen();
    const found = (await ports.projects())?.find(project => project.project_id === projectId);
    assertOpen();
    if (!found) throw new ActionError("placement.project_missing", uiText.text("workbench.placement-actions.project-not-found"));
    return found;
  };
  const servicePorts: PlacementPorts = {
    ledger,
    spaces: async () => {
      assertOpen();
      const projects = await ports.projects() ?? [];
      assertOpen();
      const spaces: PlacementSpaceView[] = [{ project_id: PERSONAL_SPACE_PROJECT_ID, title: uiText.text("workbench.placement-actions.personal-space"), kind: "personal" }];
      for (const project of projects) if (!isPersonalSpace(project)) spaces.push({ project_id: project.project_id, title: project.display_name, kind: "project" });
      return spaces;
    },
    scope: async projectId => {
      assertOpen();
      if (projectId === null) {
        const caller = await ports.ownerContext(undefined);
        assertOpen();
        return { client: ports.homeClient(), caller };
      }
      const reference = await ports.open(await record(projectId));
      assertOpen();
      const caller = await ports.ownerContext(reference);
      assertOpen();
      return { client: ports.projectClient(reference), caller };
    },
    titles: {
      get: (kind, id) => {
        assertOpen();
        return (db.prepare("SELECT title FROM placement_titles WHERE kind = ? AND id = ?").get(kind, id) as { title: string } | undefined)?.title ?? null;
      },
      set: (kind, id, title) => {
        assertOpen();
        db.prepare("INSERT INTO placement_titles (kind, id, title, seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET title = excluded.title, seen_at = excluded.seen_at")
          .run(kind, id, title.slice(0, 200), new Date().toISOString());
      },
    },
    text: (zh, vars) => uiText.text(zh, vars),
  };
  const service = new PlacementService(servicePorts);
  // A move the Host stopped in the middle of (between its put and its remove) is settled once the Host answers placement calls again, as
  // the local person, in the background, one pass at a time; one left unsettled is tried again when a new carry is recorded or after
  // `CARRY_RETRY_MS`, not on every call (a pass opens both partitions). `move` settles its own object before it starts.
  const carrying = new CarrySettling({
    pendingCarryRecords: () => (closed || !db.isOpen ? [] : service.pendingCarryRecords()),
    settleCarries: () => (closed || !db.isOpen ? Promise.resolve(0) : service.settleCarries()),
  });
  const settleCarries = () => { if (!closed) carrying.kick(); };
  const forCall = (caller: Parameters<ActionHandlerBinding["handle"]>[0]) => {
    settleCarries();
    return new PlacementService(surfacePlacementCallPorts(servicePorts, caller, () => !closed));
  };
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
    { ...placementAttachActions.targets, handle: async (caller, input) => { const value = input as { project_id: string; object: PlacedObject }; return { kinds: await forCall(caller).attachTargets(value.project_id, value.object) }; } },
    { ...placementAttachActions.attach, handle: (caller, input) => { const value = input as { object: PlacedObject; project_id: string; target: { kind: string; id: string }; read_revision?: string; mode?: "live" | "fixed"; material_ref?: MaterialRef }; return forCall(caller).attach(value.object, value.project_id, value.target, value.read_revision, { ...(value.mode ? { mode: value.mode } : {}), ...(value.material_ref ? { material_ref: value.material_ref } : {}) }); } },
    { ...placementAttachActions.create, handle: (caller, input) => forCall(caller).create(input as PlacementCreateRequest) },
  ];
  const dispose = ports.registry.registerProvider({ provider: { provider_id: PLACEMENT_PROVIDER_ID, title: "放置", kind: "system" },
    definitions: [...Object.values(placementActions), ...Object.values(placementAttachActions)], handlers });
  return {
    service,
    relationsFor: (projectId, candidates) => {
      assertOpen();
      return placementRelationsFor(ledger, projectId, candidates);
    },
    close: () => {
      closed = true;
      dispose();
      return closing ??= (async () => {
        await carrying.idle().catch(() => undefined);
        if (db.isOpen) db.close();
      })();
    },
  };
}

/** This store in the Home's store registry (W4-11). */
export const PLACEMENT_HOME_STORE: HomeStoreDeclaration = { path: "placement", library: { baseline: PLACEMENT_BASELINE } };
