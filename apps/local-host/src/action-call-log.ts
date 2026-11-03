import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, truncateSync, writeFileSync } from "node:fs";
import path from "node:path";
import { currentCallId, markCallRecorded, refusalExpected, type CallContext, type CallDescription, type CallOutcome } from "@molis-ai/molis-work-kernel";

/**
 * One finished call as the diagnostic log keeps it: what was called, for whom, how it ended, and the number of the operation it was part of.
 * Inputs and results are never kept. A row is not business data: it is written for the person who needs to find out what happened.
 */
export interface ActionCallRecord {
  at: string;
  /** The number of the operation (a request, a tool call, a round); a person is shown the first eight characters. */
  call_id: string;
  /** `unknown`: no action of the caller's project has the id it asked for. */
  operation: "command" | "query" | "unknown";
  capability_id: string;
  version: number;
  provider_id: string;
  provider_title: string;
  title: string;
  actor_id: string;
  audience: string;
  project_id: string | null;
  ok: boolean;
  code?: string;
  /** Only a command that ran and failed keeps a line of what went wrong. A refused call or a failed read keeps the error code and nothing that was said. */
  message?: string;
  /** Turned away before its handler began (shown as 「未执行」): nothing was done, and the row only says who asked for what, that it ended so, and the error code. */
  refused?: true;
  /** The plugin (Manifest `plugin_id`) whose running action made this call through its action directory (`actions:delegate`); `actor_id` stays the original caller. */
  delegated_by?: string;
  /** Identical consecutive outcomes (a page polling the same command) are one entry: how many, and the latest time. */
  count?: number;
  last_at?: string;
  /** For an entry of several operations: the newest ones, so any of them can be looked up. `call_id` is the latest. */
  call_ids?: string[];
  /** For an entry of refusals to unknown ids: the newest different ones. */
  capability_ids?: string[];
}

const RELATIVE_PATH = "logs/action-calls.jsonl";
/** Past this many lines the file is rewritten: the newest commands that ran, and a shorter tail of everything else. */
const LIMIT = 2000;
const KEEP_COMMANDS = 1000;
const KEEP_OTHER = 200;
const FOLDED = 20;
/** A prefix shorter than this would match nearly every operation. The settings page that looks a number up says so by the same count. */
export const MIN_CALL_ID_PREFIX = 6;
const COALESCE_MS = 10 * 60_000;
const OPERATIONS: readonly string[] = ["command", "query", "unknown"];

/** A client asking for ids that do not exist is one entry whatever it asked for; any other repeat needs the same call. */
const unknownId = (row: ActionCallRecord) => row.refused === true && row.code === "actions.missing";
const sameCall = (a: ActionCallRecord, b: ActionCallRecord) => a.actor_id === b.actor_id && a.audience === b.audience && a.project_id === b.project_id
  && a.ok === b.ok && a.code === b.code && a.refused === b.refused && a.delegated_by === b.delegated_by
  && (unknownId(a) && unknownId(b) || a.capability_id === b.capability_id && a.version === b.version && a.provider_id === b.provider_id && a.operation === b.operation && a.message === b.message);
const lastDistinct = (ids: readonly string[], id: string) => [...ids.filter(other => other !== id), id].slice(-FOLDED);
/**
 * What the log keeps of the text a failed command gave (the only row that keeps one; a refused call and a failed read keep their code alone).
 * A contract failure lists the fields that did not fit (`/客户 type`), and for a record keyed by what a person typed those names are the input's
 * or the result's, which is never kept: only that the contract was not met stays. This holds for every message with these codes, whoever wrote it.
 */
const reasonOf = (outcome: Extract<CallOutcome, { ok: false }>): string =>
  /^actions\.(input|output)_invalid/.test(outcome.code ?? "") ? outcome.message.split("：")[0]! : outcome.message;
const ranCommand = (row: ActionCallRecord) => row.operation === "command" && row.refused !== true;

/** Which kind of row a call leaves, if any: every command; a read (or a call to an id nobody has) only when it failed. */
function recordedOperation(operation: string, outcome: CallOutcome): ActionCallRecord["operation"] | undefined {
  if (operation === "command") return "command";
  if (outcome.ok) return undefined;
  return operation === "query" ? "query" : "unknown";
}

function parseRow(line: string): ActionCallRecord | undefined {
  let row: Partial<ActionCallRecord> | undefined;
  // A line that is not JSON is a torn write from a crash mid-append: not a row of this log.
  try { row = JSON.parse(line) as Partial<ActionCallRecord>; } catch { return undefined; }
  // A row from before calls had a number (or a torn one) is not a row of this log: it is not shown, and the next tidy drops it.
  return typeof row?.call_id === "string" && row.call_id && OPERATIONS.includes(row.operation ?? "") && typeof row.capability_id === "string" && typeof row.at === "string"
    ? row as ActionCallRecord : undefined;
}

/** The newest commands that ran, and a short tail of the rest (refusals, failed reads), so a flood of the second kind cannot push out the first. */
function tidy(rows: ActionCallRecord[]): ActionCallRecord[] {
  let commands = 0, others = 0;
  const kept: ActionCallRecord[] = [];
  for (let i = rows.length - 1; i >= 0; i--) if (ranCommand(rows[i]!) ? commands++ < KEEP_COMMANDS : others++ < KEEP_OTHER) kept.push(rows[i]!);
  return kept.reverse();
}

/** The same call again: one entry with the count, the latest time and number, and the newest numbers (and, for unknown ids, the newest ids) of what it folded. */
function fold(last: ActionCallRecord, row: ActionCallRecord): ActionCallRecord {
  const folded = { ...(unknownId(row) ? { ...row, at: last.at } : last), call_id: row.call_id, count: (last.count ?? 1) + 1, last_at: row.at,
    call_ids: lastDistinct(last.call_ids ?? [last.call_id], row.call_id) };
  return unknownId(row) ? { ...folded, capability_ids: lastDistinct(last.capability_ids ?? [last.capability_id], row.capability_id) } : folded;
}

/**
 * A short local history of calls, kept in the Home next to other local records: every command, and a read only when it failed.
 * A call turned away before its handler began (`refused`) leaves a row too, marked as not run: a person who is told "no" will look for why.
 * That row is a diagnostic, not a business record. It names who asked, for what, how it ended and the error code, and keeps no content: not the
 * input, not a result, not what the provider said. A failed read is kept the same way. Only a command that ran and failed keeps a line of
 * what went wrong, as it did before. So the rule that a cancelled, revoked or disabled call writes no business record is not touched by it.
 */
export class ActionCallLog {
  private readonly file: string;
  /** The last line as this process wrote it, and where it starts and ends, so a repeat rewrites only that line. */
  private tail?: { row: ActionCallRecord; offset: number; end: number };
  private lines = -1;
  constructor(homeDirectory: string) { this.file = path.join(homeDirectory, RELATIVE_PATH); }

  record(caller: CallContext, action: CallDescription, outcome: CallOutcome): void {
    const operation = recordedOperation(action.operation, outcome);
    // A refusal that a page was looking for (an optional area its project does not have) is its answer, not something a person will look up.
    if (!operation || !outcome.ok && outcome.refused && refusalExpected(outcome.code)) return;
    this.write({ at: new Date().toISOString(), call_id: caller.call_id, operation, capability_id: action.capability_id, version: action.version, provider_id: action.provider_id ?? "",
      provider_title: action.provider_title, title: action.title, actor_id: caller.actor_id, audience: caller.audience ?? "user", project_id: caller.project_id ?? null,
      ok: outcome.ok, ...(outcome.ok ? {} : { ...(outcome.code ? { code: outcome.code } : {}), ...(outcome.refused ? { refused: true as const } : {}),
        ...(operation === "command" && !outcome.refused ? { message: reasonOf(outcome) } : {}) }),
      ...(caller.delegated_by ? { delegated_by: caller.delegated_by } : {}) });
    // Only now that the row is in the file may the operation that is waiting for its answer show its number to a person.
    if (currentCallId() === caller.call_id) markCallRecorded();
  }

  /** Newest first, for one project or for Home (null). */
  list(projectId: string | null, limit = 200): ActionCallRecord[] {
    return this.read().rows.filter(row => row.project_id === projectId).reverse().slice(0, limit);
  }

  /** The rows of the operation that has this number (or whose number starts with it, from six characters), in any project; newest first. */
  find(prefix: string, limit = 50): ActionCallRecord[] {
    const wanted = prefix.trim().toLowerCase();
    if (wanted.length < MIN_CALL_ID_PREFIX) return [];
    return this.read().rows.filter(row => [row.call_id, ...(row.call_ids ?? [])].some(id => id.toLowerCase().startsWith(wanted))).reverse().slice(0, limit);
  }

  /** The newest rows of every project, for a page that asks "what went wrong lately". */
  recent(limit = 20, { failedOnly = false }: { failedOnly?: boolean } = {}): ActionCallRecord[] {
    return this.read().rows.filter(row => !failedOnly || !row.ok).reverse().slice(0, limit);
  }

  private write(row: ActionCallRecord): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const size = this.size();
    // Another process sharing this Home may have written since; then the last line is read again from the file.
    if (this.tail?.end !== size) this.tail = this.readTail(size);
    const last = this.tail;
    if (last && sameCall(last.row, row) && Date.parse(row.at) - Date.parse(last.row.last_at ?? last.row.at) < COALESCE_MS) {
      truncateSync(this.file, last.offset);
      this.append(fold(last.row, row), last.offset);
      return;
    }
    this.append(row, size);
    if (this.lines < 0) this.lines = this.read().lines; else this.lines++;
    // Keep the file short: once it passes its limit, rewrite what is worth keeping atomically (the rows of an older shape go with it).
    if (this.lines > LIMIT) this.rewrite(tidy(this.read().rows));
  }

  private append(row: ActionCallRecord, offset: number): void {
    const line = JSON.stringify(row) + "\n";
    appendFileSync(this.file, line, "utf8");
    this.tail = { row, offset, end: offset + Buffer.byteLength(line) };
  }

  private rewrite(rows: ActionCallRecord[]): void {
    const temporary = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temporary, rows.map(entry => JSON.stringify(entry)).join("\n") + "\n", "utf8");
    renameSync(temporary, this.file);
    this.lines = rows.length;
    this.tail = undefined;
  }

  private size(): number {
    // No file yet is an empty log (the first call creates it).
    try { return statSync(this.file).size; } catch { return 0; }
  }

  private readTail(size: number): ActionCallLog["tail"] {
    if (!size) return undefined;
    const text = readFileSync(this.file, "utf8");
    const body = text.endsWith("\n") ? text.slice(0, -1) : text;
    const start = body.lastIndexOf("\n") + 1;
    const row = parseRow(body.slice(start));
    return row ? { row, offset: Buffer.byteLength(body.slice(0, start)), end: size } : undefined;
  }

  /** The rows of the current shape, oldest first, and how many lines the file has (what counts towards its limit). */
  private read(): { rows: ActionCallRecord[]; lines: number } {
    let text = "";
    // No file yet is an empty log (the first call creates it).
    try { text = readFileSync(this.file, "utf8"); } catch { return { rows: [], lines: 0 }; }
    const lines = text.split("\n").filter(line => line.trim());
    return { rows: lines.flatMap(line => parseRow(line) ?? []), lines: lines.length };
  }
}
