import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_SOURCE_PULL_CONNECTOR_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { isDeliveredIntake, type PersonIntake } from "@molis-ai/molis-work-contracts/platform/actions";
import type { OwnedTextRef, TextRef, UiViewDeclaration, UiViewIntakeEntries } from "@molis-ai/molis-work-contracts/platform/ui";
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
   * and the project keys it is shown and chosen together with (`companions`). Absent means not marked. Only a `chosen` entry carries them, except `personal` and `home`, which the Host also
   * sets on a package installed in the Home (07-1 S4b, 口径 9); the page uses them to draw and to pre-tick, and the Host's own
   * registry decides what a submitted list means.
   */
  readonly home?: true;
  readonly companions?: readonly string[];
  /** What its Manifest says it does with the platform's services, for a page that points at "the plugin that does this" without naming one. */
  readonly offers?: readonly PluginOffer[];
  readonly ui: { readonly views: readonly DirectoryView[] };
}

/** `image_generation`: it draws with the image service; `connector_sources`: it pulls what a connected account holds. */
export const PLUGIN_OFFERS = ["image_generation", "connector_sources"] as const;
export type PluginOffer = (typeof PLUGIN_OFFERS)[number];

export type DirectoryView = Omit<UiViewDeclaration, "title_text"> & UiViewIntakeEntries;
export type PluginDirectory = readonly PluginDirectoryEntry[];

export type DirectoryWordResolver = (reference: Extract<OwnedTextRef, { key: string }>, original: string) => string;
export type DirectoryWordSource = Pick<PluginManifest, "plugin_id" | "name" | "name_text" | "summary" | "summary_text">
  & { readonly ui: Pick<PluginManifest["ui"], "views">; readonly actions?: PluginManifest["actions"];
    readonly permissions?: PluginManifest["permissions"]; readonly image_generation?: PluginManifest["image_generation"] };

/**
 * A person's intakes in Manifest order, with the station whose `create` declares one (contract-design §2.3, §2.4): the blank ones a
 * station makes are 「从目标新建…」's kinds, and the ones with a `start` are the home's starting points.
 */
function personIntakes(manifest: DirectoryWordSource): { readonly intake: PersonIntake; readonly station?: string }[] {
  return (manifest.actions ?? []).flatMap(({ action }) => {
    const intake = action.intake;
    if (!intake || isDeliveredIntake(intake)) return [];
    const station = action.workflow_content?.role === "create" ? action.workflow_content.id : undefined;
    return [{ intake, ...(station ? { station } : {}) }];
  });
}

/** Project only plain, selected words; a directory never carries a reference or a second language. */
export function projectDirectoryWords(manifest: DirectoryWordSource, resolve?: DirectoryWordResolver): Pick<PluginDirectoryEntry, "name" | "summary" | "offers" | "ui"> {
  const copy = (original: string, ref?: TextRef): string => {
    const word = tryOwnedTextRef(ref, manifest.plugin_id);
    return word === null ? original : "literal" in word ? word.literal : resolve?.(word, original) ?? original;
  };
  // A plugin's intakes are placed on its first navigator or island view: where the home and 「从目标新建…」 open it.
  const intakes = personIntakes(manifest), launch = (manifest.ui.views ?? []).find(view => view.slot === "navigator" || view.slot === "island");
  const blank = intakes.find(({ intake, station }) => station && intake.accepts?.length === 0), started = intakes.find(({ intake }) => intake.start);
  const offers: PluginOffer[] = [...(manifest.image_generation ? ["image_generation" as const] : []),
    ...(manifest.permissions?.some(({ permission }) => permission === PLUGIN_SOURCE_PULL_CONNECTOR_PERMISSION) ? ["connector_sources" as const] : [])];
  const views = (manifest.ui.views ?? []).map(declared => {
    const { title_text, ...view } = declared, own = declared === launch;
    const create = own && blank && { station: blank.station!, title: blank.intake.title, label: copy(blank.intake.title, blank.intake.title_text) };
    const start = own ? started?.intake.start : undefined;
    const opening = start && { title: copy(start.title, start.title_text), hint: copy(start.hint, start.hint_text), ...(start.icon ? { icon: start.icon } : {}) };
    return { ...view, title: copy(view.title, title_text), ...(create ? { creates: create } : {}), ...(opening ? { start: opening } : {}) };
  });
  return { name: copy(manifest.name, manifest.name_text), ...(manifest.summary === undefined ? {} : { summary: copy(manifest.summary, manifest.summary_text) }),
    ...(offers.length ? { offers } : {}), ui: { views } };
}
