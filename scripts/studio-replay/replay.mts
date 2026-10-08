/**
 * Offline replay of recorded designer answers through the host's design checks, and the comparison with a baseline.
 *
 * What it proves: for answers a model really wrote, the host still accepts the ones it accepted and still refuses
 * (with the same kind of reason) the ones it refused, so a change to the expansion or validation rules cannot quietly
 * start refusing designs that used to pass. What it cannot prove: what a changed Skill or prompt does to the model's
 * next answer. The answers are fixed, so that needs a real model (smoke.mts).
 *
 * The checks mirror `AgentBuilderWorkflow.acceptDesign` and the propose stage in
 * plugins/native/plugin-builder/src/agent-workflow.ts; tests/studio-replay.test.ts drives the real workflow with the
 * same answers and fails if the two ever disagree.
 */
import { assertContract } from '@molis-ai/molis-work-plugin-sandbox';
import { BUILDER_PROMPTS, expandDesign, normalizeProposal, parseModelJson, validateAgentDesign, type CatalogEntry } from '@molis-ai/molis-work-plugin-builder';
import type { DesignBase, ReplayEntry } from './corpus.mjs';

export interface ReplayEnv { validateContract(contract: unknown): void }
export const defaultEnv: ReplayEnv = { validateContract: contract => assertContract(contract) };

export type ReplayStage = 'parse' | 'propose' | 'expand' | 'validate' | 'rework';
export interface ReplayResult {
  id: string; mode: ReplayEntry['mode']; origin: ReplayEntry['origin']; attempt: number;
  pass: boolean;
  /** What a passing answer was: a design, proposals, or questions back to the person. */
  outcome?: 'design' | 'proposals' | 'questions';
  /** Where a refused answer stopped, and the host's own words. */
  stage?: ReplayStage;
  message?: string;
  /** The refusal with names and numbers taken out, so the same kind of refusal groups together. */
  reason?: string;
  /** How many things the host tidied in the answer ("宿主整理" notes). */
  notes: number;
  shape?: string;
}

const PLUGIN_ID = 'io.molis.work.generated.replay', REVISION = 'replay';
const asCatalog = (entry: ReplayEntry): CatalogEntry[] => entry.capabilities.map(item => ({ id: item.id, description: '', ...(item.execution ? { execution: item.execution } : {}) }) as CatalogEntry);

/** A refusal reduced to its kind: identifiers, numbers and quoted names out, so "operation x is unused" and "operation y is unused" group. */
const STRUCTURE = new Set(['JSON', 'query', 'command', 'output', 'includes', 'acceptance', 'summary', 'candidates', 'rework', 'why', 'parts', 'form', 'selection', 'prefill', 'read', 'submit',
  'input', 'effects', 'examples', 'storage', 'select', 'fill', 'expect', 'steps']);
export function reasonKind(message: string): string {
  return message.replace(/第 \d+ 个字符附近：[\s\S]*$/u, '第 # 个字符附近').replace(/「[^」]*」/gu, '「…」').replace(/[A-Za-z_][\w.-]*/gu, word => STRUCTURE.has(word) ? word : 'x')
    .replace(/\d+/gu, '#').replace(/\s+/gu, ' ').trim().slice(0, 70);
}

class Stopped extends Error { constructor(readonly stage: ReplayStage, message: string) { super(message); } }
const at = <T,>(stage: ReplayStage, work: () => T): T => { try { return work(); } catch (error) { throw error instanceof Stopped ? error : new Stopped(stage, error instanceof Error ? error.message : String(error)); } };

function proposeAnswer(entry: ReplayEntry): Pick<ReplayResult, 'outcome' | 'notes' | 'shape'> {
  const value = at('parse', () => parseModelJson(entry.answer)) as Record<string, unknown>;
  return at('propose', () => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('答案不是 JSON 对象');
    if (Array.isArray(value.questions) && value.questions.length) {
      if (entry.clarificationAllowed === false || value.questions.length > 3 || value.questions.some(question => typeof question !== 'string' || !question.trim() || question.length > 1000))
        throw new Error('已经澄清过一次，这次必须直接给出方案，把仍不确定的地方写成假设放进 summary');
      return { outcome: 'questions' as const, notes: 0, shape: `${value.questions.length} questions` };
    }
    const list = Array.isArray(value.candidates) ? value.candidates : Array.isArray(value.proposals) ? value.proposals : null;
    if (!list || list.length < 2 || list.length > 3) throw new Error('初次要给 2–3 个在页面结构或关键行为上有实质差异的方案（candidates）');
    const dropped: string[] = [], ids = entry.capabilities.map(item => item.id);
    const proposals = list.map((item, index) => normalizeProposal(item, index, PLUGIN_ID, dropped));
    if (new Set(proposals.map(item => item.id)).size !== proposals.length) throw new Error('方案标识重复');
    for (const proposal of proposals) for (const capability of proposal.effects.capabilities ?? [])
      if (!ids.includes(capability)) throw new Error(`方案 ${proposal.id} 用了能力目录里没有的「${capability}」；目录为空时只能用插件自己的存储`);
    return { outcome: 'proposals' as const, notes: dropped.length, shape: `${proposals.length} proposals` };
  });
}

function designAnswer(entry: ReplayEntry, env: ReplayEnv): Pick<ReplayResult, 'outcome' | 'notes' | 'shape'> {
  const value = at('parse', () => parseModelJson(entry.answer)), dropped: string[] = [], catalog = asCatalog(entry), base = entry.base as DesignBase;
  const design = at('expand', () => expandDesign(value, base, PLUGIN_ID, REVISION, dropped, catalog));
  const valid = at('validate', () => validateAgentDesign(design, catalog.map(item => item.id), entry.resources, contract => env.validateContract(contract)));
  at('rework', () => {
    const listed = value && typeof value === 'object' && !Array.isArray(value) ? (value as { rework?: unknown }).rework : undefined;
    for (const item of Array.isArray(listed) ? listed : []) {
      const row = item as { op?: unknown; operation?: unknown; why?: unknown; change?: unknown };
      const op = String(row?.op ?? row?.operation ?? ''), why = String(row?.why ?? row?.change ?? '').trim();
      if (!valid.contract.operations.some(operation => operation.id === op)) throw new Error('rework 引用了不存在的操作：' + op);
      if (!why || why.length > 600) throw new Error('rework 的 why 写清要在代码里做的改变（600 字以内）：' + op);
    }
  });
  return { outcome: 'design', notes: dropped.length, shape: `${valid.contract.operations.length} operations, ${valid.parts.length} parts, ${valid.acceptance.length} acceptance cases` };
}

export function replayEntry(entry: ReplayEntry, env: ReplayEnv = defaultEnv): ReplayResult {
  const head = { id: entry.id, mode: entry.mode, origin: entry.origin, attempt: entry.attempt };
  try { return { ...head, pass: true, ...(entry.mode === 'propose' ? proposeAnswer(entry) : designAnswer(entry, env)) }; }
  catch (error) {
    const stopped = error instanceof Stopped ? error : new Stopped('expand', error instanceof Error ? error.message : String(error));
    return { ...head, pass: false, stage: stopped.stage, message: stopped.message, reason: reasonKind(stopped.message), notes: 0 };
  }
}

/** Entries that are always replayed: the worked example the designer prompt itself teaches, which must stay a valid design. */
export function builtinEntries(): ReplayEntry[] {
  const text = BUILDER_PROMPTS.designer.text, marker = '【mode = "detail" 的完整回答示例】', start = text.indexOf(marker);
  if (start < 0) return [{ id: 'prompt-example', mode: 'detail', origin: 'synthetic', source: 'BUILDER_PROMPTS.designer', attempt: 0, capabilities: [], resources: [], answer: '',
    note: `the designer prompt ${BUILDER_PROMPTS.designer.version} no longer has the worked example marker ${marker}` }];
  const from = start + marker.length, example = text.slice(from, text.indexOf('\n\nmode = "propose"', from)).trim();
  return [{ id: 'prompt-example', mode: 'detail', origin: 'synthetic', source: `BUILDER_PROMPTS.designer ${BUILDER_PROMPTS.designer.version}`, attempt: 0, capabilities: [], resources: [], answer: example,
    base: { id: 'quick', title: '随手记', description: '写一句就保存', rationale: '最短路径', journey: ['写', '看'] }, note: 'the worked example in the designer prompt; a prompt edit that breaks it fails here' }];
}

export interface Group { label: string; passed: number; total: number }
export interface Summary {
  total: number; passed: number;
  /** First answers only (attempt 0): the share the host accepted without sending anything back. */
  groups: Group[];
  reasons: Array<{ kind: string; count: number; ids: string[]; stage: ReplayStage | undefined; example: string }>;
  repairRounds: { total: number; passed: number };
}
export function summarise(results: readonly ReplayResult[]): Summary {
  const first = results.filter(result => result.attempt === 0), groups = new Map<string, Group>();
  for (const result of first) {
    const label = `${result.origin} ${result.mode}`, group = groups.get(label) ?? { label, passed: 0, total: 0 };
    group.total++; if (result.pass) group.passed++; groups.set(label, group);
  }
  const reasons = new Map<string, Summary['reasons'][number]>();
  for (const result of results.filter(item => !item.pass)) {
    const row = reasons.get(result.reason!) ?? { kind: result.reason!, count: 0, ids: [], stage: result.stage, example: result.message! };
    row.count++; row.ids.push(result.id); reasons.set(result.reason!, row);
  }
  const repairs = results.filter(result => result.attempt > 0);
  return { total: results.length, passed: results.filter(result => result.pass).length, groups: [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)),
    reasons: [...reasons.values()].sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)), repairRounds: { total: repairs.length, passed: repairs.filter(result => result.pass).length } };
}

export const BASELINE_FORMAT = 'studio-replay-baseline/1';
export interface SkillMount { version: number | null; chars: number | null; error?: string }
export interface Baseline {
  format: typeof BASELINE_FORMAT;
  /** The mounted Skill and prompt versions when the baseline was written: informational, see `skillNotes`. */
  skill?: { stages: Record<string, SkillMount>; prompts: Record<string, string> };
  entries: Record<string, { pass: boolean; reason?: string }>;
  /** Entries taken out of the corpus on purpose, each with why. A passing entry may not just disappear. */
  retired?: Record<string, string>;
}
export function parseBaseline(text: string, where: string): Baseline {
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error(`${where}: not JSON`); }
  const row = json as Partial<Baseline> | null;
  if (!row || row.format !== BASELINE_FORMAT || !row.entries || typeof row.entries !== 'object' || Object.values(row.entries).some(value => typeof value?.pass !== 'boolean'))
    throw new Error(`${where}: not a ${BASELINE_FORMAT} file`);
  for (const [id, why] of Object.entries(row.retired ?? {})) if (typeof why !== 'string' || !why.trim()) throw new Error(`${where}: retired entry ${id} needs the reason it was retired`);
  return row as Baseline;
}
export function baselineFrom(results: readonly ReplayResult[], skill: Baseline['skill'], retired: Baseline['retired']): Baseline {
  const entries = Object.fromEntries([...results].sort((a, b) => a.id.localeCompare(b.id)).map(result => [result.id, result.pass ? { pass: true } : { pass: false, reason: result.reason }]));
  return { format: BASELINE_FORMAT, ...(skill ? { skill } : {}), entries, ...(retired && Object.keys(retired).length ? { retired } : {}) };
}

export interface Comparison {
  /** Each of these fails the check. */
  regressions: string[]; removed: string[]; unrecorded: string[]; behind: string[];
  /** Informational. */
  reasonChanged: string[];
}
/**
 * `baseline` is the committed record; `previous` is the same file as it was at the merge-base, when known. An entry that
 * passed in either must still be in the corpus and still pass, so rewriting the baseline cannot hide a regression.
 */
export function compare(results: readonly ReplayResult[], baseline: Baseline, previous?: Baseline): Comparison {
  const byId = new Map(results.map(result => [result.id, result])), retired = baseline.retired ?? {};
  const out: Comparison = { regressions: [], removed: [], unrecorded: [], behind: [], reasonChanged: [] };
  const mustPass = new Map<string, string>();
  for (const [id, row] of Object.entries(previous?.entries ?? {})) if (row.pass && !(id in retired)) mustPass.set(id, ' (it passed at the base)');
  for (const [id, row] of Object.entries(baseline.entries)) if (row.pass && !(id in retired)) mustPass.set(id, '');
  for (const [id, where] of mustPass) {
    const now = byId.get(id);
    if (!now) out.removed.push(`${id}${where}: no longer in the corpus; to retire it, list it under "retired" in the baseline with the reason`);
    else if (!now.pass) out.regressions.push(`${id}${where}: passed, now refused at ${now.stage}: ${now.message}`);
  }
  for (const result of results) {
    const row = baseline.entries[result.id];
    if (!row) out.unrecorded.push(`${result.id}: not in the baseline; run --write-baseline to record it`);
    else if (!row.pass && result.pass) out.behind.push(`${result.id}: refused before, accepted now; run --write-baseline to keep the gain`);
    else if (!row.pass && !result.pass && row.reason !== result.reason) out.reasonChanged.push(`${result.id}: still refused, for a different reason: ${row.reason} → ${result.reason}`);
  }
  for (const id of Object.keys(baseline.entries)) if (!byId.has(id) && !baseline.entries[id]!.pass && !(id in retired)) out.removed.push(`${id}: refused entry no longer in the corpus; list it under "retired" with the reason, or restore it`);
  return out;
}
export const failures = (comparison: Comparison) => comparison.regressions.length + comparison.removed.length + comparison.unrecorded.length + comparison.behind.length;
