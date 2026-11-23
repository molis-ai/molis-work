import type { HostSurfaceRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { studioSurface } from "@molis-ai/molis-work-plugin-studio/surface";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";

/**
 * The platform's own surfaces the shell frames like a plugin's page, in every project (47-1 C): the plugin studio. Not plugins:
 * they are in no plugin catalog, Settings › 插件, market or project plugin list, and nobody turns them on or off.
 */
export const HOST_FRAMED_SURFACES: readonly HostSurfaceRegistration[] = [studioSurface];

/** What the shell frames: the built-in plugins' workbench parts, then the platform's own framed surfaces. */
export const WORKBENCH_SURFACE_CATALOG: readonly HostSurfaceRegistration[] = [...BUILTIN_PLUGIN_CATALOG, ...HOST_FRAMED_SURFACES];
