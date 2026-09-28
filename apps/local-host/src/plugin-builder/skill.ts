/**
 * The plugin standard the builder's agents work to: `skills/molis-plugin-dev`, the same Skill official plugins are
 * written with. Each stage mounts the chapters it needs; the version is the content's own digest, so every build
 * records exactly which revision of the standard it followed.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuilderSkill } from '@molis-ai/molis-work-contracts/services/agent-host';

export const PLUGIN_SKILL_ID = 'molis-plugin-dev';
/** Prologue inlines at most this much Skill body. */
const MAX_BODY = 20_000;
/** What each stage reads, in order. The UI quality bar is the section of ui.md every plugin shares. */
const CHAPTERS: Record<'design' | 'code', Array<string | { file: string; section: string }>> = {
  design: ['process.md', 'generated-design.md', 'generated-ai.md', { file: 'ui.md', section: '## 质量线（所有插件）' }, 'capabilities.md'],
  code: ['generated-code.md', 'generated-ai.md', 'capabilities.md'],
};

/** The Skill directory: in the repository and in an installed release, `skills/` sits beside the code. */
export function pluginSkillDirectory(from = dirname(fileURLToPath(import.meta.url))): string | undefined {
  for (let directory = from, depth = 0; depth < 10; depth++, directory = dirname(directory)) {
    const candidate = join(directory, 'skills', PLUGIN_SKILL_ID);
    if (existsSync(join(candidate, 'SKILL.md'))) return candidate;
    if (dirname(directory) === directory) break;
  }
  return undefined;
}

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  if (start < 0) throw new Error('插件开发 Skill 缺少章节：' + heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next < 0 ? undefined : next).trim();
}

/** The Skill a stage mounts, or undefined when the release has no Skill directory. */
export function builderSkill(stage: 'design' | 'code', directory = pluginSkillDirectory()): BuilderSkill | undefined {
  if (!directory) return undefined;
  const parts = CHAPTERS[stage].map(chapter => {
    const file = typeof chapter === 'string' ? chapter : chapter.file, text = readFileSync(join(directory, file), 'utf8').trim();
    return typeof chapter === 'string' ? text : section(text, chapter.section);
  });
  const body = parts.join('\n\n---\n\n');
  if (body.length > MAX_BODY) throw new Error(`插件开发 Skill 的 ${stage} 部分有 ${body.length} 字，超过 ${MAX_BODY} 字的挂载上限；请精简章节`);
  const version = Number.parseInt(createHash('sha256').update(body).digest('hex').slice(0, 7), 16);
  return { id: PLUGIN_SKILL_ID + '.' + stage, version, name: stage === 'design' ? '插件开发规范 · 设计' : '插件开发规范 · 代码', body };
}
