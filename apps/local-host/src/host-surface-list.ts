import type { HostSurfaceRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { shelfSurface } from "@molis-ai/molis-work-module-shelf/surface";
import { studioSurface } from "@molis-ai/molis-work-plugin-studio/surface";

/** A platform surface with the package its words, client assets and (for a hosted one) Home instance come from. */
export type HostSurface = HostSurfaceRegistration & { readonly package_name: string };

/**
 * The platform's own surfaces the shell frames like a plugin's page (47-1 C): the plugin studio, and Shelf, which the runtime also runs
 * in the Home (44B, decision 66). Not plugins: no catalog, settings, market, project membership or install a person makes; their
 * declaration gives their page its requests and words, their prompts their owner, and their data the stores and sync collections they
 * always had. Kept apart from host-surfaces.ts so the plugin registry can list the hosted ones without importing that file.
 */
export const HOST_SURFACE_REGISTRATIONS: readonly HostSurface[] = [
  { ...studioSurface, package_name: "@molis-ai/molis-work-plugin-studio" },
  { ...shelfSurface, package_name: "@molis-ai/molis-work-module-shelf" },
];

/** The surfaces the runtime runs in the Home: those that name the code their instance starts from. */
export const HOSTED_SURFACES: readonly HostSurface[] = HOST_SURFACE_REGISTRATIONS.filter(surface => surface.runtime !== undefined);
