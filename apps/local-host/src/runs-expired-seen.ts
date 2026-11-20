import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteFileSync } from "@molis-ai/molis-work-storage";
import { RUN_DIRECTORY } from "./host-presence.js";

/**
 * How far the person has been told about missed runs skipped on their own (scheduled-runs.ts, seven days from `due_at`), owner by
 * owner: the panel says once how many were skipped, and 「知道了」 moves the mark of each owner that answered that summary to the moment
 * it was made. An owner that did not answer (its project was closed, it timed out) keeps its mark, so what ran out there meanwhile is
 * still said once. Owners count only what is expired and not told since (`RunsWindow.expired_after`), so the same summary is not said
 * again after a restart. One instant per owner in `run/expired-seen.json`; a missing or unreadable file means nothing was told yet.
 */
const FILE = "expired-seen.json";
const SCHEMA_VERSION = /* @version format.home.run.expired-seen */ 1;
/** Marks are dropped only past this many owners, oldest first: an owner's rows may outlive any age, so a mark is never dropped for age alone. */
const OWNERS_KEPT = 1_000;

export type ExpiredSeen = Readonly<Record<string, string>>;

/** One owner of runs: the project its provider runs in (null: the Home) and the provider. */
export const expiredOwnerKey = (scopeProjectId: string | null, providerId: string) => `${scopeProjectId ?? ""}\u0000${providerId}`;

const instant = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

export function expiredSeen(homeDirectory: string): ExpiredSeen {
  try {
    const record = JSON.parse(readFileSync(join(homeDirectory, RUN_DIRECTORY, FILE), "utf8")) as { schema_version?: unknown; seen?: unknown } | null;
    if (record?.schema_version !== SCHEMA_VERSION || !record.seen || typeof record.seen !== "object" || Array.isArray(record.seen)) return {};
    return Object.fromEntries(Object.entries(record.seen).filter((entry): entry is [string, string] => instant(entry[1])));
  } catch { return {}; /* nothing told yet, or a torn file: counted again once */ }
}

/**
 * The person has read the summary made at `through`, which these owners answered: their marks move there, never back and never past
 * `now`. Past `OWNERS_KEPT` owners the oldest marks are dropped. Returns the marks kept.
 */
export function markExpiredSeen(homeDirectory: string, through: string, owners: readonly string[], now: Date): ExpiredSeen {
  const at = Math.min(Date.parse(through), now.getTime()), seen: Record<string, string> = { ...expiredSeen(homeDirectory) };
  for (const owner of owners) {
    const previous = seen[owner];
    if (previous === undefined || Date.parse(previous) < at) seen[owner] = new Date(at).toISOString();
  }
  const kept = Object.entries(seen).sort((a, b) => b[1].localeCompare(a[1])).slice(0, OWNERS_KEPT);
  mkdirSync(join(homeDirectory, RUN_DIRECTORY), { recursive: true, mode: 0o700 });
  atomicWriteFileSync(join(homeDirectory, RUN_DIRECTORY, FILE), `${JSON.stringify({ schema_version: SCHEMA_VERSION, seen: Object.fromEntries(kept) })}\n`, { mode: 0o600 });
  return Object.fromEntries(kept);
}
