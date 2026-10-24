// The shape of a Manifest's `owner_files` (PG-102): the root a plugin's files live under in the Home and the top-level entries it may
// touch. Only the shape is checked here; whether the Home's store registry holds the root as this plugin's own, and that no other
// declaration uses it, is for the Host to check when it starts the plugin. `parsePluginManifest` is the one caller.

/** The name a plugin's store goes by, the same rule as a library in the Home. */
const STORE_NAME = /^[a-z][a-z0-9-]*$/u;
const FIELDS = new Set(["store_name", "entries", "read_permission", "write_permission"]);
const ENTRY_FIELDS = new Set(["name", "kind"]);
const ENTRY_KINDS = ["file", "directory"];

export function ownerFilesDeclarationProblems(value: unknown, permissions: ReadonlySet<string>): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return ["owner_files 必须为对象"];
  const problems: string[] = [];
  const unknown = Object.keys(value).filter(field => !FIELDS.has(field));
  if (unknown.length > 0) problems.push(`owner_files 不认这些字段：${unknown.join("、")}`);
  if (typeof value.store_name !== "string" || !STORE_NAME.test(value.store_name)) {
    problems.push("owner_files.store_name 必须是小写字母开头、只含小写字母、数字和连字符的名字");
  }
  if (!permissions.has("storage:private")) problems.push("owner_files 需要这份 Manifest 在 permissions 里声明 storage:private");
  for (const field of ["read_permission", "write_permission"] as const) {
    const permission = value[field];
    if (typeof permission !== "string" || !permissions.has(permission)) problems.push(`owner_files.${field} 必须是这份 Manifest 在 permissions 里声明的权限`);
  }
  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    problems.push("owner_files.entries 至少要有一个顶层条目");
    return problems;
  }
  const names = new Set<string>();
  for (const entry of value.entries) {
    if (!isRecord(entry) || Object.keys(entry).some(field => !ENTRY_FIELDS.has(field))) { problems.push("owner_files.entries 的每一项只能有 name 和 kind"); continue; }
    if (typeof entry.name !== "string" || !/^[^/\\\u0000]+$/u.test(entry.name) || entry.name === "." || entry.name === ".." || names.has(entry.name)) {
      problems.push("owner_files.entries 的名字必须是互不相同的单段名字，不能带路径");
    } else names.add(entry.name);
    if (!ENTRY_KINDS.includes(entry.kind as string)) problems.push("owner_files.entries 的 kind 只能是 file 或 directory");
  }
  return problems;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
