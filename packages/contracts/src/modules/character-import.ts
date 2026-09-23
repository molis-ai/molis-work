/** Portable, immutable copy of selected local Agent instructions and Skill resources. */
export const CHARACTER_IMPORT_RUNTIMES = ["codex", "claude-code", "cursor", "opencode", "grok-build"] as const;
export type CharacterImportRuntimeId = typeof CHARACTER_IMPORT_RUNTIMES[number];
export interface CharacterImportRule { path: string; scope: "global" | "project"; content: string; condition?: string }
export interface CharacterImportFile { path: string; encoding: "utf8" | "base64"; content: string }
export interface CharacterImportSkill {
  id: string; name: string; description: string; path: string; files: CharacterImportFile[];
  compatibility: "portable" | "native-only"; reason?: string;
}
export interface CharacterImportSnapshot {
  runtime_id: CharacterImportRuntimeId; config_root: string; project_root?: string; captured_at: string;
  rules: CharacterImportRule[]; skills: CharacterImportSkill[];
}
export interface CharacterImportSelection { rule_paths: string[]; skill_ids: string[] }
export interface CharacterImportCandidate {
  candidate_id: string; label: string; executable: string | null;
  snapshot: CharacterImportSnapshot; warnings: string[];
}
export const CHARACTER_IMPORT_LIMITS = { rules: 200, skills: 200, filesPerSkill: 300, files: 4000,
  fileBytes: 8 * 1024 * 1024, totalBytes: 64 * 1024 * 1024 } as const;

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("导入快照必须是对象");
  return value as Record<string, unknown>;
};
function string(value: unknown, label: string, max: number, empty = false): string {
  if (typeof value !== "string" || (!empty && !value.trim()) || value.length > max || value.includes("\0")) throw new Error(`${label}无效或过长`);
  return value;
}
function absolute(value: unknown): string {
  const result = string(value, "来源路径", 4096);
  if (!/^(?:\/|[A-Za-z]:[\\/])/.test(result) || /[\r\n]/.test(result) || result.split(/[\\/]/).some(part => part === "." || part === "..")) throw new Error("来源必须使用绝对路径且不可包含路径跳转");
  return result;
}
function relative(value: unknown): string {
  const result = string(value, "技能资源路径", 1024);
  if (result.startsWith("/") || /[\\:\r\n]/.test(result) || result.split("/").some(part => !part || part === "." || part === "..")) throw new Error("技能资源必须使用安全的相对路径");
  return result;
}
export function parseCharacterImportSnapshot(value: unknown): CharacterImportSnapshot {
  const x = object(value), limits = CHARACTER_IMPORT_LIMITS;
  if (!CHARACTER_IMPORT_RUNTIMES.includes(x.runtime_id as CharacterImportRuntimeId)) throw new Error("不支持的 Agent 来源");
  const config_root = absolute(x.config_root), project_root = x.project_root === undefined ? undefined : absolute(x.project_root);
  const captured_at = string(x.captured_at, "采集时间", 40);
  if (!/^\d{4}-\d\d-\d\dT/.test(captured_at) || !Number.isFinite(Date.parse(captured_at))) throw new Error("采集时间无效");
  if (!Array.isArray(x.rules) || x.rules.length > limits.rules || !Array.isArray(x.skills) || x.skills.length > limits.skills) throw new Error("规则或技能数量超出导入限制");
  let bytes = 0, fileCount = 0;
  const size = (content: string, encoding: "utf8" | "base64") => {
    let amount: number;
    if (encoding === "base64") {
      const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
      // A repeated regex group can overflow V8's regexp stack on multi-megabyte attachments.
      if (content.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(padding ? content.slice(0, -padding) : content)) throw new Error("技能二进制资源编码无效");
      amount = content.length / 4 * 3 - padding;
    } else amount = new TextEncoder().encode(content).length;
    bytes += amount;
    if (amount > limits.fileBytes || bytes > limits.totalBytes) throw new Error("导入内容超出大小限制；未截断或保存任何内容");
  };
  const paths = new Set<string>();
  const rules = x.rules.map(value => {
    const rule = object(value), path = absolute(rule.path);
    if (paths.has(path) || !["global", "project"].includes(String(rule.scope))) throw new Error("规则来源重复或范围无效");
    if (rule.scope === "project" && !project_root) throw new Error("项目规则缺少项目范围");
    paths.add(path);
    const content = string(rule.content, "规则正文", limits.fileBytes, true); size(content, "utf8");
    return { path, scope: rule.scope as "global" | "project", content,
      ...(rule.condition === undefined ? {} : { condition: string(rule.condition, "规则条件", 8192) }) };
  });
  const ids = new Set<string>();
  const skills = x.skills.map(value => {
    const skill = object(value), id = string(skill.id, "技能标识", 8192), path = absolute(skill.path);
    if (ids.has(id) || !["portable", "native-only"].includes(String(skill.compatibility))) throw new Error("技能标识重复或兼容性无效");
    ids.add(id);
    if (!Array.isArray(skill.files) || !skill.files.length || skill.files.length > limits.filesPerSkill) throw new Error("技能资源数量无效");
    const filePaths = new Set<string>();
    const files = skill.files.map(value => {
      const file = object(value), path = relative(file.path);
      if (filePaths.has(path) || !["utf8", "base64"].includes(String(file.encoding)) || ++fileCount > limits.files) throw new Error("技能资源重复、编码或数量无效");
      filePaths.add(path);
      const encoding = file.encoding as "utf8" | "base64", content = string(file.content, "技能资源", limits.fileBytes * 2, true);
      size(content, encoding); return { path, encoding, content };
    });
    if (!files.some(file => file.path === "SKILL.md" && file.encoding === "utf8")) throw new Error("技能必须包含完整的 SKILL.md");
    return { id, name: string(skill.name, "技能名称", 200), description: string(skill.description, "技能说明", 8000, true), path, files,
      compatibility: skill.compatibility as "portable" | "native-only", ...(skill.reason === undefined ? {} : { reason: string(skill.reason, "兼容性说明", 2000) }) };
  });
  return { runtime_id: x.runtime_id as CharacterImportRuntimeId, config_root, ...(project_root ? { project_root } : {}), captured_at, rules, skills };
}

export function selectCharacterImportSnapshot(value: unknown, selection: CharacterImportSelection): CharacterImportSnapshot {
  const snapshot = parseCharacterImportSnapshot(value);
  if (!selection || !Array.isArray(selection.rule_paths) || !Array.isArray(selection.skill_ids)
    || selection.rule_paths.some(path => typeof path !== "string" || !snapshot.rules.some(rule => rule.path === path))
    || selection.skill_ids.some(id => typeof id !== "string" || !snapshot.skills.some(skill => skill.id === id))
    || new Set(selection.rule_paths).size !== selection.rule_paths.length || new Set(selection.skill_ids).size !== selection.skill_ids.length) throw new Error("导入选择与已预览的快照不符");
  if (!selection.rule_paths.length && !selection.skill_ids.length) throw new Error("至少选择一条规则或一个技能");
  return { ...snapshot, rules: snapshot.rules.filter(rule => selection.rule_paths.includes(rule.path)), skills: snapshot.skills.filter(skill => selection.skill_ids.includes(skill.id)) };
}
