import type { AgentWriteCheckResult, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * What the person's after-write check of one write came to, as the timeline shows it on that write's row
 * (specs/prologue-adoption §6.0p.5, PA-35).
 *
 * Every fact here is read from the check's own command receipt (`<write call id>:diagnostics` in the round's
 * `command_outputs`), never from the words the model was given. A write with no entry had no check run for it; a receipt
 * that exists but cannot be read is said to be unreadable, never passed off as "not checked".
 */
export type CodingWriteCheck =
  | AgentWriteCheckResult
  | { call_id: string; unreadable: true };

const RECEIPT = ":diagnostics";

/** How long a receipt that could not be read is left alone before it is asked for again. */
const RETRY_UNREADABLE_MS = 30_000;
/** Upper bound for cached settled receipts and negative retry timestamps (oldest-used evicted first). */
const MAX_ENTRIES = 1000;

type Load = (runId: string, writeIds: string[]) => Promise<AgentWriteCheckResult[]>;

function rememberBounded<V>(map: Map<string, V>, key: string, value: V): void {
  map.delete(key);
  map.set(key, value);
  for (const oldest of map.keys()) {
    if (map.size <= MAX_ENTRIES) break;
    map.delete(oldest);
  }
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown; cause?: unknown };
  if (candidate.name === "AbortError" || candidate.code === "ABORT_ERR" || candidate.code === "actions.cancelled") return true;
  return candidate.cause !== undefined && candidate.cause !== error && isAbortError(candidate.cause);
}

/** Immutable successes and short-lived misses, scoped to the original session, round and write. */
export function writeCheckCache(now: () => number = Date.now) {
  const settled = new Map<string, AgentWriteCheckResult>();
  const loading = new Map<string, Promise<void>>();
  const retryAt = new Map<string, number>();
  return {
    async attach<Run extends Pick<AgentRunView, "ref" | "command_outputs">>(session: string, runs: readonly Run[], load: Load) {
      return Promise.all(runs.map(async run => {
        const runId = run.ref.run_id;
        const ids = [...new Set((run.command_outputs ?? []).filter(ref => ref.run_id === runId && ref.call_id.endsWith(RECEIPT))
          .map(ref => ref.call_id.slice(0, -RECEIPT.length)).filter(Boolean))];
        const key = (id: string) => JSON.stringify([session, runId, id]);
        const currentTime = now();
        const due = ids.filter(id => {
          const entryKey = key(id);
          if (loading.has(entryKey) || settled.has(entryKey)) return false;
          const retry = retryAt.get(entryKey);
          if (retry !== undefined && currentTime < retry) return false;
          if (retry !== undefined) retryAt.delete(entryKey);
          return true;
        });
        if (due.length) {
          const batch = Promise.resolve()
            .then(() => load(runId, due))
            .then(
              rows => {
                const results = new Map(rows.map(result => [result.call_id, result]));
                for (const id of due) {
                  const entryKey = key(id);
                  const result = results.get(id);
                  if (result) {
                    rememberBounded(settled, entryKey, result);
                    retryAt.delete(entryKey);
                  } else {
                    rememberBounded(retryAt, entryKey, now() + RETRY_UNREADABLE_MS);
                  }
                  loading.delete(entryKey);
                }
              },
              error => {
                const aborted = isAbortError(error);
                for (const id of due) {
                  const entryKey = key(id);
                  if (!aborted) rememberBounded(retryAt, entryKey, now() + RETRY_UNREADABLE_MS);
                  loading.delete(entryKey);
                }
              },
            );
          for (const id of due) loading.set(key(id), batch);
        }
        await Promise.all(new Set(ids.map(id => loading.get(key(id)))));
        const write_checks: CodingWriteCheck[] = ids.map(id => {
          const entryKey = key(id);
          const hit = settled.get(entryKey);
          if (hit) {
            settled.delete(entryKey);
            settled.set(entryKey, hit);
            return hit;
          }
          return { call_id: id, unreadable: true };
        });
        return { ...run, write_checks };
      }));
    },
  };
}
