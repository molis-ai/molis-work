/**
 * The Skill and prompts the studio mounts, as the replay reports them. The plugin builder mounts chapters of
 * skills/molis-plugin-dev per stage (apps/local-host/src/plugin-builder/skill.ts); a stage's version is the digest of
 * its mounted text, so a changed number here means the model would read something different.
 */
import { BUILDER_PROMPTS } from '@molis-ai/molis-work-plugin-builder';
import { builderSkill } from '../../apps/local-host/src/plugin-builder/skill.js';
import type { Baseline, SkillMount } from './replay.mjs';

export const SKILL_STAGES = ['design', 'experience', 'ui', 'review', 'code'] as const;
/** The cap on one mounted stage (MAX_BODY in skill.ts). */
export const SKILL_BODY_LIMIT = 20_000;

export function mountedSkill(directory?: string): NonNullable<Baseline['skill']> {
  const stages: Record<string, SkillMount> = {};
  for (const stage of SKILL_STAGES) {
    try { const skill = builderSkill(stage, directory); stages[stage] = skill ? { version: skill.version, chars: skill.body.length } : { version: null, chars: null, error: 'no skills/molis-plugin-dev directory found' }; }
    catch (error) { stages[stage] = { version: null, chars: null, error: error instanceof Error ? error.message : String(error) }; }
  }
  return { stages, prompts: Object.fromEntries(Object.entries(BUILDER_PROMPTS).map(([name, prompt]) => [name, prompt.version])) };
}

/** Lines about the mounted Skill. A mount that cannot be built is a failure; a changed one is a reminder that this replay cannot judge it. */
export function skillNotes(current: NonNullable<Baseline['skill']>, recorded?: Baseline['skill']): { problems: string[]; changed: string[] } {
  const problems = Object.entries(current.stages).flatMap(([stage, mount]) => mount.error ? [`Skill stage ${stage}: ${mount.error}`] : []);
  const changed: string[] = [];
  for (const [stage, mount] of Object.entries(current.stages)) {
    const before = recorded?.stages[stage];
    if (before && before.version !== mount.version) changed.push(`Skill stage ${stage}: version ${before.version} → ${mount.version} (${before.chars} → ${mount.chars} chars)`);
  }
  for (const [name, version] of Object.entries(current.prompts)) if (recorded?.prompts[name] && recorded.prompts[name] !== version) changed.push(`prompt ${name}: ${recorded.prompts[name]} → ${version}`);
  return { problems, changed };
}
