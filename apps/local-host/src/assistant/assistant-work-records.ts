import { currentCallId } from "@molis-ai/molis-work-kernel";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { hostLog } from "../host-log.js";
import { liveObservation } from "../observation-live.js";

/**
 * What the person did to one of their Assistant works through the panel, joined to that work (observation-collection design §4「助理」):
 * sending a turn, answering, running or dismissing a suggestion, undoing, reviewing, taking it back. The call's own input and result are
 * the action exit's record under the same call number, as are the rounds a turn started; this record only names the work and the item,
 * so a work's turns, deliveries and the person's responses can be read together. Recorded after the write succeeded; never throws.
 */
export function recordAssistantWorkStep(home: string, projectId: string | null, step: string, input: unknown, output: unknown): void {
  const asked = input as { work_id?: unknown; item?: unknown }, made = output as { work?: { work_id?: unknown } } | undefined;
  const work_id = typeof asked.work_id === "string" ? asked.work_id : typeof made?.work?.work_id === "string" ? made.work.work_id : undefined;
  const live = work_id ? liveObservation(home) : undefined;
  if (!work_id || !live) return;
  try {
    const call_id = currentCallId(), item = typeof asked.item === "string" ? asked.item : undefined;
    live.sink("assistant").bind({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, audience: "user", permissions: [], ...(call_id ? { call_id } : {}) })
      .record({ fact: "assistant.work", outcome: "succeeded", stage: step, work: { work_ref: work_id },
        subjects: [{ kind: "assistant_work", id: work_id }, ...(item ? [{ kind: "assistant_item", id: item }] : [])] });
  } catch (error) { hostLog.warn("observation", "assistant_record_failed", error); }
}
