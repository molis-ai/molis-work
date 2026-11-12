import { networkInterfaces } from "node:os";
import { ActionError, RUN_DECISION_INPUT_TYPE, RUN_DECISION_OUTPUT_TYPE, RUNS_OVERVIEW_INPUT_TYPE, RUNS_OVERVIEW_OUTPUT_TYPE, type ActionReference, type ActionView,
  type MissedRun, type RunDecided, type RunDecision, type RunsOverview, type RunsWindow, type ScheduledRun } from "@molis-ai/molis-work-contracts/platform/actions";
import { beforeDeadline, collectHomeAggregate, type HomeAggregatePorts } from "./home-aggregate.js";
import type { RuntimeGap } from "./host-presence.js";

/**
 * What runs on its own here, side by side (specs/proactive-assistant/resident-runtime-design.md §2.2): the owners that declare the runs types
 * (Schedule, Feed, the Assistant's follow-ups …) are found by type, asked once each, and their answers put together with when Molis Work
 * was not running and what a run is waiting for. Nothing here names an owner or reads its record; 「现在做」 and 「跳过」 go back to the
 * owner of that one run, found again by type in the same place.
 */

/** Where an owner lives and how to reach its actions: the project its provider runs in (null: the Home), and the provider. */
export interface RuntimeRunSource { readonly scope_project_id: string | null; readonly provider_id: string; readonly surface: string; readonly title: string }
export interface RuntimeUpcomingRun extends ScheduledRun { readonly source: RuntimeRunSource; readonly waiting: boolean }
export interface RuntimeMissedRun extends MissedRun { readonly source: RuntimeRunSource }
export interface RuntimeOverview {
  readonly state: "running";
  readonly waiting: { readonly network: boolean; readonly model: boolean };
  readonly gaps: readonly RuntimeGap[];
  readonly upcoming: RuntimeUpcomingRun[];
  readonly missed: RuntimeMissedRun[];
  /** An owner that could not answer, by its code only (what it said stays out, S-12); the others are listed as usual. */
  readonly unavailable_sources: Array<{ readonly project_id: string | null; readonly provider_id: string | null; readonly code: string }>;
}

/** The person's own actions in the Home, or in one open project (`work` runs while it stays open; undefined once it is not open). */
export interface RunsClient { discover(): Promise<readonly ActionView[]>; invoke(reference: Required<ActionReference>, input: unknown): Promise<unknown> }
export interface RuntimeOverviewPorts {
  readonly aggregate: HomeAggregatePorts;
  within<T>(projectId: string | null, work: (client: RunsClient) => Promise<T>): Promise<T | undefined>;
  now(): Date;
  /** Whether this computer has a network to reach anything on; false is written as 「没联网」. */
  online(): boolean;
  /** Whether a text model is set to run with; false is written as 「没有可用的模型」. */
  model(): boolean;
  gaps(): readonly RuntimeGap[];
}

/** The runs the panel lists: what comes in the next two days, and what the next day holds for the quit confirmation (the desktop asks for 24 hours). */
const UPCOMING_HOURS = 48;
const UPCOMING_SHOWN = 20;

const SURFACE = /^[a-zA-Z0-9_-]{1,64}$/u;
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const instant = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

function runOf(value: unknown): ScheduledRun | null {
  if (!value || typeof value !== "object") return null;
  const run = value as Partial<Record<keyof ScheduledRun, unknown>>;
  const open = run.open === null ? null : run.open && typeof run.open === "object" ? run.open as { surface?: unknown; id?: unknown } : undefined;
  if (!text(run.run_id, 300) || !text(run.title, 300) || !instant(run.due_at) || !(run.project_id === null || text(run.project_id, 120)) || open === undefined
    || (open && (!text(open.surface, 64) || !SURFACE.test(open.surface) || !text(open.id, 400))) || !Array.isArray(run.needs)) return null;
  const needs = run.needs.filter((need): need is ScheduledRun["needs"][number] => need === "network" || need === "model");
  return { run_id: run.run_id, title: run.title, due_at: run.due_at, project_id: run.project_id, open: open ? { surface: open.surface as string, id: open.id as string } : null, needs };
}

/** One owner's answer as rows, or null when it sent something the panel cannot draw. A project owner's runs are that project's, whatever it says. */
function rowsOf(output: unknown, scopeProjectId: string | null, providerId: string): { upcoming: Array<ScheduledRun & { source: RuntimeRunSource }>; missed: RuntimeMissedRun[] } | null {
  if (!output || typeof output !== "object") return null;
  const answer = output as Partial<Record<keyof RunsOverview, unknown>>;
  const source = answer.source as { surface?: unknown; title?: unknown } | undefined;
  if (!source || !text(source.surface, 64) || !SURFACE.test(source.surface) || !text(source.title, 200) || !Array.isArray(answer.upcoming) || !Array.isArray(answer.missed)) return null;
  const owner: RuntimeRunSource = { scope_project_id: scopeProjectId, provider_id: providerId, surface: source.surface, title: source.title };
  const own = <R extends ScheduledRun>(run: R): R => scopeProjectId === null ? run : { ...run, project_id: scopeProjectId };
  const upcoming = answer.upcoming.map(runOf).filter((run): run is ScheduledRun => run !== null).map(run => ({ ...own(run), source: owner }));
  const missed = answer.missed.flatMap((value: unknown) => {
    const run = runOf(value), missedAt = value && typeof value === "object" ? (value as { missed_at?: unknown }).missed_at : undefined;
    return run && instant(missedAt) ? [{ ...own(run), missed_at: missedAt, source: owner }] : [];
  });
  return { upcoming, missed };
}

const isOverview = (view: ActionView) => view.action.input_type === RUNS_OVERVIEW_INPUT_TYPE && view.action.output_type === RUNS_OVERVIEW_OUTPUT_TYPE;
const isDecision = (view: ActionView) => view.action.input_type === RUN_DECISION_INPUT_TYPE && view.action.output_type === RUN_DECISION_OUTPUT_TYPE;
const referenceOf = (view: ActionView): Required<ActionReference> => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
const codeOf = (error: unknown) => error instanceof ActionError ? error.code : "actions.execution_failed";

export async function runtimeOverview(ports: RuntimeOverviewPorts, signal?: AbortSignal): Promise<RuntimeOverview> {
  const now = ports.now(), window: RunsWindow = { now: now.toISOString(), upcoming_until: new Date(now.getTime() + UPCOMING_HOURS * 3_600_000).toISOString() };
  const upcoming: Array<ScheduledRun & { source: RuntimeRunSource }> = [], missed: RuntimeMissedRun[] = [];
  const unavailable: RuntimeOverview["unavailable_sources"] = [];
  const take = (output: unknown, scope: string | null, providerId: string) => {
    const rows = rowsOf(output, scope, providerId);
    if (!rows) { unavailable.push({ project_id: scope, provider_id: providerId, code: "actions.output_invalid" }); return; }
    upcoming.push(...rows.upcoming); missed.push(...rows.missed);
  };
  // The project owners, in every open project (their list is a `home_aggregate` query), and the Home's own owners, at the same time.
  const [projects] = await Promise.all([
    collectHomeAggregate<RunsOverview>(ports.aggregate, RUNS_OVERVIEW_OUTPUT_TYPE, window, signal),
    ports.within(null, async client => {
      const views = (await client.discover()).filter(view => isOverview(view) && view.action.scope === "home" && !view.action.home_aggregate);
      await Promise.all(views.map(async view => {
        if (!view.availability.available) { unavailable.push({ project_id: null, provider_id: view.provider.provider_id, code: view.availability.code }); return; }
        try { take(await beforeDeadline(signal, async () => client.invoke(referenceOf(view), window)), null, view.provider.provider_id); }
        catch (error) { signal?.throwIfAborted(); unavailable.push({ project_id: null, provider_id: view.provider.provider_id, code: codeOf(error) }); }
      }));
    }).catch((error: unknown) => { signal?.throwIfAborted(); unavailable.push({ project_id: null, provider_id: null, code: codeOf(error) }); }),
  ]);
  for (const answer of projects.answers) take(answer.output, answer.project_id, answer.source.provider_id);
  for (const issue of projects.issues) unavailable.push({ project_id: issue.project_id, provider_id: issue.source?.provider_id ?? null, code: issue.code });
  const waiting = { network: !ports.online(), model: !ports.model() };
  return {
    state: "running", waiting, gaps: ports.gaps(),
    upcoming: upcoming.sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, UPCOMING_SHOWN)
      .map(run => ({ ...run, waiting: run.needs.some(need => need === "network" ? waiting.network : waiting.model) })),
    missed: missed.sort((a, b) => b.due_at.localeCompare(a.due_at)),
    unavailable_sources: unavailable,
  };
}

/** The request for 「现在做」 or 「跳过」 on one row, as the panel sends it back: where its owner lives, and the run. */
export interface RuntimeRunDecisionRequest extends RunDecision { readonly scope_project_id: string | null; readonly provider_id: string }

export function runtimeRunDecisionRequest(body: Record<string, unknown>): RuntimeRunDecisionRequest {
  const { scope_project_id: scope, provider_id: provider, run_id: run, decision } = body;
  if (!(scope === null || text(scope, 120)) || !text(provider, 200) || !text(run, 300) || (decision !== "run_now" && decision !== "skip"))
    throw new ActionError("actions.input_invalid", "要处理的那件事说得不完整");
  return { scope_project_id: scope, provider_id: provider, run_id: run, decision };
}

/**
 * Hand one decision to the owner of that run: its decision action, found by type under the same provider in the same place. An owner
 * no longer there (the project closed, the plugin turned off) has nothing to decide: the row is `gone` and the panel drops it.
 */
export async function decideRuntimeRun(ports: Pick<RuntimeOverviewPorts, "within">, request: RuntimeRunDecisionRequest): Promise<RunDecided> {
  const decided = await ports.within(request.scope_project_id, async client => {
    const view = (await client.discover()).find(entry => isDecision(entry) && entry.provider.provider_id === request.provider_id && entry.availability.available);
    if (!view) return { state: "gone" } satisfies RunDecided;
    const answer = await client.invoke(referenceOf(view), { run_id: request.run_id, decision: request.decision } satisfies RunDecision) as Partial<RunDecided> | null;
    if (answer?.state !== "started" && answer?.state !== "skipped" && answer?.state !== "gone") throw new ActionError("actions.output_invalid", "这件事的主人没有给出处理结果");
    return { state: answer.state } satisfies RunDecided;
  });
  return decided ?? { state: "gone" };
}

/** A network to reach anything on: an interface that is up and is not this machine's own loopback. */
export function hasNetwork(): boolean {
  return Object.values(networkInterfaces()).some(addresses => addresses?.some(address => !address.internal));
}
