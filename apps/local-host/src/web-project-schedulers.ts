import fs from "node:fs";
import { repeatingFailure } from "./host-log.js";
import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { bindProjectSchedulers } from "./project-schedulers.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { ResolvedWebBoardOptions, ProjectScheduleRuntime } from "./web-types.js";
import type { PeriodicTasks } from "./periodic-tasks.js";

/** One service timer over the Host's current project instances, independent of page visits. */
export function startWebProjectSchedulers(options: {
  localHost: MolisWorkLocalHost; homeDirectory: string; withCatalog: LocalWebCatalogRunner;
  fixture: ResolvedWebBoardOptions | null;
  periodic: PeriodicTasks;
  changed(databasePath: string): void;
  onError(error: unknown): void;
}) {
  const { localHost, homeDirectory, withCatalog, fixture, changed } = options;
  const runtimes = new Map<string, ProjectScheduleRuntime>();
  const unbind = bindProjectSchedulers(localHost, { runtimes, changed });
  let stopped = false, stopping: Promise<void> | undefined, opening: Promise<void> | undefined;
  // Every project with a database is opened before the first round, not at start: opening one compiles its contracts and starts its
  // plugins, and the first requests of a launch do not wait behind that. Its schedules only run on a round anyway.
  // A project that will not open is skipped: the ones after it still open and the round runs, and the next interval tries it
  // again (one that already opened is reused). Its failure is reported when it starts failing and again only once it has opened
  // since, so a broken store is not reported every 30 seconds. A catalog that cannot be read fails the whole open, tried again too.
  const failingOpens = new Set<string>();
  const openAll = () => {
    if (opening) return opening;
    const run = runWithMolisWorkHome(homeDirectory, async () => {
      const projects = fixture ? [{ database_path: fixture.databasePath, project_id: fixture.projectId }]
        : await withCatalog({ homeDirectory }, catalog => catalog.listProjects());
      let missed = false;
      for (const project of projects) {
        if (stopped) break;
        if (!fs.existsSync(project.database_path)) continue;
        try {
          await localHost.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user", permissions: [] },
            molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }));
          failingOpens.delete(project.database_path);
        } catch (error) {
          missed = true;
          if (stopped || failingOpens.has(project.database_path)) continue;
          failingOpens.add(project.database_path);
          options.onError(error);
        }
      }
      return missed;
    }).then(missed => { if (missed && opening === run) opening = undefined; }, (error: unknown) => {
      if (opening === run) opening = undefined;
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
  const round = () => runWithMolisWorkHome(homeDirectory, () => {
    for (const [databasePath, runtime] of runtimes) {
      void withCallId(newCallId(), () => runtime.schedule.tick())
        .then(result => { ran(`tasks:${databasePath}`); if (result.invoked) changed(databasePath); }).catch(failed(`tasks:${databasePath}`, "tasks"));
    }
  });
  const cancel = options.periodic.every({ id: "projects.schedules", title: "项目里的定时任务", owner: "local-host", intervalMs: 30_000,
    run: () => openAll().then(() => { if (!stopped) return round(); }) });
  return { runtimes, stop: () => stopping ??= (async () => {
    stopped = true;
    cancel();
    await opening?.catch(() => undefined);
    await unbind();
  })() };
}
