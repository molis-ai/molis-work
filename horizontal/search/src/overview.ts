import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  OVERVIEW_KINDS, OVERVIEW_SUMMARY_FIELDS, type OverviewIndexRow, type OverviewKind, type OverviewSummaryField,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { OverviewIndexLibrary, OverviewIndexPort, OverviewIndexStoredRow, OverviewTableRow } from "@molis-ai/molis-work-contracts/services/search";
import { checkOverviewRow } from "@molis-ai/molis-work-plugin-sdk";

/**
 * The Home's overview index (specs/unified-partition-plugins §6.1, U4/V11, batch 106): the overview tables the plugins keep in their
 * partition libraries, read on a read-only connection without starting the plugin or its partition's supervisor (S-partition-wake-scope),
 * stamped with the partition and installation the platform read them from (a plugin cannot name either), and dropped the moment the plugin
 * is disabled or uninstalled there or the partition goes. A synchronized write or a restore marks a library dirty; opening the overview
 * reads only dirty libraries, so dormant partitions stay closed. Each read hands the reminder times to the due registry (`reminders`), so a
 * reminder that arrived by sync rings. The index is a cache beside the search index (`packages/storage` `openOverviewIndex`).
 *
 * Who reads it is the platform's rule (`overview-readers`, user 2026-11-24), applied on every read and again before the answer is handed
 * over: the person on this machine reads the partitions they can read now; the personal assistant only the partitions and summary fields
 * the person granted it, intersected with what it may read now; a project Agent, an MCP client, a workflow or a plugin reads nothing here.
 */
export type OverviewLibrary = OverviewIndexLibrary;

/** What one reader may see now: per partition, the summary fields. Absent partitions and fields are not shown. */
export type OverviewReach = readonly { readonly partition_id: string; readonly fields: readonly OverviewSummaryField[] }[];

/** One of the person's grants to the personal assistant: a project, and the summary fields it may see there. */
export interface OverviewGrant {
  readonly partition_id: string;
  readonly fields: readonly OverviewSummaryField[];
}

type OverviewCaller = Pick<ActionCallContext, "actor_id" | "audience" | "actor_kind" | "delegated_by" | "host_plugin" | "calling_plugin_id" | "audit_actor_id">;

/**
 * The person on this machine, the personal assistant acting for them, or nobody. Both are the local person's own identity from the trusted
 * context: the person's page or command, and the assistant's runtime (`assistantActionContext`, carrying `audit_actor_id: "assistant:<id>"`).
 * A project Agent carries its own `agent:` actor; an MCP client, a workflow, a plugin or a delegated call is nobody here, whatever it was granted.
 */
export function overviewReaderKind(caller: OverviewCaller): "person" | "assistant" | null {
  if (caller.actor_id !== LOCAL_PERSON_ACTOR_ID || caller.delegated_by !== undefined || caller.host_plugin || caller.calling_plugin_id) return null;
  if (caller.audience === "user" && caller.actor_kind !== "runtime") return "person";
  if (caller.audience === "agent" && caller.actor_kind === "runtime"
    && typeof caller.audit_actor_id === "string" && caller.audit_actor_id.startsWith("assistant:") && caller.audit_actor_id.length > "assistant:".length) {
    return "assistant";
  }
  return null;
}

/**
 * What `caller` may read now. `readable` is what the Host lets this caller read at this moment (for the assistant, after the projects'
 * AI permission and its own reach); `grants` are the person's grants to the assistant. The person gets every summary field of what they
 * can read; the assistant only granted fields of granted partitions it can read; anyone else is refused.
 */
export function overviewReach(caller: OverviewCaller,
  now: { readonly readable: readonly string[]; readonly grants: readonly OverviewGrant[] }): OverviewReach {
  const kind = overviewReaderKind(caller);
  if (kind === null) throw new ActionError("actions.forbidden", "这个调用方不能读总览");
  const readable = new Set(now.readable);
  if (kind === "person") return [...readable].map(partition_id => ({ partition_id, fields: OVERVIEW_SUMMARY_FIELDS }));
  const fields = new Map<string, Set<OverviewSummaryField>>();
  for (const grant of now.grants) {
    if (!readable.has(grant.partition_id)) continue;
    const kept = fields.get(grant.partition_id) ?? new Set<OverviewSummaryField>();
    for (const field of grant.fields) if ((OVERVIEW_SUMMARY_FIELDS as readonly string[]).includes(field)) kept.add(field);
    fields.set(grant.partition_id, kept);
  }
  return [...fields].filter(([, kept]) => kept.size > 0).map(([partition_id, kept]) => ({ partition_id, fields: [...kept] }));
}

export interface OverviewServiceOptions {
  readonly rebuilt?: (refreshed: number, failed: number) => void;
  /** Replaces the due registry's reminder entries of one library with the times read from it now. */
  readonly reminders?: (library: OverviewLibrary, entries: readonly { readonly entry_key: string; readonly due_at: string }[]) => void;
  /**
   * Reads an `attention` library (the partition's "waiting on you" entries, R13): its owner module's projection on a read-only connection.
   * Without it such a library cannot be read and stays dirty.
   */
  readonly readAttention?: (library: OverviewLibrary) => readonly OverviewTableRow[] | null;
}

export class OverviewService {
  private readonly pending = new Map<string, OverviewLibrary>();
  private turn?: NodeJS.Immediate;
  private readonly failedReads = new Map<string, { library: OverviewLibrary; retryAt: number }>();

  constructor(private readonly port: OverviewIndexPort, private readonly options: OverviewServiceOptions = {}) {}

  /** A synchronized write or a restore reached this partition (or one installation in it): read it again on the next open. */
  markDirty(partitionId: string, installId?: string): void {
    this.forgetFailures(partitionId, installId);
    this.port.markDirty(partitionId, installId);
  }

  /** A library to read; a new one is dirty until it is read. */
  track(library: OverviewLibrary): void { this.port.track(library); }

  /**
   * Reads one library's overview table and replaces what the index holds of it. Each row is checked again as the SDK checks it before a
   * write (`checkOverviewRow`): one written past the SDK is left out, never breaking the rest. The reminders go to the due registry before
   * the library is marked read, so a failure there leaves it dirty and it is read again. A library that cannot be read now keeps its rows
   * and stays dirty. Returns the rows held, or null when it could not be read.
   */
  refresh(library: OverviewLibrary): number | null {
    const read = library.table === "attention" ? this.options.readAttention?.(library) ?? null : this.port.readLibrary(library);
    if (read === null) {
      this.port.track(library);
      return null;
    }
    const valid = read.flatMap(row => {
      const columns = checkedColumns(row);
      return columns ? [columns] : [];
    });
    const reminders = valid.flatMap(row => typeof row.remind_at === "string" ? [{ entry_key: `${String(row.kind)}:${String(row.row_id)}`, due_at: row.remind_at }] : []);
    this.options.reminders?.(library, reminders);
    const rows = valid.map(row => storedRow(library, row));
    this.port.replace(library, rows, valid.map(sortAt));
    return rows.length;
  }

  /** Reads those of `libraries` that are new or dirty, and only those: clean and dormant partitions are not opened. */
  refreshDirty(libraries: readonly OverviewLibrary[]): number {
    let read = 0;
    for (const library of libraries) {
      const state = this.port.state(library.partition_id, library.install_id);
      if (state !== null && !state.dirty) continue;
      this.refresh(library);
      read += 1;
    }
    return read;
  }

  /** The foreground may read one source. A backlog is rebuilt one library per host event-loop turn. */
  refreshForRead(libraries: readonly OverviewLibrary[]): { pending: OverviewLibrary[]; unavailable: OverviewLibrary[] } {
    const unavailable: OverviewLibrary[] = [];
    const dirty = libraries.filter(library => {
      const state = this.port.state(library.partition_id, library.install_id);
      if (!state) this.port.track(library);
      if (state && !state.dirty) return false;
      const failed = this.failedReads.get(JSON.stringify([library.partition_id, library.install_id]));
      if (failed && Date.now() < failed.retryAt) {
        unavailable.push(library);
        return false;
      }
      return true;
    });
    if (dirty.length === 1 && !this.turn) {
      if (!this.refreshAvailable(dirty[0]!)) unavailable.push(dirty[0]!);
      return { pending: [], unavailable };
    }
    for (const library of dirty) this.pending.set(JSON.stringify([library.partition_id, library.install_id]), library);
    if (this.pending.size && !this.turn) this.scheduleTurn(0, 0);
    return { pending: dirty, unavailable };
  }

  private refreshAvailable(library: OverviewLibrary): boolean {
    const key = JSON.stringify([library.partition_id, library.install_id]);
    try {
      if (this.refresh(library) !== null) {
        this.failedReads.delete(key);
        return true;
      }
    } catch { /* Keep the source dirty when the replacement cannot commit. */ }
    // Revisit on the next change or a later read. A broken file is not work in progress.
    this.failedReads.set(key, { library, retryAt: Date.now() + 30_000 });
    return false;
  }

  private scheduleTurn(refreshed: number, failed: number): void {
    this.turn = setImmediate(() => {
      this.turn = undefined;
      const [key, library] = this.pending.entries().next().value!;
      this.pending.delete(key);
      // Disabling or removing the plugin clears its tracked state, even if a read previously queued it.
      if (this.port.state(library.partition_id, library.install_id)?.dirty) {
        if (this.refreshAvailable(library)) refreshed++;
        else failed++;
      }
      if (this.pending.size) this.scheduleTurn(refreshed, failed);
      else this.options.rebuilt?.(refreshed, failed);
    });
    this.turn.unref();
  }

  /** The owner's default due reminder. An unreadable source must retry delivery, even during an index rebuild. */
  row(library: OverviewLibrary, kind: string, rowId: string): OverviewIndexStoredRow | null {
    if (!(OVERVIEW_KINDS as readonly string[]).includes(kind)) return null;
    const { partition_id, install_id } = library;
    if (this.port.state(partition_id, install_id)?.dirty !== false && this.refresh(library) === null) {
      throw new ActionError("actions.plugin_unavailable", "暂时无法读取提醒");
    }
    return this.port.rows({ partitions: [partition_id], kinds: [kind], ownerRow: { install_id, row_id: rowId }, limit: 1 })[0] ?? null;
  }

  private forgetFailures(partition?: string, install?: string): void {
    for (const [key, { library }] of this.failedReads) {
      if ((!partition || library.partition_id === partition) && (!install || library.install_id === install)) this.failedReads.delete(key);
    }
  }
  removeInstall(installId: string, partitionId?: string): void {
    this.forgetFailures(partitionId, installId);
    this.port.removeInstall(installId, partitionId);
  }
  removePartition(partitionId: string): void {
    this.forgetFailures(partitionId);
    this.port.removePartition(partitionId);
  }

  /**
   * The rows `reach` allows of the asked kinds, with only the allowed fields. `reach` is asked before the read and again before the rows
   * are handed over, and the answer keeps only what both allow, so a partition or field revoked in between is not delivered.
   */
  read(reach: () => OverviewReach, query: { readonly kinds?: readonly OverviewKind[]; readonly limit?: number } = {}): OverviewIndexRow[] {
    const before = reachMap(reach());
    const kinds = (query.kinds ?? OVERVIEW_KINDS).filter(kind => (OVERVIEW_KINDS as readonly string[]).includes(kind));
    const limit = Math.max(1, Math.min(query.limit ?? 200, 2_000));
    const rows = this.port.rows({ partitions: [...before.keys()], kinds, limit });
    const after = reachMap(reach());
    return rows.flatMap(row => {
      const first = before.get(row.partition_id), second = after.get(row.partition_id);
      if (!first || !second) return [];
      const fields = Object.fromEntries(Object.entries(row.fields).filter(([field]) => first.has(field) && second.has(field)));
      if (Object.keys(fields).length === 0) return [];
      return [{ partition_id: row.partition_id, install_id: row.install_id, plugin_id: row.plugin_id, kind: row.kind, row_id: row.row_id,
        fields: fields as OverviewIndexRow["fields"] }];
    });
  }

  close(): void {
    if (this.turn) clearImmediate(this.turn);
    this.pending.clear();
    this.port.close();
  }
}

function reachMap(reach: OverviewReach): Map<string, Set<string>> {
  return new Map(reach.map(entry => [entry.partition_id, new Set<string>(entry.fields)]));
}

/** A row read back from a library as its kind's columns, or null when it is not a valid row of its kind. */
function checkedColumns(row: OverviewTableRow): OverviewTableRow | null {
  let tags: unknown, needs: unknown;
  try {
    if (typeof row.tags_json === "string") tags = JSON.parse(row.tags_json);
    if (typeof row.needs_json === "string") needs = JSON.parse(row.needs_json);
  } catch {
    return null;
  }
  const flag = (value: unknown) => value === null || value === undefined ? undefined : value === 1 ? true : value === 0 ? false : value;
  const open = typeof row.open_surface === "string" || typeof row.open_id === "string" ? { surface: row.open_surface, id: row.open_id } : null;
  const checked = checkOverviewRow(row.kind, { ...row, tags: tags ?? undefined, needs: needs ?? undefined, all_day: flag(row.all_day), waiting: flag(row.waiting), open });
  if ("problem" in checked) return null;
  const columns: Record<string, string | number | null> = {};
  for (const [column, value] of Object.entries(checked.columns)) if (typeof value === "string" || typeof value === "number" || value === null) columns[column] = value;
  return columns;
}

function storedRow(library: OverviewLibrary, row: OverviewTableRow): OverviewIndexStoredRow {
  const fields: Record<string, unknown> = {};
  for (const field of OVERVIEW_SUMMARY_FIELDS) {
    const value = field === "tags" ? (typeof row.tags_json === "string" ? JSON.parse(row.tags_json) as unknown : null)
      : field === "needs" ? (typeof row.needs_json === "string" ? JSON.parse(row.needs_json) as unknown : null)
        : field === "all_day" || field === "waiting" ? (row[field] === null || row[field] === undefined ? null : Number(row[field]) === 1)
          : field === "open" ? (typeof row.open_surface === "string" && typeof row.open_id === "string" ? { surface: row.open_surface, id: row.open_id } : null)
            : row[field];
    if (value !== null && value !== undefined) fields[field] = value;
  }
  return { partition_id: library.partition_id, install_id: library.install_id, plugin_id: library.plugin_id, kind: String(row.kind) as OverviewKind,
    row_id: String(row.row_id), fields };
}

function sortAt(row: OverviewTableRow): string | null {
  for (const field of ["due_at", "starts_at", "occurred_at", "updated_at"]) {
    const value = row[field];
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
    }
  }
  return null;
}
