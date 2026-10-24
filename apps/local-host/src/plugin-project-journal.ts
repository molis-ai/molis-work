import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  PROJECT_JOURNAL_PERMISSION, type PluginJournalReader, type PluginJournalWriter,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { currentPluginInvocation, inPluginInstance, type PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import type { LocalSqliteJournal } from "@molis-ai/molis-work-storage";
import { assertOwnName, ownsName } from "./plugin-namespace.js";

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
 * The names it writes are its own too (`plugin-namespace.ts`): the event type, the object type and the idempotency operation start with
 * its plugin id, so it cannot write another plugin's events or take over another plugin's operation. What it reads of the log is its
 * own namespace's too: other plugins' and the platform's events are not shown, and a cursor of an object type is asked for an own one
 * only (the S9-0b slice, ruling 10-24); a record is read by its operation, which has to be the plugin's own.
 */
function assertActor(instance: PluginInstance, host_actor: string, actorId: string): void {
  const scope = currentPluginInvocation();
  const allowed = inPluginInstance(scope, instance) ? [scope!.caller.actor_id, scope!.caller.audit_actor_id] : [host_actor];
  if (!allowed.includes(actorId)) throw new ActionError("actions.forbidden", "日志只记调用者本人的事件和幂等记录");
}

export function projectJournalBinding(ports: ProjectJournalPorts, authorize: (permission: string) => void, instance: PluginInstance, pluginId: string): ProjectJournalBinding {
  const { project_id: projectId } = ports;
  const permit = (check: () => void) => () => { check(); authorize(PROJECT_JOURNAL_PERMISSION); };
  const actor = (actorId: string) => assertActor(instance, ports.actor_id, actorId);
  const reads = (journal: LocalSqliteJournal, ask: () => void): PluginJournalReader => {
    const own = () => journal.readEventsDescending(projectId).filter(event => ownsName(pluginId, event.type));
    return {
      // Of one object type, which has to be the plugin's own; of none, where the plugin's own events end.
      eventCursor(objectType) {
        ask();
        if (objectType !== undefined) { assertOwnName(pluginId, "事件的对象类型", objectType); return journal.eventCursor(projectId, objectType); }
        return own()[0]?.seq ?? 0;
      },
      readEventsDescending() { ask(); return own(); },
    };
  };
  return {
    reader: check => reads(ports.reader, permit(check)),
    writer(check) {
      const ask = permit(check);
      const writer: PluginJournalWriter = {
        ...reads(ports.writer, ask),
        appendEvent(input) {
          ask(); actor(input.actorId);
          assertOwnName(pluginId, "事件类型", input.type); assertOwnName(pluginId, "事件的对象类型", input.objectType);
          return ports.writer.appendEvent({ ...input, projectId });
        },
        getIdempotency(actorId, operation, key) {
          ask(); actor(actorId); assertOwnName(pluginId, "幂等操作名", operation);
          return ports.writer.getIdempotency(projectId, actorId, operation, key);
        },
        putIdempotency(input) {
          ask(); actor(input.actorId); assertOwnName(pluginId, "幂等操作名", input.operation);
          ports.writer.putIdempotency({ ...input, projectId });
        },
      };
      return Object.freeze(writer);
    },
  };
}
