/** The pass-rate report of a replay: what was replayed, how many first answers the host accepted, why it refused the rest, and how that compares with the baseline. */
import type { Merged, Skipped } from './corpus.mjs';
import { failures, type Baseline, type Comparison, type ReplayResult, type Summary } from './replay.mjs';

export interface ReportInput {
  results: readonly ReplayResult[];
  summary: Summary;
  skipped: readonly Skipped[];
  /** Run records (or repeated entries) of the same task and answer that were folded into one entry. */
  merged: readonly Merged[];
  sources: readonly string[];
  comparison?: Comparison;
  baselineLabel?: string;
  /** Said loudly, before the verdict: the comparison with the merge-base could not be made. */
  baselineWarning?: string;
  /** The committed seed corpus is among the sources. */
  seed: boolean;
  skill: NonNullable<Baseline['skill']>;
  skillProblems: readonly string[];
  skillChanged: readonly string[];
  verbose: boolean;
}

const NO_DETAIL_NOTICE = ['(no recorded detail answers in this corpus: the studio\'s headline number, the share of full designs accepted first time, is not measured; see docs/platform/STUDIO-SKILL-REPLAY.md)'] as const;
/**
 * Printed when the sources hold no real full-design answer but include the hand-written seed: the seed alone does not measure the headline number.
 * The committed real answers (tests/fixtures/studio-replay/recorded.json) are replayed by default together with it; a run that leaves them out says so here.
 */
export const SEED_NOTICE = [
  '(no recorded detail answers among these sources. tests/fixtures/studio-replay/corpus.json is the hand-written seed: entries that each exercise one host rule.',
  ' The studio\'s headline number, the share of full designs accepted first time, is NOT measured by the seed alone. The real full-design answers (380 on 2026-10-08,',
  ' exported read-only from a copy of three projects of the person\'s Home and reviewed for personal data, specs/repository-anti-corruption/spec.md §1) are committed',
  ' in tests/fixtures/studio-replay/recorded.json and are replayed by the default run: pnpm studio:replay. See docs/platform/STUDIO-SKILL-REPLAY.md)'] as const;

const percent = (passed: number, total: number) => total ? `${Math.round(100 * passed / total)}%` : '–';
const section = (title: string, lines: readonly string[]) => lines.length ? ['', title, ...lines.map(line => '  ' + line)] : [];

export function renderReport(input: ReportInput): string {
  const { summary, results, comparison } = input, recorded = results.filter(result => result.origin === 'recorded').length;
  const out: string[] = [`Studio design replay: ${summary.total} answers (${recorded} recorded by a model, ${summary.total - recorded} synthetic) through the host's design checks`];
  out.push(`sources: ${input.sources.join(', ')}`);
  out.push('', 'First answers accepted without a repair round (attempt 0)');
  for (const group of summary.groups) out.push(`  ${group.label.padEnd(20)} ${String(group.passed).padStart(3)}/${String(group.total).padEnd(3)} ${percent(group.passed, group.total).padStart(4)}${group.gap ? `   (${group.gap} of the ${group.total - group.passed} refused name an action the run record does not show; if the host accepted those, at most ${percent(group.passed + group.gap, group.total)})` : ''}`);
  if (!summary.groups.some(group => group.label.startsWith('recorded detail'))) out.push(...(input.seed ? SEED_NOTICE : NO_DETAIL_NOTICE).map(line => '  ' + line));
  if (summary.repairRounds.total) out.push(`  answers to repair requests: ${summary.repairRounds.passed}/${summary.repairRounds.total} accepted`);
  if (summary.fromRunRecords) out.push(`  ${summary.fromRunRecords} of these answers were rebuilt from run records: their action list is what the designer was shown (the actions given in full and up to eight example ids per source), not the whole directory the host checked; see docs/platform/STUDIO-SKILL-REPLAY.md §2.3`);
  out.push(...section('Why the host refused answers (grouped)', summary.reasons.map(reason => `${String(reason.count).padStart(3)}×  ${reason.kind}  [${reason.stage}]  e.g. ${reason.ids.slice(0, 3).join(', ')}`)));
  out.push(...section('Refused for an action the run record does not show (the host checked the whole directory and may have accepted these)', results.filter(result => result.catalogGap).map(result => `${result.id} [${result.stage}]: ${result.message}`)));
  if (input.verbose) out.push(...section('Every refusal, in the host\'s words', results.filter(result => !result.pass).map(result => `${result.id} [${result.stage}]: ${result.message}`)));
  if (input.verbose) out.push(...section('Every accepted answer', results.filter(result => result.pass).map(result => `${result.id}: ${result.outcome}, ${result.shape}${result.notes ? `, ${result.notes} tidied by the host` : ''}`)));
  if (input.merged.length) out.push(...section(`Same task and answer met more than once, replayed once (${input.merged.length})`, input.merged.slice(0, input.verbose ? undefined : 8).map(item => `${item.id}: ${item.kept} and ${item.also}`)));
  if (input.skipped.length) out.push(...section(`Not replayed (${input.skipped.length})`, input.skipped.slice(0, input.verbose ? undefined : 8).map(item => `${item.file}: ${item.reason}`)));
  out.push(...section('Mounted Skill (skills/molis-plugin-dev) and prompts', [
    ...Object.entries(input.skill.stages).map(([stage, mount]) => `${stage.padEnd(11)} ${mount.error ? 'ERROR ' + mount.error : `${mount.chars} chars, version ${mount.version}`}`),
    `prompts: ${Object.entries(input.skill.prompts).map(([name, version]) => `${name} ${version}`).join(', ')}`]));
  if (comparison) {
    const lists: Array<[string, readonly string[]]> = [['Regressions: answers the host used to accept', comparison.regressions], ['Missing from the corpus', comparison.removed], ['Changed under the same id, or a retired id used again', comparison.changed], ['Not in the baseline', comparison.unrecorded],
      ['Baseline is behind (the host now accepts these)', comparison.behind], ['Refused for a different reason (informational)', comparison.reasonChanged]];
    for (const [title, lines] of lists) out.push(...section(title, lines));
    if (input.baselineWarning) out.push('', 'WARNING: ' + input.baselineWarning);
    const bad = failures(comparison);
    out.push('', bad ? `Baseline ${input.baselineLabel}: FAILED (${bad})` : `Baseline ${input.baselineLabel}: every recorded result still holds`);
  }
  out.push(...section('Skill mount problems', input.skillProblems));
  if (input.skillChanged.length) out.push(...section('The mounted text changed since the baseline', [...input.skillChanged, 'This replay feeds the same fixed answers, so it cannot say what that does to a model. Run the generation smoke on an isolated Home: pnpm studio:replay smoke']));
  out.push('', 'Scope: fixed recorded answers prove the host checks; only a real model proves what a Skill or prompt edit does (pnpm studio:replay smoke).');
  return out.join('\n') + '\n';
}
