import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  PROJECT_JOURNAL_PERMISSION, type PluginJournalReader, type PluginJournalWriter,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { currentPluginInvocation, inPluginInstance, type PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import type { LocalSqliteJournal } from "@molis-ai/molis-work-storage";

/**
 * What the project's journal is made of for one installation (PG-094 S9-0): the project and the actor the Host runs its plugins as
 * are the Host's to say, and the two journals are the storage package's own, one on each connection the plugin's tables use.
 * `events` and `idempotency_records` stay the storage package's tables (`tooling/gates/table-owners.json` is unchanged): a plugin
 * reaches them only through these methods, never by a statement.
 */
export interface ProjectJournalPorts {
  readonly project_id: string;
  /** The one actor a write may name outside every action (a route, a timer, `start`): there is no caller to ask. */
  readonly actor_id: string;
  /** Over the connection a write transaction runs on, so a journal row joins the plugin's own rows in one transaction. */
  readonly writer: LocalSqliteJournal;
  /** Over the read-only connection of the same library. */
  readonly reader: LocalSqliteJournal;
}

/** The journal the client adds to a database and to each of its write transactions; `check` is what that handle asks first. */
export interface ProjectJournalBinding {
  reader(check: () => void): PluginJournalReader;
  writer(check: () => void): PluginJournalWriter;
}

/**
 * Inside an action the actor of a row is the action's caller, or the author the Host records for it (`audit_actor_id`); outside
 * every action, the actor the project's plugins run as. A plugin cannot write a row in someone else's name, and cannot read or
 * claim another actor's idempotency record: the key is (project, actor, operation, key), and the actor is not the plugin's to choose.
 */
function assertActor(instance: PluginInstance, host_actor: string, actorId: string): void {
  const scope = currentPluginInvocation();
  const allowed = inPluginInstance(scope, instance) ? [scope!.caller.actor_id, scope!.caller.audit_actor_id] : [host_actor];
  if (!allowed.includes(actorId)) throw new ActionError("actions.forbidden", "日志只记调用者本人的事件和幂等记录");
}

export function projectJournalBinding(ports: ProjectJournalPorts, authorize: (permission: string) => void, instance: PluginInstance): ProjectJournalBinding {
  const { project_id: projectId } = ports;
  const permit = (check: () => void) => () => { check(); authorize(PROJECT_JOURNAL_PERMISSION); };
  const actor = (actorId: string) => assertActor(instance, ports.actor_id, actorId);
  const reads = (journal: LocalSqliteJournal, ask: () => void): PluginJournalReader => ({
    eventCursor(objectType) { ask(); return journal.eventCursor(projectId, objectType); },
    readEventsDescending() { ask(); return journal.readEventsDescending(projectId); },
  });
  return {
    reader: check => reads(ports.reader, permit(check)),
    writer(check) {
      const ask = permit(check);
      const writer: PluginJournalWriter = {
        ...reads(ports.writer, ask),
        appendEvent(input) { ask(); actor(input.actorId); return ports.writer.appendEvent({ ...input, projectId }); },
        getIdempotency(actorId, operation, key) { ask(); actor(actorId); return ports.writer.getIdempotency(projectId, actorId, operation, key); },
        putIdempotency(input) { ask(); actor(input.actorId); ports.writer.putIdempotency({ ...input, projectId }); },
      };
      return Object.freeze(writer);
    },
  };
}
