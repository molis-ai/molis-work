import type { Server } from "node:http";
import type { HostSurfaceDriver } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { createLocalImServer } from "./im-server.js";
import { projectOrNull } from "./catalog-lookup.js";
import { lazyBrowserHost } from "./browser/browser-host.js";
import { BrowserSiteDecisions, registerBrowserSurfaces } from "./browser/browser-surfaces.js";
import { createBrowserSurfaceDriver } from "./browser/surface-driver.js";
import { locateBrowser } from "./browser/locate.js";
import { installComputerDesk } from "./computer/computer-surfaces.js";
import { startWebProjectSchedulers } from "./web-project-schedulers.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { PeriodicTasks } from "./periodic-tasks.js";
import type { MolisWorkWebViewCache } from "./web-view.js";
import type { ResolvedWebBoardOptions } from "./web-types.js";
import { hostLog } from "./host-log.js";

/** Actual Web owners, registered as soon as each exists so partial initialization has the same shutdown path. */
export function createWebStorageResources(options: {
  home: string; localHost: MolisWorkLocalHost; withCatalog: LocalWebCatalogRunner; fixture: ResolvedWebBoardOptions | null;
  periodic: PeriodicTasks; webViewCache: MolisWorkWebViewCache; server(): Server;
  resources: Array<readonly [string, () => unknown]>;
}) {
  const { home, localHost, withCatalog, fixture, periodic, webViewCache, resources } = options;
  const projectSchedulers = startWebProjectSchedulers({ localHost, homeDirectory: home, withCatalog, fixture, periodic,
    changed: database => webViewCache.delete(database), onError: error => hostLog.warn("schedule", "project_schedulers_not_started", error) });
  // Stop new project rounds before waiting for all periodic tasks already in flight.
  resources.unshift(["project-schedules", () => projectSchedulers.stop()]);
  const im = createLocalImServer(home, async id => {
    if (fixture && id === fixture.projectId) return { id, title: fixture.project?.display_name ?? "Molis Work" };
    return withCatalog({ homeDirectory: home }, catalog => {
      const project = projectOrNull(catalog, id);
      return project ? { id: project.project_id, title: project.display_name } : null;
    });
  });
  resources.push(["discussion", () => im.close()]);
  const browserHost = lazyBrowserHost(home, options.server);
  resources.push(["browser", () => browserHost.current()?.close()]);
  const sites = new BrowserSiteDecisions(home), drivers = new Map<string, HostSurfaceDriver>();
  const computer = installComputerDesk(localHost, home, periodic);
  resources.push(["computer", () => computer.close()]);
  const projectExists = async (id: string) => Boolean(fixture && id === fixture.projectId)
    || await withCatalog({ homeDirectory: home }, catalog => projectOrNull(catalog, id) !== null);
  const unregister = registerBrowserSurfaces(localHost, {
    siteDecisions: () => sites.list(),
    driverFor: async projectId => {
      if (!sites.assistantEnabled || !locateBrowser() || !await projectExists(projectId)) return null;
      let driver = drivers.get(projectId);
      if (!driver) drivers.set(projectId, driver = createBrowserSurfaceDriver(browserHost().page(projectId), origin => sites.blocked(origin), () => sites.assistantEnabled));
      return driver;
    },
  });
  resources.push(["browser-surfaces", unregister]);
  return { im, browserHost, sites, computer, projectExists, feedSchedulers: projectSchedulers.runtimes };
}
