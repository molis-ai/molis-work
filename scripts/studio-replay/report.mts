/** The pass-rate report of a replay: what was replayed, how many first answers the host accepted, why it refused the rest, and how that compares with the baseline. */
import type { Skipped } from './corpus.mjs';
import type { Baseline, Comparison, ReplayResult, Summary } from './replay.mjs';

export interface ReportInput {
  results: readonly ReplayResult[];
  summary: Summary;
  skipped: readonly Skipped[];
  sources: readonly string[];
  comparison?: Comparison;
  baselineLabel?: string;
  skill: NonNullable<Baseline['skill']>;
  skillProblems: readonly string[];
  skillChanged: readonly string[];
  verbose: boolean;
}

const percent = (passed: number, total: number) => total ? `${Math.round(100 * passed / total)}%` : '–';
const section = (title: string, lines: readonly string[]) => lines.length ? ['', title, ...lines.map(line => '  ' + line)] : [];

export function renderReport(input: ReportInput): string {
  const { summary, results, comparison } = input, recorded = results.filter(result => result.origin === 'recorded').length;
  const out: string[] = [`Studio design replay: ${summary.total} answers (${recorded} recorded by a model, ${summary.total - recorded} synthetic) through the host's design checks`];
  out.push(`sources: ${input.sources.join(', ')}`);
  out.push('', 'First answers accepted without a repair round (attempt 0)');
  for (const group of summary.groups) out.push(`  ${group.label.padEnd(20)} ${String(group.passed).padStart(3)}/${String(group.total).padEnd(3)} ${percent(group.passed, group.total).padStart(4)}`);
  if (!summary.groups.some(group => group.label.startsWith('recorded detail'))) out.push('  (no recorded detail answers in this corpus: the headline number of the studio, the share of full designs accepted first time, needs them; see docs/platform/STUDIO-SKILL-REPLAY.md)');
  if (summary.repairRounds.total) out.push(`  answers to repair requests: ${summary.repairRounds.passed}/${summary.repairRounds.total} accepted`);
  out.push(...section('Why the host refused answers (grouped)', summary.reasons.map(reason => `${String(reason.count).padStart(3)}×  ${reason.kind}  [${reason.stage}]  e.g. ${reason.ids.slice(0, 3).join(', ')}`)));
  if (input.verbose) out.push(...section('Every refusal, in the host\'s words', results.filter(result => !result.pass).map(result => `${result.id} [${result.stage}]: ${result.message}`)));
  if (input.verbose) out.push(...section('Every accepted answer', results.filter(result => result.pass).map(result => `${result.id}: ${result.outcome}, ${result.shape}${result.notes ? `, ${result.notes} tidied by the host` : ''}`)));
  if (input.skipped.length) out.push(...section(`Not replayed (${input.skipped.length})`, input.skipped.slice(0, input.verbose ? undefined : 8).map(item => `${item.file}: ${item.reason}`)));
  out.push(...section('Mounted Skill (skills/molis-plugin-dev) and prompts', [
    ...Object.entries(input.skill.stages).map(([stage, mount]) => `${stage.padEnd(11)} ${mount.error ? 'ERROR ' + mount.error : `${mount.chars} chars, version ${mount.version}`}`),
    `prompts: ${Object.entries(input.skill.prompts).map(([name, version]) => `${name} ${version}`).join(', ')}`]));
  if (comparison) {
    const lists: Array<[string, readonly string[]]> = [['Regressions: answers the host used to accept', comparison.regressions], ['Missing from the corpus', comparison.removed], ['Not in the baseline', comparison.unrecorded],
      ['Baseline is behind (the host now accepts these)', comparison.behind], ['Refused for a different reason (informational)', comparison.reasonChanged]];
    for (const [title, lines] of lists) out.push(...section(title, lines));
    const bad = comparison.regressions.length + comparison.removed.length + comparison.unrecorded.length + comparison.behind.length;
    out.push('', bad ? `Baseline ${input.baselineLabel}: FAILED (${bad})` : `Baseline ${input.baselineLabel}: every recorded result still holds`);
  }
  out.push(...section('Skill mount problems', input.skillProblems));
  if (input.skillChanged.length) out.push(...section('The mounted text changed since the baseline', [...input.skillChanged, 'This replay feeds the same fixed answers, so it cannot say what that does to a model. Run the generation smoke on an isolated Home: pnpm studio:replay smoke']));
  out.push('', 'Scope: fixed recorded answers prove the host checks; only a real model proves what a Skill or prompt edit does (pnpm studio:replay smoke).');
  return out.join('\n') + '\n';
}
