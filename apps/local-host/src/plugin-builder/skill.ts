/**
 * Studio mounts the same standard its plugin authors use. Groups keep each SDK Skill within its own body limit; a
 * group's version covers its shipped text in every language, while Prologue registers each concrete body separately.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_WEB_LOCALE, WEB_LOCALES, type WebLocale } from '@molis-ai/molis-work-app-workbench';
import type { BuilderSkill } from '@molis-ai/molis-work-contracts/services/agent-host';

export const PLUGIN_SKILL_ID = 'molis-plugin-dev';
/** The maximum body passed to Prologue's fillSkillBody, per mounted Skill. */
const MAX_BODY = 20_000;
const QUALITY_BAR = 'studio-quality-bar';
const CHAPTERS = {
  design: [['process', 'generated-design'], ['generated-experience', 'generated-ai'], ['ui', 'capabilities']],
  ui: [['generated-experience', 'generated-ui', 'ui']],
  experience: [['generated-experience', 'ui']],
  review: [['generated-experience', 'ui']],
  code: [['generated-code', 'generated-ai', 'capabilities']],
} as const;

/** In the repository and in an installed release, `skills/` sits beside the code. */
export function pluginSkillDirectory(from = dirname(fileURLToPath(import.meta.url))): string | undefined {
  for (let directory = from, depth = 0; depth < 10; depth++, directory = dirname(directory)) {
    const candidate = join(directory, 'skills', PLUGIN_SKILL_ID);
    if (existsSync(join(candidate, 'SKILL.md'))) return candidate;
    if (dirname(directory) === directory) break;
  }
  return undefined;
}

function chapterText(file: string, chapter: string): string {
  const markdown = readFileSync(file, 'utf8').trim();
  if (chapter !== 'ui') return markdown;
  const marker = '<!-- ' + QUALITY_BAR + ' -->\n', start = markdown.indexOf(marker);
  if (start < 0) throw new Error(file + ': missing Studio quality bar');
  const body = start + marker.length, end = markdown.indexOf('\n## ', body);
  return markdown.slice(body, end < 0 ? undefined : end).trim();
}

function chapterIn(directory: string, chapter: string, tag: WebLocale): string | undefined {
  const file = join(directory, chapter + (tag === DEFAULT_WEB_LOCALE ? '' : '.' + tag) + '.md');
  if (tag !== DEFAULT_WEB_LOCALE && !existsSync(file)) return undefined;
  return chapterText(file, chapter);
}

function groupIn(directory: string, chapters: readonly string[], id: string, selected: WebLocale): BuilderSkill {
  const available = [...WEB_LOCALES].sort();
  const translations = chapters.map(chapter => new Map(available.flatMap(tag => {
    const body = chapterIn(directory, chapter, tag);
    return body === undefined ? [] : [[tag, body] as const];
  })));
  const version = Number.parseInt(createHash('sha256').update(JSON.stringify(translations.map(part => [...part]))).digest('hex').slice(0, 7), 16);
  const bodies = new Map(WEB_LOCALES.map(tag => {
    const body = translations.map(part => part.get(tag) ?? part.get(DEFAULT_WEB_LOCALE)!).join('\n\n---\n\n');
    if (body.length > MAX_BODY) throw new Error(`${id} (${tag}): ${body.length} characters exceeds the ${MAX_BODY} character Skill body limit`);
    return [tag, body];
  }));
  const body = bodies.get(selected)!;
  const name = body.split('\n', 1)[0]!.replace(/^#+\s+/u, '');
  return { id: id + '.' + selected.toLowerCase(), version, name, body };
}

/** The ordered standards for a stage, or no standards when a release has no Skill directory. */
export function builderSkills(stage: keyof typeof CHAPTERS, directory = pluginSkillDirectory(), locale: WebLocale = DEFAULT_WEB_LOCALE): readonly BuilderSkill[] {
  if (!directory) return [];
  const selected = WEB_LOCALES.includes(locale) ? locale : DEFAULT_WEB_LOCALE;
  const groups = CHAPTERS[stage];
  return groups.map((chapters, index) => groupIn(directory, chapters, PLUGIN_SKILL_ID + '.' + stage + (groups.length > 1 ? '.' + (index + 1) : ''), selected));
}
