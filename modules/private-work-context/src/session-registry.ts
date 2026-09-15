import type { WorkSessionApi } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { SessionAssociationRepository } from "./session-associations.js";
import { HandoffAssociationRepository } from "./handoff-associations.js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createSessionContentStore } from "./content-store.js";
import type {
  AppendMolisWorkSessionEventInput,
  CreateMolisWorkSessionInput,
  CreateSessionHandoffDraftInput,
  DiscoverRuntimeSessionInput,
  ExplicitlyLinkRuntimeSessionInput,
  MolisWorkSessionEventRecord,
  MolisWorkSessionGoalLink,
  MolisWorkSessionHandoffRecord,
  MolisWorkSessionRecord,
  LegacySessionMigrationInput,
  LegacySessionMigrationReport,
  LinkNativeRuntimeSessionInput,
  ReassignWorkspaceSessionsInput,
  SessionListFilter,
  SetMolisWorkSessionStatusInput,
  UpdateSessionAssociationsInput,
  UpdateSessionHandoffDraftInput,
} from "./contract-aliases.js";
import { SessionEventRepository } from "./session-events.js";
import { SessionHandoffRepository } from "./session-handoffs.js";
import { LegacySessionMigrator } from "./session-migration.js";
import { SessionRecordRepository } from "./session-records.js";
import { initializeOrValidateSessionSchema } from "./session-schema.js";

export interface MolisWorkSessionRegistryOptions {
  createLedger(db: Database.Database): ContextLedgerApi;
  homeDirectory?: string;
  now?: () => Date;
}

/**
 * Compatibility facade for the Private Work Context owner.
 *
 * Persistence, events, handoffs and legacy migration live in separate owner
 * components; callers keep the established API while their imports move to the
 * package public entrypoint.
 */
export class MolisWorkSessionRegistry implements WorkSessionApi {
  readonly homeDirectory: string;
  readonly databasePath: string;

  private constructor(
    private readonly db: Database.Database,
    homeDirectory: string,
    private readonly sessions: SessionRecordRepository,
    private readonly eventsRepository: SessionEventRepository,
    private readonly handoffs: SessionHandoffRepository,
    private readonly migration: LegacySessionMigrator,
  ) {
    this.homeDirectory = homeDirectory;
    this.databasePath = path.join(homeDirectory, "sessions", "sessions.db");
  }

  static async open(options: MolisWorkSessionRegistryOptions): Promise<MolisWorkSessionRegistry> {
    const homeDirectory = path.resolve(options.homeDirectory ?? path.join(os.homedir(), ".molis-work"));
    const sessionsDirectory = path.join(homeDirectory, "sessions");
    await fs.mkdir(sessionsDirectory, { recursive: true });
    const databasePath = path.join(sessionsDirectory, "sessions.db");
    const db = new Database(databasePath, { timeout: 5000 });
    try {
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = FULL");
      db.pragma("foreign_keys = ON");
      db.pragma("busy_timeout = 5000");
      const now = options.now ?? (() => new Date());
      const contentStore = createSessionContentStore(path.join(sessionsDirectory, "content"));
      const { associations, handoffAssociations } = db.transaction(() => {
        initializeOrValidateSessionSchema(db);
        const ledger = options.createLedger(db);
        const owner = new SessionAssociationRepository(ledger);
        owner.migrate(db);
        const handoffOwner = new HandoffAssociationRepository(ledger);
        handoffOwner.migrate(db);
        return { associations: owner, handoffAssociations: handoffOwner };
      }).immediate();
      const sessions = new SessionRecordRepository(db, now, associations);
      const handoffs = new SessionHandoffRepository(db, now, contentStore, sessions, handoffAssociations);
      const registry = new MolisWorkSessionRegistry(
        db,
        homeDirectory,
        sessions,
        new SessionEventRepository(db, now, contentStore, sessions),
        handoffs,
        new LegacySessionMigrator(db, now, sessions),
      );
      handoffs.recoverInterrupted();
      return registry;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }

  createSession(input: CreateMolisWorkSessionInput): MolisWorkSessionRecord {
    return this.sessions.createSession(input);
  }

  discoverSession(input: DiscoverRuntimeSessionInput): MolisWorkSessionRecord {
    return this.sessions.discoverSession(input);
  }

  explicitlyLinkSession(input: ExplicitlyLinkRuntimeSessionInput): MolisWorkSessionRecord {
    return this.sessions.explicitlyLinkSession(input);
  }

  linkNativeRuntimeSession(input: LinkNativeRuntimeSessionInput): MolisWorkSessionRecord {
    return this.sessions.linkNativeRuntimeSession(input);
  }

  updateAssociations(input: UpdateSessionAssociationsInput): MolisWorkSessionRecord {
    return this.sessions.updateAssociations(input);
  }

  setStatus(input: SetMolisWorkSessionStatusInput): MolisWorkSessionRecord {
    return this.sessions.setStatus(input);
  }

  reassignWorkspaceSessions(input: ReassignWorkspaceSessionsInput): MolisWorkSessionRecord[] {
    return this.sessions.reassignWorkspaceSessions(input);
  }

  get(sessionId: string): MolisWorkSessionRecord {
    return this.sessions.get(sessionId);
  }

  findByNativeRuntimeSession(runtimeId: string, nativeId: string): MolisWorkSessionRecord | null {
    return this.sessions.findByNativeRuntimeSession(runtimeId, nativeId);
  }

  findBySurface(surfaceId: string): MolisWorkSessionRecord | null {
    return this.sessions.findBySurface(surfaceId);
  }

  list(filter: SessionListFilter = {}): MolisWorkSessionRecord[] {
    return this.sessions.list(filter);
  }

  goalHistory(sessionId: string): MolisWorkSessionGoalLink[] {
    return this.sessions.goalHistory(sessionId);
  }

  appendEvent(input: AppendMolisWorkSessionEventInput): MolisWorkSessionEventRecord {
    return this.eventsRepository.append(input);
  }

  events(sessionId: string): MolisWorkSessionEventRecord[] {
    return this.eventsRepository.list(sessionId);
  }

  eventCount(sessionId: string): number {
    return this.eventsRepository.count(sessionId);
  }

  createHandoffDraft(input: CreateSessionHandoffDraftInput): MolisWorkSessionHandoffRecord {
    return this.handoffs.createDraft(input);
  }

  getHandoff(packageId: string): MolisWorkSessionHandoffRecord {
    return this.handoffs.get(packageId);
  }

  latestPendingHandoff(sourceSessionId: string): MolisWorkSessionHandoffRecord | null {
    return this.handoffs.latestPending(sourceSessionId);
  }

  handoffsForSession(sessionId: string): MolisWorkSessionHandoffRecord[] {
    return this.handoffs.listForSession(sessionId);
  }

  updateHandoffDraft(input: UpdateSessionHandoffDraftInput): MolisWorkSessionHandoffRecord {
    return this.handoffs.updateDraft(input);
  }

  markHandoffSending(packageId: string): MolisWorkSessionHandoffRecord {
    return this.handoffs.markSending(packageId);
  }

  attachHandoffDestination(input: {
    package_id: string;
    destination_session_id: string;
    delivery_mode: NonNullable<MolisWorkSessionHandoffRecord["delivery_mode"]>;
  }): MolisWorkSessionHandoffRecord {
    return this.handoffs.attachDestination(input);
  }

  markHandoffFailed(input: {
    package_id: string;
    error_code: string;
    error_message: string;
    retryable: boolean;
    destination_session_id?: string | null;
    delivery_mode?: MolisWorkSessionHandoffRecord["delivery_mode"];
  }): MolisWorkSessionHandoffRecord {
    return this.handoffs.markFailed(input);
  }

  markHandoffSent(input: {
    package_id: string;
    destination_session_id: string;
    delivery_mode: NonNullable<MolisWorkSessionHandoffRecord["delivery_mode"]>;
  }): MolisWorkSessionHandoffRecord {
    return this.handoffs.markSent(input);
  }

  cancelHandoff(packageId: string): MolisWorkSessionHandoffRecord {
    return this.handoffs.cancel(packageId);
  }

  migrateLegacy(input: LegacySessionMigrationInput): LegacySessionMigrationReport {
    return this.migration.migrate(input);
  }
}
