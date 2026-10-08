/**
 * `pnpm studio:replay smoke`: the guards and the wiring around smoke.mts. The smoke uses a model the person has put
 * into an isolated Home; it never looks at the real Home, the system key store, or credentials in the environment.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SmokeBrief } from './smoke.mjs';

export interface SmokeCommandOptions { root: string; briefs: string; out?: string; minutes: number; standIn?: boolean }

const real = (path: string) => { try { return realpathSync(path); } catch { return resolve(path); } };

/** How to give the isolated Home a model, printed whenever the smoke has none. */
const HOW = (home: string) => [
  'To run it, put a text model with its key into that isolated Home yourself, then run the command again:',
  `  1. MOLIS_WORK_HOME=${home} MOLIS_WORK_SECRET_BACKEND=file pnpm web --port <a free port>`,
  '  2. open the printed address, 设置 → 模型设置 (AI group; apps/workbench/src/settings-sections.ts, id "models"), add a provider and key, then stop the server',
  `  3. MOLIS_WORK_HOME=${home} MOLIS_WORK_SECRET_BACKEND=file pnpm studio:replay smoke`,
  'The key stays in that Home\'s own file secret store. Nothing is copied from the real Home and nothing is printed.'].join('\n');

export async function runSmokeCommand(options: SmokeCommandOptions): Promise<number> {
  const refuse = (line: string) => { process.stderr.write('REFUSED: ' + line + '\n'); return 2; };
  if (!(options.minutes > 0 && options.minutes <= 30)) return refuse('--minutes is a number in (0, 30]');
  if (process.env.MOLIS_WORK_SECRET_BACKEND !== 'file') return refuse('MOLIS_WORK_SECRET_BACKEND must be "file" so the system key store and its real keys are not touched.');
  if (!existsSync(options.briefs)) return refuse(`no briefs file at ${options.briefs}`);
  const parsed = JSON.parse(readFileSync(options.briefs, 'utf8')) as { briefs?: SmokeBrief[] };
  const briefs = parsed.briefs ?? [];
  if (!briefs.length || briefs.some(item => typeof item?.id !== 'string' || typeof item?.brief !== 'string')) return refuse(`${options.briefs} needs { "briefs": [{ "id", "brief" }, ...] }`);
  if (options.standIn) return withStandIn(options, briefs);

  const requested = process.env.MOLIS_WORK_HOME?.trim();
  if (!requested) return refuse('MOLIS_WORK_HOME is not set. The smoke only runs on an isolated Home (a scratch directory), never on the default one.\n' + HOW('<scratch dir>'));
  const home = resolve(requested);
  if (real(home) === real(join(homedir(), '.molis-work'))) return refuse(`MOLIS_WORK_HOME is the real Home (${home}). Point it at a scratch directory.`);
  return execute(home, briefs, options, false);
}

/** The wiring check: a throwaway Home and a scripted local model, no key and no cost. */
async function withStandIn(options: SmokeCommandOptions, briefs: SmokeBrief[]): Promise<number> {
  const { startStandInModel, configureStandInHome, standInAnswers } = await import('./stand-in.mjs');
  const home = mkdtempSync(join(tmpdir(), 'studio-replay-stand-in-')), standIn = await startStandInModel(standInAnswers(resolve(options.root, 'tests/fixtures/studio-replay/corpus.json')));
  process.env.MOLIS_WORK_HOME = home;
  try {
    configureStandInHome(home, standIn.address);
    process.stdout.write('STAND-IN MODEL: a scripted local model answers with fixed valid designs. This checks the wiring (Home, model, agent, workflow, report), not any Skill or prompt.\n');
    return await execute(home, briefs, options, true);
  } finally { await standIn.close(); rmSync(home, { recursive: true, force: true }); }
}

async function execute(home: string, briefs: SmokeBrief[], options: SmokeCommandOptions, standIn: boolean): Promise<number> {
  const say = (line: string) => process.stdout.write(line + '\n');
  // Heavy modules only now: the refusals above must not depend on a built product.
  const { openConfiguredModels, selectConfiguredTextModel } = await import('../../apps/local-host/src/configured-models.js');
  const opened = existsSync(home) ? openConfiguredModels(home) : undefined;
  const chosen = opened && selectConfiguredTextModel(home, opened.store);
  opened?.storage.close();
  if (!chosen) {
    say(`SKIP: the isolated Home ${home} has no enabled text model with a usable key, so no real generation was run.`);
    say(HOW(home));
    return 0;
  }
  const selection = { provider_id: chosen.provider.provider_id, model_id: chosen.model.model_id };
  const configuration = () => { const db = openConfiguredModels(home); try { return db?.store.resolveConfiguration(selection) ?? null; } finally { db?.storage.close(); } };
  const { createPrologueNodeAdapter, prologueModelConfiguration, AgentReviewQueue } = await import('@molis-ai/molis-work-service-agent-host');
  const { runSmoke, renderSmoke } = await import('./smoke.mjs');
  const { builderSkill } = await import('../../apps/local-host/src/plugin-builder/skill.js');
  const work = join(home, 'studio-replay'), runs = join(work, 'runs'), design = join(work, 'design');
  mkdirSync(runs, { recursive: true, mode: 0o700 }); mkdirSync(design, { recursive: true, mode: 0o700 });
  // The model and its key come from the isolated Home only, through these two ports; the key is read when a call needs it and never printed.
  const access = { modelConfiguration: async () => prologueModelConfiguration(configuration()), resolveCredential: (reference: string) => { const config = configuration(); return config?.provider.credential_ref === reference ? config.api_key : null; } };
  const adapter = await createPrologueNodeAdapter({ app: { appId: 'io.molis.work.studio-replay', appVersion: '1.0.0' }, storageRoot: join(work, 'sdk'), reviewQueue: new AgentReviewQueue(), ...access });
  say(`Running ${briefs.length} briefs against ${chosen.model.model_id} (${chosen.provider.display_name}) on ${home}; design only, no plugin is built.`);
  try {
    const report = await runSmoke({ briefs, minutes: options.minutes, pollMs: standIn ? 50 : 500, model: { ...selection, label: chosen.model.model_id }, skill: stage => builderSkill(stage),
      agent: () => adapter.createBuilderAgent({ buildRoot: design, storageRoot: runs, timeoutMs: 600_000, ...access }), progress: line => process.stderr.write(line + '\n') });
    say(renderSmoke(report));
    if (!standIn) say(`The designer's raw answers of this run are kept in ${runs}. To add them to a corpus: pnpm studio:replay harvest --runs ${runs} --out <file> (read the file before committing it).`);
    if (options.out) { mkdirSync(resolve(options.out, '..'), { recursive: true }); writeFileSync(options.out, JSON.stringify({ ...report, standIn }, null, 2) + '\n'); say(`report written to ${options.out}`); }
    return report.summary.designed === 0 ? 1 : 0;
  } finally { await adapter.close(); }
}
