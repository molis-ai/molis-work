import { CHARACTER_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/characters";
import { SESSIONS_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/sessions";

/**
 * The platform's own pages that no Manifest declares (44C M15): 成果库, 角色 and 外部会话. One row each, read by the Host (the reserved
 * ids and project keys, the served programs, the HTTP routes) and by the shell (navigation, directory data, search rows), so a page added
 * here is complete or does not compile. The pages the shell frames like a plugin's (the studio, Shelf) are `HostSurfaceRegistration`s,
 * because they have a Manifest.
 */
export interface PlatformSurface {
  /** The key the page has in the shell. It belongs to the platform: no plugin may take it as its project key. */
  readonly id: string;
  /** The provider of its actions, which no package may take as its id. */
  readonly provider_id: string;
  /** Whether other owners' objects may be placed on it. */
  readonly accepts_objects: boolean;
  /** The program the Host serves for it. `on_show`: the deferred loader mounts it when the page first shows, not a loader of its own. */
  readonly client?: { readonly path: `/assets/${string}.js`; readonly on_show: boolean };
  /** The row a search hit is opened from: its selector and the data attribute that carries the id. */
  readonly search_row?: { readonly selector: string; readonly attribute: string };
}

export const PLATFORM_SURFACES = [
  { id: "artifacts", provider_id: "system.artifacts", accepts_objects: true },
  // The settings pages load it themselves (Settings › 角色, 项目设置 › 角色); the address is its plugin pack's (CHR-1 D5, BL-378).
  { id: "characters", provider_id: CHARACTER_PLUGIN_ID, accepts_objects: false,
    client: { path: "/assets/molis-work-plugins/characters.js", on_show: false }, search_row: { selector: "[data-character-id]", attribute: "characterId" } },
  { id: "sessions", provider_id: SESSIONS_PROVIDER_ID, accepts_objects: false,
    client: { path: "/assets/molis-work-plugins/sessions.js", on_show: true }, search_row: { selector: "[data-session-key]", attribute: "sessionKey" } },
] as const satisfies readonly PlatformSurface[];

export type PlatformSurfaceId = typeof PLATFORM_SURFACES[number]["id"];
/** The surfaces the Host serves a program for, and the addresses it serves them at. */
export type PlatformSurfaceClient = Extract<typeof PLATFORM_SURFACES[number], { readonly client: unknown }>;
export type PlatformSurfaceClientPath = PlatformSurfaceClient["client"]["path"];

/** The surface with this shell key, or undefined when the key is not the platform's. */
export function platformSurface(id: string): PlatformSurface | undefined {
  return PLATFORM_SURFACES.find(surface => surface.id === id);
}
