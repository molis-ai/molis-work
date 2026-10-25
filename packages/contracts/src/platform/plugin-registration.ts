import type { ProjectDataDeclaration } from "../modules/projects.js";
import type { HomeStoreDeclaration } from "./plugin-database.js";
import type { PluginDefinition, PluginManifest } from "./plugin.js";
import type { UiContribution } from "./ui.js";

/** A row on a plugin's page that a search result or record opens, found by its selector and the dataset key holding its id. */
export interface PluginSearchRow { readonly selector: string; readonly idDataset: string }

/** One fixed state of a plugin's own view, drawn by its own renderer from sample data for the component board (a development tool). */
export interface PluginBoardSpecimen {
  readonly id: string;
  /** What the state is, in the page's language (through `text`). */
  readonly title: string;
  /** Where the page draws it: a directory column beside the main area, or the main area itself. */
  readonly place: "column" | "page";
  readonly html: string;
}
/** What the component board hands a plugin's specimens: the page's own primitives and the language of the sample's words. */
export interface PluginBoardSpecimenPorts {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
  icon(name: string): string;
  formatDate(value: string): string;
  /** The sample's own words (names, titles), apart from the interface's language. */
  readonly sample: "zh" | "en" | "mixed";
}

/** What the workbench shell loads for one plugin: its views, styles and browser client. */
export interface PluginWorkbenchRegistration {
  /** Exact existing HTTP routes for pages whose backend is registered outside Plugin Runtime. This grants no Runtime services. */
  readonly pageRequests?: readonly { readonly method: string; readonly path: string }[];
  /** Asset cascade/initialization order, independent of navigation order in the Manifest. */
  readonly order: number;
  readonly contributions: readonly UiContribution[];
  readonly stylesheet?: string;
  readonly clientFactory?: string;
  /**
   * The shell sends `clientFactory` without its whole-line comments and indentation (the page does not run them). A script
   * whose multi-line strings or templates carry indentation as content cannot set this; tests/plugin-client-served.test.ts
   * holds the result to the same program as the source.
   */
  readonly clientServed?: true;
  /**
   * The plugins whose clients this one calls (their short ids). Each ships a bundle of its own, which the page loads beside this
   * plugin's; their factories reach it as `host.clients[<short id>]` and mount on the ports this plugin gives them, as the
   * plugin they belong to.
   */
  readonly clientUses?: readonly string[];
  /** Browser dependencies prepared before this factory mounts. */
  readonly clientAssets?: readonly string[];
  readonly settingsClient?: string;
  readonly searchRow?: PluginSearchRow;
  /**
   * The row a record is opened from on this plugin's page, where it differs from `searchRow`: ⌘/Ctrl- or middle-click on it
   * opens the record as a tab in the plugin's group (specs/plugin-tab-groups).
   */
  readonly recordRow?: PluginSearchRow;
  /**
   * The plugin's rows in fixed sample states for the component board (`/__ui/catalog`, specs/visual-ui-experience VUX-39), drawn
   * by the renderer its page uses, so the board shows the production row and never a copy of it. Nothing is read or written.
   */
  readonly specimens?: (ports: PluginBoardSpecimenPorts) => readonly PluginBoardSpecimen[];
}

/**
 * One plugin this build ships and its already exported implementations. This declaration grants no authority. 2026-10-18 改:
 * each plugin package writes its own and the catalog is generated from them (W5-02, PG-065 in
 * specs/repository-anti-corruption/privileges.md).
 */
export interface PluginRegistration {
  /** The plugin's key inside a project (`^[a-z0-9][a-z0-9-]*$`); the Manifest's `plugin_id` stays its identity. */
  readonly project_plugin_id: string;
  /** Position in the catalog, unique across the build; the derived lists keep this order. */
  readonly catalog_order: number;
  readonly manifest: PluginManifest;
  /** One sentence for the plugin market and the page heading. 2026-10-18 改: declared in the Manifest (W5-02). */
  readonly summary: string;
  /**
   * Kept out of the plugin list (switcher and market) unless the Host is in developer mode; still installable and enabled where
   * already added. 2026-10-18 改: declared in the Manifest (W5-02).
   */
  readonly developer?: true;
  /**
   * On in every project unless the person hid it there; not offered for enabling. Trusted: the Host reads it from this
   * registration only, never from a Manifest or an installed package.
   */
  readonly personal?: true;
  /** Product setup choice for new projects; stored as ordinary membership and freely removable afterwards. */
  readonly default_enabled?: true;
  /** Short ids enabled together with this plugin in a project, whatever its ports say (Feed brings Inbox). Trusted, as above. */
  readonly companions?: readonly string[];
  /**
   * Explicit Runtime activation in the Home; personal visibility alone never migrates an existing plugin. Trusted, as above.
   * Its library is the Manifest's `databases.home` (PG-022). Its files, model settings and image generation are the Manifest's `owner_files`,
   * `model_configuration` and `image_generation` (PG-102).
   */
  readonly runtime?: {
    readonly scope: "home";
    readonly create: () => PluginDefinition;
    readonly package_name: string;
    readonly factory_export: string;
    /** The chord (`Mod+Shift+<letter>`) that summons this Home tool's side view from anywhere; global keys are the Host's to give. */
    readonly keys?: string;
    /**
     * This Home instance is one half of a dual-instance plugin (docs/system/GLOSSARY.md): the same plugin also runs as each
     * project's instance from the project start list, and each half offers only its share of the one Manifest. Trusted, as above:
     * no Manifest or installed package can say it. Every permission of such a Manifest is required (specs/dual-instance-plugins).
     */
    readonly dual_instance?: true;
  };
  /**
   * What this plugin keeps in the Home for a project that is more than rows of its library, and how to clear it. The Host runs it
   * when a project is deleted (the owner's id in the receipt is `project_plugin_id`) and lists its label in the confirmation.
   * Rows are declared in the Manifest instead (`databases.home.project_rows`), and the platform deletes them without running the
   * plugin's code; never both. 2026-10-18 改: only Images still has it (its files and jobs, BL-615), and then it goes (PG-024).
   */
  readonly project_data?: ProjectDataDeclaration;
  /**
   * The Home store this plugin keeps (exported by the plugin, beside the code that opens it), for the Host's one registry of Home
   * stores. A library is not written here: the registry reads it from the Manifest's `databases.home`.
   */
  readonly home_store?: HomeStoreDeclaration;
  /** Owner-scoped UI words, projected into the page language by the common translator. */
  readonly messages?: Readonly<Record<string, { readonly zh: string; readonly en: string }>>;
  readonly workbench: PluginWorkbenchRegistration;
}
