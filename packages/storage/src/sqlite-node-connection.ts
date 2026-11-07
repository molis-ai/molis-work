import { backup as backupDatabase, DatabaseSync, type SQLInputValue, type SQLOutputValue, type StatementSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { sqliteErrorName, type SqliteDatabase, type SqliteOpenOptions, type SqliteStatement } from "./sqlite-connection.js";
import { readSqlStatementShape } from "./sqlite-statement-shape.js";

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

class NodeSqliteStatement<Args extends unknown[], Row> implements SqliteStatement<Args, Row> {
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
class NodeSqliteConnection implements SqliteDatabase {
  private cacheSized = false;
  private savepoints = 0;

  constructor(private readonly database: DatabaseSync, readonly name: string, readonly readonly: boolean) {
    // Not in the Node 22 types the repository compiles against; the Node it runs on has had it since v24.
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
    return new NodeSqliteStatement<Params, Row>(this.database.prepare(sql), parameters);
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
        if (this.inTransaction) this.database.exec(nested ? `ROLLBACK TO ${name}; RELEASE ${name}` : "ROLLBACK");
        throw error;
      } finally { this.savepoints -= 1; }
    };
    return Object.assign(wrapped(""), { immediate: wrapped("IMMEDIATE") });
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
export function openNodeSqliteConnection(path: string, options: SqliteOpenOptions = {}): SqliteDatabase {
  // `node:sqlite` spells this one `readOnly` and ignores any other spelling, which leaves the connection writable.
  for (const option of Object.keys(options)) if (!KNOWN_OPTIONS.has(option)) throw new TypeError(`Unknown SQLite connection option: ${option}`);
  const readonly = options.readonly === true;
  const database = new DatabaseSync(databaseLocation(path, options.fileMustExist === true && !readonly), { readOnly: readonly, timeout: options.timeout ?? DEFAULT_BUSY_TIMEOUT_MS });
  return new NodeSqliteConnection(database, path, readonly);
}
