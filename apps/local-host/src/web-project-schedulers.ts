import fs from "node:fs";
import { readUpgradeStore } from "@molis-ai/molis-work-storage";
import { nextScheduleDueAt } from "@molis-ai/molis-work-service-scheduler";
import { repeatingFailure } from "./host-log.js";
import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { bindProjectSchedulers } from "./project-schedulers.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { ResolvedWebBoardOptions, ProjectScheduleRuntime } from "./web-types.js";
import type { PeriodicTasks } from "./periodic-tasks.js";

const ROUND_MS = 30_000;
/** How long an open project nobody uses stays open (batch 103-1), as the Agent studio keeps its runtime (`STUDIO_IDLE_MS`). */
const PROJECT_IDLE_MS = 10 * 60_000;

/** One service timer over the Host's projects, independent of page visits: open ones are ticked, a closed one is opened when its clock has something due. */
export function startWebProjectSchedulers(options: {
  localHost: MolisWorkLocalHost; homeDirectory: string; withCatalog: LocalWebCatalogRunner;
  fixture: ResolvedWebBoardOptions | null;
  periodic: PeriodicTasks;
  changed(databasePath: string): void;
  onError(error: unknown): void;
  /** How long an unused open project stays open; `PROJECT_IDLE_MS` unless a test sets it. */
  idleMs?: number;
}) {
  const { localHost, homeDirectory, withCatalog, fixture, changed } = options;
  const runtimes = new Map<string, ProjectScheduleRuntime>();
  const unbind = bindProjectSchedulers(localHost, { home: homeDirectory, runtimes, changed });
  let stopped = false, stopping: Promise<void> | undefined, opening: Promise<void> | undefined;
  // A project is opened for its schedules only when something in it is due (batch 103-1): when the Host started, every project with a
  // database was opened before the first round and stayed open. What is due is read from the project's own clock table, read only and
  // without opening the project (`nextDueAt`), so the fact keeps one owner; a project already open is ticked as before.
  // A project that will not open is skipped: the ones after it still open and the round runs, and the next interval tries it
  // again. Its failure is reported when it starts failing and again only once it has opened since, so a broken store is not reported
  // every 30 seconds. A catalog that cannot be read fails the whole open, tried again too.
  const failingOpens = new Set<string>();
  const dueClocks = new Map<string, { identity: string; next: string | null }>();
  const isDue = (databasePath: string, now: string) => {
    const read = nextDueAt(databasePath, dueClocks);
    return read === "unreadable" || (read !== null && read <= now);
  };
  const openDue = () => {
    if (opening) return opening;
    const run = runWithMolisWorkHome(homeDirectory, async () => {
      const projects = fixture ? [{ database_path: fixture.databasePath, project_id: fixture.projectId }]
        : await withCatalog({ homeDirectory }, catalog => catalog.listProjects());
      const now = new Date().toISOString(), listed = new Set(projects.map(project => project.database_path));
      for (const path of dueClocks.keys()) if (!listed.has(path)) dueClocks.delete(path);
      for (const project of projects) {
        if (stopped) break;
        const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
        if (runtimes.has(reference.storage_key) || !fs.existsSync(project.database_path) || !isDue(project.database_path, now)) continue;
        try {
          await localHost.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user", permissions: [] }, reference);
          failingOpens.delete(project.database_path);
        } catch (error) {
          if (stopped || failingOpens.has(project.database_path)) continue;
          failingOpens.add(project.database_path);
          options.onError(error);
        }
      }
    }).finally(() => { if (opening === run) opening = undefined; }).catch((error: unknown) => {
      if (!stopped) options.onError(error);
      throw error;
    });
    opening = run;
    return run;
  };
  // A round that throws throws again every 30 seconds: written when it starts failing, and again once it has run since.
  const rounds = repeatingFailure("schedule", "round_failed");
  const ran = (key: string) => rounds.worked(key);
  const failed = (key: string, schedule: "tasks") => (error: unknown) => rounds.failed(key, error, { schedule });
  // A round starts every project's tick and returns at once: one project's long wakeup (a model call, an outside service) must not
  // hold the next round, so the others keep running every 30 seconds (the scheduler's claim keeps a job from running twice). Only
  // stop() waits for the ticks still in flight.
  const inFlight = new Set<Promise<void>>();
  // How many ticks of each project are still running: a round no longer waits for them, so none of those is put to sleep meanwhile.
  const ticking = new Map<string, number>();
  // After a round, a project nobody has used for `idleMs` and with nothing running is put to sleep, unless its clock is due within the
  // next two rounds: it would only be opened again. A call that comes later opens it, and its clock wakes it when something is due.
  // A round does not wait for its ticks, so a project whose tick is still running is offered when its last tick settles, not before.
  type OpenProject = ReturnType<typeof localHost.projects>[number];
  const offerSleep = async (project: OpenProject) => {
    if (fixture || stopped || project.state !== "ready" || ticking.has(project.storage_key)) return;
    if (isDue(project.storage_key, new Date(Date.now() + 2 * ROUND_MS).toISOString())) return;
    try { await localHost.sleepIfIdle(project, options.idleMs ?? PROJECT_IDLE_MS); }
    catch (error) { if (!stopped) options.onError(error); }
  };
  const sleepIdle = async () => {
    for (const project of localHost.projects()) {
      if (stopped) return;
      await offerSleep(project);
    }
  };
  const round = () => runWithMolisWorkHome(homeDirectory, () => {
    for (const [databasePath, runtime] of runtimes) {
      ticking.set(databasePath, (ticking.get(databasePath) ?? 0) + 1);
      const tracked = withCallId(newCallId(), () => runtime.schedule.tick())
        .then(result => {
          ran(`tasks:${databasePath}`);
          if (!stopped && result.invoked) changed(databasePath);
        })
        .catch(failed(`tasks:${databasePath}`, "tasks"))
        .finally(async () => {
          const left = (ticking.get(databasePath) ?? 1) - 1;
          if (left > 0) ticking.set(databasePath, left);
          else {
            ticking.delete(databasePath);
            const project = fixture ? undefined : localHost.projects().find(open => open.storage_key === databasePath);
            if (project) await offerSleep(project);
          }
          inFlight.delete(tracked);
        });
      inFlight.add(tracked);
    }
  });
  const cancel = options.periodic.every({ id: "projects.schedules", title: "项目里的定时任务", owner: "local-host", intervalMs: ROUND_MS,
    run: () => openDue().then(() => { if (!stopped) return round(); }).then(() => { if (!stopped) return sleepIdle(); }) });
  return { runtimes, stop: () => stopping ??= (async () => {
    stopped = true;
    cancel();
    await opening?.catch(() => undefined);
    await unbind();
    await Promise.all([...inFlight]);
  })() };
}

/**
 * When the earliest enabled job of a project's clock is due, read from the project's own `schedule_jobs` without opening the project:
 * read only, leaving no side files on a closed store (`readUpgradeStore`). Remembered while the file is unchanged. `unreadable`: the
 * store could not be read this way (a new or damaged file); the caller opens the project, whose open reports what is wrong.
 */
function nextDueAt(databasePath: string, remembered: Map<string, { identity: string; next: string | null }>): string | null | "unreadable" {
  // The write-ahead log is part of the file: a write that has not been folded back yet changes only it.
  const stamp = (file: string) => {
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    return stat ? `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}` : "-";
  };
  let identity: string;
  try { identity = `${stamp(databasePath)}|${stamp(`${databasePath}-wal`)}`; } catch { return "unreadable"; }
  const known = remembered.get(databasePath);
  if (known?.identity === identity) return known.next;
  try {
    const next = readUpgradeStore(databasePath, nextScheduleDueAt);
    remembered.set(databasePath, { identity, next });
    return next;
  } catch {
    remembered.delete(databasePath);
    return "unreadable";
  }
}
