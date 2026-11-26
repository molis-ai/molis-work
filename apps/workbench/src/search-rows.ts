import { PLATFORM_SURFACES, type PlatformSurface } from "@molis-ai/molis-work-ui-host";
import { pluginRecordRows, pluginSearchRows } from "./plugin-workbench.js";

/** The rows a record opens from on its plugin's page, as the plugins declare them (`recordRow`). */
export function recordRows(): Array<[string, string, string]> {
  return pluginRecordRows();
}

/** Every row a search hit is opened from: the plugins' declared `searchRow`s, then the platform's own pages'. */
export function searchRows(): Array<[string, string, string]> {
  return [...pluginSearchRows(), ...PLATFORM_SURFACES.flatMap((surface: PlatformSurface): [string, string, string][] =>
    surface.search_row ? [[surface.id, surface.search_row.selector, surface.search_row.attribute]] : [])];
}
