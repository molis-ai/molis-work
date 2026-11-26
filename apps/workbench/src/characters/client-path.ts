import type { PlatformSurfaceClient } from "@molis-ai/molis-work-ui-host";

/**
 * Where the Host serves the browser program of 角色: the address its plugin pack had (CHR-1 D5; the name is inexact, BL-378). The
 * settings loader fetches it and the page-asset budget measures it. A value of its own, so the browser program carries no registration;
 * its type is the address the registration gives (`PLATFORM_SURFACES`).
 */
export const CHARACTERS_CLIENT_PATH: Extract<PlatformSurfaceClient, { id: "characters" }>["client"]["path"] = "/assets/molis-work-plugins/characters.js";
