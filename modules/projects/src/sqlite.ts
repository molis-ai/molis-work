interface ProjectsSqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid?: number | bigint };
}

export interface ProjectsSqliteDatabase {
  prepare(sql: string): ProjectsSqliteStatement;
  exec(sql: string): void;
  pragma(source: string): unknown;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

export type Row = Record<string, unknown>;

export const text = (value: unknown) => String(value);
export const nullableText = (value: unknown) => value == null ? null : String(value);
export const booleanInt = (value: unknown) => Number(value) === 1;
export const numeric = (value: unknown) => Number(value);
