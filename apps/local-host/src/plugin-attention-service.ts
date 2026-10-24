import { randomUUID } from "node:crypto";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  PLUGIN_ATTENTION_READ_PERMISSION, PLUGIN_ATTENTION_WRITE_PERMISSION, PLUGIN_CONTEXT_LEDGER_READ_PERMISSION, PLUGIN_CONTEXT_LEDGER_WRITE_PERMISSION,
  type PluginAttentionClient, type PluginAttentionWriter, type PluginContextLedgerClient, type PluginContextLedgerWriter, type PluginInstanceRecord,
  type PluginManifest, type PluginProjectDatabase, type PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";
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
 * current project transaction, and asks the original caller again at each call. An entry may be added or deleted only for a kind of
 * subject the Manifest declares (`attention.subjects`), so a plugin writes entries about its own objects and no one else's; closing
 * or reopening an entry (`setStatus`) is any holder of `attention:write`'s, the way the Inbox does.
 */
export function pluginAttentionFor(manifest: PluginManifest, context: PluginStartContext, database: PluginProjectDatabase | undefined, ports: PluginProjectServicePorts,
  assertActive: () => void, record: () => PluginInstanceRecord | null): PluginAttentionClient | undefined {
  const connection = ports.connection;
  if (!database || !connection || !("transaction" in connection) || typeof connection.transaction !== "function"
    || !declared(manifest, PLUGIN_ATTENTION_READ_PERMISSION) && !declared(manifest, PLUGIN_ATTENTION_WRITE_PERMISSION)) return undefined;
  const projectId = ports.project_id, gate = gateFor(context, projectId, assertActive, record), subjects = manifest.attention?.subjects ?? [];
  let actor = ports.actor_id;
  const attentionModule = new AttentionModule(connection as AttentionSqliteDatabase, { exists: () => true }, { eventSink: event => {
    if (!ports.journal) throw new ActionError("actions.service_unavailable", "这个项目库没有日志");
    ports.journal.appendEvent({ eventId: `event-${randomUUID()}`, projectId: event.project_id, actorId: actor, objectType: "inbox_entry", objectId: event.entry_id,
      type: event.type, reason: event.reason, payload: event.payload, at: event.at });
  } });
  const reading = () => { gate.read(PLUGIN_ATTENTION_READ_PERMISSION); };
  const owns = (subjectType: string) => {
    if (!(subjects as readonly string[]).includes(subjectType)) throw new ActionError("actions.forbidden", "插件没有在 Manifest 里声明这种对象");
  };
  return Object.freeze<PluginAttentionClient>({
    list: () => { reading(); return attentionModule.query.list(projectId); },
    get: entryId => { reading(); return attentionModule.query.get(projectId, entryId); },
    findActiveForSubject: (subjectType, subjectId) => { reading(); return attentionModule.query.findActiveForSubject(projectId, subjectType, subjectId); },
    findForSubject: (subjectType, subjectId) => { reading(); return attentionModule.query.findForSubject(projectId, subjectType, subjectId); },
    events: entryId => { reading(); return attentionModule.events.list(projectId, entryId); },
    join: (transaction, write) => joinPluginTransaction(database, transaction, (_afterCommit, live) => {
      const permit = () => { live(); const scope = gate.write(PLUGIN_ATTENTION_WRITE_PERMISSION); actor = actorOf(scope, ports.actor_id); };
      permit();
      return write(Object.freeze<PluginAttentionWriter>({
        create: input => { permit(); owns(input.subject_type); return attentionModule.commands.create({ ...input, project_id: projectId }); },
        setStatus: (entryId, status, expectedRevision) => { permit(); return attentionModule.commands.setStatus(projectId, entryId, status, expectedRevision); },
        deleteSubject: (subjectType, subjectId) => { permit(); owns(subjectType); return attentionModule.commands.deleteSubject(projectId, subjectType, subjectId); },
      }));
    }),
  });
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
