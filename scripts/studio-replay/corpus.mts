/**
 * The corpus of designer answers the studio replay runs through the host's checks.
 *
 * An entry is one raw answer of the plugin builder's designer role, with what the host knew when it was given (the
 * proposal it refines, the actions it could name; the entry field is called `capabilities`, as in the host's catalog
 * type). Three kinds of file load:
 *
 * - a corpus file `{ "format": "studio-replay-corpus/1", "entries": [...] }` (tests/fixtures/studio-replay/corpus.json);
 * - a run record of the Agent host (`<home>/plugin-builder/<project>/runs/<build>/builder-runs/<id>.json`): a designer
 *   run is converted on the fly, so a Home's own history can be replayed without copying it anywhere. Records of the
 *   same task and answer (a retried build keeps its runs again) become one entry: see `LoadedCorpus.merged`;
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
  /** The actions the designer could name (ids, and the execution declaration the host checks). */
  capabilities: CorpusCapability[];
  resources: string[];
  /**
   * `capabilities` was rebuilt from a run record, which keeps only what the designer was shown: the actions given in full
   * plus up to eight example ids per other source. The host checked the answer against the whole directory, so a refusal
   * for an action outside that list may be an artefact of the replay, and an accepted answer was not checked against the
   * actions, or the execution declarations, it was never shown. The report tags such refusals (`replay.mts`, `CATALOG_MISS`).
   */
  shownCatalogOnly?: boolean;
  /** propose: whether the designer may ask questions instead of proposing (the first round). */
  clarificationAllowed?: boolean;
  answer: string;
  promptVersion?: string;
  model?: string;
  /** Synthetic entries that are meant to be refused: the refusal they must keep giving (a regular expression). */
  expectFailure?: string;
  /** What the entry is for. */
  note?: string;
  /** The answer is read from the current code on every run (the prompt's own example), so there is no fixed text to take a digest of. */
  live?: boolean;
}
export const CORPUS_FORMAT = 'studio-replay-corpus/1';

export interface Skipped { file: string; reason: string }
/** An entry that was met again, with the same answer and the same context, in another file: kept once, here is where the other copy was. */
export interface Merged { id: string; kept: string; also: string }
export interface LoadedCorpus { entries: ReplayEntry[]; skipped: Skipped[]; merged: Merged[] }

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const MODES: readonly string[] = ['propose', 'detail', 'revise'];
const isDesignBase = (value: unknown): value is DesignBase => record(value) && ['id', 'title', 'description', 'rationale'].every(key => typeof value[key] === 'string')
  && Array.isArray(value.journey) && value.journey.every(step => typeof step === 'string');

/** Keys in a fixed order, so the same value always serialises to the same text. */
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : record(value) ? `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value) ?? 'null';
/**
 * What an entry is, for the baseline: everything that decides how the host treats it or how the report counts it (the
 * stage, the answer, the context it was given, whether it is a model's own or a hand-written one, the refusal it must
 * keep). Where it came from and what it is for are words about it and are not part of it. A baseline that keeps this
 * digest notices an answer rewritten under the same id, which would otherwise keep its recorded "accepted" for free.
 */
export const entryDigest = (entry: ReplayEntry): string => createHash('sha256').update(canonical({ mode: entry.mode, origin: entry.origin, attempt: entry.attempt, base: entry.base, capabilities: entry.capabilities,
  resources: entry.resources, clarificationAllowed: entry.clarificationAllowed, answer: entry.answer, expectFailure: entry.expectFailure, shownCatalogOnly: entry.shownCatalogOnly })).digest('hex').slice(0, 16);

function checkEntry(raw: unknown, where: string): ReplayEntry {
  if (!record(raw)) throw new Error(`${where}: an entry is an object`);
  const text = (key: string) => { const value = raw[key]; if (typeof value !== 'string' || !value) throw new Error(`${where}: "${key}" is a non-empty string`); return value; };
  const mode = text('mode'); if (!MODES.includes(mode)) throw new Error(`${where}: "mode" is propose, detail or revise`);
  const origin = text('origin'); if (origin !== 'recorded' && origin !== 'synthetic') throw new Error(`${where}: "origin" is recorded or synthetic`);
  // A reply that is plain JSON may be kept readable as "answerJson"; the replayed text is its compact serialisation.
  const answer = raw.answerJson !== undefined ? JSON.stringify(raw.answerJson) : raw.answer;
  if (typeof answer !== 'string') throw new Error(`${where}: "answer" is the raw text of the designer's reply (or "answerJson" for one that is plain JSON)`);
  if (mode !== 'propose' && !record(raw.base)) throw new Error(`${where}: a ${mode} entry needs "base" (the proposal or design it refines)`);
  if (raw.base !== undefined && !isDesignBase(raw.base)) throw new Error(`${where}: "base" has id, title, description and rationale as text and journey as a list of text`);
  const capabilities = Array.isArray(raw.capabilities) ? raw.capabilities : [];
  if (capabilities.some(item => !record(item) || typeof item.id !== 'string')) throw new Error(`${where}: "capabilities" is a list of { id, execution? }`);
  return { id: text('id'), mode: mode as ReplayMode, origin, source: text('source'), attempt: Number.isInteger(raw.attempt) ? raw.attempt as number : 0,
    ...(isDesignBase(raw.base) ? { base: raw.base } : {}), capabilities: capabilities as CorpusCapability[],
    resources: Array.isArray(raw.resources) ? raw.resources.filter((item): item is string => typeof item === 'string') : [], answer,
    ...(typeof raw.clarificationAllowed === 'boolean' ? { clarificationAllowed: raw.clarificationAllowed } : {}), ...(raw.shownCatalogOnly === true ? { shownCatalogOnly: true } : {}),
    ...(typeof raw.promptVersion === 'string' ? { promptVersion: raw.promptVersion } : {}), ...(typeof raw.model === 'string' ? { model: raw.model } : {}),
    ...(typeof raw.expectFailure === 'string' ? { expectFailure: raw.expectFailure } : {}), ...(typeof raw.note === 'string' ? { note: raw.note } : {}) };
}

/** `"id — title"` lines from the catalog summary the designer was shown for actions it was not shown in full (at most eight per source: the rest of the directory is not in the record). */
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
    resources: Array.isArray(task.resources) ? task.resources.filter((item): item is string => typeof item === 'string') : [], answer: run.output, shownCatalogOnly: true,
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

/**
 * Keeps one entry per id. A second entry with the same id is the same task and answer met again (the id of an entry
 * converted from a run record is a digest of both; a corpus file that repeats an entry says the same), so it is merged and
 * reported, never silently dropped and never an error. Two entries that share an id but are not the same entry are a mistake
 * in a corpus file, not something to merge: that throws, naming both files.
 */
class Entries {
  readonly list: ReplayEntry[] = []; readonly merged: Merged[] = [];
  private readonly files = new Map<string, { entry: ReplayEntry; file: string }>();
  add(entry: ReplayEntry, file: string): void {
    const first = this.files.get(entry.id);
    if (!first) { this.files.set(entry.id, { entry, file }); this.list.push(entry); return; }
    if (entryDigest(first.entry) !== entryDigest(entry)) throw new Error(`two corpus entries are called ${entry.id} but are not the same answer (${first.file} and ${file})`);
    this.merged.push({ id: entry.id, kept: first.file, also: file });
  }
}

/** Every `*.json` under the given files and directories, in name order. Directories are walked; `baseline*.json` is not a corpus. */
export function loadCorpus(paths: readonly string[]): LoadedCorpus {
  const entries = new Entries(), skipped: Skipped[] = [];
  const visit = (path: string, listed: boolean) => {
    if (!existsSync(path)) throw new Error(`corpus path does not exist: ${path}`);
    if (statSync(path).isDirectory()) { for (const name of readdirSync(path).sort()) visit(join(path, name), false); return; }
    if (extname(path) !== '.json' || (!listed && /^baseline.*\.json$/.test(basename(path)))) return;
    let text: string;
    // A file met while walking a Home's run history that cannot be read is one more thing not replayed, not the end of the run.
    try { text = readFileSync(path, 'utf8'); } catch (error) { if (listed) throw error; skipped.push({ file: path, reason: 'could not be read' }); return; }
    const loaded = entriesFromFile(path, text, listed);
    for (const entry of loaded.entries) entries.add(entry, path);
    skipped.push(...loaded.skipped);
  };
  for (const path of paths) visit(path, true);
  return { entries: entries.list, skipped, merged: entries.merged };
}

/**
 * Corpus entries from a Home's run history, for committing or keeping. The answers and the proposals they refine are
 * the person's own words in a plugin they asked for: look at them before they leave the machine. Briefs, instructions
 * and the model's activity are never copied. Identical tasks and answers collapse into one entry (the first in name
 * order), and the count of what was merged is reported.
 */
export function harvest(runsDirectory: string): LoadedCorpus {
  const entries = new Entries(), skipped: Skipped[] = [];
  const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(item => item.isDirectory() ? files(join(directory, item.name)) : item.name.endsWith('.json') ? [join(directory, item.name)] : []);
  for (const file of files(runsDirectory)) {
    let text: string;
    try { text = readFileSync(file, 'utf8'); } catch { skipped.push({ file, reason: 'could not be read' }); continue; }
    let json: unknown;
    try { json = JSON.parse(text); } catch { skipped.push({ file, reason: 'not JSON' }); continue; }
    if (!record(json)) { skipped.push({ file, reason: 'not a run record' }); continue; }
    const converted = entryFromRunRecord(json, 'harvested run record');
    if (typeof converted === 'string') skipped.push({ file, reason: converted }); else entries.add(converted, file);
  }
  return { entries: entries.list, skipped, merged: entries.merged };
}
