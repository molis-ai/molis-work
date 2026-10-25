import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

/**
 * The `plugin_id` of every plugin this build ships (S-75, ac-trust T6). A Runtime is given this set so that an install of any other
 * trust level cannot take one of these ids or nest under one, whichever project or Home the plugin is installed in.
 */
export const HOST_PLUGIN_IDS: ReadonlySet<string> = new Set(PLATFORM_PLUGIN_REGISTRATIONS.map(entry => entry.manifest.plugin_id));
