import fs from "node:fs";
import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { workspaceRefFor } from "./agent-host-composition.js";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { bindProjectSchedulers } from "./project-schedulers.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { ResolvedWebBoardOptions, FeedSchedulerRuntime } from "./web-types.js";
import type { ensureSystemAgentService } from "./system-agent-service.js";

/** One service timer over the Host's current project instances, independent of page visits. */
export function startWebProjectSchedulers(options: {
  localHost: MolisWorkLocalHost; homeDirectory: string; withCatalog: LocalWebCatalogRunner;
  fixture: ResolvedWebBoardOptions | null;
  agents: Pick<ReturnType<typeof ensureSystemAgentService>, "agentHost" | "ready">;
  changed(databasePath: string): void;
  onError(error: unknown): void;
}) {
  const { localHost, homeDirectory, withCatalog, fixture, agents, changed } = options;
  const runtimes = new Map<string, FeedSchedulerRuntime>();
  const unbind = bindProjectSchedulers(localHost, { runtimes, changed, agentHost: agents.agentHost, ready: () => agents.ready,
    workspaceFor: projectId => withCatalog({ homeDirectory }, catalog => workspaceRefFor(catalog, projectId)) });
  let stopped = false, stopping: Promise<void> | undefined;
  const startup = runWithMolisWorkHome(homeDirectory, async () => {
    const projects = fixture ? [{ database_path: fixture.databasePath, project_id: fixture.projectId }]
      : await withCatalog({ homeDirectory }, catalog => catalog.listProjects());
    for (const project of projects) {
      if (stopped) break;
      if (fs.existsSync(project.database_path)) await localHost.withProject(molisWorkHostProjectReference({
        databasePath: project.database_path, projectId: project.project_id }), () => undefined);
    }
  });
  void startup.catch(error => { if (!stopped) options.onError(error); });
  const timer = setInterval(() => runWithMolisWorkHome(homeDirectory, () => {
    for (const [databasePath, runtime] of runtimes) {
      void runtime.scheduler.tick().then(result => { if (result.completed || result.failed) changed(databasePath); }).catch(() => undefined);
      void withCallId(newCallId(), () => runtime.schedule.tick())
        .then(result => { if (result.invoked) changed(databasePath); }).catch(() => undefined);
    }
  }), 30_000);
  timer.unref();
  return { runtimes, stop: () => stopping ??= (async () => {
    stopped = true;
    clearInterval(timer);
    await startup.catch(() => undefined);
    await unbind();
  })() };
}
