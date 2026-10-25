import { randomUUID } from "node:crypto";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  PLUGIN_ATTENTION_READ_PERMISSION, PLUGIN_ATTENTION_WRITE_PERMISSION, PLUGIN_CONTEXT_LEDGER_READ_PERMISSION, PLUGIN_CONTEXT_LEDGER_WRITE_PERMISSION,
  type PluginAttentionClient, type PluginAttentionWriter, type PluginContextLedgerClient, type PluginContextLedgerWriter, type PluginInstanceRecord,
  type PluginManifest, type PluginProjectDatabase, type PluginStartContext,
  type PluginAttentionEntryInput, type PluginAttentionSubjectReference,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { attentionErrors, type AttentionEntryRecord } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { AttentionModule, type AttentionSqliteDatabase } from "@molis-ai/molis-work-module-attention-resumption";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, pluginInvocationReadOnly } from "@molis-ai/molis-work-plugin-runtime";
import type { ContextLedgerDatabase } from "@molis-ai/molis-work-module-context-ledger";
import type { ContextEdge } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { LocalSqliteJournal } from "@molis-ai/molis-work-storage";
import { pluginNamespace } from "./plugin-namespace.js";
import { joinPluginTransaction } from "./plugin-transaction.js";

/**
 * What the Host gives `services.attention` and `services.contextLedger` of one installation (PG-087, PG-094 S9-0b): the project and the
 * actor its plugins run as, the Host's own connection to the project's library (the one the plugin's write transaction runs on, so a
 * row joins the plugin's own rows), and the storage package's journal for the events an Inbox entry writes.
 */
export interface PluginProjectServicePorts {
  readonly project_id: string;
  readonly actor_id: string;
  readonly connection: object | undefined;
  readonly journal: LocalSqliteJournal | undefined;
}

type Scope = ReturnType<typeof currentPluginInvocation>;

interface Gate {
  /** Whether the installation is still the running one and holds `permission`; the caller of an action, when there is one, is current. */
  read(permission: string): Scope;
  /** The same, and a write: only inside this project's writable, concurrent action (or kept job) that itself declares `permission`. */
  write(permission: string): NonNullable<Scope>;
}

/** The questions both services ask before every call, so a stopped, revoked, cancelled or read-only call reaches neither table. */
function gateFor(context: PluginStartContext, projectId: string, assertActive: () => void, record: () => PluginInstanceRecord | null): Gate {
  const generation = record()?.installation_generation;
  const holding = (permission: string) => {
    assertActive(); context.requireGrant(permission);
    const current = record();
    if (!generation || current?.installation_generation !== generation || current.state !== "running" || !current.grants.includes(permission)) {
      throw new ActionError("actions.forbidden", "所属安装已停止或撤权");
    }
  };
  return {
    read(permission) {
      holding(permission);
      const scope = currentPluginInvocation();
      if (scope && scope.caller.project_id !== projectId) throw new ActionError("actions.forbidden", "调用不属于这个项目");
      assertCapturedPluginActionCurrent(scope, context);
      return scope;
    },
    write(permission) {
      holding(permission);
      const scope = currentPluginInvocation();
      if (!scope || scope.caller.project_id !== projectId || pluginInvocationReadOnly(scope)) {
        throw new ActionError("actions.forbidden", "写入需要当前项目中的可写插件调用");
      }
      assertCapturedPluginActionCurrent(scope, context);
      if ("scene" in scope || "definition" in scope && (scope.definition.action.scheduling !== "concurrent" || !scope.definition.action.permissions.includes(permission))
        || "job" in scope && !scope.caller.permissions.includes(permission)) throw new ActionError("actions.forbidden", "写入需要声明了这项权限的可等待并行动作");
      return scope;
    },
  };
}

const declared = (manifest: PluginManifest, permission: string) => manifest.permissions.some(entry => entry.permission === permission);

/** The actor of a row: the original caller's recorded author or the caller, as the journal's rule (S-63) has it. */
const actorOf = (scope: Scope, fallback: string) => scope ? scope.caller.audit_actor_id ?? scope.caller.actor_id : fallback;

/**
 * `services.attention`: the project's Inbox entries. Reads need `attention:read`; every write needs `attention:write`, joins the plugin's
 * current project transaction, and asks the original caller again at each call. Adding/deleting checks the declared kind and the
 * installation's recorded plugin owner. Reads show explicitly owned entries of every plugin; unassigned entries remain with their
 * direct owner paths until explicit maintenance assigns them. Closing/reopening by global id still belongs to any attention:write holder.
 */
export function pluginAttentionFor(manifest: PluginManifest, context: PluginStartContext, database: PluginProjectDatabase | undefined, ports: PluginProjectServicePorts,
  assertActive: () => void, record: () => PluginInstanceRecord | null): PluginAttentionClient | undefined {
  const connection = ports.connection;
  if (!database || !connection || !("transaction" in connection) || typeof connection.transaction !== "function"
    || !declared(manifest, PLUGIN_ATTENTION_READ_PERMISSION) && !declared(manifest, PLUGIN_ATTENTION_WRITE_PERMISSION)) return undefined;
  const projectId = ports.project_id, owner = manifest.plugin_id, gate = gateFor(context, projectId, assertActive, record), subjects = manifest.attention?.subjects ?? [];
  let actor = ports.actor_id;
  const attentionModule = new AttentionModule(connection as AttentionSqliteDatabase, { exists: () => true }, { eventSink: event => {
    if (!ports.journal) throw new ActionError("actions.service_unavailable", "这个项目库没有日志");
    ports.journal.appendEvent({ eventId: `event-${randomUUID()}`, projectId: event.project_id, actorId: actor, objectType: "inbox_entry", objectId: event.entry_id,
      type: event.type, reason: event.reason, payload: event.payload, at: event.at });
  } });
  const reading = () => { gate.read(PLUGIN_ATTENTION_READ_PERMISSION); };
  const owns = (subject: PluginAttentionSubjectReference) => {
    if (subject.owner_plugin_id !== owner) throw new ActionError("actions.forbidden", "插件只能添加或删除自己的对象");
    if (!(subjects as readonly string[]).includes(subject.subject_type)) throw new ActionError("actions.forbidden", "插件没有在 Manifest 里声明这种对象");
  };
  return Object.freeze<PluginAttentionClient>({
    list: () => { reading(); return attentionModule.query.list(projectId).filter(hasAttentionOwner); },
    get: entryId => { reading(); return assignedEntry(attentionModule.query.get(projectId, entryId)); },
    findActiveForSubject: subject => {
      reading(); const entry = attentionModule.query.findActiveForSubject(projectId, subject.subject_type, subject.subject_id, subject.owner_plugin_id);
      return entry && hasAttentionOwner(entry) ? entry : null;
    },
    findForSubject: subject => { reading(); return attentionModule.query.findForSubject(projectId, subject.subject_type, subject.subject_id, subject.owner_plugin_id).filter(hasAttentionOwner); },
    events: entryId => { reading(); return attentionModule.events.list(projectId, entryId).filter(hasAttentionOwner); },
    join: (transaction, write) => joinPluginTransaction(database, transaction, (_afterCommit, live) => {
      const permit = () => { live(); const scope = gate.write(PLUGIN_ATTENTION_WRITE_PERMISSION); actor = actorOf(scope, ports.actor_id); };
      permit();
      return write(Object.freeze<PluginAttentionWriter>({
        create: input => {
          permit(); owns(input); assertEntryIdAvailable(attentionModule, projectId, owner, input);
          const result = attentionModule.commands.create({ ...input, owner_plugin_id: owner, project_id: projectId });
          return { ...result, entry: assignedEntry(result.entry) };
        },
        setStatus: (entryId, status, expectedRevision) => { permit(); return attentionModule.commands.setStatus(projectId, entryId, status, expectedRevision); },
        deleteSubject: subject => { permit(); owns(subject); return attentionModule.commands.deleteSubject(projectId, subject.subject_type, subject.subject_id, owner); },
      }));
    }),
  });
}

function hasAttentionOwner<T extends { owner_plugin_id: string | null }>(entry: T): entry is T & { owner_plugin_id: string } {
  return entry.owner_plugin_id !== null;
}

function assignedEntry(entry: AttentionEntryRecord): AttentionEntryRecord & { owner_plugin_id: string } {
  if (!hasAttentionOwner(entry)) throw attentionErrors.entry_not_found("找不到这个 Inbox Entry");
  return entry;
}

function assertEntryIdAvailable(attention: AttentionModule, projectId: string, owner: string, input: PluginAttentionEntryInput): void {
  if (input.entry_id === undefined) return;
  let entry: AttentionEntryRecord;
  try { entry = attention.query.get(projectId, input.entry_id); }
  catch (error) { if (error instanceof ActionError && error.code === "attention.entry_not_found") return; throw error; }
  if (entry.owner_plugin_id !== owner || entry.subject_type !== input.subject_type || entry.subject_id !== input.subject_id || entry.reason !== input.reason) {
    throw new ActionError("actions.forbidden", "条目 ID 已用于另一个对象");
  }
}

/**
 * `services.contextLedger`: this project's reference edges. Reads need `context-ledger:read`, writes `context-ledger:write` and join the
 * plugin's current project transaction with the same questions as `services.attention`. The scope is always this project and the actor
 * of an edge is the one the call runs for; a plugin names neither. The key of an edge is stored as `<plugin_id>:<key>`
 * (`plugin-namespace.ts`): a plugin passes and reads back its own bare keys, can reach only its own edges, and a list shows its own
 * edges only. What an edge refers to is any object of the project; the key is what says the edge is the plugin's. An edge written
 * before this, whose key has no plugin id, belongs to no plugin until the names maintenance (S9-2) puts its owner's id on it.
 */
export function pluginContextLedgerFor(manifest: PluginManifest, context: PluginStartContext, database: PluginProjectDatabase | undefined, ports: PluginProjectServicePorts,
  assertActive: () => void, record: () => PluginInstanceRecord | null): PluginContextLedgerClient | undefined {
  const connection = ports.connection;
  if (!database || !connection || !("transaction" in connection) || typeof connection.transaction !== "function"
    || !declared(manifest, PLUGIN_CONTEXT_LEDGER_READ_PERMISSION) && !declared(manifest, PLUGIN_CONTEXT_LEDGER_WRITE_PERMISSION)) return undefined;
  const projectId = ports.project_id, gate = gateFor(context, projectId, assertActive, record), names = pluginNamespace(manifest.plugin_id);
  // An empty key stays empty, so the ledger's own refusal of it still applies.
  const named = (key: string) => key === "" ? key : names.named(key);
  const bare = (edge: ContextEdge): ContextEdge => ({ ...edge, key: names.bare(edge.key) });
  const bareOrNull = (edge: ContextEdge | null) => edge === null ? null : bare(edge);
  const ledger = createContextLedger(connection as ContextLedgerDatabase, { authorize: access => access.scope.kind === "personal" && access.scope.id === projectId, initializeSchema: false });
  const access = (scope: Scope) => ({ actor_id: actorOf(scope, ports.actor_id), scope: { kind: "personal" as const, id: projectId } });
  return Object.freeze<PluginContextLedgerClient>({
    get: key => bareOrNull(ledger.query.get(access(gate.read(PLUGIN_CONTEXT_LEDGER_READ_PERMISSION)), named(key))),
    list: query => ledger.query.list(access(gate.read(PLUGIN_CONTEXT_LEDGER_READ_PERMISSION)), query).filter(edge => names.owns(edge.key)).map(bare),
    history: key => ledger.query.history(access(gate.read(PLUGIN_CONTEXT_LEDGER_READ_PERMISSION)), named(key)).map(bare),
    join: (transaction, write) => joinPluginTransaction(database, transaction, (_afterCommit, live) => {
      const permit = () => { live(); return access(gate.write(PLUGIN_CONTEXT_LEDGER_WRITE_PERMISSION)); };
      permit();
      return write(Object.freeze<PluginContextLedgerWriter>({
        put: input => bare(ledger.commands.put(permit(), { ...input, key: named(input.key) })),
        remove: (key, cause, recordedAt) => bareOrNull(ledger.commands.remove(permit(), named(key), cause, recordedAt)),
      }));
    }),
  });
}
