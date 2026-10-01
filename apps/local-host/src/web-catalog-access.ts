import path from "node:path";
import type { MolisWorkProjectCatalog, MolisWorkProjectCatalogOptions } from "./project-catalog.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

/** One connection per Web owner and fixed Home; business reads remain live SQL. */
export function createWebCatalogAccess(
  homeDirectory: string,
  open: (options: MolisWorkProjectCatalogOptions) => Promise<MolisWorkProjectCatalog>,
) {
  let opening: Promise<MolisWorkProjectCatalog> | undefined;
  let ready = false, closing = false, active = 0, projectCount = 0;
  const idle = new Set<() => void>();
  const prepare = () => opening ??= open({ homeDirectory }).then(catalog => {
    try { projectCount = catalog.listProjects().length; ready = true; }
    catch (error) { catalog.close(); throw error; }
    return catalog;
  }).catch(error => { opening = undefined; throw error; });
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
    get ready() { return ready; },
    get projectCount() { return projectCount; },
    warm: () => withCatalog({ homeDirectory }, () => undefined),
    close() {
      closing = true;
      return shutdown ??= (async () => {
        if (active) await new Promise<void>(resolve => idle.add(resolve));
        const catalog = await opening?.catch(() => undefined);
        catalog?.close(); ready = false;
      })();
    },
  };
}
