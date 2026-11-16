// The placeholders a general Skill writes, apart from the rest of `services/skills` so a page that only replaces them carries no
// action definitions (batch 42). `services/skills` re-exports it. The pattern itself is not exported: a global expression keeps its
// `lastIndex` between callers.

/** A connector-category placeholder a general Skill writes (`~~project tracker`, `~~项目管理工具`): what a copy replaces with the person's own. */
const SKILL_PLACEHOLDER_PATTERN = /~~[^\s~`*_，。、；：！？,.;:!?()（）[\]【】<>「」"']+(?: [a-z][a-z-]*)?/gu;
/** The distinct placeholders a text still has, in the order they first appear. */
export function skillPlaceholders(text: string): string[] {
  return [...new Set(text.match(SKILL_PLACEHOLDER_PATTERN) ?? [])];
}
