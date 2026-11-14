import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";

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
