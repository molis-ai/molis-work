// A plugin's placement declarations in its Manifest (`ui.views`): where each view sits and what it says about itself.
// Rendering stays with `UiContribution.render` in `ui.ts`, which re-exports this file.
import type { TextRef } from "./ui-text.js";
import type { UiSettingsAddressParamsDeclaration, UiSettingsDataDeclaration, UiStageDataDeclaration, UiViewGroup, UiViewHue, UiViewRail, UiViewSlot } from "./ui.js";

/** A kind of thing a person can make new from a Goal: one of the Manifest's create stations, and the kind's name. */
export interface UiViewCreateEntry {
  /** The `id` of a `workflow_content` station of the same Manifest whose role is `create`; `placement.create` calls it. */
  readonly station: string;
  /** The kind's name, also the original used if the supplying release no longer has the words. */
  readonly title: string;
  /** Optional owned short text, resolved by the Host while projecting the supplying declaration. */
  readonly title_text?: TextRef;
}

/** One way to start something from the project home on an empty day; choosing it opens the view's plugin. */
export interface UiViewStartEntry {
  readonly title: string;
  readonly title_text?: TextRef;
  /** One sentence, shown as the entry's hint. */
  readonly hint: string;
  readonly hint_text?: TextRef;
  /** Icon name from the Host's catalog, as for the view's own `icon`; omitted means the view's icon. */
  readonly icon?: string;
}

/** Placement declaration. Rendering stays with `UiContribution.render`. */
export interface UiViewDeclaration {
  readonly view_id: string;
  readonly slot: UiViewSlot;
  readonly title: string;
  /** The view's own title, never filled from the Manifest name. Without usable words, show `title`. */
  readonly title_text?: TextRef;
  /** Contribution that renders this view. Defaults to `<plugin_id>.<view_id>`. */
  readonly contribution_id?: string;
  /**
   * Icon name from the platform's icon set (the SDK's `PLUGIN_ICON_NAMES`). The
   * Manifest reader refuses a name outside the set; a Plugin never ships artwork
   * into the shell.
   */
  readonly icon?: string;
  /** The view can host bounded objects opened from elsewhere. */
  readonly accepts_objects?: boolean;
  /** A side view follows the focused stage object of its own plugin. Omitted means a persistent tool. */
  readonly context_binding?: "focused-object";
  /**
   * `side` views only: the object kinds this cell of the right panel shows, so what is picked up there is a known object.
   * Each kind needs an object reader (`subject.read`) in the same Manifest (context-program §4).
   */
  readonly objects?: readonly string[];
  /**
   * `side` views only, at most one per plugin: an open that names one of this plugin's items (`openItem`, an `openPlugin` link
   * with `openItem`) lands in this side view first, even when the plugin also has a work-area surface. Opens from the plugin's
   * own frames, opens without an item and `openBeside` keep their place (context-program §21.6).
   */
  readonly opens_items?: boolean;
  /** Lower sorts earlier inside its slot. Ties fall back to view_id order. */
  readonly order?: number;
  /**
   * The colour of the plugin's group on the tab strip; any view of the plugin may say it, and the first one that does is the plugin's.
   * Omitted means the Host picks one from a spare list by the plugin's id (a plugin has one colour on every device and every day).
   */
  readonly hue?: UiViewHue;
  /** `navigator` and `island` views only: the rail group the plugin is listed in. Omitted means 更多. */
  readonly group?: UiViewGroup;
  /** `navigator` views only: the plugin is part of the rail's backbone (`core`) or a way to extend the workbench (`extend`). Omitted means an ordinary tool. */
  readonly rail?: UiViewRail;
  /** `navigator` views only: the Dock keeps this plugin until the person chooses others. Their choice, once made, replaces it. */
  readonly pinned_default?: true;
  /** `settings` views only: the read action that gives the page its data. The Host calls it as the person and hands the answer to the page. */
  readonly settings_data?: UiSettingsDataDeclaration;
  /** `settings` views only: request the Host's Agent Runtime list in `SettingsPageContext.runtimes`. Omission skips the query. */
  readonly settings_runtimes?: true;
  /** `settings` views only: the extra address parameters this page reads (BL-543). Omitted means the defaults only. */
  readonly settings_address?: UiSettingsAddressParamsDeclaration;
  /**
   * The view that opens the plugin's stage only (its `stage` view, else its `navigator` view): the read action that gives the stage its
   * data. The Host calls it as the person and hands the answer to the stage, on the page and when the stage is redrawn in place.
   */
  readonly stage_data?: UiStageDataDeclaration;
  /** The main surfaces mounted with the stage, in order. Defaults to `["workbench"]`; must include it exactly once. */
  readonly stage_surfaces?: readonly string[];
  /** `navigator` and `island` views only: what a person can make new with this plugin from a Goal. */
  readonly creates?: UiViewCreateEntry;
  /** `navigator` and `island` views only: the project home's way to start with this plugin. */
  readonly start?: UiViewStartEntry;
}
