// The shape of a Manifest's `databases` (PG-020): which tables a plugin asks for in each scope. Only the shape is checked here; what
// the statements may create, and whether they agree with what a project's library already holds, is for the platform to check when it
// opens the library (packages/plugin-runtime `openPluginProjectDatabase`). `parsePluginManifest` is the one caller.

/** The name a plugin's store goes by, the same rule as a library in the Home. */
const STORE_NAME = /^[a-z][a-z0-9-]*$/u;
const DECLARATION_FIELDS = new Set(["store_name", "version", "schema", "read_permission", "write_permission"]);

export function databaseDeclarationProblems(value: unknown, permissions: ReadonlySet<string>): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return ["databases 必须为对象"];
  const scopes = Object.keys(value).filter(scope => scope !== "project");
  // The Home half is the same declaration, moved off the trusted Host entries later (PG-022); until then a Manifest cannot claim it.
  if (scopes.length > 0) return [`databases 现在只能声明 project（项目库），不认 ${scopes.join("、")}`];
  if (value.project === undefined) return [];
  const declaration = value.project;
  if (!isRecord(declaration)) return ["databases.project 必须为对象"];
  const problems: string[] = [];
  const unknown = Object.keys(declaration).filter(field => !DECLARATION_FIELDS.has(field));
  if (unknown.length > 0) problems.push(`databases.project 不认这些字段：${unknown.join("、")}`);
  if (typeof declaration.store_name !== "string" || !STORE_NAME.test(declaration.store_name)) {
    problems.push("databases.project.store_name 必须是小写字母开头、只含小写字母、数字和连字符的名字");
  }
  if (typeof declaration.version !== "number" || !Number.isSafeInteger(declaration.version) || declaration.version < 1) {
    problems.push("databases.project.version 必须是正整数");
  }
  if (typeof declaration.schema !== "string" || declaration.schema.trim().length === 0) problems.push("databases.project.schema 必须写出建表语句");
  for (const field of ["read_permission", "write_permission"] as const) {
    const permission = declaration[field];
    if (typeof permission !== "string" || !permissions.has(permission)) problems.push(`databases.project.${field} 必须是这份 Manifest 在 permissions 里声明的权限`);
  }
  return problems;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
