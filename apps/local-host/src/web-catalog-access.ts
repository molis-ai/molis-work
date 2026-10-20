import { assertPassiveProjectAvailable } from './passive-sync-execution.js';
import path from "node:path";
import type { MolisWorkProjectCatalog, MolisWorkProjectCatalogOptions } from "./project-catalog.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

/** One connection per Web owner and fixed Home; business reads remain live SQL. */
export function createWebCatalogAccess(
  homeDirectory: string,
  open: (options: MolisWorkProjectCatalogOptions) => Promise<MolisWorkProjectCatalog>,
) {
  let opening: Promise<MolisWorkProjectCatalog> | undefined;
  let current: MolisWorkProjectCatalog | undefined;
  let ready = false, closing = false, active = 0, projectCount = 0;
  const idle = new Set<() => void>();
  let retry: ReturnType<typeof setTimeout> | undefined;
  const prepare = () => opening ??= open({ homeDirectory }).then(catalog => {
    try { projectCount = catalog.listProjects().length; current = catalog; ready = true; }
    catch (error) { catalog.close(); throw error; }
    return catalog;
  }).catch(error => {
    opening = undefined;
    // Retry only an unstarted preparation, never the business operation that borrowed it.
    if (!closing && !retry && error.code === "SQLITE_BUSY") {
      retry = setTimeout(() => {
        retry = undefined;
        if (!closing) void withCatalog({ homeDirectory }, () => undefined).catch(() => undefined);
      }, 100);
      retry.unref();
    }
    throw error;
  });
  const withCatalog: LocalWebCatalogRunner = async (options, operation) => {
    if (path.resolve(options.homeDirectory ?? homeDirectory) !== homeDirectory) throw new Error("Web catalog belongs to another Home");
    if (closing) throw new Error("Web catalog is closing");
    active++;
    try {
      const catalog = await prepare();
      catalog.assertCurrentSchema();
      try { return await operation(catalog); }
      finally {
        try { projectCount = catalog.listProjects().length; }
        catch { ready = false; }
      }
    } finally {
      if (--active === 0) { for (const resolve of idle) resolve(); idle.clear(); }
    }
  };
  let shutdown: Promise<void> | undefined;
  return {
    withCatalog,
    /** Synchronous final checks immediately before starting a PTY; never opens or caches business facts. */
    read<T>(operation: (catalog: MolisWorkProjectCatalog) => T): T {
      if (closing || !ready || !current) throw new Error('Web catalog is not ready');
      current.assertCurrentSchema();
      const result = operation(current);
      if (result instanceof Promise) throw new TypeError('Synchronous catalog reads must not return a Promise');
      return result;
    },
    get ready() { return ready; },
    get projectCount() { return projectCount; },
    warm: () => withCatalog({ homeDirectory }, () => undefined),
    close() {
      closing = true;
      clearTimeout(retry); retry = undefined;
      return shutdown ??= (async () => {
        if (active) await new Promise<void>(resolve => idle.add(resolve));
        const catalog = await opening?.catch(() => undefined);
        catalog?.close(); current = undefined; ready = false;
      })();
    },
  };
}

/** The check and native spawn run in one turn; retained panel records cannot reopen recycled projects. */
export function assertTerminalProjectAvailable(access: ReturnType<typeof createWebCatalogAccess> | undefined, home: string, panelId: string): void {
  if (!access) throw new Error('项目目录尚未就绪，不能启动终端');
  access.read(catalog => {
    const panel = catalog.getDesktopPanel(panelId);
    catalog.getProject(panel.project_id);
    assertPassiveProjectAvailable(home, panel.project_id);
  });
}
