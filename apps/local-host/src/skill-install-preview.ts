import { matchLocale, type PluginLocaleReader } from '@molis-ai/molis-work-plugin-sdk/ui';
import { activeLocale } from './web-locale.js';
import { skillDisplayWords } from './agent-definitions/skill-display-words.js';
/**
 * What the install preview says about a package's Skills (specs/skill-packs/contract-design.md §4.3, §5): every Skill its Manifest's
 * `methods` declare, in the declaration's own words with its body's opening, and in an upgrade what changed against the installed
 * package. A sandbox package's methods and a content package's Skills are listed the same way: a method is a Skill.
 */
import type { PluginManifest, SandboxAgentBody } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { PluginMethodDeclaration } from '@molis-ai/molis-work-contracts/platform/plugin-agent';
import { SKILL_EXCERPT_CHARS, type SkillInstallPreview } from '@molis-ai/molis-work-contracts/services/skills';
import { refuseDeclarations } from '@molis-ai/molis-work-plugin-sdk';

/** A package's Skills as the Host reads them: the Manifest's declarations and each method's body (`SandboxAgentBody` of kind `method`). */
export interface PackagedSkillSet {
  readonly manifest: Pick<PluginManifest, 'methods'> & Partial<Pick<PluginManifest, 'kind'>>;
  readonly localePacks?: PluginLocaleReader | null;
  readonly agentBodies?: readonly SandboxAgentBody[];
}

type Skill = { declaration: PluginMethodDeclaration; body: string; reader: PluginLocaleReader | null };

const skillsOf = (pkg: PackagedSkillSet): Map<string, Skill> => new Map((pkg.manifest.methods ?? []).map(declaration => [declaration.skill_id,
  { declaration, body: pkg.agentBodies?.find(item => item.kind === 'method' && item.entry_id === declaration.skill_id)?.body ?? '', reader: pkg.manifest.kind === 'content' ? pkg.localePacks ?? null : null }]));

const resourceKey = (skill: Skill) => JSON.stringify((skill.declaration.resources ?? []).map(item => [item.path, item.sha256]).sort());

/**
 * What a Skill's upgrade changed: its body, else its resources (path or digest), else nothing. A change needs a higher `version` and a
 * `version` never goes down (§4.3, SKC-04), so the version a running round froze always names one body and one set of resources.
 */
function changeOf(next: Skill, installed: Skill): 'body_changed' | 'resources_changed' | undefined {
  return next.body !== installed.body ? 'body_changed' : resourceKey(next) !== resourceKey(installed) ? 'resources_changed' : undefined;
}

function preview(skill: Skill, change?: SkillInstallPreview['change']): SkillInstallPreview {
  const { declaration } = skill, resources = declaration.resources ?? [];
  const locale = skill.reader ? matchLocale(activeLocale(), skill.reader.available, skill.reader.default) : null;
  const words = skillDisplayWords(declaration, skill.reader, locale);
  return { skill_id: declaration.skill_id, version: declaration.version, name: words.name, description: words.description,
    ...(words.when_to_use ? { when_to_use: words.when_to_use } : {}), ...(words.when_not_to_use ? { when_not_to_use: words.when_not_to_use } : {}),
    // Not written means it can be named (§4.2).
    applies_to: declaration.applies_to, user_invocable: declaration.user_invocable ?? true,
    ...(declaration.native_only_reason ? { native_only_reason: declaration.native_only_reason } : {}),
    ...(declaration.argument_hint ? { argument_hint: declaration.argument_hint } : {}), tools: [...declaration.tools],
    resources: resources.map(item => ({ path: item.path, role: item.role, bytes: item.bytes })), runs_scripts: resources.some(item => item.role === 'script'),
    connector_categories: [...declaration.connector_categories ?? []], excerpt: Array.from(skill.body).slice(0, SKILL_EXCERPT_CHARS).join(''),
    ...(change ? { change } : {}),
    // No Skill has a setting yet: settings, kept through an upgrade and dropped with a removed Skill, come with the catalog (batch 08, 08-7).
    state: 'off' };
}

/**
 * The preview's `skills`: each Skill of `next`, and in an upgrade (`installed` given) each one's change and each installed Skill the
 * upgrade removes. A Skill whose body or resources changed while its `version` stayed, or whose `version` went down, refuses the whole
 * package with `plugin.declaration_invalid`, naming each such Skill (SKC-04): the Host never makes up a version for it.
 */
export function skillInstallPreviews(next: PackagedSkillSet, installed?: PackagedSkillSet): SkillInstallPreview[] {
  const skills = skillsOf(next), before = installed ? skillsOf(installed) : undefined;
  const problems: Array<{ skill_id: string; reason: string }> = [];
  const previews = [...skills.values()].map(skill => {
    if (!before) return preview(skill);
    const held = before.get(skill.declaration.skill_id);
    if (!held) return preview(skill, 'added');
    const change = changeOf(skill, held), { version } = skill.declaration, was = held.declaration.version;
    if (version < was) problems.push({ skill_id: skill.declaration.skill_id, reason: `版本 ${version} 低于已装的 ${was}：Skill 的版本只许增加` });
    else if (change && version === was) problems.push({ skill_id: skill.declaration.skill_id, reason: `${change === 'body_changed' ? '正文' : '附带文件'}变了，版本仍是 ${was}：要把版本加一` });
    return preview(skill, change);
  });
  if (problems.length) refuseDeclarations(problems);
  for (const held of before?.values() ?? []) if (!skills.has(held.declaration.skill_id)) previews.push(preview(held, 'removed'));
  return previews;
}
