import type { UiViewDeclaration } from "./ui.js";
import type { PluginEventsDeclaration } from "./plugin-events.js";
import type { PluginPortsDeclaration } from "./plugin-wiring.js";
import type { AgentManifest } from "./plugin-agent.js";

/** The permission a Plugin declares to name the websites it uses in the side panel browser (specs/archive/side-panel D16). */
export const SURFACE_BROWSER_PERMISSION = "surface:browser";

export type PluginDeployment = "local" | "server";
/**
 * `app` is a v2 Plugin that contributes views, commands, routes, ports and
 * events. `native` stays the v1 first-party entry; `integration` stays the
 * Provider shape. The kind selects the contribution, never the trust level.
 */
export type PluginKind = "native" | "integration" | "app";

export interface PluginPermissionDeclaration {
  permission: string;
  required: boolean;
  reason: string;
  /**
   * Only with `surface:browser`: the sites the Plugin's work opens or acts on in the side panel browser, each an exact
   * origin (`https://example.com`, no path, query or fragment). Shown to the person before the Plugin is added.
   */
  origins?: readonly string[];
}

/** The websites a Plugin says it uses in the side panel browser; empty when it declares none. */
export function browserSiteDeclarations(manifest: { readonly permissions: readonly PluginPermissionDeclaration[] }): readonly string[] {
  return manifest.permissions.find(item => item.permission === SURFACE_BROWSER_PERMISSION)?.origins ?? [];
}

export interface PluginEntrypointManifest {
  deployment: PluginDeployment;
  entrypoint: string;
}

/**
 * A contract dependency, never an implementation dependency. Any registered
 * provider of `capability_id@version` satisfies it.
 */
export interface PluginRequirementDeclaration {
  capability_id: string;
  version: number;
  /** An unsatisfied optional requirement degrades the Plugin; it does not block it. */
  optional?: boolean;
  reason: string;
}

/** Exact installed versions this release can safely continue from or migrate from. */
export interface PluginUpgradeCompatibilityDeclaration {
  /** The new implementation can use the old installation and its existing grants without migration. */
  compatible_from_versions?: string[];
  /** Manual upgrade is supported only with a plugin-provided private-data validation hook. */
  migratable_from_versions?: string[];
}

export type PluginRouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * One HTTP route the Host mounts under `/api/plugins/<plugin_id>/`. `path` is a
 * pattern with `:name` segments; the Plugin never owns the prefix or the router.
 */
export interface PluginRouteDeclaration {
  route_id: string;
  method: PluginRouteMethod;
  path: string;
  /** Permission the caller's session must hold. Omitted means the Plugin's own grants suffice. */
  permission?: string;
  /**
   * The largest request body, in bytes, the Host reads for this route (at most 96 MiB, including JSON/base64 overhead). Omitted, the Host's own default: 256 000
   * bytes on a project instance's route, 12 MiB on a Home instance's.
   */
  max_body_bytes?: number;
  /**
   * `"ndjson"` (POST only): the answer is a stream of `PluginRouteStreamLine`s. The handler reports progress through the request's
   * `emit`; the Host writes each as a `progress` line and ends the stream with one `result` or `error` line, which only the Host
   * writes. The stream ends at once when the call is cancelled, the person leaves, or the plugin stops or is replaced.
   */
  stream?: "ndjson";
}

/**
 * The files a plugin can read from an imported 成果: the lower-case extensions with their dot, and whether a file the 成果库 kept as
 * extracted text (an original too big to hold inline) counts when that text is not empty.
 */
export interface ArtifactFileDeclaration {
  extensions: string[];
  stored_text?: boolean;
}

/**
 * One kind of link from a Plugin's objects to a 成果 version in the context ledger (「被谁引用」, 「目标的输入与交付物」). `role` is what the
 * object does with the version: takes it as an input, or hands it in as an output; `proposal` marks the edge written for a person to
 * confirm before the plain kind is.
 */
export interface ArtifactLinkDeclaration {
  kind: string;
  role: "input" | "output";
  proposal?: boolean;
}

/** The dual-instance mark (docs/system/GLOSSARY.md) is not here: only the Host's registration can say it (S-48). */
export interface PluginRuntimeDeclaration {
  readonly scope: "home";
}
/** A Plugin's words by stable key, each in both page languages. */
export type PluginMessagesDeclaration = Readonly<Record<string, { readonly zh: string; readonly en: string }>>;

/** A Plugin's English for words still keyed by their Chinese source text. */
export type PluginTranslationsDeclaration = Readonly<Record<string, string>>;

export interface PluginManifest {
  /** 1 is the original shape. 2 adds ports, events, views, commands, routes and agent. */
  schema_version: 1 | 2;
  plugin_id: string;
  version: string;
  name: string;
  kind: PluginKind;
  publisher: {
    publisher_id: string;
    /** Signature identity. A changed value creates a different Plugin identity. */
    signature: string;
  };
  host_api_version: 1 | 2;
  /**
   * v2: 常开插件. Enabled in every project, never listed where plugins are chosen, added or removed (the plugin list, the
   * market, the Dock, a project's plugin settings), so it cannot be removed. Only a plugin that ships with the Host may
   * declare it: the Runtime refuses to install or upgrade to a Manifest that does from anywhere else.
   */
  always_on?: boolean;
  /** One sentence for the plugin market and the page heading, at most 120 characters once trimmed. Without one the market lists the plugin by its name. */
  summary?: string;
  /** Kept out of the plugin list (switcher and market) unless the Host is in developer mode; still installable, and shown where already added. Only `true`. */
  developer?: true;
  entrypoints: PluginEntrypointManifest[];
  permissions: PluginPermissionDeclaration[];
  capabilities: {
    provides: string[];
    consumes: string[];
  };
  /**
   * Types this Plugin pins into the 成果库 (versions people keep and cite), and the 成果 types it reads. Each produced
   * type names itself (`title`, e.g. 「文档」) and its preview action (A4): one of this Plugin's actions defined with
   * `defineArtifactPreviewAction`. A type whose work objects can be pinned on the spot (a Goal handing one in, A5) also
   * names its pin action, defined with `defineArtifactPinAction`.
   * A type pinned from a work object names its compare action (`defineArtifactCompareAction`): whether the version still
   * matches the object, for 「原文已改」 (A4b).
   * A plugin that can start new work from a version declares `continue` (`defineArtifactContinueAction`) on that type,
   * whether it produces it or only consumes it (「从这一版继续」, A4b).
   * A consumed type that is an imported file says which files it can read (`file`), so the 成果库 lists the plugin for the files it can
   * continue from and no others (ac-artifacts A3, PG-079).
   */
  artifacts: {
    produces: Array<{ artifact_type_id: string; schema_version: number; title?: string; preview?: { capability_id: string; version: number }; pin?: { capability_id: string; version: number }; compare?: { capability_id: string; version: number }; continue?: { capability_id: string; version: number } }>;
    consumes: Array<{ artifact_type_id: string; schema_version: number; continue?: { capability_id: string; version: number }; file?: ArtifactFileDeclaration }>;
    /** The kinds of link this Plugin writes between its own objects and exact 成果 versions; one Plugin owns a kind. */
    links?: ArtifactLinkDeclaration[];
  };
  /** Exchange data this Plugin records for others and reads from them; kept out of the 成果库. A type is either a 成果 type or a process item type. */
  process_items?: {
    produces: Array<{ artifact_type_id: string; schema_version: number }>;
    consumes: Array<{ artifact_type_id: string; schema_version: number }>;
  };
  ui: {
    contributions: string[];
    /** v2: Plugin IDs whose embedded surfaces this UI uses. Enables discovery, never grants authority. */
    embedded_plugins?: string[];
    /** v2: where each contribution is placed. Absent means the Host places nothing. */
    views?: UiViewDeclaration[];
    /**
     * v2: the Plugin's UI words in both page languages, by stable key (`<owner>.<area>.<name>`, 2 to 5 lowercase segments).
     * Plain data in the Manifest, so a built-in and a third-party Plugin bring their words the same way; the Host reads
     * them from the Manifests of the Plugins that are installed, never from a list of its own. A key one Plugin has
     * declared is refused to another.
     */
    messages?: PluginMessagesDeclaration;
    /**
     * v2: English for UI words still written as their Chinese source text (`{ "保存": "Save" }`), until the words have
     * stable keys (specs/repository-anti-corruption PG-071). Any publisher's Plugin may declare it. It applies only to
     * what this Plugin draws itself (its frame and its contributions) and to the text it supplies where the Host draws it
     * (an action's title, a deletion dialog's data description): the same Chinese sentence on the Host's pages or in another
     * Plugin is not changed by it, and the Host's own English wins. New words use `messages`.
     */
    translations?: PluginTranslationsDeclaration;
  };
  /** v2: named, typed connection points wired by the user inside a project. */
  ports?: PluginPortsDeclaration;
  /** v2: events this Plugin publishes and the exact sources it listens to. */
  events?: PluginEventsDeclaration;
  /** v2: HTTP routes the Host mounts on the Plugin's behalf. */
  routes?: PluginRouteDeclaration[];
  /** v2: Capability contracts required before activation. */
  requires?: PluginRequirementDeclaration[];
  /** v2: roles, prompts, skills and subagents for an Agent-backed Plugin. */
  agent?: AgentManifest;
  /**
   * Methods this Plugin offers to other Agents for business work (the Assistant, a Character): how to do something
   * in its domain with the capability gateway. Bodies ship in the package; the Host registers them with the Plugin and
   * gives them to a round only by id and version. `agent.skills` is the Plugin's own Agent's; this is for others.
   */
  methods?: import("./plugin-agent.js").AgentSkillDeclaration[];
  /** Exact old installation versions this release can upgrade from. */
  upgrade_compatibility?: PluginUpgradeCompatibilityDeclaration;
  /** The plugin's own tables, by scope (PG-020, specs/plugin-project-database). */
  databases?: import("./plugin-database.js").PluginManifestDatabases;
  /** The plugin's own files in the Home (`services.ownerFiles`, PG-102): a root and its top-level entries, like `databases.home` declared here and nowhere else. */
  owner_files?: import("./plugin-owner-files.js").PluginOwnerFilesDeclaration;
  /** The settings of the model this plugin uses (`services.model.configuration`, PG-102): where its choice is kept and the two actions that read and save it. */
  model_configuration?: import("./plugin-model-configuration.js").PluginModelConfigurationDeclaration;
  /** The image connections this plugin uses (`services.imageGeneration`, PG-102): the namespace its bindings live in and the permissions that read, bind and generate. */
  image_generation?: import("./plugin-image-generation.js").PluginImageGenerationDeclaration;
  /**
   * Where this plugin runs, written here and nowhere else (PG-011). Left out, it is a project plugin. `home` is the Host's own Home
   * Runtime; only code of the Host's build may be started there, so an installed or generated plugin that writes it is refused at
   * install (`plugin.home_scope_unavailable`) until the sandbox host can run a Home instance.
   */
  runtime?: PluginRuntimeDeclaration;
  /** The command-line tools this plugin looks for on this machine (`services.localTools`, PG-112): names and directories declared here, found by the platform, never run by it. */
  local_tools?: import("./plugin-local-tools.js").PluginLocalToolsDeclaration;
  /** v2: the kinds of subject its objects are for Attention, with `attention:write` (`services.attention`, PG-087). */
  attention?: import("./plugin-attention.js").PluginAttentionDeclaration;
  /** v2: places where the plugin may use an account the person binds, with `connections:use` (`services.connections`, S-57). */
  connections?: import("./plugin-connections.js").PluginConnectionsDeclaration;
  /** v2: the services whose accounts this plugin works with and the cards shown for them (PG-046). Declaring one gives no right to any connection. */
  connection_services?: readonly import("./plugin-integrations.js").PluginConnectionServiceDeclaration[];
  /** v2: what this plugin does with those services: pull a Feed source, or import a document (PG-046). */
  integrations?: readonly import("./plugin-integrations.js").PluginIntegrationDeclaration[];
  /** v2: kept jobs and commands the platform may wake for this installation. */
  background?: { jobs: readonly import("./plugin-background.js").PluginJobDeclaration[]; wakeups?: readonly import("./plugin-scheduler.js").PluginWakeupDeclaration[] };
  /** Complete, callable capabilities registered with the system action service. */
  actions?: readonly import("./actions.js").ActionDefinition[];
  /** Actual judgment consumption points, automatically discovered by configuration UIs. */
  action_scenes?: readonly import("./actions.js").ActionSceneDefinition[];
}
