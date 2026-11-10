import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { DirectoryWordResolver } from "@molis-ai/molis-work-ui-host";

type CatalogTextScope = <T>(manifest: PluginManifest, draw: (resolve?: DirectoryWordResolver) => T) => T;
let catalogTextScope: CatalogTextScope | undefined;

/** The host binds static, registered catalog contributions to their own packaged source. */
export function installCatalogTextScope(scope: CatalogTextScope): void {
  if (catalogTextScope && catalogTextScope !== scope) throw new Error("Workbench catalog text scope already installed");
  catalogTextScope = scope;
}

export function drawCatalogText<T>(manifest: PluginManifest, draw: (resolve?: DirectoryWordResolver) => T): T {
  return catalogTextScope ? catalogTextScope(manifest, draw) : draw();
}
