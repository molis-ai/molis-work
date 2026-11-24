import type { HostSurfaceRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { studioSurface } from "@molis-ai/molis-work-plugin-studio/surface";
import { shelfSurface } from "@molis-ai/molis-work-module-shelf/surface";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";

/**
 * The platform's own surfaces the shell frames like a plugin's page, in every project (47-1 C): the plugin studio, and Shelf in the
 * side panel (44B). Not plugins: they are in no plugin catalog, Settings › 插件, market or project plugin list, and nobody turns them
 * on or off.
 */
export const HOST_FRAMED_SURFACES: readonly HostSurfaceRegistration[] = [studioSurface, shelfSurface];

/**
 * What the build ships that the runtime runs, for the shell's reads of declarations (settings, words, side tabs, owner states): the
 * built-in plugins, then the platform parts the runtime hosts (Shelf). The catalog alone is for what a person chooses.
 */
export const SHIPPED_WORKBENCH_PARTS: readonly HostSurfaceRegistration[] = [...BUILTIN_PLUGIN_CATALOG, ...HOST_FRAMED_SURFACES.filter(surface => surface.runtime !== undefined)];

/** What the shell frames: the built-in plugins' workbench parts, then the platform's own framed surfaces. */
export const WORKBENCH_SURFACE_CATALOG: readonly HostSurfaceRegistration[] = [...BUILTIN_PLUGIN_CATALOG, ...HOST_FRAMED_SURFACES];
