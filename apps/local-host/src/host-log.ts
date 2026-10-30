import { platformErrorKind } from "@molis-ai/molis-work-contracts/platform/actions";
import { currentCallId } from "@molis-ai/molis-work-kernel";

/**
 * The Host's log (W5-13), its one implementation: one JSON line per entry on stderr, which the resident Web service's
 * LaunchAgent writes to the Home's log file. An entry is named by a stable area and event, and carries the ID of the call it
 * happened in when there is one, so the diagnostic ID a person copies from a failure finds its log lines too.
 *
 * Keys only (docs/system/SECURITY-INVARIANTS.md, secrets by reference only): an error keeps its name and code, never its
 * message or stack, which can carry a person's text, a path or a secret; a field keeps a number, a boolean, null or a
 * key-like string (letters, digits and `._:@-`, at most 120 characters: no spaces, no path separators), and anything else is written as `"[omitted]"`.
 * The key filter is a shape check, not a secret detector: an email or an `sk-…` token has a key's shape and would be written.
 * So a call site gives only ids, enums and counts it chose itself, never a value it read from a person, a file or a provider.
 * `debug` lines are written only for the areas listed in `MOLIS_WORK_DEBUG` (comma separated, e.g. `memory,search`; `*` for
 * all).
 */
export type HostLogLevel = "debug" | "warn" | "error";
export type HostLogField = string | number | boolean | null;

export interface HostLogEntry {
  at: string;
  level: HostLogLevel;
  area: string;
  event: string;
  call_id?: string;
  error?: { name: string; code?: string };
  fields?: Record<string, HostLogField>;
}

const KEY = /^[A-Za-z0-9._:@-]{1,120}$/;
const OMITTED = "[omitted]";

type Sink = (line: string) => void;
let sink: Sink = line => { process.stderr.write(line + "\n"); };

/** Tests read the entries a piece of code writes; returns the function that puts the previous sink back. */
export function captureHostLog(into: HostLogEntry[]): () => void {
  const previous = sink;
  sink = line => { into.push(JSON.parse(line) as HostLogEntry); };
  return () => { sink = previous; };
}

const keyed = (value: unknown): HostLogField => typeof value === "number" || typeof value === "boolean" || value === null ? value
  : typeof value === "string" && KEY.test(value) ? value : OMITTED;

const keyedName = (name: string): string => KEY.test(name) ? name : OMITTED;

const describe = (error: unknown): NonNullable<HostLogEntry["error"]> => {
  const code = (error as { code?: unknown } | null)?.code;
  const name = error instanceof Error ? error.name : typeof error;
  return { name: KEY.test(name) ? name : OMITTED, ...(typeof code === "string" && KEY.test(code) ? { code } : {}) };
};

const debugging = (area: string): boolean => {
  const listed = (process.env.MOLIS_WORK_DEBUG ?? "").split(",").map(name => name.trim()).filter(Boolean);
  return listed.includes("*") || listed.includes(area);
};

function write(level: HostLogLevel, area: string, event: string, error?: unknown, fields?: Record<string, unknown>): void {
  if (level === "debug" && !debugging(area)) return;
  const callId = currentCallId();
  const kept = fields ? Object.fromEntries(Object.entries(fields).filter(([name]) => KEY.test(name)).map(([name, value]) => [name, keyed(value)])) : {};
  // A name that is not a stable key is a mistake at the call site; the line is still written, never thrown from a catch.
  const entry: HostLogEntry = { at: new Date().toISOString(), level, area: keyedName(area), event: keyedName(event), ...(callId ? { call_id: callId } : {}),
    ...(error === undefined ? {} : { error: describe(error) }), ...(Object.keys(kept).length ? { fields: kept } : {}) };
  sink(JSON.stringify(entry));
}

export const hostLog = {
  /** Something went wrong that the Host carries on past; `error` is what was caught. */
  warn: (area: string, event: string, error?: unknown, fields?: Record<string, unknown>) => write("warn", area, event, error, fields),
  /** Something that failed for good: a step the person or a later run has to look at. */
  error: (area: string, event: string, error?: unknown, fields?: Record<string, unknown>) => write("error", area, event, error, fields),
  /** A developer trace, written only when `MOLIS_WORK_DEBUG` lists the area. */
  debug: (area: string, event: string, fields?: Record<string, unknown>) => write("debug", area, event, undefined, fields),
};

/**
 * Something that runs again and again (a timer's round, a poll) and fails the same way each time: written when it starts failing,
 * and again only once it has worked since. `key` names what failed (a project's store, one schedule), never text of its own.
 */
export function repeatingFailure(area: string, event: string) {
  const failing = new Set<string>();
  return {
    worked: (key: string): void => { failing.delete(key); },
    failed: (key: string, error: unknown, fields?: Record<string, unknown>): void => {
      if (failing.has(key)) return;
      failing.add(key); hostLog.warn(area, event, error, fields);
    },
  };
}

const failingListeners = new WeakSet<object>();

/**
 * Tells every listener of `of` (a store's changes, a desk's frames): one that throws does not stop the others or the code that
 * told them, and is written as `<area>.listener_failed` when it starts failing, and again only once it has worked since.
 */
export function eachListener<L extends object>(area: string, of: string, listeners: Iterable<L>, tell: (listener: L) => void): void {
  for (const listener of listeners) {
    try { tell(listener); failingListeners.delete(listener); }
    catch (error) {
      if (failingListeners.has(listener)) continue;
      failingListeners.add(listener); hostLog.warn(area, "listener_failed", error, { of });
    }
  }
}

/**
 * The search index's background passes (reconcile, refresh, sync) that failed past the source's own report. They run after
 * every write, so one failure is written once per pass and error code for the life of the process.
 */
const searchIndexFailures = repeatingFailure("search", "index_update_failed");
export const logSearchIndexFailure = (error: unknown, where: string): void =>
  searchIndexFailures.failed(`${where}:${String((error as { code?: unknown } | null)?.code ?? "")}`, error, { where });

/**
 * "You may not read it" and "it is not there" are answers a reader shows as such, not failures to write. An MCP client's call to an
 * action it was not granted is refused with `mcp.action_revoked`, which carries no kind yet (giving it one at the source is its own
 * task), so it is named here.
 */
function answeredRefusal(error: unknown): boolean {
  const { kind, code } = (error ?? {}) as { kind?: unknown; code?: unknown };
  if (code === "mcp.action_revoked") return true;
  const sort = kind ?? (typeof code === "string" ? platformErrorKind(code) : undefined);
  return sort === "forbidden" || sort === "not_found";
}

/**
 * 「被谁引用」: the plugin that declares a link kind could not name its objects. The 成果库 shows their ids; a refusal is the
 * caller's answer, anything else (the plugin broke, timed out, is unavailable) is written.
 */
export function logLinkSubjectsFailure(error: unknown, pluginId: string): void {
  if (answeredRefusal(error)) return;
  hostLog.warn("artifacts", "link_subjects_failed", error, { plugin_id: pluginId });
}

/**
 * An owner's preview of a version that failed. The caller still shows no preview; "you may not read it" and "it is not there"
 * are answers, and anything else (the owner broke, timed out, is unavailable) is written.
 */
export function logPreviewFailure(error: unknown, artifactTypeId: string): void {
  if (answeredRefusal(error)) return;
  hostLog.warn("artifacts", "preview_failed", error, { artifact_type_id: artifactTypeId });
}
