import { isRecord } from "./json-value.js";
// The shape of a Manifest's `databases` (PG-020, PG-022): which tables a plugin asks for in each scope. Only the shape is checked here;
// what the statements may create, and whether they agree with what a project's library already holds, is for the platform to check when
// it opens the library (packages/plugin-runtime `openPluginProjectDatabase`), and whether the Home's registry holds a `home` library
// as this plugin's own is for the Host to check when it starts the plugin. `parsePluginManifest` is the one caller.
import { projectRowsProblems } from "./project-rows-declarations.js";

/** The name a plugin's store goes by, the same rule as a library in the Home. */
const STORE_NAME = /^[a-z][a-z0-9-]*$/u;
const SCOPES = ["project", "home"] as const;
const DECLARATION_FIELDS = new Set(["store_name", "version", "schema", "read_permission", "write_permission", "upgrades"]);
const STEP_FIELDS = new Set(["from", "sql", "reduces_rows"]);
/**
 * A library in the Home may also be partitioned by project, or say which of its rows belong to a project; a project's library is one
 * per project already.
 */
const HOME_FIELDS = new Set([...DECLARATION_FIELDS, "partition", "project_rows"]);

/** `ownerFiles`: the Manifest's `owner_files`, whose directories a library's `project_rows.files` may name. */
export function databaseDeclarationProblems(value: unknown, permissions: ReadonlySet<string>, ownerFiles?: unknown): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return ["databases 必须为对象"];
  const scopes = Object.keys(value).filter(scope => !(SCOPES as readonly string[]).includes(scope));
  if (scopes.length > 0) return [`databases 只能声明 project（项目库）和 home（Home 库），不认 ${scopes.join("、")}`];
  return SCOPES.flatMap(scope => value[scope] === undefined ? [] : declarationProblems(scope, value[scope], permissions, ownerFiles));
}

function declarationProblems(scope: (typeof SCOPES)[number], declaration: unknown, permissions: ReadonlySet<string>, ownerFiles: unknown): string[] {
  const path = `databases.${scope}`;
  if (!isRecord(declaration)) return [`${path} 必须为对象`];
  const problems: string[] = [];
  const fields = scope === "home" ? HOME_FIELDS : DECLARATION_FIELDS;
  const unknown = Object.keys(declaration).filter(field => !fields.has(field));
  if (unknown.length > 0) problems.push(`${path} 不认这些字段：${unknown.join("、")}`);
  if (typeof declaration.store_name !== "string" || !STORE_NAME.test(declaration.store_name)) {
    problems.push(`${path}.store_name 必须是小写字母开头、只含小写字母、数字和连字符的名字`);
  }
  if (typeof declaration.version !== "number" || !Number.isSafeInteger(declaration.version) || declaration.version < 1) {
    problems.push(`${path}.version 必须是正整数`);
  }
  if (typeof declaration.schema !== "string" || declaration.schema.trim().length === 0) problems.push(`${path}.schema 必须写出建表语句`);
  for (const field of ["read_permission", "write_permission"] as const) {
    const permission = declaration[field];
    if (typeof permission !== "string" || !permissions.has(permission)) problems.push(`${path}.${field} 必须是这份 Manifest 在 permissions 里声明的权限`);
  }
  problems.push(...upgradeStepsProblems(path, declaration.upgrades, declaration.version));
  if (scope === "home" && declaration.partition !== undefined && declaration.partition !== "project") problems.push(`${path}.partition 只能是 "project"`);
  if (scope === "home") problems.push(...projectRowsProblems(`${path}.project_rows`, declaration.project_rows, declaration.schema, declaration.partition !== undefined, ownerFiles));
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
