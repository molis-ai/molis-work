import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  OVERVIEW_KINDS, OVERVIEW_SUMMARY_FIELDS, type OverviewIndexRow, type OverviewKind, type OverviewSummaryField,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { OverviewIndexLibrary, OverviewIndexPort, OverviewIndexStoredRow, OverviewTableRow } from "@molis-ai/molis-work-contracts/services/search";

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

type OverviewCaller = Pick<ActionCallContext, "actor_id" | "audience" | "actor_kind" | "delegated_by" | "host_plugin">;

/**
 * The person on this machine, the personal assistant acting for them, or nobody. Both are the local person's own identity from the trusted
 * context: the person's page or command, and the assistant's runtime (`assistantActionContext`). A project Agent carries its own
 * `agent:` actor; an MCP client, a workflow, a plugin or a delegated call is nobody here, whatever it was granted.
 */
export function overviewReaderKind(caller: OverviewCaller): "person" | "assistant" | null {
  if (caller.actor_id !== LOCAL_PERSON_ACTOR_ID || caller.delegated_by !== undefined || caller.host_plugin) return null;
  if (caller.audience === "user" && caller.actor_kind !== "runtime") return "person";
  if (caller.audience === "agent" && caller.actor_kind === "runtime") return "assistant";
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
  /** Replaces the due registry's reminder entries of one library with the times read from it now. */
  readonly reminders?: (library: OverviewLibrary, entries: readonly { readonly entry_key: string; readonly due_at: string }[]) => void;
}

export class OverviewService {
  constructor(private readonly port: OverviewIndexPort, private readonly options: OverviewServiceOptions = {}) {}

  /** A synchronized write or a restore reached this partition (or one installation in it): read it again on the next open. */
  markDirty(partitionId: string, installId?: string): void { this.port.markDirty(partitionId, installId); }

  /** A library to read; a new one is dirty until it is read. */
  track(library: OverviewLibrary): void { this.port.track(library); }

  /**
   * Reads one library's overview table and replaces what the index holds of it. A library that cannot be read now keeps its rows and
   * stays dirty. Returns the rows held, or null when it could not be read.
   */
  refresh(library: OverviewLibrary): number | null {
    const read = this.port.readLibrary(library);
    if (read === null) {
      this.port.track(library);
      return null;
    }
    const rows = read.map(row => storedRow(library, row));
    this.port.replace(library, rows, read.map(sortAt));
    const reminders = read.flatMap(row => typeof row.remind_at === "string" && !Number.isNaN(Date.parse(row.remind_at))
      ? [{ entry_key: `${String(row.kind)}:${String(row.row_id)}`, due_at: row.remind_at }] : []);
    this.options.reminders?.(library, reminders);
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

  removeInstall(installId: string, partitionId?: string): void { this.port.removeInstall(installId, partitionId); }
  removePartition(partitionId: string): void { this.port.removePartition(partitionId); }

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
      return [{ partition_id: row.partition_id, install_id: row.install_id, plugin_id: row.plugin_id, kind: row.kind, row_id: row.row_id,
        fields: fields as OverviewIndexRow["fields"] }];
    });
  }

  close(): void { this.port.close(); }
}

function reachMap(reach: OverviewReach): Map<string, Set<string>> {
  return new Map(reach.map(entry => [entry.partition_id, new Set<string>(entry.fields)]));
}

function storedRow(library: OverviewLibrary, row: OverviewTableRow): OverviewIndexStoredRow {
  const fields: Record<string, unknown> = {};
  for (const field of OVERVIEW_SUMMARY_FIELDS) {
    const value = field === "tags" ? (typeof row.tags_json === "string" ? JSON.parse(row.tags_json) as unknown : null)
      : field === "all_day" ? (row.all_day === null || row.all_day === undefined ? null : Number(row.all_day) === 1)
        : row[field];
    if (value !== null && value !== undefined) fields[field] = value;
  }
  return { partition_id: library.partition_id, install_id: library.install_id, plugin_id: library.plugin_id, kind: String(row.kind) as OverviewKind,
    row_id: String(row.row_id), fields };
}

function sortAt(row: OverviewTableRow): string | null {
  for (const field of ["due_at", "starts_at", "occurred_at", "updated_at"]) {
    const value = row[field];
    if (typeof value === "string") return value;
  }
  return null;
}
