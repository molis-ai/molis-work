// The shape of a Manifest's `model_configuration` and `image_generation` (PG-102): the settings of the model a plugin uses and the
// image connections it uses. Only the shape is checked here. Whether the Home's store registry holds the directory or namespace as
// this plugin's own, and that the two settings actions are the plugin's own, is for the Host to check when it starts the plugin.
// `parsePluginManifest` is the one caller.

/** The name a plugin's store goes by, the same rule as a library in the Home. */
const STORE_NAME = /^[a-z][a-z0-9-]*$/u;
const PREFERENCE_FILE = /^[a-z][a-z0-9-]*\.json$/u;
const PROVIDER_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const MODEL_FIELDS = new Set(["preference", "custom_provider", "actions"]);
const IMAGE_FIELDS = new Set(["store_name", "read_permission", "write_permission", "generate_permission"]);

export function modelConfigurationDeclarationProblems(value: unknown, permissions: ReadonlySet<string>): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return ["model_configuration 必须为对象"];
  const problems: string[] = [];
  const unknown = Object.keys(value).filter(field => !MODEL_FIELDS.has(field));
  if (unknown.length > 0) problems.push(`model_configuration 不认这些字段：${unknown.join("、")}`);
  const preference = value.preference, provider = value.custom_provider, actions = value.actions;
  if (!isRecord(preference) || typeof preference.store_name !== "string" || !STORE_NAME.test(preference.store_name)
    || typeof preference.file_name !== "string" || !PREFERENCE_FILE.test(preference.file_name)) {
    problems.push("model_configuration.preference 必须写出库名（小写字母开头的普通名字）和单层的 JSON 文件名");
  }
  if (!isRecord(provider) || typeof provider.provider_id !== "string" || !PROVIDER_ID.test(provider.provider_id)
    || typeof provider.display_name !== "string" || provider.display_name.trim().length === 0) {
    problems.push("model_configuration.custom_provider 必须写出专用供应商的 ID 和显示名");
  }
  for (const kind of ["read", "save"] as const) {
    const reference = isRecord(actions) ? actions[kind] : undefined;
    if (!isRecord(reference) || typeof reference.capability_id !== "string" || !reference.capability_id
      || typeof reference.version !== "number" || !Number.isSafeInteger(reference.version) || reference.version < 1) {
      problems.push(`model_configuration.actions.${kind} 必须指向一个动作（capability_id 和正整数 version）`);
    }
  }
  for (const permission of ["storage:private", "model:invoke"]) {
    if (!permissions.has(permission)) problems.push(`model_configuration 需要这份 Manifest 在 permissions 里声明 ${permission}`);
  }
  return problems;
}

export function imageGenerationDeclarationProblems(value: unknown, permissions: ReadonlySet<string>): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return ["image_generation 必须为对象"];
  const problems: string[] = [];
  const unknown = Object.keys(value).filter(field => !IMAGE_FIELDS.has(field));
  if (unknown.length > 0) problems.push(`image_generation 不认这些字段：${unknown.join("、")}`);
  if (typeof value.store_name !== "string" || !STORE_NAME.test(value.store_name)) {
    problems.push("image_generation.store_name 必须是小写字母开头、只含小写字母、数字和连字符的名字");
  }
  for (const field of ["read_permission", "write_permission", "generate_permission"] as const) {
    const permission = value[field];
    if (typeof permission !== "string" || !permissions.has(permission)) problems.push(`image_generation.${field} 必须是这份 Manifest 在 permissions 里声明的权限`);
  }
  if (!permissions.has("model:invoke")) problems.push("image_generation 需要这份 Manifest 在 permissions 里声明 model:invoke");
  return problems;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
