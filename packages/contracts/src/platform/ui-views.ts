// A plugin's placement declarations in its Manifest (`ui.views`): where each view sits and what it says about itself.
// Rendering stays with `UiContribution.render` in `ui.ts`, which re-exports this file.
import type { TextRef } from "./ui-text.js";
import type { UiSettingsAddressParamsDeclaration, UiSettingsDataDeclaration, UiStageDataDeclaration, UiViewGroup, UiViewHue, UiViewRail, UiViewSlot } from "./ui.js";

/**
 * A kind of thing a person can make new from a Goal, as the Host places it on the plugin's first navigator or island view: read from a
 * station's blank intake (`<station>.create`, contract-design §2.3), never declared on a view.
 */
export interface UiViewCreateEntry {
  /** The `id` of the `workflow_content` station whose `create` carries the intake; `placement.create` calls it. */
  readonly station: string;
  /** The kind's name, the intake's original. */
  readonly title: string;
  /** The name in the person's language. */
  readonly label?: string;
}

/** One way to start something from the project home, as the Host places it: read from an intake's `start` (contract-design §2.4). */
export interface UiViewStartEntry {
  readonly title: string;
  /** One sentence, shown as the entry's hint. */
  readonly hint: string;
  /** Icon name from the Host's catalog; omitted means the view's icon. */
  readonly icon?: string;
}

/** What the Host adds to a placed view from the plugin's intakes. */
export interface UiViewIntakeEntries {
  readonly creates?: UiViewCreateEntry;
  readonly start?: UiViewStartEntry;
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
}
