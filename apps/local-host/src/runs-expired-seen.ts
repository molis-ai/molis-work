import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteFileSync } from "@molis-ai/molis-work-storage";
import { RUN_DIRECTORY } from "./host-presence.js";

/**
 * How far the person has been told about missed runs skipped on their own (scheduled-runs.ts, seven days from `due_at`): the panel says
 * once how many were skipped, and 「知道了」 moves this mark to the moment that summary was made. Owners count only what ran out after
 * it, so the same summary is not said again after a restart. One instant in `run/expired-seen.json`; a missing or unreadable file means
 * nothing was told yet, and every expired run the owners still keep is counted once.
 */
const FILE = "expired-seen.json";
const SCHEMA_VERSION = /* @version format.home.run.expired-seen */ 1;

const instant = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

export function expiredSeenThrough(homeDirectory: string): string | null {
  try {
    const record = JSON.parse(readFileSync(join(homeDirectory, RUN_DIRECTORY, FILE), "utf8")) as { schema_version?: unknown; seen_through?: unknown } | null;
    return record?.schema_version === SCHEMA_VERSION && instant(record.seen_through) ? record.seen_through : null;
  } catch { return null; /* nothing told yet, or a torn file: counted again once */ }
}

/** The person has read the summary made at `through`: the mark moves there, never back and never past `now`. Returns the mark kept. */
export function markExpiredSeen(homeDirectory: string, through: string, now: Date): string {
  const at = Math.min(Date.parse(through), now.getTime()), previous = expiredSeenThrough(homeDirectory);
  if (previous !== null && Date.parse(previous) >= at) return previous;
  const seen = new Date(at).toISOString();
  mkdirSync(join(homeDirectory, RUN_DIRECTORY), { recursive: true, mode: 0o700 });
  atomicWriteFileSync(join(homeDirectory, RUN_DIRECTORY, FILE), `${JSON.stringify({ schema_version: SCHEMA_VERSION, seen_through: seen })}\n`, { mode: 0o600 });
  return seen;
}
