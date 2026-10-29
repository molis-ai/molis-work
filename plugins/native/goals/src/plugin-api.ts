/**
 * Where the project's pages call Goals' own routes: the plugin prefix that carries Goals' plugin id. The page's project prefix
 * joins it; a Goal's page address is `/goals/<goal>` relative to it, and only the plugin id is fixed by the manifest.
 */
export const GOALS_PLUGIN_API = "/api/plugins/io.molis.work.goals";
