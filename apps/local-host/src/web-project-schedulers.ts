import fs from "node:fs";
import { repeatingFailure } from "./host-log.js";
import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { workspaceRefFor } from "./agent-host-composition.js";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { bindProjectSchedulers } from "./project-schedulers.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { ResolvedWebBoardOptions, FeedSchedulerRuntime } from "./web-types.js";
import type { ensureSystemAgentService } from "./system-agent-service.js";
import type { PeriodicTasks } from "./periodic-tasks.js";

/** One service timer over the Host's current project instances, independent of page visits. */
export function startWebProjectSchedulers(options: {
  localHost: MolisWorkLocalHost; homeDirectory: string; withCatalog: LocalWebCatalogRunner;
  fixture: ResolvedWebBoardOptions | null;
  agents: Pick<ReturnType<typeof ensureSystemAgentService>, "agentHost" | "ready">;
  periodic: PeriodicTasks;
  changed(databasePath: string): void;
  onError(error: unknown): void;
}) {
  const { localHost, homeDirectory, withCatalog, fixture, agents, changed } = options;
  const runtimes = new Map<string, FeedSchedulerRuntime>();
  const unbind = bindProjectSchedulers(localHost, { runtimes, changed, agentHost: agents.agentHost, ready: () => agents.ready,
    workspaceFor: projectId => withCatalog({ homeDirectory }, catalog => workspaceRefFor(catalog, projectId)) });
  let stopped = false, stopping: Promise<void> | undefined, opening: Promise<void> | undefined;
  // Every project with a database is opened before the first round, not at start: opening one compiles its contracts and starts its
  // plugins, and the first requests of a launch do not wait behind that. Its schedules only run on a round anyway.
  const openAll = () => opening ??= runWithMolisWorkHome(homeDirectory, async () => {
    const projects = fixture ? [{ database_path: fixture.databasePath, project_id: fixture.projectId }]
      : await withCatalog({ homeDirectory }, catalog => catalog.listProjects());
    for (const project of projects) {
      if (stopped) break;
      if (fs.existsSync(project.database_path)) await localHost.withProject(molisWorkHostProjectReference({
        databasePath: project.database_path, projectId: project.project_id }), () => undefined);
    }
  }).catch(error => { if (!stopped) options.onError(error); });
  // A round that throws throws again every 30 seconds: written when it starts failing, and again once it has run since.
  const rounds = repeatingFailure("schedule", "round_failed");
  const ran = (key: string) => rounds.worked(key);
  const failed = (key: string, schedule: "feed" | "tasks") => (error: unknown) => rounds.failed(key, error, { schedule });
  const round = () => runWithMolisWorkHome(homeDirectory, () => {
    for (const [databasePath, runtime] of runtimes) {
      void runtime.scheduler.tick().then(result => { ran(`feed:${databasePath}`); if (result.completed || result.failed) changed(databasePath); }).catch(failed(`feed:${databasePath}`, "feed"));
      void withCallId(newCallId(), () => runtime.schedule.tick())
        .then(result => { ran(`tasks:${databasePath}`); if (result.invoked) changed(databasePath); }).catch(failed(`tasks:${databasePath}`, "tasks"));
    }
  });
  const cancel = options.periodic.every({ id: "projects.schedules", title: "项目里的定时任务", owner: "local-host", intervalMs: 30_000,
    run: () => openAll().then(() => { if (!stopped) return round(); }) });
  return { runtimes, stop: () => stopping ??= (async () => {
    stopped = true;
    cancel();
    await opening;
    await unbind();
  })() };
}
