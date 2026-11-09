/** The same native-tool detection for discovery and an installed, verified Skill. No extra compatibility record. */
export function nativeSkill(body: string, resources: readonly { path: string; binary?: boolean }[]): boolean {
  return resources.some(file => file.binary || !/\.(?:md|mdx|txt|json|jsonc|ya?ml|toml|csv|tsv|xml|svg)$/i.test(file.path))
    || /(?:mcp__|\bBash\b|\ballowed-tools:|\$\{(?:CLAUDE|CODEX|CURSOR)|(?:^|[\s(])(?:\.\.\/|file:\/\/))/m.test(body);
}
