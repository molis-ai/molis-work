import { t as uiText, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { PLATFORM_SURFACES, type PlatformSurface, type PlatformSurfaceClientPath, type PlatformSurfaceId } from "@molis-ai/molis-work-ui-host";
import { renderMolisWorkCharactersClientScript } from "./characters/client-asset.js";
import { workbenchNavigationLabel } from "./navigation-label.js";
import { renderMolisWorkSessionsClientScript } from "./sessions/client-asset.js";

/** A platform page's place in the rail and on tabs: independent of project plugin membership or any Manifest. */
export interface PlatformNavigation {
  readonly id: PlatformSurfaceId;
  readonly provider_id: string;
  readonly glyph: PluginIconName;
  readonly group: "make";
  readonly order: number;
  readonly hue: string;
  /** Text keys: its name and its one-line hint. */
  readonly label: string;
  readonly hint: string;
}

/** Where each of the platform's own pages stands in the shell (`PLATFORM_SURFACES`); null for one that is a settings page. */
const PLACES = {
  artifacts: { glyph: "package", group: "make", order: 60, hue: "pink", label: "workbench.artifacts.navigation-name", hint: "workbench.artifacts.navigation-hint" },
  characters: null,
  sessions: { glyph: "history", group: "make", order: 65, hue: "indigo", label: "workbench.sessions.navigation-name", hint: "workbench.sessions.navigation-hint" },
} as const satisfies Readonly<Record<PlatformSurfaceId, Omit<PlatformNavigation, "id" | "provider_id"> | null>>;

/** The platform's own pages that have a place in the rail, in the registration's order. */
export const PLATFORM_NAVIGATION: readonly (PlatformNavigation & Pick<PlatformSurface, "accepts_objects">)[] = PLATFORM_SURFACES.flatMap(({ id, provider_id, accepts_objects }) => {
  const place = PLACES[id];
  return place ? [{ id, provider_id, accepts_objects, ...place }] : [];
});

/** Its name in the page's language; the default language's where a page reads the placement before a Host gave it a language. */
export function platformNavigationLabel(id: PlatformSurfaceId): string {
  const key = PLACES[id]?.label;
  if (!key) throw new Error(`platform surface ${id} has no place in the rail`);
  return workbenchNavigationLabel(key, () => uiText.text(key));
}

/** Each served program, by the address the registration gives it. */
const CLIENTS: Readonly<Record<PlatformSurfaceClientPath, () => string>> = {
  "/assets/molis-work-plugins/characters.js": renderMolisWorkCharactersClientScript,
  "/assets/molis-work-plugins/sessions.js": renderMolisWorkSessionsClientScript,
};

export function platformSurfaceClientScript(path: PlatformSurfaceClientPath): string {
  return CLIENTS[path]();
}
