/**
 * The generation smoke: real designer answers, to the same checks, with the Skill and prompts as they are on disk now.
 *
 * It runs the studio's own workflow (AgentBuilderWorkflow, the class the product runs) for each brief up to the point
 * where a design is accepted and frozen, and reports how often the host took the designer's answer the first time. The
 * code role never runs, no plugin is built or installed. The agent is injected: smoke-command.mts hands it a Prologue
 * agent on an isolated Home; tests/studio-replay.test.ts hands it a scripted one.
 *
 * Real models answer differently every time, so one run is a sample, not a number to compare to the digit: run the same
 * briefs before and after a Skill edit and read the repair rounds, not a single pass/fail.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertContract } from '@molis-ai/molis-work-plugin-sandbox';
import { AgentBuilderWorkflow, STUDIO_CAPABILITIES, type AgentBuild, type AgentBuilderPorts, type CatalogEntry } from '@molis-ai/molis-work-plugin-builder';
import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import { mountedSkill } from './skill.mjs';
import type { Baseline } from './replay.mjs';

export interface SmokeBrief { id: string; brief: string }
export type SmokeAgent = Awaited<ReturnType<AgentBuilderPorts['agent']>>;
export interface SmokeOptions {
  briefs: readonly SmokeBrief[];
  /** The designer agent. Asked for once per request; closed after it. */
  agent(): Promise<SmokeAgent>;
  model: { provider_id: string; model_id: string; label: string };
  skill?: AgentBuilderPorts['skill'];
  prompt?: AgentBuilderPorts['prompt'];
  /** How long one brief may take before it is stopped and reported as unfinished. */
  minutes: number;
  pollMs?: number;
  progress?(line: string): void;
}
export type SmokeOutcome = 'designed' | 'failed' | 'unfinished';
export interface SmokeBriefResult {
  id: string; outcome: SmokeOutcome; elapsedMs: number;
  /** Designer requests made, and how many of them were repair requests after the host refused an answer. */
  designerRuns: number; repairRounds: { propose: number; experience: number; detail: number };
  /** Stage by stage: true when the host took the first answer. */
  firstTry: { propose: boolean; experience: boolean | null; detail: boolean | null };
  repairs: string[];
  error?: string;
  designSummary?: string;
}
export interface SmokeReport {
  format: 'studio-replay-smoke/1';
  at: string; model: string;
  skill: NonNullable<Baseline['skill']>;
  briefs: SmokeBriefResult[];
  summary: { briefs: number; designed: number; detailFirstTry: number; repairRounds: number };
}

function memoryStorage(): PluginPrivateStorage {
  const values = new Map<string, string>();
  return { get: key => values.get(key) ?? null, set: (key, value) => { values.set(key, value); }, delete: key => values.delete(key),
    compareAndSet: (key, expected, value) => { if ((values.get(key) ?? null) !== expected) return false; values.set(key, value); return true; } };
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const DESIGN_ONLY = '生成冒烟只做到设计冻结，不写代码、不构建';

/** The studio's own capabilities as the catalog entries a project's directory would offer for them. */
const studioCatalog = (): CatalogEntry[] => STUDIO_CAPABILITIES.map(item => ({ id: item.id, title: item.title, description: item.description, source: '平台', input: item.input, output: item.output, execution: item.execution }) as CatalogEntry);

async function designOne(options: SmokeOptions, item: SmokeBrief): Promise<SmokeBriefResult> {
  const scratch = mkdtempSync(join(tmpdir(), 'studio-replay-smoke-')), started = Date.now();
  const ports: AgentBuilderPorts = {
    projectId: 'studio-replay-smoke', presentation: true, catalog: async () => studioCatalog(), models: async () => [options.model],
    // The code role never runs; after the design is frozen the workflow's next designer request (the UI stage) is not wanted either.
    agent: async (build, purpose) => { if (purpose === 'code' || build.design) throw new Error(DESIGN_ONLY); return options.agent(); },
    ...(options.skill ? { skill: options.skill } : {}), ...(options.prompt ? { prompt: options.prompt } : {}),
    validateContract: contract => assertContract(contract), prepareBuild: async () => scratch,
    check: async () => { throw new Error(DESIGN_ONLY); }, call: async () => { throw new Error(DESIGN_ONLY); }, resetPreview: async () => {},
    browserAcceptance: async () => { throw new Error(DESIGN_ONLY); }, publish: async () => { throw new Error(DESIGN_ONLY); }, installations: async () => [], lifecycle: async () => {},
  };
  const workflow = new AgentBuilderWorkflow(memoryStorage(), ports);
  let build: AgentBuild = workflow.create(item.brief), answered = false;
  try {
    const deadline = started + options.minutes * 60_000;
    for (;;) {
      build = workflow.store.require(build.id);
      if (build.design || (build.phase === 'failed')) break;
      if (build.phase === 'clarifying' && !build.active && !answered) { answered = true; await workflow.action(build.id, { action: 'message', message: item.brief + '。采用最直接的单人使用方案即可。' }); }
      else if (build.phase === 'choosing' && !build.active && build.candidates[0]) await workflow.action(build.id, { action: 'choose', revision: build.revision, candidateId: build.candidates[0].id });
      if (Date.now() > deadline) { await workflow.action(build.id, { action: 'pause' }).catch(() => undefined); break; }
      await sleep(options.pollMs ?? 500);
      options.progress?.(`${item.id}: ${build.phase}${build.active ? ' (' + build.active.stage + ')' : ''}`);
    }
    build = workflow.store.require(build.id);
    const repairs = build.steps.filter(step => step.action === 'repair'), stage = (prefix: string) => repairs.filter(step => step.id.startsWith(prefix + ':'));
    const ran = (prefix: string) => build.steps.some(step => step.id.startsWith(prefix + ':') && step.status !== 'queued');
    const result: SmokeBriefResult = { id: item.id, outcome: build.design ? 'designed' : build.phase === 'failed' ? 'failed' : 'unfinished', elapsedMs: Date.now() - started,
      designerRuns: build.runs.filter(run => run.role === 'designer').length, repairRounds: { propose: stage('design').length, experience: stage('experience').length, detail: stage('detail').length },
      firstTry: { propose: stage('design').length === 0, experience: ran('experience') ? stage('experience').length === 0 : null, detail: build.design ? stage('detail').length === 0 : ran('detail') ? false : null },
      repairs: repairs.map(step => `${step.id.split(':')[0]}: ${step.detail ?? step.label}`),
      ...(build.design ? { designSummary: `${build.design.contract.operations.length} operations, ${build.design.parts.length} parts, ${build.design.acceptance.length} acceptance cases` } : {}) };
    // After the design is frozen the workflow tries to build it, which the smoke refuses by design; that is not the design's failure.
    if (build.error && !build.design) result.error = build.error;
    return result;
  } finally { await workflow.close().catch(() => undefined); rmSync(scratch, { recursive: true, force: true }); }
}

export async function runSmoke(options: SmokeOptions): Promise<SmokeReport> {
  const briefs: SmokeBriefResult[] = [];
  for (const item of options.briefs) { options.progress?.(`${item.id}: starting`); briefs.push(await designOne(options, item)); }
  return { format: 'studio-replay-smoke/1', at: new Date().toISOString(), model: options.model.model_id, skill: mountedSkill(), briefs,
    summary: { briefs: briefs.length, designed: briefs.filter(item => item.outcome === 'designed').length, detailFirstTry: briefs.filter(item => item.firstTry.detail === true).length,
      repairRounds: briefs.reduce((sum, item) => sum + item.repairRounds.propose + item.repairRounds.experience + item.repairRounds.detail, 0) } };
}

export function renderSmoke(report: SmokeReport): string {
  const lines = [`Generation smoke: ${report.summary.designed}/${report.summary.briefs} briefs reached a frozen design with ${report.model}; ${report.summary.detailFirstTry} full designs accepted on the first answer; ${report.summary.repairRounds} repair rounds in all`];
  for (const item of report.briefs) {
    const tries = `propose ${item.firstTry.propose ? 'first try' : item.repairRounds.propose + ' repairs'}, experience ${item.firstTry.experience === null ? 'not run' : item.firstTry.experience ? 'first try' : item.repairRounds.experience + ' repairs'}, detail ${item.firstTry.detail === null ? 'not reached' : item.firstTry.detail ? 'first try' : item.repairRounds.detail + ' repairs'}`;
    lines.push(`  ${item.id.padEnd(16)} ${item.outcome.padEnd(10)} ${(item.elapsedMs / 1000).toFixed(0).padStart(4)}s  ${tries}${item.designSummary ? '  [' + item.designSummary + ']' : ''}${item.error ? '  ' + item.error : ''}`);
    for (const repair of item.repairs) lines.push(`      repair ${repair.slice(0, 200)}`);
  }
  lines.push(`Skill/prompts this run mounted: ${Object.entries(report.skill.stages).map(([stage, mount]) => `${stage} ${mount.version}`).join(', ')}; designer ${report.skill.prompts.designer}`);
  return lines.join('\n') + '\n';
}
