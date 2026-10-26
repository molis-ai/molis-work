// The shape of a Manifest's `model_configuration`, `image_generation` (PG-102), `local_tools` (PG-112) and `runtime` (PG-011): the settings of
// the model a plugin uses, the image connections it uses, the command-line tools it looks for and where it runs. Only the shape is checked here. Whether the Home's store registry holds the directory or namespace as
// this plugin's own, and that the two settings actions are the plugin's own, is for the Host to check when it starts the plugin.
// `parsePluginManifest` is the one caller.

import { PLUGIN_LOCAL_TOOLS_LIMITS, PLUGIN_LOCAL_TOOLS_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin";

/** The name a plugin's store goes by, the same rule as a library in the Home. */
const STORE_NAME = /^[a-z][a-z0-9-]*$/u;
const PREFERENCE_FILE = /^[a-z][a-z0-9-]*\.json$/u;
const PROVIDER_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const MODEL_FIELDS = new Set(["preference", "custom_provider", "actions"]);
const LOCAL_TOOLS_FIELDS = new Set(["tools", "directories", "custom_executables"]);
const LOCAL_TOOL_ID = /^[a-z][a-z0-9-]{0,63}$/u;
/** A bare file name: no separator, no leading dot, no spaces. */
const LOCAL_BINARY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
/** `~/…` or an absolute path; characters that are not part of a plain path are refused. */
const LOCAL_DIRECTORY = /^(?:~\/|\/)[A-Za-z0-9._\/ -]{1,300}$/u;
const RUNTIME_FIELDS = new Set(["scope"]);
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

export function localToolsDeclarationProblems(value: unknown, permissions: ReadonlySet<string>): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return ["local_tools 必须为对象"];
  const problems: string[] = [];
  const unknown = Object.keys(value).filter(field => !LOCAL_TOOLS_FIELDS.has(field));
  if (unknown.length > 0) problems.push(`local_tools 不认这些字段：${unknown.join("、")}`);
  const { tools, directories } = value;
  if (!Array.isArray(tools) || tools.length === 0 || tools.length > PLUGIN_LOCAL_TOOLS_LIMITS.tools) {
    problems.push(`local_tools.tools 必须是 1 到 ${PLUGIN_LOCAL_TOOLS_LIMITS.tools} 个工具`);
  } else {
    const seen = new Set<string>();
    for (const tool of tools as unknown[]) {
      if (!isRecord(tool) || Object.keys(tool).some(field => field !== "tool_id" && field !== "binaries")) { problems.push("local_tools.tools 的每一项只能写 tool_id 和 binaries"); continue; }
      const id = typeof tool.tool_id === "string" && LOCAL_TOOL_ID.test(tool.tool_id) ? tool.tool_id : undefined;
      if (!id) problems.push("local_tools.tools[].tool_id 必须是小写字母开头、只含小写字母、数字和连字符的名字");
      else if (seen.has(id)) problems.push(`local_tools.tools 里 ${id} 重复`);
      else seen.add(id);
      const names = tool.binaries;
      if (!Array.isArray(names) || names.length === 0 || names.length > PLUGIN_LOCAL_TOOLS_LIMITS.binaries
        || names.some(name => typeof name !== "string" || !LOCAL_BINARY.test(name))) {
        problems.push(`local_tools.tools[].binaries 必须是 1 到 ${PLUGIN_LOCAL_TOOLS_LIMITS.binaries} 个不含路径的文件名`);
      }
    }
  }
  if (directories !== undefined) {
    if (!Array.isArray(directories) || directories.length > PLUGIN_LOCAL_TOOLS_LIMITS.directories
      || directories.some(directory => typeof directory !== "string" || !LOCAL_DIRECTORY.test(directory) || directory.split("/").includes(".."))) {
      problems.push(`local_tools.directories 至多 ${PLUGIN_LOCAL_TOOLS_LIMITS.directories} 个，每个是以 ~/ 或 / 开头、不含 .. 的路径`);
    }
  }
  if (value.custom_executables !== undefined && value.custom_executables !== true) problems.push("local_tools.custom_executables 只能写 true");
  if (!permissions.has(PLUGIN_LOCAL_TOOLS_PERMISSION)) problems.push(`local_tools 需要这份 Manifest 在 permissions 里声明 ${PLUGIN_LOCAL_TOOLS_PERMISSION}`);
  return problems;
}

/** `runtime` says where a plugin runs; the only place other than the project is the Home. The dual-instance mark is the Host's to give, never a Manifest's (S-48). */
export function runtimeDeclarationProblems(value: unknown): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return ["runtime 必须为对象"];
  const problems: string[] = [];
  const unknown = Object.keys(value).filter(field => !RUNTIME_FIELDS.has(field));
  if (unknown.length > 0) problems.push(`runtime 不认这些字段：${unknown.join("、")}${unknown.includes("dual_instance") ? "（双实例的标记只来自宿主的登记，Manifest 说不了）" : ""}`);
  if (value.scope !== "home") problems.push("runtime.scope 只能写 \"home\"（项目级插件不写 runtime）");
  return problems;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
