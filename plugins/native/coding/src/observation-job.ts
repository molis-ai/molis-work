import { setTimeout } from "node:timers/promises";
import type { CodingActivation } from "./route-activation.js";
import { readCodingSessions } from "./session-observation.js";

/** Independently refresh derived directory facts, even when no page polls Coding. Queries never keep this job. */
export function startCodingObservation(a: CodingActivation): void {
  const { context, execution, projectId } = a, api = context.services?.capabilities;
  if (!api || !context.services?.background) return;
  const job = context.services.background.keep("observe", async control => {
    const beforeWrite = Object.assign(control.beforeEffect, { assert_current: control.assert_authority_current, signal: control.signal });
    while (!control.signal.aborted) {
      await setTimeout(5_000, undefined, { signal: control.signal, ref: false });
      try {
        await readCodingSessions(a, execution, beforeWrite, true);
        for (const runtimeId of new Set(execution.sessions.list(projectId).filter(record => record.runtime_session_id).map(record => record.runtime_id))) {
          a.waits.wakeLoop(api, execution, runtimeId);
        }
      } catch {
        // Leave the last recorded facts intact; a later observation can recover without a page reopening.
        if (control.signal.aborted) return;
      }
    }
  });
  void job.done.catch(() => {}); // The platform ends it on stop or withdrawal; there is no business failure record.
}
