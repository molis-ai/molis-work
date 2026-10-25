import type { TodoActorKind, TodoLink, TodoPlacement, TodoSource, TodoStatus, TodoWaiting } from "@molis-ai/molis-work-contracts/modules/todo";

/**
 * Who is asking and what they may see. A caller inside a project sees personal, unplaced and that
 * project's todos; `projectIds` (the Host's list of the projects the person may reach, PG-014) also lets them see those projects'.
 * The plugin does not decide that list from who is asking: it uses the one the Host gave.
 */
export interface TodoAccess {
  readonly projectId: string | null;
  readonly projectIds: readonly string[];
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
  readonly placement?: TodoPlacement;
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
  | { readonly placement: TodoPlacement }
  | { readonly archive: boolean };

export type TodoLinkInput = Omit<TodoLink, "link_id" | "added_at">;

/**
 * What makes two requests one: who asked, from which project (or none), and the id they chose. The store is one
 * Home-wide database and callers choose their own ids, so the id alone would hand one caller another caller's todo.
 * Both the todo receipts and the organizer's batches keep requests under this key.
 */
export function todoRequestKey(access: Pick<TodoAccess, "actorId" | "projectId">, requestId: string | undefined): string | null {
  const id = requestId?.trim();
  return id ? JSON.stringify([access.actorId, access.projectId, id]) : null;
}

/**
 * The SQL the store runs: its own connection to `todo/todo.db`, or the library the Runtime gives the plugin, inside one write
 * transaction or read-only. Reads are SELECT; writes are INSERT, UPDATE and DELETE.
 */
export interface TodoSql {
  get(sql: string, parameters?: readonly TodoSqlValue[]): Readonly<Record<string, unknown>> | null | undefined;
  all(sql: string, parameters?: readonly TodoSqlValue[]): readonly Readonly<Record<string, unknown>>[];
  run(sql: string, parameters?: readonly TodoSqlValue[]): { changes: number | bigint };
}
export type TodoSqlValue = string | number | null;
