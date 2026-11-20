import { ActionError, type ActionErrorKind } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePluginDatabaseDeclaration, PluginDatabaseVersionSwitch, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginProjectDatabaseRecord } from "@molis-ai/molis-work-plugin-runtime";
import type { InstalledLibraryOwner } from "./installed-plugin-libraries.js";
import type { ProjectReviewCommit } from "./project-review-effect.js";
import type { TrustedReviewRow } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { readSqlStatementShape } from "@molis-ai/molis-work-storage";

// What the Host and the process that runs a sandboxed plugin's statements say to each other (specs/archive/repository-anti-corruption/
// slices/sandbox-project-database-limits.md §2). Every value is JSON; a row holds text, finite numbers and null, nothing else.

export type StatementValue = string | number | null;
export type StatementRow = Record<string, StatementValue>;

export interface StatementMemoryLimits { readonly heapMb: number; readonly rssMb: number; readonly sampleMs: number }
export interface ReviewedStatementTarget {
  readonly row: TrustedReviewRow;
  readonly id: string;
  readonly version: string;
}
export interface StatementReadyToCommit { readonly id: number; readonly ready_to_commit: true }
export interface StatementCommitPermit { readonly commit_permit: number }
/** Host-only preparation. The sandbox never supplies a path, owner, registry or a preparation command. */
export type DatabaseUpgradeCall = {
  readonly target: PluginManifest;
  readonly change: Omit<PluginDatabaseVersionSwitch, "assertCurrent">;
} & ({ readonly op: "upgrade-project-database"; readonly home: string; readonly path: string; readonly projectId: string; readonly platformVersion: number }
  | { readonly op: "upgrade-home-database"; readonly home: string; readonly reserved: readonly { readonly path: string; readonly owner: string }[] });
export type HomePreparationCall =
  | { readonly op: "validate-home-schema"; readonly declaration: HomePluginDatabaseDeclaration }
  | { readonly op: "initialize-owned-home-library"; readonly home: string; readonly owner: InstalledLibraryOwner;
      readonly declaration: HomePluginDatabaseDeclaration; readonly reserved: readonly { readonly path: string; readonly owner: string }[] }
  | DatabaseUpgradeCall;
export type HomePreparationCommand = HomePreparationCall & {
  readonly limits: StatementMemoryLimits; readonly startDeadline: number; readonly executionMs: number;
};
type StatementCommand =
  /** `record` is the plugin's tables in a project's library; `null` is a library in the Home, which is wholly the plugin's (PG-017 BL-490). */
  | { readonly op: "open"; readonly path: string; readonly record: PluginProjectDatabaseRecord | null; readonly limits: StatementMemoryLimits }
  | { readonly op: "get"; readonly sql: string; readonly parameters: readonly StatementValue[]; readonly bytes: number }
  /** `rows` and `bytes` are the most one answer may carry; the process stops reading at the first row past either. */
  | { readonly op: "all"; readonly sql: string; readonly parameters: readonly StatementValue[]; readonly rows: number; readonly bytes: number }
  | { readonly op: "begin"; readonly transactionDeadline: number; readonly reviewed?: ReviewedStatementTarget }
  | { readonly op: "commit"; readonly decision?: ProjectReviewCommit }
  | { readonly op: "rollback" }
  | { readonly op: "run"; readonly sql: string; readonly parameters: readonly StatementValue[] }
  | HomePreparationCommand;

/** Absolute deadlines are issued by the Host before dispatch; a transaction's remains active between requests. */
export type StatementRequest = StatementCommand & { readonly id: number; readonly deadline: number };

/** A request before the Host numbers it. */
export type StatementCall = StatementCommand;
export type StatementStep = Exclude<StatementRequest, { readonly op: "open" } | HomePreparationCommand>;

/** The process will end even if the Host cannot consume this notification. It also applies between two requests. */
export interface StatementFatal { readonly fatal: "timeout" | "memory" | "process"; readonly message: string }
export interface StatementPrepared { readonly id: number; readonly prepared: true }
export interface StatementUpgradeDecision { readonly id: number; readonly publishUpgrade: true }
export type StatementMessage = StatementReply | StatementFatal | StatementPrepared | StatementReadyToCommit;
export const isDatabaseUpgrade = <T extends { op: string }>(request: T): request is T & DatabaseUpgradeCall =>
  request.op === "upgrade-home-database" || request.op === "upgrade-project-database";
export const isPreparation = (request: StatementRequest): request is StatementRequest & HomePreparationCommand =>
  request.op === "validate-home-schema" || request.op === "initialize-owned-home-library" || isDatabaseUpgrade(request);

export type StatementFailure = "refused" | "too_large" | "decision_conflict" | "decision_expired" | "error";
export type StatementReply =
  | { readonly id: number; readonly ok: true; readonly row?: StatementRow | null; readonly rows?: StatementRow[]; readonly changes?: number }
  /** `refused` is the check of S-46 (`plugin.project_database.statement_refused`); `error` is anything else, SQLite's message included. */
  | { readonly id: number; readonly ok: false; readonly kind: StatementFailure; readonly message: string;
      /** Only a Host preparation reply carries the original owner's coded refusal. Never an outcome marker from plugin JSON. */
      readonly preparationError?: { readonly code: string; readonly kind?: ActionErrorKind; readonly details?: Readonly<Record<string, unknown>> } };

export function statementFailure(id: number, error: unknown): StatementReply {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2048);
  if (error instanceof ActionError && error.code === "plugin.project_database.result_too_large") return { id, ok: false, kind: "too_large", message };
  if (error instanceof ActionError && error.code === "plugin.project_database.statement_refused") return { id, ok: false, kind: "refused", message };
  if (error instanceof ActionError && error.code === "actions.conflict") return { id, ok: false, kind: "decision_conflict", message };
  if (error instanceof ActionError && error.code === "actions.expired") return { id, ok: false, kind: "decision_expired", message };
  return { id, ok: false, kind: "error", message };
}

/**
 * The client's own keyword filters (`pluginDatabaseClient`): the Host asks before it sends a statement, and the process asks again.
 * Both also take one statement only, with the project connection's own scan (`readSqlStatementShape`) and its words: a library in the
 * Home is a bare `node:sqlite` connection, which compiles the first of two statements, runs it and drops the second without a word.
 */
export function assertReadStatement(sql: string): void {
  if (!/^\s*(SELECT|WITH)\b/iu.test(sql)) throw new Error("读取仅接受 SELECT 或 WITH 查询，不提供连接管理或跨库指令");
  readSqlStatementShape(sql);
}
export function assertWriteStatement(sql: string): void {
  if (!/^\s*(INSERT|UPDATE|DELETE)\b/iu.test(sql)) throw new Error("事务写入仅接受 INSERT、UPDATE 或 DELETE");
  readSqlStatementShape(sql);
}
