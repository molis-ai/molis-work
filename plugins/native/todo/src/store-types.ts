import type { TodoActorKind, TodoLink, TodoSource, TodoStatus, TodoWaiting } from "./contract.js";

/**
 * Who is asking. Which todos they see is not Todo's to judge: the library is one partition's, and the platform lets a call reach it only
 * where the caller may (specs/unified-partition-plugins §4.2), so every todo in it is the caller's to see.
 */
export interface TodoAccess {
  readonly actor: TodoActorKind;
  readonly actorId: string;
}

export interface TodoFields {
  readonly title?: string;
  readonly notes?: string;
  readonly due_date?: string | null;
  readonly due_time?: string | null;
  readonly planned_date?: string | null;
  readonly remind_at?: string | null;
  readonly important?: boolean;
  readonly waiting?: TodoWaiting | null;
}

export interface TodoCreateInput extends TodoFields {
  readonly title: string;
  readonly status?: TodoStatus;
  readonly sources?: readonly Omit<TodoSource, "source_id" | "added_at">[];
  readonly request_id?: string;
}

export type TodoBatchChange =
  | { readonly status: TodoStatus }
  | { readonly planned_date: string | null }
  | { readonly due_date: string | null }
  | { readonly shift_days: number }
  | { readonly archive: boolean };

export type TodoLinkInput = Omit<TodoLink, "link_id" | "added_at">;

/**
 * What makes two requests one: who asked and the id they chose. Callers choose their own ids, so the id alone would hand one caller
 * another caller's todo. Both the todo receipts and the organizer's batches keep requests under this key.
 */
export function todoRequestKey(access: Pick<TodoAccess, "actorId">, requestId: string | undefined): string | null {
  const id = requestId?.trim();
  return id ? JSON.stringify([access.actorId, id]) : null;
}

/**
 * The SQL the store runs: its own connection to a partition's `todo.db`, or the library the Runtime gives the plugin, inside one write
 * transaction or read-only. Reads are SELECT; writes are INSERT, UPDATE and DELETE.
 */
export interface TodoSql {
  get(sql: string, parameters?: readonly TodoSqlValue[]): Readonly<Record<string, unknown>> | null | undefined;
  all(sql: string, parameters?: readonly TodoSqlValue[]): readonly Readonly<Record<string, unknown>>[];
  run(sql: string, parameters?: readonly TodoSqlValue[]): { changes: number | bigint };
}
export type TodoSqlValue = string | number | null;
