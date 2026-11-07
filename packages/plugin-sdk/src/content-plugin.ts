import type { AgentSkillDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { PluginDeclarationProblem } from "@molis-ai/molis-work-contracts/platform/plugin";

// A plugin with only declarations (「只有声明的插件」, Manifest `kind: "content"`, specs/skill-packs/contract-design.md §3). One check
// of the Manifest, called by `parsePluginManifest`, so the CLI, Plugin Runtime, install preview and Plugin Builder hold every such
// plugin to the same list. A later key (batch 20's scene sets) is added to this list and its own check, never as a branch on a
// plugin's name. Its package is read in `content-package.ts`.

/** The top-level keys a plugin with only declarations may write; any other is refused by name. */
const CONTENT_KEYS = new Set([
  "schema_version", "plugin_id", "version", "name", "name_en", "summary", "publisher", "host_api_version", "developer", "kind",
  "entrypoints", "permissions", "capabilities", "artifacts", "ui",
  "methods", "requires", "upgrade_compatibility", "runtime",
]);
/** The `ui` keys it may write: the empty contribution list, and its words in both languages. */
const CONTENT_UI_KEYS = new Set(["contributions", "messages", "translations"]);
/** Lists every Manifest has that must stay empty here: nothing to start, grant, provide, consume, produce or place. */
const EMPTY_LISTS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["entrypoints", []], ["permissions", []],
  ["capabilities", ["provides", "consumes"]], ["artifacts", ["produces", "consumes"]], ["ui", ["contributions"]],
];

const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/**
 * What keeps a Manifest from being a plugin with only declarations (SKC-01): a key outside the list, a list that must be empty and is
 * not, no method, or a method without its body's path. Empty when there is nothing; the caller refuses with `plugin.declaration_invalid`.
 */
export function inspectContentPlugin(manifest: Readonly<Record<string, unknown>>): PluginDeclarationProblem[] {
  const problems: PluginDeclarationProblem[] = [];
  for (const key of Object.keys(manifest)) if (!CONTENT_KEYS.has(key)) problems.push({ reason: `只有声明的插件不能写 ${key}` });
  if (plain(manifest.ui)) for (const key of Object.keys(manifest.ui)) if (!CONTENT_UI_KEYS.has(key)) problems.push({ reason: `只有声明的插件不能写 ui.${key}` });
  for (const [key, fields] of EMPTY_LISTS) {
    const value = manifest[key];
    if (!fields.length) { if (!Array.isArray(value) || value.length) problems.push({ reason: `只有声明的插件的 ${key} 必须是空列表` }); continue; }
    if (!plain(value)) { problems.push({ reason: `只有声明的插件的 ${key} 必须写成空列表的 ${fields.join("、")}` }); continue; }
    for (const field of Object.keys(value)) if (!fields.includes(field) && key !== "ui") problems.push({ reason: `只有声明的插件不能写 ${key}.${field}` });
    for (const field of fields) if (!Array.isArray(value[field]) || (value[field] as unknown[]).length) problems.push({ reason: `只有声明的插件的 ${key}.${field} 必须是空列表` });
  }
  const methods = manifest.methods;
  if (!Array.isArray(methods) || !methods.length) problems.push({ reason: "只有声明的插件至少要声明一个方法（methods）" });
  else for (const method of methods as Array<Partial<AgentSkillDeclaration> | null>) {
    // Nothing runs to hand the Host a body, so each one ships in the package at the path the declaration names.
    if (plain(method) && typeof method.skill_id === "string" && method.body === undefined) {
      problems.push({ skill_id: method.skill_id, reason: `方法 ${method.skill_id} 要写 body：只有声明的插件的正文随包发布` });
    }
  }
  return problems;
}
