import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";

/**
 * One key per exact Skill reference: every field of a `SkillRef`, so two installations' Skills with the same `skill_id` never meet.
 * The Agent Host freezing a round and a plugin listing or de-duplicating its choices compare references with this one key. A leaf with
 * only a type import, so a page bundle can take it: `@molis-ai/molis-work-plugin-sdk/skill-ref`.
 */
export const skillRefKey = (ref: SkillRef): string => JSON.stringify([ref.source.kind, ref.source.plugin_id, ref.source.plugin_version,
  ref.source.publisher_signature, ref.install_id, ref.installation_generation, ref.skill_id, ref.version]);
