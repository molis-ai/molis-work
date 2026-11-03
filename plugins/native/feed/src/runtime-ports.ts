import { randomUUID } from "node:crypto";
import type { AttentionSubjectType } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  PluginArtifactClient, PluginAttentionClient, PluginAttentionEntryInput, PluginAttentionWriter, PluginContextLedgerClient, PluginContextLedgerWriter,
  PluginProjectDatabase, PluginProjectDatabaseTransaction,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { FeedAssemblyPorts } from "./application-assembly.js";
import type { FeedArtifactProducer } from "./out-rules.js";
import { FEED_PLUGIN_ID } from "./identity.js";
import { fromPluginReader, fromPluginTransaction, type FeedAttentionPort, type FeedLedgerPort, type FeedSql } from "./store/index.js";

/** What the platform gives a Feed installation for one project: its tables, the project's Inbox entries, its Context Ledger and its 成果库. */
export interface FeedRuntimeServices {
  readonly projectId: string;
  readonly database: PluginProjectDatabase;
  readonly attention: PluginAttentionClient;
  readonly contextLedger: PluginContextLedgerClient;
  readonly artifacts: PluginArtifactClient;
}

/** The ports `assembleFeedApplication` takes, over the platform's services, and the one way to write through them. */
export interface FeedRuntimePorts extends Pick<FeedAssemblyPorts, "sql" | "attention" | "ledger" | "artifacts" | "appendEvent" | "subscribeInboxCreated"> {
  /**
   * Runs `body` with every port bound to the plugin's current write transaction, so a row, its Inbox entry, its ledger edge, the 成果
   * it captures and its journal event are one commit or none. `actorId` is the original caller's: the journal records no one else. Outside it the ports
   * read through the read-only client and refuse every write. Synchronous, like the transaction it joins; the ports are unbound
   * when it ends, so nothing kept from `body` can write later.
   */
  within<T>(transaction: PluginProjectDatabaseTransaction, actorId: string, body: () => T): T;
}

interface Bound { readonly transaction: PluginProjectDatabaseTransaction; readonly sql: FeedSql; readonly actorId: string }

const notBound = (): never => { throw new ActionError("actions.execution_failed", "Feed wrote outside a write transaction"); };

/**
 * Feed's ports over `services.project_database`, `services.attention`, `services.contextLedger` and `services.artifacts`. One set serves a Feed installation for
 * its life: the application built over it keeps its queues between calls, and each call binds the set to its own transaction.
 */
export function createFeedRuntimePorts(services: FeedRuntimeServices): FeedRuntimePorts {
  const reader = fromPluginReader(services.database);
  let bound: Bound | null = null;
  let inboxCreated: (entry: { project_id: string; entry_id: string }) => void = () => {};
  const current = (): FeedSql => bound?.sql ?? reader;
  const writing = (): Bound => bound ?? notBound();
  const inProject = (projectId: string): void => {
    if (projectId !== services.projectId) throw new ActionError("actions.forbidden", "调用不属于这个项目");
  };
  /** Feed's entries are Feed's: the owner is the installation, and a port asked to act for another owner refuses. */
  const ownedByFeed = (owner: string | null | undefined): void => {
    if (owner != null && owner !== FEED_PLUGIN_ID) throw new ActionError("actions.forbidden", "Feed 只能处理自己的 Inbox 事项");
  };
  const subject = (type: AttentionSubjectType, id: string) => ({ owner_plugin_id: FEED_PLUGIN_ID, subject_type: type, subject_id: id });
  const writeAttention = <T>(write: (writer: PluginAttentionWriter) => T): T => services.attention.join(writing().transaction, write);
  const writeLedger = <T>(write: (writer: PluginContextLedgerWriter) => T): T => services.contextLedger.join(writing().transaction, write);
  const created = <T extends { entry: { entry_id: string }; created: boolean }>(result: T): T => {
    if (result.created) inboxCreated({ project_id: services.projectId, entry_id: result.entry.entry_id });
    return result;
  };
  const createEntry = (input: Omit<PluginAttentionEntryInput, "owner_plugin_id">) => created(writeAttention(writer => writer.create({ ...input, owner_plugin_id: FEED_PLUGIN_ID })));

  const sql: FeedSql = {
    get: (statement, ...params) => current().get(statement, ...params),
    all: (statement, ...params) => current().all(statement, ...params),
    run: (statement, ...params) => current().run(statement, ...params),
    transaction: operation => current().transaction(operation),
  };
  const attention: FeedAttentionPort = {
    query: {
      list: projectId => (inProject(projectId), services.attention.list()),
      get: (projectId, entryId) => (inProject(projectId), services.attention.get(entryId)),
      findForSubject: (projectId, type, id, owner) => (inProject(projectId), ownedByFeed(owner), services.attention.findForSubject(subject(type, id))),
    },
    commands: {
      create: input => {
        inProject(input.project_id); ownedByFeed(input.owner_plugin_id);
        return createEntry({ subject_type: input.subject_type, subject_id: input.subject_id, reason: input.reason,
          ...input.detail === undefined ? {} : { detail: input.detail }, ...input.entry_id === undefined ? {} : { entry_id: input.entry_id },
          ...input.at === undefined ? {} : { at: input.at } });
      },
      ensureFeedItem: (projectId, itemId, reason, detail) => (inProject(projectId),
        createEntry({ subject_type: "feed_item", subject_id: itemId, reason, ...detail === undefined ? {} : { detail } })),
      setStatus: (projectId, entryId, status, expectedRevision) => (inProject(projectId), writeAttention(writer => writer.setStatus(entryId, status, expectedRevision))),
      deleteSubject: (projectId, type, id, owner) => (inProject(projectId), ownedByFeed(owner), writeAttention(writer => writer.deleteSubject(subject(type, id)))),
    },
  };
  // A capture is pinned in the commit of the item it captures (`services.artifacts.join`); a platform without `join` gives Feed nowhere to pin it.
  const { artifacts: library } = services;
  const artifacts: FeedArtifactProducer | undefined = library.join === undefined ? undefined
    : { capture: (projectId, write) => (inProject(projectId), library.join!(writing().transaction, write)) };
  const ledger: FeedLedgerPort = {
    get: (projectId, key) => (inProject(projectId), services.contextLedger.get(key)),
    list: (projectId, query) => (inProject(projectId), services.contextLedger.list(query)),
    put: (projectId, input) => (inProject(projectId), writeLedger(writer => writer.put(input))),
    remove: (projectId, key, cause, recordedAt) => (inProject(projectId), writeLedger(writer => writer.remove(key, cause, recordedAt))),
  };
  return {
    sql, ledger, artifacts,
    attention: () => attention,
    appendEvent: (projectId, objectType, objectId, type, reason, payload, at) => {
      inProject(projectId);
      const { transaction, actorId } = writing();
      transaction.journal.appendEvent({ eventId: `event-${randomUUID()}`, actorId, type, objectType, objectId, reason, payload, at });
    },
    subscribeInboxCreated: listener => { inboxCreated = listener; },
    within: (transaction, actorId, body) => {
      if (bound) throw new ActionError("actions.execution_failed", "Feed's ports are already bound to a transaction");
      bound = { transaction, sql: fromPluginTransaction(transaction), actorId };
      try { return body(); } finally { bound = null; }
    },
  };
}
