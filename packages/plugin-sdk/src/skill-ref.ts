import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { SkillCatalogEntry, SkillReadRefusal } from "@molis-ai/molis-work-contracts/services/skills";

/**
 * One key per exact Skill reference: every field of a `SkillRef`, so two installations' Skills with the same `skill_id` never meet.
 * The Agent Host freezing a round and a plugin listing or de-duplicating its choices compare references with this one key. A leaf with
 * only a type import, so a page bundle can take it: `@molis-ai/molis-work-plugin-sdk/skill-ref`.
 */
export const skillRefKey = (ref: SkillRef): string => JSON.stringify([ref.source.kind, ref.source.plugin_id, ref.source.plugin_version,
  ref.source.publisher_signature, ref.install_id, ref.installation_generation, ref.skill_id, ref.version]);

/**
 * What a round's list of Skills it may pick by itself says of one Skill (specs/prologue-strategies/skill.md SKL-02): the exact reference
 * to read it by, and the words to judge it against the task — what it does, when to use it and when not to. The Assistant's round and a
 * plugin's round build their lists from this one row, so the model weighs the same facts wherever it runs. Never the body.
 */
export const skillChoiceRow = (entry: Pick<SkillCatalogEntry, "ref" | "name" | "description" | "when_to_use" | "when_not_to_use">) => ({
  ref: entry.ref, name: entry.name, description: entry.description,
  ...(entry.when_to_use ? { when_to_use: entry.when_to_use } : {}), ...(entry.when_not_to_use ? { when_not_to_use: entry.when_not_to_use } : {}) });

/** Why a Skill the person named cannot be read now, each in words that say what they can do about it. */
const NAMED_SKILL_REFUSED: Record<SkillReadRefusal, string> = {
  plugin_disabled: "它所在的插件已停用，到设置里启用后再用",
  publisher_revoked: "发布者已撤回它",
  resource_invalid: "它的正文或文件缺失，要重新安装",
  requires_unmet: "它需要的能力现在没有",
  connection_missing: "它需要的服务还没连接，先去连接",
  native_only: "它只能在本机应用里用",
  not_applicable: "它不适用于这里",
  not_current: "它已经更新或移除，要重新选一次",
  off: "它已停用，在设置的「技能」里打开后再用",
  not_named: "这一轮没有点名它",
  over_limit: "这一轮自动选的技能已满三个",
};

/**
 * What a round says when Skills the person named cannot be read (SKL-16, the basic layer): the round did not start, nothing was swapped
 * in for them, each one with its own reason, and the three things the person can do. One sentence for the Assistant and for a plugin's
 * round, so a refusal reads the same wherever it happens. The reason's code stays in the sentence: it is what a report or a test tells
 * one refusal from another by.
 */
export const namedSkillsRefused = (refused: ReadonlyArray<{ name: string; reason: SkillReadRefusal; detail?: string }>): string =>
  `这一轮没有开始，也没有换成别的技能。${refused.map(one => `技能「${one.name}」现在不能用：${NAMED_SKILL_REFUSED[one.reason]}（${one.detail ? `${one.detail}，` : ""}${one.reason}）`).join("；")}。`
  + "可以处理好再发，改用另一个技能，或者去掉技能直接发。";
