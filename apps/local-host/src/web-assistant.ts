import type { Server } from "node:http";
import { setTimeout as pause } from "node:timers/promises";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import type { AssistantService } from "./assistant/assistant-service.js";
import type { PeriodicTasks } from "./periodic-tasks.js";
import { hostLog } from "./host-log.js";

/** Assistant background activity belongs to the serving Host, never to an open page or the request that started it. */
export function attachWebAssistant(server: Server, home: string, assistant: () => AssistantService,
  agents: { readonly ready: Promise<void>; readonly started: Promise<void> }, periodic: PeriodicTasks): void {
  const stopped = new AbortController();
  server.once("close", () => stopped.abort());
  // Restore waiting/interrupted work and due follow-ups; otherwise stay lazy until something needs the Runtime.
  void runWithMolisWorkHome(home, async () => {
    if (!assistant().notices.hasTimedWork()) await agents.started;
    for (let attempt = 0; attempt < 40 && !stopped.signal.aborted; attempt++) {
      try { await agents.ready; if (!stopped.signal.aborted && await assistant().notices.attachSchedule()) return; }
      catch (error) { if (attempt === 0) hostLog.warn("assistant", "schedule_not_attached", error); }
      await pause(15_000, undefined, { signal: stopped.signal, ref: false });
    }
  }).catch(error => { if (!stopped.signal.aborted) hostLog.warn("assistant", "background_failed", error); });
  periodic.every({ id: "assistant.material", title: "为进行中的工作找新资料", owner: "assistant", intervalMs: 300_000,
    run: () => runWithMolisWorkHome(home, () => withCallId(newCallId(), () => assistant().notices.scanNewMaterial())), onError: error => hostLog.warn("assistant", "new_material_scan_failed", error) });
  periodic.every({ id: "assistant.reminders", title: "到期提醒", owner: "assistant", intervalMs: 60_000,
    run: () => runWithMolisWorkHome(home, () => withCallId(newCallId(), () => assistant().followUps.sweepReminders())), onError: error => hostLog.warn("assistant", "reminder_sweep_failed", error) });
}
