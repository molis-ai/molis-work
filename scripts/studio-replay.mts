/**
 * Studio Skill replay: one way to verify any change that reaches what the plugin builder tells a model or checks in its answers.
 *
 *   pnpm studio:replay                       replay the committed corpus through the host's design checks and compare with the baseline
 *   pnpm studio:replay harvest --runs <dir> --out <file>   turn a Home's recorded designer runs into a corpus file (read-only on the Home)
 *   pnpm studio:replay smoke                 real generation on an isolated Home (skips with a message when it has no model)
 *   pnpm studio:replay smoke --stand-in      the same wiring against a scripted local model: no key, no cost, says nothing about a Skill
 *
 * Method and what each part proves: docs/platform/STUDIO-SKILL-REPLAY.md.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harvest, loadCorpus } from './studio-replay/corpus.mjs';
import { baselineFrom, builtinEntries, compare, failures, parseBaseline, replayEntry, summarise, type Baseline } from './studio-replay/replay.mjs';
import { renderReport } from './studio-replay/report.mjs';
import { mountedSkill, skillNotes } from './studio-replay/skill.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CORPUS = ['tests/fixtures/studio-replay/corpus.json', 'tests/fixtures/builder-designer/minimax-notes-v1.json'];
const DEFAULT_BASELINE = 'tests/fixtures/studio-replay/baseline.json';

const USAGE = `usage:
  pnpm studio:replay [--corpus <file|dir>]... [--baseline <file>] [--write-baseline] [--base <git ref>] [--min-pass <0..1>] [--json <file>] [--skill-dir <skills/molis-plugin-dev copy>] [--verbose]
  pnpm studio:replay harvest --runs <builder-runs dir> --out <file>
  pnpm studio:replay smoke [--briefs <file>] [--out <file>] [--minutes <n>] [--stand-in]
Exit codes: 0 holds, 1 a recorded result changed for the worse (or the baseline is behind), 2 the command could not run.`;

class Usage extends Error {}
function parse(argv: string[], flags: readonly string[], booleans: readonly string[]): { values: Record<string, string[]>; set: Set<string> } {
  const values: Record<string, string[]> = {}, set = new Set<string>();
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index]!.replace(/^--/, '');
    if (!argv[index]!.startsWith('--')) throw new Usage(`unexpected argument ${argv[index]}`);
    if (booleans.includes(name)) { set.add(name); continue; }
    if (!flags.includes(name)) throw new Usage(`unknown option --${name}`);
    const value = argv[++index]; if (value === undefined || value.startsWith('--')) throw new Usage(`--${name} needs a value`);
    (values[name] ??= []).push(value);
  }
  return { values, set };
}

/** The baseline file as the merge-base has it, so a baseline rewritten to forgive a regression is still caught. */
function baselineAt(ref: string, file: string): Baseline | undefined {
  const where = realpathSync(file), git = (...args: string[]) => spawnSync('git', ['-C', dirname(where), ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const top = git('rev-parse', '--show-toplevel');
  if (top.status !== 0) throw new Usage(`--base needs the baseline to be inside a git repository: ${file}`);
  if (git('rev-parse', '--verify', '--quiet', ref + '^{commit}').status !== 0) throw new Usage(`--base ${ref} is not a commit here (fetch it first)`);
  const shown = git('show', `${ref}:${relative(realpathSync(top.stdout.trim()), where).split('\\').join('/')}`);
  if (shown.status === 0) return parseBaseline(shown.stdout, `${file} at ${ref}`);
  // The file not being there yet is the first commit that adds it; any other failure is not an excuse to skip the comparison.
  if (/exists on disk, but not in|does not exist in/.test(shown.stderr)) return undefined;
  throw new Error(`could not read ${file} at ${ref}: ${shown.stderr.trim()}`);
}

function replayCommand(argv: string[]): number {
  const { values, set } = parse(argv, ['corpus', 'baseline', 'base', 'min-pass', 'json', 'skill-dir'], ['write-baseline', 'verbose']);
  const custom = values.corpus !== undefined, paths = (values.corpus ?? DEFAULT_CORPUS).map(path => resolve(root, path));
  const baselineFile = values.baseline?.[0] ? resolve(root, values.baseline[0]) : custom ? undefined : resolve(root, DEFAULT_BASELINE);
  if (set.has('write-baseline') && !baselineFile) throw new Usage('--write-baseline needs --baseline <file> when --corpus is given');
  if (values.base && !baselineFile) throw new Usage('--base compares a baseline file: give --baseline <file>');
  const loaded = loadCorpus(paths), entries = [...builtinEntries(), ...loaded.entries];
  const results = entries.map(entry => replayEntry(entry));
  const summary = summarise(results), skill = mountedSkill(values['skill-dir']?.[0] ? resolve(values['skill-dir'][0]) : undefined);
  const recorded = existsSync(baselineFile ?? '') && !set.has('write-baseline') ? parseBaseline(readFileSync(baselineFile!, 'utf8'), baselineFile!) : undefined;
  if (baselineFile && !recorded && !set.has('write-baseline')) throw new Usage(`no baseline at ${baselineFile}; run with --write-baseline to create it`);
  const notes = skillNotes(skill, recorded?.skill);
  if (set.has('write-baseline')) {
    const before = existsSync(baselineFile!) ? parseBaseline(readFileSync(baselineFile!, 'utf8'), baselineFile!) : undefined;
    // Writing the baseline never forgives a loss by itself: an entry that passed must still pass, or be retired with a reason.
    const lost = before ? compare(results, before) : undefined;
    if (lost && (lost.regressions.length || lost.removed.length)) { process.stderr.write(['Refusing to write the baseline over a loss:', ...lost.regressions, ...lost.removed].join('\n  ') + '\n'); return 1; }
    mkdirSync(dirname(baselineFile!), { recursive: true });
    writeFileSync(baselineFile!, JSON.stringify(baselineFrom(results, skill, before?.retired), null, 2) + '\n');
    process.stdout.write(`wrote ${relative(process.cwd(), baselineFile!)}: ${results.filter(result => result.pass).length}/${results.length} accepted\n`);
    return 0;
  }
  const previous = values.base?.[0] && baselineFile ? baselineAt(values.base[0], baselineFile) : undefined;
  const comparison = recorded ? compare(results, recorded, previous) : undefined;
  process.stdout.write(renderReport({ results, summary, skipped: loaded.skipped, sources: ['built-in prompt example', ...paths.map(path => relative(root, path))], ...(comparison ? { comparison } : {}),
    baselineLabel: baselineFile ? relative(root, baselineFile) + (values.base ? ` (also against ${values.base[0]})` : '') : '', skill, skillProblems: notes.problems, skillChanged: notes.changed, verbose: set.has('verbose') }));
  if (values.json?.[0]) writeFileSync(resolve(values.json[0]), JSON.stringify({ summary, results, comparison: comparison ?? null, skill }, null, 2) + '\n');
  let code = 0;
  if (comparison && failures(comparison)) code = 1;
  if (notes.problems.length) code = 1;
  const floor = values['min-pass']?.[0];
  if (floor !== undefined) {
    const need = Number(floor), first = results.filter(result => result.attempt === 0 && result.origin === 'recorded');
    if (!(need >= 0 && need <= 1)) throw new Usage('--min-pass is a number between 0 and 1');
    const rate = first.length ? first.filter(result => result.pass).length / first.length : 0;
    if (rate < need) { process.stderr.write(`first-answer pass rate of recorded answers ${(100 * rate).toFixed(0)}% is below --min-pass ${floor}\n`); code = 1; }
  }
  return code;
}

function harvestCommand(argv: string[]): number {
  const { values } = parse(argv, ['runs', 'out'], []);
  if (!values.runs?.[0] || !values.out?.[0]) throw new Usage('harvest needs --runs <builder-runs dir> and --out <file>');
  const loaded = harvest(resolve(values.runs[0]));
  const out = resolve(values.out[0]);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ format: 'studio-replay-corpus/1', entries: loaded.entries }, null, 2) + '\n');
  const first = loaded.entries.filter(entry => entry.attempt === 0).length;
  process.stdout.write(`wrote ${loaded.entries.length} entries (${first} first answers) to ${out}; skipped ${loaded.skipped.length}\n`
    + 'They carry the proposals and designs a person asked for: read them before committing or sharing the file. Briefs and prompts are not copied.\n');
  return 0;
}

async function smokeCommand(argv: string[]): Promise<number> {
  const { values, set } = parse(argv, ['briefs', 'out', 'minutes'], ['stand-in']);
  const { runSmokeCommand } = await import('./studio-replay/smoke-command.mjs');
  return runSmokeCommand({ root, briefs: values.briefs?.[0] ? resolve(values.briefs[0]) : resolve(root, 'tests/fixtures/studio-replay/smoke-briefs.json'), ...(values.out?.[0] ? { out: resolve(values.out[0]) } : {}),
    minutes: values.minutes?.[0] ? Number(values.minutes[0]) : 12, standIn: set.has('stand-in') });
}

const [first, ...rest] = process.argv.slice(2);
try {
  if (first === '--help' || first === '-h') { process.stdout.write(USAGE + '\n'); process.exitCode = 0; }
  else if (first === 'harvest') process.exitCode = harvestCommand(rest);
  else if (first === 'smoke') process.exitCode = await smokeCommand(rest);
  else process.exitCode = replayCommand(first === 'replay' ? rest : process.argv.slice(2));
} catch (error) {
  if (error instanceof Usage) { process.stderr.write(`${error.message}\n${USAGE}\n`); process.exitCode = 2; }
  else { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 2; }
}
