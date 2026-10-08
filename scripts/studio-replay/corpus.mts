/**
 * The corpus of designer answers the studio replay runs through the host's checks.
 *
 * An entry is one raw answer of the plugin builder's designer role, with what the host knew when it was given (the
 * proposal it refines, the capabilities it could name). Three kinds of file load:
 *
 * - a corpus file `{ "format": "studio-replay-corpus/1", "entries": [...] }` (tests/fixtures/studio-replay/corpus.json);
 * - a run record of the Agent host (`<home>/plugin-builder/<project>/runs/<build>/builder-runs/<id>.json`): a designer
 *   run is converted on the fly, so a Home's own history can be replayed without copying it anywhere;
 * - the older fixture shape `{ "source": "...", "answers": ["<raw answer>", ...] }` (tests/fixtures/builder-designer),
 *   whose answers are first proposals.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

export type ReplayMode = 'propose' | 'detail' | 'revise';
export type ReplayOrigin = 'recorded' | 'synthetic';
export interface DesignBase { id: string; title: string; description: string; rationale: string; journey: string[] }
export interface CorpusCapability { id: string; execution?: { cost?: string; timeout_ms?: number; max_calls_per_minute?: number } }
export interface ReplayEntry {
  id: string;
  mode: ReplayMode;
  /** `recorded`: a model wrote it for a real brief. `synthetic`: written by hand to exercise one host rule. */
  origin: ReplayOrigin;
  /** Where it comes from, for people: the file, the model, the date. */
  source: string;
  /** 0 for the first answer to a task, more for an answer to a repair request. Only attempt 0 counts as a one-shot pass. */
  attempt: number;
  /** detail and revise: the proposal or design the answer refines. */
  base?: DesignBase;
  /** The capabilities the designer could name (ids, and the cost the host checks). */
  capabilities: CorpusCapability[];
  resources: string[];
  /** propose: whether the designer may ask questions instead of proposing (the first round). */
  clarificationAllowed?: boolean;
  answer: string;
  promptVersion?: string;
  model?: string;
  /** Synthetic entries that are meant to be refused: the refusal they must keep giving (a regular expression). */
  expectFailure?: string;
  /** What the entry is for. */
  note?: string;
}
export const CORPUS_FORMAT = 'studio-replay-corpus/1';
export interface Skipped { file: string; reason: string }
export interface LoadedCorpus { entries: ReplayEntry[]; skipped: Skipped[] }

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const MODES: readonly string[] = ['propose', 'detail', 'revise'];

function checkEntry(raw: unknown, where: string): ReplayEntry {
  if (!record(raw)) throw new Error(`${where}: an entry is an object`);
  const text = (key: string) => { const value = raw[key]; if (typeof value !== 'string' || !value) throw new Error(`${where}: "${key}" is a non-empty string`); return value; };
  const mode = text('mode'); if (!MODES.includes(mode)) throw new Error(`${where}: "mode" is propose, detail or revise`);
  const origin = text('origin'); if (origin !== 'recorded' && origin !== 'synthetic') throw new Error(`${where}: "origin" is recorded or synthetic`);
  // A reply that is plain JSON may be kept readable as "answerJson"; the replayed text is its compact serialisation.
  const answer = raw.answerJson !== undefined ? JSON.stringify(raw.answerJson) : raw.answer;
  if (typeof answer !== 'string') throw new Error(`${where}: "answer" is the raw text of the designer's reply (or "answerJson" for one that is plain JSON)`);
  if (mode !== 'propose' && !record(raw.base)) throw new Error(`${where}: a ${mode} entry needs "base" (the proposal or design it refines)`);
  const capabilities = Array.isArray(raw.capabilities) ? raw.capabilities : [];
  if (capabilities.some(item => !record(item) || typeof item.id !== 'string')) throw new Error(`${where}: "capabilities" is a list of { id, execution? }`);
  return { id: text('id'), mode: mode as ReplayMode, origin, source: text('source'), attempt: Number.isInteger(raw.attempt) ? raw.attempt as number : 0,
    ...(record(raw.base) ? { base: raw.base as unknown as DesignBase } : {}), capabilities: capabilities as CorpusCapability[],
    resources: Array.isArray(raw.resources) ? raw.resources.filter((item): item is string => typeof item === 'string') : [], answer,
    ...(typeof raw.clarificationAllowed === 'boolean' ? { clarificationAllowed: raw.clarificationAllowed } : {}),
    ...(typeof raw.promptVersion === 'string' ? { promptVersion: raw.promptVersion } : {}), ...(typeof raw.model === 'string' ? { model: raw.model } : {}),
    ...(typeof raw.expectFailure === 'string' ? { expectFailure: raw.expectFailure } : {}), ...(typeof raw.note === 'string' ? { note: raw.note } : {}) };
}

/** `"id — title"` lines from the catalog summary the designer was shown for capabilities it was not shown in full. */
const summarised = (more: unknown): CorpusCapability[] => (Array.isArray(more) ? more : []).flatMap(group => record(group) && Array.isArray(group.examples) ? group.examples : [])
  .flatMap(line => typeof line === 'string' && /^[\w.-]+/.test(line) ? [{ id: /^[\w.-]+/.exec(line)![0] }] : []);

/**
 * One run record of the Agent host as an entry, or the reason it is not one. The task the designer was given is the
 * record's `input`; its `mode` says which stage asked. Briefs and the instruction text are not carried over.
 */
export function entryFromRunRecord(run: Record<string, unknown>, source: string): ReplayEntry | string {
  if (run.role !== 'designer') return 'not a designer run';
  if (typeof run.input !== 'string' || typeof run.output !== 'string') return 'no task or no answer recorded';
  if (!run.output.trim()) return 'the run recorded no answer' + (typeof run.phase === 'string' ? ` (${run.phase})` : '');
  let task: unknown;
  try { task = JSON.parse(run.input); } catch { return 'the recorded task is not JSON'; }
  if (!record(task) || typeof task.mode !== 'string') return 'the recorded task has no mode';
  if (!MODES.includes(task.mode)) return `stage "${task.mode}" is not a design answer the replay checks`;
  const mode = task.mode as ReplayMode, known = new Map<string, CorpusCapability>();
  for (const item of [...summarised(task.moreCapabilities), ...(Array.isArray(task.capabilities) ? task.capabilities : [])]) {
    if (!record(item) || typeof item.id !== 'string') continue;
    known.set(item.id, { id: item.id, ...(record(item.execution) ? { execution: item.execution as CorpusCapability['execution'] } : {}) });
  }
  const sketch = mode === 'detail' ? task.proposal : mode === 'revise' ? task.current : undefined;
  if (mode !== 'propose' && !record(sketch)) return `a ${mode} task without its ${mode === 'detail' ? 'proposal' : 'current design'}`;
  const words = (key: string) => record(sketch) && typeof sketch[key] === 'string' ? sketch[key] as string : '';
  // A proposal carries all five fields. A revision's base is the design as the designer wrote it, which has no id or
  // rationale of its own; the host's checks need a word in each, and the answer's own fields win over them.
  const journey = record(sketch) && Array.isArray(sketch.journey) ? sketch.journey.filter((item): item is string => typeof item === 'string') : [];
  const base: DesignBase | undefined = record(sketch) ? { id: words('id') || 'current', title: words('title') || 'current design', description: words('description') || 'current design',
    rationale: words('rationale') || 'current design', journey: journey.length ? journey : ['current design'] } : undefined;
  const digest = createHash('sha256').update(run.input).update('\0').update(run.output).digest('hex').slice(0, 12);
  return { id: `${mode}-${digest}`, mode, origin: 'recorded', source, attempt: record(task.repair) ? 1 : 0, ...(base ? { base } : {}), capabilities: [...known.values()],
    resources: Array.isArray(task.resources) ? task.resources.filter((item): item is string => typeof item === 'string') : [], answer: run.output,
    ...(typeof task.clarificationAllowed === 'boolean' ? { clarificationAllowed: task.clarificationAllowed } : {}),
    ...(typeof run.promptVersion === 'string' ? { promptVersion: run.promptVersion } : {}), ...(typeof run.configuredModel === 'string' ? { model: run.configuredModel } : {}) };
}

function entriesFromFile(file: string, text: string, listed: boolean): { entries: ReplayEntry[]; skipped: Skipped[] } {
  const name = basename(file);
  let json: unknown;
  try { json = JSON.parse(text); }
  catch (error) {
    // A file the person named must be readable; one met while walking a directory (a Home's run history) is only skipped.
    if (listed) throw new Error(`${file}: not JSON (${(error as Error).message})`);
    return { entries: [], skipped: [{ file, reason: 'not JSON' }] };
  }
  if (record(json) && json.format === CORPUS_FORMAT) {
    if (!Array.isArray(json.entries)) throw new Error(`${file}: "entries" is a list`);
    return { entries: json.entries.map((item, index) => checkEntry(item, `${file} entry ${index + 1}`)), skipped: [] };
  }
  // The fixture shape of tests/fixtures/builder-designer: real first proposals, no catalog, no brief kept.
  if (record(json) && Array.isArray(json.answers) && json.answers.every(item => typeof item === 'string')) {
    const stem = name.replace(/\.json$/, '');
    return { entries: (json.answers as string[]).map((answer, index) => ({ id: `${stem}#${index + 1}`, mode: 'propose' as const, origin: 'recorded' as const,
      source: `${name}: ${typeof json.source === 'string' ? json.source : 'recorded answers'}`, attempt: 0, capabilities: [], resources: [], clarificationAllowed: true, answer })), skipped: [] };
  }
  if (record(json) && json.role !== undefined) {
    const converted = entryFromRunRecord(json, name);
    return typeof converted === 'string' ? { entries: [], skipped: [{ file, reason: converted }] } : { entries: [converted], skipped: [] };
  }
  return { entries: [], skipped: [{ file, reason: 'neither a corpus file, a run record nor a fixture of answers' }] };
}

/** Every `*.json` under the given files and directories, in name order. Directories are walked; `baseline*.json` is not a corpus. */
export function loadCorpus(paths: readonly string[]): LoadedCorpus {
  const entries: ReplayEntry[] = [], skipped: Skipped[] = [];
  const visit = (path: string, listed: boolean) => {
    if (!existsSync(path)) throw new Error(`corpus path does not exist: ${path}`);
    if (statSync(path).isDirectory()) { for (const name of readdirSync(path).sort()) visit(join(path, name), false); return; }
    if (extname(path) !== '.json' || (!listed && /^baseline.*\.json$/.test(basename(path)))) return;
    const loaded = entriesFromFile(path, readFileSync(path, 'utf8'), listed);
    entries.push(...loaded.entries); skipped.push(...loaded.skipped);
  };
  for (const path of paths) visit(path, true);
  const seen = new Set<string>();
  for (const entry of entries) { if (seen.has(entry.id)) throw new Error(`two corpus entries are called ${entry.id}`); seen.add(entry.id); }
  return { entries, skipped };
}

/**
 * Corpus entries from a Home's run history, for committing or keeping. The answers and the proposals they refine are
 * the person's own words in a plugin they asked for: look at them before they leave the machine. Briefs, instructions
 * and the model's activity are never copied. Identical tasks and answers collapse into one entry.
 */
export function harvest(runsDirectory: string): LoadedCorpus {
  const entries = new Map<string, ReplayEntry>(), skipped: Skipped[] = [];
  const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(item => item.isDirectory() ? files(join(directory, item.name)) : item.name.endsWith('.json') ? [join(directory, item.name)] : []);
  for (const file of files(runsDirectory)) {
    let json: unknown;
    try { json = JSON.parse(readFileSync(file, 'utf8')); } catch { skipped.push({ file, reason: 'not JSON' }); continue; }
    if (!record(json)) { skipped.push({ file, reason: 'not a run record' }); continue; }
    const converted = entryFromRunRecord(json, 'harvested run record');
    if (typeof converted === 'string') skipped.push({ file, reason: converted }); else entries.set(converted.id, converted);
  }
  return { entries: [...entries.values()], skipped };
}
