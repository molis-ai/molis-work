import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { OwnedTextRef, TextRef, UiViewCreateEntry, UiViewDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
import { tryOwnedTextRef } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * What the shell reads of one plugin that runs in the project (W5-06 余项 2, BL-388, BL-542): the declarations of its Manifest
 * that place it, and nothing else. Built-in and installed-at-run-time plugins have this one shape. The Host takes it from the
 * Manifests its Runtimes run, once per page read; it also satisfies the view registry's Manifest subset, so the rail, the
 * create buttons and the project home's starts read it the way they read any Manifest.
 */
export interface PluginDirectoryEntry {
  /** The shell's key for the plugin: a built-in's project key, else the key the Host gave its surface. Safe in an attribute. */
  readonly id: string;
  readonly plugin_id: string;
  readonly name: string;
  readonly summary?: string;
  /** Whether the project's plugin list chooses it (a built-in). Otherwise it is in the project because it runs there. */
  readonly chosen: boolean;
  /**
   * Trusted marks the Host sets from its own registry of built-ins (W5-02 B1), never from a Manifest a package brings: the plugin
   * holds the person's data across projects (`personal`), runs in the Home's Runtime (`home`, from the registration's own Manifest),
   * is on in every project and cannot be turned off (`always_on`), and the project keys it is shown and chosen together with
   * (`companions`). Absent means not marked. Only a `chosen` entry carries them, except `personal` and `home`, which the Host also
   * sets on a package installed in the Home (07-1 S4b, 口径 9); the page uses them to draw and to pre-tick, and the Host's own
   * registry decides what a submitted list means.
   */
  readonly personal?: true;
  readonly home?: true;
  readonly always_on?: true;
  readonly companions?: readonly string[];
  readonly ui: { readonly views: readonly DirectoryView[] };
}

export type DirectoryView = Omit<UiViewDeclaration, "creates" | "start" | "title_text"> & {
  readonly creates?: Pick<UiViewCreateEntry, "station" | "title"> & { readonly label?: string };
  readonly start?: Pick<NonNullable<UiViewDeclaration["start"]>, "title" | "hint" | "icon">;
};
export type PluginDirectory = readonly PluginDirectoryEntry[];

export type DirectoryWordResolver = (reference: Extract<OwnedTextRef, { key: string }>, original: string) => string;
export type DirectoryWordSource = Pick<PluginManifest, "plugin_id" | "name" | "name_text" | "summary" | "summary_text">
  & { readonly ui: Pick<PluginManifest["ui"], "views"> };

/** Project only plain, selected words; a directory never carries a reference or a second language. */
export function projectDirectoryWords(manifest: DirectoryWordSource, resolve?: DirectoryWordResolver): Pick<PluginDirectoryEntry, "name" | "summary" | "ui"> {
  const copy = (original: string, ref?: TextRef): string => {
    const word = tryOwnedTextRef(ref, manifest.plugin_id);
    return word === null ? original : "literal" in word ? word.literal : resolve?.(word, original) ?? original;
  };
  const views = (manifest.ui.views ?? []).map(({ title_text, creates, start, ...view }) => {
    const create = creates && { station: creates.station, title: creates.title, label: copy(creates.title, creates.title_text) };
    const opening = start && { title: copy(start.title, start.title_text), hint: copy(start.hint, start.hint_text),
      ...(start.icon ? { icon: start.icon } : {}) };
    return { ...view, title: copy(view.title, title_text), ...(create ? { creates: create } : {}), ...(opening ? { start: opening } : {}) };
  });
  return { name: copy(manifest.name, manifest.name_text), ...(manifest.summary === undefined ? {} : { summary: copy(manifest.summary, manifest.summary_text) }), ui: { views } };
}
