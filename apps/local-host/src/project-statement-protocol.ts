import type { PluginProjectDatabaseRecord } from "@molis-ai/molis-work-plugin-runtime";

// What the Host and the process that runs a sandboxed plugin's statements say to each other (specs/repository-anti-corruption/
// slices/sandbox-project-database-limits.md §2). Every value is JSON; a row holds text, finite numbers and null, nothing else.

export type StatementValue = string | number | null;
export type StatementRow = Record<string, StatementValue>;

export type StatementRequest =
  | { readonly id: number; readonly op: "open"; readonly path: string; readonly record: PluginProjectDatabaseRecord }
  | { readonly id: number; readonly op: "get"; readonly sql: string; readonly parameters: readonly StatementValue[] }
  /** `rows` and `bytes` are the most one answer may carry; the process stops reading at the first row past either. */
  | { readonly id: number; readonly op: "all"; readonly sql: string; readonly parameters: readonly StatementValue[]; readonly rows: number; readonly bytes: number }
  | { readonly id: number; readonly op: "begin" | "commit" | "rollback" }
  | { readonly id: number; readonly op: "run"; readonly sql: string; readonly parameters: readonly StatementValue[] };

/** A request before the Host numbers it. */
export type StatementCall = StatementRequest extends infer Request ? (Request extends unknown ? Omit<Request, "id"> : never) : never;

export type StatementFailure = "refused" | "too_large" | "error";
export type StatementReply =
  | { readonly id: number; readonly ok: true; readonly row?: StatementRow | null; readonly rows?: StatementRow[]; readonly changes?: number }
  /** `refused` is the check of S-46 (`plugin.project_database.statement_refused`); `error` is anything else, SQLite's message included. */
  | { readonly id: number; readonly ok: false; readonly kind: StatementFailure; readonly message: string };

/** The client's own keyword filters (`pluginDatabaseClient`): the Host asks before it sends a statement, and the process asks again. */
export function assertReadStatement(sql: string): void {
  if (!/^\s*(SELECT|WITH)\b/iu.test(sql)) throw new Error("读取仅接受 SELECT 或 WITH 查询，不提供连接管理或跨库指令");
}
export function assertWriteStatement(sql: string): void {
  if (!/^\s*(INSERT|UPDATE|DELETE)\b/iu.test(sql)) throw new Error("事务写入仅接受 INSERT、UPDATE 或 DELETE");
}
