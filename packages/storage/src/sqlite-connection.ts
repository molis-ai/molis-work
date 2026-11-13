import { rollbackPreservingError } from "./transaction-errors.js";
import { backup as backupDatabase, constants, DatabaseSync, type SQLInputValue, type SQLOutputValue, type StatementSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { readSqlStatementShape } from "./sqlite-statement-shape.js";

/** The synchronous project connection. Callers share the owner’s handle instead of opening the file with another SQLite engine. */
export interface SqliteDatabase {
  readonly name: string;
  readonly open: boolean;
  readonly inTransaction: boolean;
  readonly readonly: boolean;
  prepare<Params extends unknown[] = unknown[], Row = unknown>(sql: string): SqliteStatement<Params, Row>;
  exec(sql: string): this;
  pragma(sql: string, options?: { simple?: boolean }): unknown;
  transaction<Args extends unknown[], Result>(run: (...args: Args) => Result): {
    (...args: Args): Result;
    immediate(...args: Args): Result;
  };
  function<Args extends unknown[]>(name: string, invoke: (...args: Args) => unknown): this;
  /**
   * SQLite's own authorizer (`sqlite3_set_authorizer`): asked about every table, column, function and schema change a statement
   * would touch while it is prepared, so a refusal stops the statement before any of it runs. `null` takes it away.
   */
  setAuthorizer(callback: SqliteAuthorizer | null): void;
  /** `rate` is how many pages go in each step. `progress` is told after each one; throwing from it stops the backup with that error. */
  backup(destination: string, options?: { rate?: number; progress?(info: { totalPages: number; remainingPages: number }): void }): Promise<unknown>;
  close(): this;
}

/**
 * One question of SQLite's authorizer: what the statement would do (`action`, SQLite's numbers from `SQLITE_CREATE_INDEX` to
 * `SQLITE_RECURSIVE`), the two names it gives for that action, the database (`main`, `temp`, an attached one), and the trigger or view
 * the access comes from. It answers 0 (allowed), 1 (refused, the statement fails) or 2 (a column read as NULL).
 */
export type SqliteAuthorizer = (action: number, first: string | null, second: string | null, database: string | null, origin: string | null) => number;

const { SQLITE_OK: allow, SQLITE_DENY: deny, SQLITE_SELECT: select, SQLITE_READ: read, SQLITE_INSERT: insert, SQLITE_UPDATE: update, SQLITE_FUNCTION: call } =
  constants as Readonly<Record<string, unknown>>;
/** The native authorizer answers and operations used by the attached root-row transaction. Missing native support admits no statement. */
export const sqliteRowAuthorizerCodes = typeof allow === "number" && typeof deny === "number" && typeof select === "number"
  && typeof read === "number" && typeof insert === "number" && typeof update === "number" && typeof call === "number"
  ? Object.freeze({ allow, deny, select, read, insert, update, call }) : undefined;

export interface SqliteOpenOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
}

export interface SqliteStatement<Args extends unknown[], Row> {
  get(...args: Args): Row | undefined;
  all(...args: Args): Row[];
  iterate(...args: Args): IterableIterator<Row>;
  run(...args: Args): { changes: number; lastInsertRowid: number | bigint };
}

/** SQLite's primary result codes, by number (https://sqlite.org/rescode.html). An extended code keeps its primary one in the low byte. */
const SQLITE_PRIMARY_RESULTS: Readonly<Record<number, string>> = {
  1: "SQLITE_ERROR", 2: "SQLITE_INTERNAL", 3: "SQLITE_PERM", 4: "SQLITE_ABORT", 5: "SQLITE_BUSY", 6: "SQLITE_LOCKED", 7: "SQLITE_NOMEM",
  8: "SQLITE_READONLY", 9: "SQLITE_INTERRUPT", 10: "SQLITE_IOERR", 11: "SQLITE_CORRUPT", 12: "SQLITE_NOTFOUND", 13: "SQLITE_FULL",
  14: "SQLITE_CANTOPEN", 15: "SQLITE_PROTOCOL", 16: "SQLITE_EMPTY", 17: "SQLITE_SCHEMA", 18: "SQLITE_TOOBIG", 19: "SQLITE_CONSTRAINT",
  20: "SQLITE_MISMATCH", 21: "SQLITE_MISUSE", 22: "SQLITE_NOLFS", 23: "SQLITE_AUTH", 24: "SQLITE_FORMAT", 25: "SQLITE_RANGE",
  26: "SQLITE_NOTADB", 27: "SQLITE_NOTICE", 28: "SQLITE_WARNING",
};

/** Names a failure the way SQLite does (`SQLITE_BUSY` for a busy file): `node:sqlite` gives every one the code `ERR_SQLITE_ERROR` and SQLite's own number beside it. `undefined` for anything SQLite did not raise. */
export function sqliteErrorName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { errcode } = error as { errcode?: unknown };
  return typeof errcode === "number" ? SQLITE_PRIMARY_RESULTS[errcode & 0xff] : undefined;
}

/** The busy timeout and page cache a project connection has always had; `node:sqlite`'s own defaults are 0 and 2 MB. */
const DEFAULT_BUSY_TIMEOUT_MS = 5000;
const CACHE_SIZE_KIB = 16000;
const KNOWN_OPTIONS = new Set(["readonly", "fileMustExist", "timeout"]);

/** A file is named by URL so `mode=rw` can refuse a missing file without a race, and so a path is never read as a URI of its own. */
function databaseLocation(path: string, mustExist: boolean): string | URL {
  if (path === ":memory:" || path === "") return path;
  const url = pathToFileURL(path);
  if (mustExist) url.searchParams.set("mode", "rw");
  return url;
}

/** `node:sqlite` would store a boolean or a `Date` as whatever it makes of them, so anything outside SQLite's own types is refused here. */
function boundValue(value: unknown): SQLInputValue {
  if (value === undefined) return null;
  if (value === null || typeof value === "number" || typeof value === "string" || typeof value === "bigint" || ArrayBuffer.isView(value)) return value as SQLInputValue;
  throw new TypeError("SQLite3 can only bind numbers, strings, bigints, buffers, and null");
}

function boundValues(values: readonly unknown[], expected: number): SQLInputValue[] {
  const bound: SQLInputValue[] = [];
  for (const value of values) {
    if (Array.isArray(value)) for (const item of value) bound.push(boundValue(item));
    else bound.push(boundValue(value));
  }
  // `node:sqlite` would bind NULL to every value left out, and write it.
  if (bound.length < expected) throw new RangeError("Too few parameter values were provided");
  if (bound.length > expected) throw new RangeError("Too many parameter values were provided");
  return bound;
}

/** A row as callers read it: an ordinary object, a BLOB as a `Buffer` over the same bytes. Spreading keeps a column named `__proto__` an own property. */
function plainRow(row: unknown): Record<string, unknown> {
  const plain: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const column in plain) {
    const value = plain[column];
    if (value instanceof Uint8Array) plain[column] = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return plain;
}

class ProjectStatement<Args extends unknown[], Row> implements SqliteStatement<Args, Row> {
  private returnsData: boolean | undefined;

  constructor(private readonly statement: StatementSync, private readonly parameters: number) {}

  /** Without this, a write through `get`, `all` or `iterate` runs and answers as if it had read nothing. */
  private assertReturnsData(): void {
    this.returnsData ??= this.statement.columns().length > 0;
    if (!this.returnsData) throw new TypeError("This statement does not return data. Use run() instead");
  }

  get(...args: Args): Row | undefined {
    this.assertReturnsData();
    const row = this.statement.get(...boundValues(args, this.parameters));
    return row === undefined ? undefined : plainRow(row) as Row;
  }

  all(...args: Args): Row[] {
    this.assertReturnsData();
    return this.statement.all(...boundValues(args, this.parameters)).map(row => plainRow(row) as Row);
  }

  iterate(...args: Args): IterableIterator<Row> {
    this.assertReturnsData();
    const rows = this.statement.iterate(...boundValues(args, this.parameters));
    return {
      [Symbol.iterator]() { return this; },
      next() {
        const step = rows.next();
        return step.done ? { done: true, value: undefined } : { done: false, value: plainRow(step.value) as Row };
      },
      return() {
        rows.return?.();
        return { done: true, value: undefined };
      },
    };
  }

  run(...args: Args): { changes: number; lastInsertRowid: number | bigint } {
    const { changes, lastInsertRowid } = this.statement.run(...boundValues(args, this.parameters));
    return { changes: Number(changes), lastInsertRowid };
  }
}

/**
 * `node:sqlite` behind the project connection's interface. Where it is quieter than callers may assume (it drops a second statement,
 * binds NULL to a missing value, runs a write through `get`), this refuses, so the difference cannot become silent damage to data
 * (specs/sqlite-driver-switch §3).
 */
class ProjectConnection implements SqliteDatabase {
  private cacheSized = false;
  private savepoints = 0;

  constructor(private readonly database: DatabaseSync, readonly name: string, readonly readonly: boolean) {
    // Not in the Node 22 types the repository compiles against. Node has it from v24.12.0 and turns it on by default from v24.14.0,
    // so on the locked Node this only says so; it keeps a connection from writing to the schema or corrupting the file by pragma.
    (database as DatabaseSync & { enableDefensive(active: boolean): void }).enableDefensive(true);
  }

  get open(): boolean { return this.database.isOpen; }
  get inTransaction(): boolean { return this.database.isOpen && this.database.isTransaction; }

  private assertOpen(): void {
    if (!this.database.isOpen) throw new TypeError("The database connection is not open");
  }

  /**
   * Before the connection's first prepared statement, not at open: this pragma reads the file, and an open must not (it would fail on a
   * file that is no database, and give a WAL library its `-shm`, before anyone has asked to read it). It cannot wait on a lock, so a
   * busy library costs the statement's own timeout and no more. Whatever SQLite raises here (busy, not a database, corrupt, a hot
   * journal on a read-only connection) costs only the larger cache: the statement that follows reads the same file and reports it,
   * and the next one tries again.
   */
  private sizeCache(): void {
    if (this.cacheSized) return;
    const { timeout } = this.database.prepare("PRAGMA busy_timeout").get() as { timeout: number };
    this.database.exec("PRAGMA busy_timeout = 0");
    try {
      this.database.exec(`PRAGMA cache_size = -${CACHE_SIZE_KIB}`);
      this.cacheSized = true;
    } catch (error) {
      if (sqliteErrorName(error) === undefined) throw error;
    } finally {
      this.database.exec(`PRAGMA busy_timeout = ${timeout}`);
    }
  }

  prepare<Params extends unknown[] = unknown[], Row = unknown>(sql: string): SqliteStatement<Params, Row> {
    this.assertOpen();
    const { parameters } = readSqlStatementShape(sql);
    this.sizeCache();
    return new ProjectStatement<Params, Row>(this.database.prepare(sql), parameters);
  }

  exec(sql: string): this {
    this.assertOpen();
    this.database.exec(sql);
    return this;
  }

  /** On a statement of its own: `PRAGMA x = y` has no columns, which `prepare` refuses for a read. */
  pragma(sql: string, options?: { simple?: boolean }): unknown {
    this.assertOpen();
    const rows = this.database.prepare(`PRAGMA ${sql}`).all().map(plainRow);
    return options?.simple ? Object.values(rows[0] ?? {})[0] : rows;
  }

  transaction<Args extends unknown[], Result>(run: (...args: Args) => Result) {
    const wrapped = (mode: string) => (...args: Args): Result => {
      const nested = this.inTransaction, name = `_tx_${this.savepoints + 1}`;
      this.exec(nested ? `SAVEPOINT ${name}` : `BEGIN ${mode}`);
      this.savepoints += 1;
      try {
        const result = run(...args);
        // A `transaction(async …)` would commit at its first `await` and write the rest outside the transaction.
        if (result && typeof (result as { then?: unknown }).then === "function") throw new TypeError("Transaction function cannot return a promise");
        this.database.exec(nested ? `RELEASE ${name}` : "COMMIT");
        return result;
      } catch (error) {
        // SQLite may have rolled back by itself (disk full, ON CONFLICT ROLLBACK); a second ROLLBACK would replace the error that says why.
        rollbackPreservingError(error, () => { if (this.inTransaction) this.database.exec(nested ? `ROLLBACK TO ${name}; RELEASE ${name}` : "ROLLBACK"); });
        throw error;
      } finally { this.savepoints -= 1; }
    };
    return Object.assign(wrapped(""), { immediate: wrapped("IMMEDIATE") });
  }

  setAuthorizer(callback: SqliteAuthorizer | null): void {
    this.assertOpen();
    // Not in the Node 22 types either; Node has it from v24.10.0, and the locked Node is newer.
    (this.database as DatabaseSync & { setAuthorizer(callback: SqliteAuthorizer | null): void }).setAuthorizer(callback);
  }

  function<Args extends unknown[]>(name: string, invoke: (...args: Args) => unknown): this {
    this.assertOpen();
    // The function itself, not a wrapper: its `length` is the arity SQLite is told.
    const body: unknown = invoke;
    this.database.function(name, body as (...args: SQLOutputValue[]) => SQLInputValue);
    return this;
  }

  async backup(destination: string, options?: { rate?: number; progress?(info: { totalPages: number; remainingPages: number }): void }): Promise<void> {
    this.assertOpen();
    await backupDatabase(this.database, destination, options ?? {});
  }

  close(): this {
    if (this.database.isOpen) this.database.close();
    return this;
  }
}

/** Opens only the connection. Schema setup, WAL and foreign-key policy belong to the store using it. */
export function openSqliteConnection(path: string, options: SqliteOpenOptions = {}): SqliteDatabase {
  // `node:sqlite` spells this one `readOnly` and ignores any other spelling, which leaves the connection writable.
  for (const option of Object.keys(options)) if (!KNOWN_OPTIONS.has(option)) throw new TypeError(`Unknown SQLite connection option: ${option}`);
  const readonly = options.readonly === true;
  const database = new DatabaseSync(databaseLocation(path, options.fileMustExist === true && !readonly), { readOnly: readonly, timeout: options.timeout ?? DEFAULT_BUSY_TIMEOUT_MS });
  return new ProjectConnection(database, path, readonly);
}
