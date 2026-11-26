import { isRecord } from "./json-value.js";
// The shape of a Manifest's `databases` (PG-020, PG-022): which tables a plugin asks for in each scope. Only the shape is checked here;
// what the statements may create, and whether they agree with what a project's library already holds, is for the platform to check when
// it opens the library (packages/plugin-runtime `openPluginProjectDatabase`), and whether the Home's registry holds a `home` library
// as this plugin's own is for the Host to check when it starts the plugin. `parsePluginManifest` is the one caller.
import { partitionDeletionProblems, pinnedRowsProblems, projectRowsProblems } from "./project-rows-declarations.js";

/** The name a plugin's store goes by, the same rule as a library in the Home. */
const STORE_NAME = /^[a-z][a-z0-9-]*$/u;
const SCOPES = ["project", "home", "partition"] as const;
const DECLARATION_FIELDS = new Set(["store_name", "version", "schema", "read_permission", "write_permission", "upgrades"]);
const STEP_FIELDS = new Set(["from", "sql", "reduces_rows"]);
/** A library in the Home may say which of its rows belong to a project; a project's library is one per project already. */
const HOME_FIELDS = new Set([...DECLARATION_FIELDS, "project_rows", "snapshot_exclusions"]);
/** A partition's own library may name the table its pinned 成果 versions are recorded on, and what a project's deletion says of it. */
const PARTITION_FIELDS = new Set([...DECLARATION_FIELDS, "pinned_rows", "deletion"]);
const EXCLUSION_FIELDS = new Set(["path", "reason", "restore"]);
const EXCLUSION_PATH = /^[a-z0-9][a-z0-9._-]*$/u;
const PARTITION_SCHEMA_LIMITS = { bytes: 256 * 1024, statements: 128 } as const;
const SQL_NAME = String.raw`(?:Q|[A-Za-z_\u0080-\u{10FFFF}][\w$\u0080-\u{10FFFF}]*)`;
const PARTITION_CREATE_TABLE = new RegExp(String.raw`^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${SQL_NAME}\s*\(`, "iu");
const PARTITION_CREATE_INDEX = new RegExp(String.raw`^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?${SQL_NAME}\s+ON\s+${SQL_NAME}\s*\(`, "iu");

/** `ownerFiles`: the Manifest's `owner_files`, whose directories a library's `project_rows.files` may name. */
export function databaseDeclarationProblems(value: unknown, permissions: ReadonlySet<string>, ownerFiles?: unknown): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return ["databases 必须为对象"];
  const scopes = Object.keys(value).filter(scope => !(SCOPES as readonly string[]).includes(scope));
  if (scopes.length > 0) return [`databases 只能声明 project（项目库）、home（Home 库）和 partition（分区独立库），不认 ${scopes.join(", ")}`];
  const problems = SCOPES.flatMap(scope => value[scope] === undefined ? [] : declarationProblems(scope, value[scope], permissions, ownerFiles));
  // A library of its own in each partition is the plugin's whole store; it does not also keep one in the Home (§4.2 第 2 条).
  if (value.partition !== undefined && value.home !== undefined) problems.push("databases.partition 与 databases.home 不能同时声明：分区独立库就是这个插件在每个分区自己的库");
  return problems;
}

function declarationProblems(scope: (typeof SCOPES)[number], declaration: unknown, permissions: ReadonlySet<string>, ownerFiles: unknown): string[] {
  const path = `databases.${scope}`;
  if (!isRecord(declaration)) return [`${path} 必须为对象`];
  const problems: string[] = [];
  const fields = scope === "home" ? HOME_FIELDS : scope === "partition" ? PARTITION_FIELDS : DECLARATION_FIELDS;
  const unknown = Object.keys(declaration).filter(field => !fields.has(field));
  if (unknown.length > 0) problems.push(`${path} 不认这些字段：${unknown.join("、")}`);
  if (typeof declaration.store_name !== "string" || !STORE_NAME.test(declaration.store_name)) {
    problems.push(`${path}.store_name 必须是小写字母开头、只含小写字母、数字和连字符的名字`);
  }
  if (typeof declaration.version !== "number" || !Number.isSafeInteger(declaration.version) || declaration.version < 1) {
    problems.push(`${path}.version 必须是正整数`);
  }
  if (typeof declaration.schema !== "string" || declaration.schema.trim().length === 0) problems.push(`${path}.schema 必须写出建表语句`);
  else if (scope === "partition") problems.push(...partitionSchemaProblems(path, declaration.schema));
  for (const field of ["read_permission", "write_permission"] as const) {
    const permission = declaration[field];
    if (typeof permission !== "string" || !permissions.has(permission)) problems.push(`${path}.${field} 必须是这份 Manifest 在 permissions 里声明的权限`);
  }
  problems.push(...upgradeStepsProblems(path, declaration.upgrades, declaration.version));
  if (scope === "home") {
    problems.push(...projectRowsProblems(`${path}.project_rows`, declaration.project_rows, declaration.schema, ownerFiles));
    problems.push(...snapshotExclusionsProblems(`${path}.snapshot_exclusions`, declaration.snapshot_exclusions));
  }
  if (scope === "partition" && declaration.pinned_rows !== undefined) problems.push(...pinnedRowsProblems(`${path}.pinned_rows`, declaration.pinned_rows, declaration.schema));
  if (scope === "partition") problems.push(...partitionDeletionProblems(`${path}.deletion`, declaration.deletion));
  return problems;
}

function snapshotExclusionsProblems(path: string, value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [`${path} 必须是快照排除项数组`];
  const problems: string[] = [], seen = new Set<string>();
  value.forEach((entry, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(entry)) { problems.push(`${at} 必须为对象`); return; }
    const unknown = Object.keys(entry).filter(field => !EXCLUSION_FIELDS.has(field));
    if (unknown.length > 0) problems.push(`${at} 不认这些字段：${unknown.join("、")}`);
    if (typeof entry.path !== "string" || !EXCLUSION_PATH.test(entry.path) || entry.path === "." || entry.path === "..") {
      problems.push(`${at}.path 必须是单个相对路径段`);
    } else if (seen.has(entry.path)) problems.push(`${at}.path 重复：${entry.path}`);
    else seen.add(entry.path);
    if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) problems.push(`${at}.reason 必须写明排除原因`);
    if (entry.restore !== undefined && entry.restore !== "preserve" && entry.restore !== "reset") problems.push(`${at}.restore 只能是 "preserve" 或 "reset"`);
  });
  return problems;
}

/**
 * The shape of `upgrades` (upgrade-chain-design §2.4): steps of SQL, each `from` once, below the declaration's version. Which statements a
 * step may hold, and that the chain reaches the version from where a library is, are the platform's checks (`packages/plugin-runtime`).
 */
function upgradeStepsProblems(path: string, steps: unknown, version: unknown): string[] {
  if (steps === undefined) return [];
  if (!Array.isArray(steps)) return [`${path}.upgrades 必须是升级段的数组`];
  const problems: string[] = [], seen = new Set<number>();
  steps.forEach((step: unknown, index) => {
    const at = `${path}.upgrades[${index}]`;
    if (!isRecord(step)) { problems.push(`${at} 必须为对象`); return; }
    const unknown = Object.keys(step).filter(field => !STEP_FIELDS.has(field));
    if (unknown.length > 0) problems.push(`${at} 不认这些字段：${unknown.join("、")}（升级段只有 SQL）`);
    const from = step.from;
    if (typeof from !== "number" || !Number.isSafeInteger(from) || from < 1 || (typeof version === "number" && from >= version)) {
      problems.push(`${at}.from 必须是 1 到 version - 1 之间的整数`);
    } else if (seen.has(from)) problems.push(`${at}.from 重复：每个版本只能有一段`);
    else seen.add(from);
    if (typeof step.sql !== "string" || step.sql.trim().length === 0) problems.push(`${at}.sql 必须写出这一段的语句`);
    const reduces = step.reduces_rows;
    if (reduces !== undefined && (!Array.isArray(reduces) || !reduces.every(table => typeof table === "string" && table.length > 0))) {
      problems.push(`${at}.reduces_rows 必须是表名的数组`);
    }
  });
  return problems;
}

/** Pure lexical SQL safety check for `databases.partition.schema` (mirrors plugin-runtime's `assertPluginHomeSchema`). */
function partitionSchemaProblems(path: string, schema: string): string[] {
  if (new TextEncoder().encode(schema).byteLength > PARTITION_SCHEMA_LIMITS.bytes) {
    return [`${path}.schema 最多 ${PARTITION_SCHEMA_LIMITS.bytes} 个 UTF-8 字节`];
  }
  const found: Array<{ text: string; masked: string }> = [];
  let masked = "";
  let start = 0;
  let index = 0;
  const end = (at: number) => {
    if (masked.trim()) {
      found.push({ text: schema.slice(start, at).trim(), masked: masked.replace(/\s+/gu, " ").trim() });
    }
    masked = "";
    start = at + 1;
  };
  while (index < schema.length) {
    const char = schema[index];
    const next = schema[index + 1];
    if (char === "-" && next === "-") {
      const line = schema.indexOf("\n", index);
      index = line < 0 ? schema.length : line + 1;
      masked += " ";
    } else if (char === "/" && next === "*") {
      const close = schema.indexOf("*/", index + 2);
      if (close < 0) return [`${path}.schema 里有没闭合的注释`];
      index = close + 2;
      masked += " ";
    } else if (char === "'" || char === "\"" || char === "`" || char === "[") {
      const closing = char === "[" ? "]" : char;
      let close = schema.indexOf(closing, index + 1);
      while (close >= 0 && closing !== "]" && schema[close + 1] === closing) {
        close = schema.indexOf(closing, close + 2);
      }
      if (close < 0) return [`${path}.schema 里有没闭合的引号`];
      index = close + 1;
      masked += char === "'" ? "''" : "Q";
    } else if (char === ";") {
      end(index);
      index += 1;
    } else {
      masked += char;
      index += 1;
    }
  }
  end(schema.length);
  if (found.length === 0) return [`${path}.schema 没有建表语句`];
  if (found.length > PARTITION_SCHEMA_LIMITS.statements) {
    return [`${path}.schema 最多 ${PARTITION_SCHEMA_LIMITS.statements} 条显式 CREATE TABLE 或 CREATE INDEX 语句`];
  }
  const problems: string[] = [];
  for (const part of found) {
    let depth = 0;
    let ok = true;
    for (const char of part.masked) {
      if (char === "(") {
        depth += 1;
      } else if (char === ")" && --depth < 0) {
        ok = false;
        break;
      }
    }
    if (!ok || depth !== 0 || !(PARTITION_CREATE_TABLE.test(part.masked) || PARTITION_CREATE_INDEX.test(part.masked)) || /\bAS\s+SELECT\b/iu.test(part.masked)) {
      problems.push(`${path}.schema 只能建表和索引，名字不带库名，不能从查询建表：${part.text.slice(0, 80)}`);
    }
  }
  return problems;
}
