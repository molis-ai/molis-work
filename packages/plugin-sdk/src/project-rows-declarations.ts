// The shape of `databases.home.project_rows` (PG-024): which rows of a plugin's Home library go with a deleted project. Only what can
// be read from the declaration is checked here: names, that each table is one the declaration's own `schema` creates, and how the
// children name their parent. Whether the columns exist is for the platform, which builds the schema in SQLite before it starts the
// plugin (apps/local-host `plugin-project-rows.ts`). `databaseDeclarationProblems` is the one caller.

/** A table or column name as the platform writes it into a statement: plain, unqualified, never chosen by an argument. */
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/u;
const FIELDS = new Set(["label", "order", "tables"]);
const TABLE_FIELDS = new Set(["table", "column", "parent", "key"]);
const LABEL_LIMIT = 200;
const CREATED_TABLE = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`[]?([A-Za-z_][A-Za-z0-9_.]*)/giu;

export function projectRowsProblems(path: string, value: unknown, schema: unknown, partitioned: boolean): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return [`${path} 必须为对象`];
  if (partitioned) return [`${path} 不能和 partition: "project" 同写：按项目分开的库由平台整个删掉`];
  const problems: string[] = [];
  const unknown = Object.keys(value).filter(field => !FIELDS.has(field));
  if (unknown.length > 0) problems.push(`${path} 不认这些字段：${unknown.join("、")}`);
  if (typeof value.label !== "string" || value.label.trim().length === 0 || value.label.length > LABEL_LIMIT) {
    problems.push(`${path}.label 必须是不超过 ${LABEL_LIMIT} 字的非空文字`);
  }
  if (value.order !== undefined && (typeof value.order !== "number" || !Number.isSafeInteger(value.order))) problems.push(`${path}.order 必须是整数`);
  if (!Array.isArray(value.tables) || value.tables.length === 0) return [...problems, `${path}.tables 至少要写一张表`];
  const own = createdTables(typeof schema === "string" ? schema : "");
  value.tables.forEach((table, index) => problems.push(...tableProblems(`${path}.tables[${index}]`, table, own, value.tables as unknown[], index)));
  return problems;
}

function tableProblems(path: string, table: unknown, own: ReadonlySet<string>, tables: readonly unknown[], index: number): string[] {
  if (!isRecord(table)) return [`${path} 必须为对象`];
  const problems: string[] = [];
  const unknown = Object.keys(table).filter(field => !TABLE_FIELDS.has(field));
  if (unknown.length > 0) problems.push(`${path} 不认这些字段：${unknown.join("、")}`);
  for (const field of ["table", "column"] as const) {
    if (typeof table[field] !== "string" || !IDENTIFIER.test(table[field])) problems.push(`${path}.${field} 必须是不带库名的小写标识符（字母、数字、下划线）`);
  }
  if (typeof table.table === "string" && IDENTIFIER.test(table.table) && !own.has(table.table)) {
    problems.push(`${path}.table ${table.table} 不是这个库的 schema 建的表：只能删自己库里的行`);
  }
  if (table.key !== undefined && table.parent === undefined) problems.push(`${path}.key 只和 parent 一起写`);
  if (table.key !== undefined && (typeof table.key !== "string" || !IDENTIFIER.test(table.key))) problems.push(`${path}.key 必须是小写标识符`);
  if (table.parent !== undefined) problems.push(...parentProblems(path, table.parent, tables, index));
  return problems;
}

/** A child names a table written after it that names no parent itself: one level, cleared before the rows it hangs on. */
function parentProblems(path: string, parent: unknown, tables: readonly unknown[], index: number): string[] {
  if (typeof parent !== "string" || !IDENTIFIER.test(parent)) return [`${path}.parent 必须是小写标识符`];
  const at = tables.findIndex(candidate => isRecord(candidate) && candidate.table === parent && candidate.parent === undefined);
  return at > index ? [] : [`${path}.parent ${parent} 必须是写在它后面、自己不带 parent 的一张表`];
}

/** The tables a schema creates, lower-cased; a qualified name (`main.t`) is kept whole, so it never matches a plain table. */
function createdTables(schema: string): Set<string> {
  return new Set([...schema.matchAll(CREATED_TABLE)].map(match => match[1]!.toLowerCase()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
