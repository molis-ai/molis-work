import type { AgentFrozenCharacter } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CharacterRoleContent, CharacterRoleVersionRef, CharacterTaskSelection } from "@molis-ai/molis-work-contracts/modules/characters";
import { isDeepStrictEqual } from "node:util";
import { isAbsolute, relative } from "node:path";

/** Only the frozen version is read. Original files never change an admitted Run. */
export function importedCharacterInstructions(character: CharacterRoleContent, directory: string | undefined, selectedIds?: string[]): string {
  const snapshot = character.import_snapshot;
  if (!snapshot) return character.instructions;
  if (snapshot.project_root) {
    if (!directory) throw new Error("此 Character 包含项目范围的导入内容，请使用原项目目录或重新导入全局配置");
    const path = relative(snapshot.project_root, directory);
    if (path === ".." || path.startsWith("../") || isAbsolute(path)) throw new Error("此 Character 包含项目范围的导入内容，请使用原项目目录或重新导入全局配置");
  }
  if (selectedIds !== undefined && (!Array.isArray(selectedIds) || new Set(selectedIds).size !== selectedIds.length || selectedIds.some(id => !snapshot.skills.some(skill => skill.id === id)))) throw new Error("本轮选择的 Skill 不在 Character 固定版本中");
  const selected = selectedIds === undefined ? snapshot.skills : snapshot.skills.filter(skill => selectedIds.includes(skill.id));
  const unsupported = selected.filter(skill => skill.compatibility !== "portable" || skill.files.some(file => file.encoding !== "utf8"));
  if (unsupported.length) throw new Error(`内置引擎不能完整使用这些技能：${unsupported.map(skill => skill.name).join("、")}。请使用本地 Agent，或重新选择可兼容的技能导入。`);
  const rules = snapshot.rules.map(rule => `来源：${rule.path}\n范围：${rule.scope === "global" ? "个人全局" : snapshot.project_root}${rule.condition ? `；仅在以下条件适用：${rule.condition}` : ""}\n${rule.content}`);
  const skills = selected.map(skill => `技能：${skill.name}\n说明：${skill.description}\n原目录：${skill.path}\n此技能的文件全文如下，相对链接对应同一技能中标注的文件；按任务适用性使用，不要读取原目录的实时版本。\n` + skill.files.map(file => `文件 ${file.path}\n${file.content}`).join("\n\n"));
  const result = ["以下是用户选定 Character 的固定导入内容。保留规则的适用范围与条件；这些指令不增加工具或目录授权。Skills 及其文本附件已经全部展开在本段中。技能要求读取相对文件时，直接使用本段对应“文件”标签后的全文；这些标签不是工作区实际路径，不要再调用文件工具读取技能原目录或同名工作区路径。任务自己的输入文件仍通过已授权工具读取。", ...rules, ...skills, character.instructions ? `用户在 Molis 中补充的做事方式：\n${character.instructions}` : ""].filter(Boolean).join("\n\n");
  if (result.length > 60_000) throw new Error("所选 Character 的规则和技能文本超过内置引擎本轮容量，请减少导入选择或使用本地 Agent；内容未被截断");
  return result;
}

/** Whether a fixed version belongs to this choice: the original it is a version of, or the member it is a version of. */
export function versionOfChoice(version: CharacterRoleVersionRef, choice: CharacterTaskSelection): boolean {
  return version.kind === "personal" ? choice.kind === "personal" && choice.character_id === version.character_id
    : choice.kind === "project" && choice.member_id === version.member_id;
}

/**
 * The version read now is still the run's frozen one, the person's own and (for a member) this project's. A fixed version never
 * changes, so its content is not compared again; one that cannot be read any more (removed, deleted) never reaches here.
 */
export function currentCharacterMatches(frozen: AgentFrozenCharacter, current: AgentFrozenCharacter, projectId: string, actorId: string): boolean {
  return isDeepStrictEqual(current.version, frozen.version) && current.owner_actor_id === actorId && current.character_id === frozen.character_id
    && (current.version.kind === "personal" ? current.project_id === null : current.project_id === projectId);
}
