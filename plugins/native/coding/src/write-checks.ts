import type { AgentCommandOutput, AgentCommandOutputRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * What the person's after-write check of one write came to, as the timeline shows it on that write's row
 * (specs/prologue-adoption §6.0p.5, PA-35).
 *
 * Every fact here is read from the check's own command receipt (`<write call id>:diagnostics` in the round's
 * `command_outputs`), never from the words the model was given. A write with no entry had no check run for it; a receipt
 * that exists but cannot be read is said to be unreadable, never passed off as "not checked".
 */
export type CodingWriteCheck =
  | { call_id: string; checker: string | null; version: number | null; exit_code: number | null; timed_out: boolean; cancelled: boolean }
  | { call_id: string; unreadable: true };

const RECEIPT = ":diagnostics";

/** A receipt never changes once it exists, so each is read once for as long as the plugin runs. */
export function writeCheckCache() {
  const settled = new Map<string, CodingWriteCheck>();
  const one = async (session: string, ref: AgentCommandOutputRef, load: (ref: AgentCommandOutputRef) => Promise<AgentCommandOutput>): Promise<CodingWriteCheck> => {
    const key = `${session}:${ref.run_id}:${ref.call_id}`, known = settled.get(key), call_id = ref.call_id.slice(0, -RECEIPT.length);
    if (known) return known;
    try {
      const receipt = await load(ref);
      const check: CodingWriteCheck = { call_id, checker: receipt.after_write_check?.display_name ?? null, version: receipt.after_write_check?.version ?? null,
        exit_code: receipt.exit_code, timed_out: receipt.timed_out === true || receipt.stop_reason === "timed-out", cancelled: receipt.cancelled === true || receipt.stop_reason === "cancelled" };
      settled.set(key, check);
      return check;
    } catch { return { call_id, unreadable: true }; }
  };
  return {
    /** The rounds with their writes' checks beside them: one receipt read per check, none for a round without any. */
    async attach<Run extends Pick<AgentRunView, "command_outputs">>(session: string, runs: readonly Run[], load: (ref: AgentCommandOutputRef) => Promise<AgentCommandOutput>): Promise<Array<Run & { write_checks: CodingWriteCheck[] }>> {
      return Promise.all(runs.map(async run => Object.assign({ ...run }, {
        write_checks: await Promise.all((run.command_outputs ?? []).filter(ref => ref.call_id.endsWith(RECEIPT) && ref.call_id.length > RECEIPT.length).map(ref => one(session, ref, load))),
      })));
    },
  };
}
