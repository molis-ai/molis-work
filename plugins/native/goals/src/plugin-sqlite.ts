import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseReader, PluginDatabaseTransaction, PluginSqlValue } from "@molis-ai/molis-work-contracts/platform/plugin";

const storageErrors = defineErrorCodes("goals.storage", {
  no_window: "internal",
  window_conflict: "internal",
  read_only: "conflict",
  parameter_invalid: "internal",
  async_body: "internal",
});

/** What the two modules' repositories call a statement: the platform handle's `get`/`all`/`run`, in the shape `better-sqlite3` gave them. */
interface PluginSqliteStatement {
  all(...parameters: unknown[]): unknown[];
  get(...parameters: unknown[]): unknown;
  run(...parameters: unknown[]): { changes: number | bigint };
}

/** Structurally the `GoalsSqliteDatabase` of the Goals module and the `GovernanceSqliteDatabase` of Governance (checked where they meet). */
export interface PluginSqliteDatabase {
  prepare(sql: string): PluginSqliteStatement;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
  savepoint<T>(body: () => { readonly keep: boolean; readonly value: T }): T;
}

interface SqliteWindow {
  readonly reader: PluginDatabaseReader;
  /** Absent in a read window: nothing written there commits, so a write is refused. */
  readonly transaction: PluginDatabaseTransaction | null;
}

/**
 * The platform's statement handle, as the Goals and Governance repositories take their database (PG-094 S11). Both were written
 * over a synchronous connection they held for as long as the Host did; a plugin's connection is one it is lent for a single call,
 * and a transaction is a handle the scheduler gives to the write that began it. So the repositories are built once, when the plugin
 * starts, over this object, and each call lends it its handle for the length of one synchronous body (`read`, `write`).
 *
 * The window is the whole of the borrowing, and it is closed the moment the body returns or throws:
 * - a statement, a transaction or a savepoint asked for outside a window is refused (`goals.storage.no_window`), which is what an
 *   `await` inside a repository call would meet, or a statement kept from a call that has ended;
 * - a window opened inside another is refused (`goals.storage.window_conflict`), so two calls never share a handle;
 * - an async body is refused (`goals.storage.async_body`) and, in a write window, the platform rolls the transaction back.
 *
 * `transaction(op).immediate()` is the platform's savepoint, with `keep: true`: the plugin's own writes already belong to the one
 * transaction the call runs in, so what the old connection's nested transaction gave (undo what this operation wrote when it
 * throws) is what the savepoint gives, and nothing commits earlier than the call does.
 */
export class PluginSqlite implements PluginSqliteDatabase {
  private window: SqliteWindow | null = null;

  /** Runs `body` with the read-only connection. Writes in it are refused (`goals.storage.read_only`). */
  read<T>(reader: PluginDatabaseReader, body: () => T): T {
    return this.open({ reader, transaction: null }, body);
  }

  /** Runs `body` inside the write transaction the platform has begun for this call. */
  write<T>(transaction: PluginDatabaseTransaction, body: () => T): T {
    return this.open({ reader: transaction, transaction }, body);
  }

  prepare(sql: string): PluginSqliteStatement {
    return {
      get: (...parameters) => this.current().reader.get(sql, bind(parameters)) ?? undefined,
      all: (...parameters) => this.current().reader.all(sql, bind(parameters)),
      run: (...parameters) => ({ changes: this.writer("写入").run(sql, bind(parameters)).changes }),
    };
  }

  transaction<T>(operation: () => T): (() => T) & { immediate(): T } {
    const run = (): T => {
      const { transaction } = this.current();
      return transaction ? transaction.savepoint(() => ({ keep: true, value: operation() })) : operation();
    };
    return Object.assign(run, { immediate: run });
  }

  savepoint<T>(body: () => { readonly keep: boolean; readonly value: T }): T {
    return this.writer("保存点").savepoint(body);
  }

  private open<T>(next: SqliteWindow, body: () => T): T {
    if (this.window) throw storageErrors.window_conflict("Goals 的数据库窗口不能嵌套：一次调用只借一次句柄");
    this.window = next;
    try {
      const result = body();
      if (isThenable(result)) {
        result.then(undefined, () => undefined);
        throw storageErrors.async_body("Goals 的数据库窗口必须同步完成，不能包含异步等待");
      }
      return result;
    } finally {
      this.window = null;
    }
  }

  private current(): SqliteWindow {
    if (!this.window) throw storageErrors.no_window("Goals 的数据库只在一次调用的同步窗口里可用：这里没有窗口");
    return this.window;
  }

  private writer(what: string): PluginDatabaseTransaction {
    const { transaction } = this.current();
    if (!transaction) throw storageErrors.read_only(`只读调用里不能做${what}`);
    return transaction;
  }
}

function bind(parameters: readonly unknown[]): PluginSqlValue[] {
  return parameters.map((value, index) => {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint" || value instanceof Uint8Array) return value;
    throw storageErrors.parameter_invalid(`第 ${index + 1} 个参数的类型插件数据库不认：${typeof value}`);
  });
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}
