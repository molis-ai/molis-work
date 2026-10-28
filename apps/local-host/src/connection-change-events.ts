import { HOST_CONNECTION_CHANGED_EVENT } from "@molis-ai/molis-work-contracts/platform/plugin";
import { hostLog } from "./host-log.js";
import { runningProjectPlatforms } from "./running-project-platforms.js";

/**
 * A connection of this Home changed (connected, enabled, disabled, disconnected, removed, or its token replaced): it goes out as
 * `host.connection.changed@1` to the installations of every project whose platform runs now that subscribe and hold
 * `connections:observe`. The payload names the connection and nothing else; a subscriber reads whether it is usable itself
 * (`connectors.connection.availability`). Nothing is stored and no platform or plugin is started for it: a project that is not running
 * hears nothing, and a plugin that starts later reads the connections it cares about when it starts. A failed announcement is logged,
 * not the connection change's failure: the change is already committed.
 */
export async function announceConnectionChanged(homeDirectory: string, connectionId: string): Promise<void> {
  try {
    for (const { projectId, platform } of await runningProjectPlatforms(homeDirectory)) {
      try { platform.hostEvents.broadcast({ event_type_id: HOST_CONNECTION_CHANGED_EVENT, type_version: 1, payload: { connection_id: connectionId } }); }
      catch (error) { hostLog.warn("connections", "announce_failed", error, { project_id: projectId, connection_id: connectionId }); }
    }
  } catch (error) { hostLog.warn("connections", "announce_failed", error, { connection_id: connectionId }); }
}

/**
 * What the Host does when a connection changes: it announces it. Feed's saved source statuses follow the account in each project's Feed
 * instance, which hears the event (and reads on start).
 */
export function connectionChanged(homeDirectory: string, connectionId: string): void {
  void announceConnectionChanged(homeDirectory, connectionId);
}
