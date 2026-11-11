import type { ContractDescriptor } from "../platform/package.js";
import { defineErrorCodes, type ActionDefinition, type ActionSchema } from "../platform/actions.js";
import { inputSchemaFor } from "../platform/action-input.js";
import { closedObjectSchema as object } from "../platform/closed-object-schema.js";
import {
  KIT_ENTRY_SCHEMA, KIT_LIMITS, KIT_MANAGE_LINK_SCHEMA, KIT_PACK_ID_SCHEMA, KIT_PLUGIN_SOURCE_SCHEMA, KIT_UPGRADED_SCHEMA, KIT_VERSION_SCHEMA,
  type KitEntry, type KitEntryKey, type KitKind, type KitManageLink, type KitPackId, type KitReportedEntry, type KitSource, type KitVersion,
} from "../platform/kit-report.js";
import type { PromptOverridesFile, SkillRef } from "./agent-definitions.js";

/**
 * The AI kit (能力包, specs/capability-pack/contract-design.md §4): packs and what each holds — roles with their prompts, Skills, MCP
 * and tools — gathered on every call from the owners' own reports (`platform/kit-report`). Nothing here is stored or registered:
 * a pack is a plugin's installation, Molis Work's own (`system:builtin`) or the person's Characters (`system:characters`), and its
 * state is read from what it holds. The Host registers the one query; the gatherer is `horizontal/kit`.
 */
export const servicesKitContract = {
  contractId: /* @version contract.io.molis.work.service.kit "io.molis.work.service.kit.v{version}" */ "io.molis.work.service.kit.v1",
  kind: "service",
  schemaVersion: /* @version contract.io.molis.work.service.kit */ 1,
  maturity: "contract-only",
  ssot: "specs/capability-pack/contract-design.md",
} as const satisfies ContractDescriptor;

/** The system provider of `kit.catalog.list`, registered once for the Home: every project sees the same query. */
export const KIT_PROVIDER_ID = "system.kit";
/** Listing the kit: the person's own. */
export const KIT_READ_PERMISSION = "kit:read";
/** The Host's own reporters of prompts and roles, of the Agent tools, of the Agent Host's MCP and of Molis Work's own MCP (§4.6). */
export const KIT_AGENT_DEFINITIONS_PROVIDER_ID = "system.agent-definitions";
export const KIT_AGENT_TOOLS_PROVIDER_ID = "system.agent-tools";
export const KIT_AGENT_MCP_PROVIDER_ID = "system.agent-mcp";
export const KIT_MCP_ACCESS_PROVIDER_ID = "system.mcp-access";

/**
 * A pack's state, the first that holds (§4.4). There is no switch for a whole pack: the way to change it is to change what it holds or
 * its plugin. The two system packs are only `unknown`, `attention` or `active`.
 */
export type KitPackState =
  /** The installation is kept as uninstalled, its data kept for a reinstall: the pack is a header only. */
  | { kind: "uninstalled" }
  /** The plugin is disabled: nothing in the pack is used; the way out is enabling the plugin. */
  | { kind: "disabled" }
  /** A reporter whose entries could be in this pack failed: 0-based indexes into the same `kit.catalog.list` answer's `issues`. */
  | { kind: "unknown"; issues: number[] }
  /** One or more entries cannot be used now. Tools have no availability and never count. */
  | { kind: "attention"; items: Array<{ entry: KitEntryKey; reason: string }> }
  | { kind: "active" };

/** A pack as the page lists it: the header and what it holds, by entry key; entries are listed once, in `entries`. */
export interface KitPack {
  pack_id: KitPackId;
  kind: "plugin" | "builtin" | "characters";
  name: string;
  description: string;
  /** For a plugin pack: its installation (stamped from the install record); absent for the two system packs. */
  source?: Extract<KitSource, { kind: "plugin" }>;
  version?: KitVersion;
  /** The last upgrade, from the install record: SemVer before and after. */
  upgraded?: { from: string; to: string; at: string };
  state: KitPackState;
  /** Roles in order; each with its own prompts. A plugin pack's role-less prompts hang under `{ kind: "assistant" }` (§4.2). */
  roles: Array<{ role: KitEntryKey; prompts: KitEntryKey[] }>;
  skills: KitEntryKey[];
  mcp: KitEntryKey[];
  /** Tool entry keys, computed from the pack's roles' `host_tools` (§4.3). */
  tools: KitEntryKey[];
  manage?: KitManageLink;
  /** What 「导出这个包」 can carry (§4.9). */
  export: { package: boolean; prompt_overrides: boolean; references: boolean };
}

/** Closed and empty: the scope is the call context's; filtering by kind is the page's, so no pack's state is read from part of it. */
export type KitCatalogListRequest = Record<string, never>;
export interface KitCatalog {
  /** Those that need attention first, the rest by name. */
  packs: KitPack[];
  /** Each entry once; packs refer to them by key. */
  entries: KitEntry[];
  /** Reporters that were unavailable, refused, timed out or answered out of contract, and entries dropped while stamping. */
  issues: Array<{ provider_id: string; title: string; message: string }>;
}

/** The answer of the plugin install service's `plugins.package.export@1` (a Host action, the person's own): a content package as kept. */
export interface PluginPackageExportRequest { install_id: string }
export interface PluginPackageExport {
  plugin_id: string;
  version: string;
  /** The key the kept package is signed with: this Home's own for `home_local`, the third party's for `pinned`. */
  publisher_key_id: string;
  filename: string;
  media_type: "application/json";
  /** The signed bundle JSON exactly as the Host keeps it from the install: never re-signed, never re-encoded. */
  content: string;
}

/** What 「导出这个包」 writes: each part goes back its own owner's way (capability-pack §5). Never an installable package by itself. */
export interface KitPackFile {
  format: "molis.kit-pack";
  format_version: /* @version format.kit.pack */ 1;
  exported_at: string;
  pack: { name: string; plugin_id?: string; version?: string };
  /** The signed content package exactly as kept (`plugins.package.export@1`), when the pack is an exportable content package. */
  package?: PluginPackageExport;
  /** The person's own edits of this pack's prompts (`agent-definitions.prompt-overrides.export@1`). */
  prompt_overrides?: PromptOverridesFile;
  /** References to what the file cannot carry: roles, tools, MCP, and a package that cannot be exported. */
  references: Array<{ kind: KitKind; ref: Extract<KitReportedEntry, { ref: unknown }>["ref"] | SkillRef; name: string; source_title: string;
    needs?: { connector_categories: string[] } }>;
}

/** The gatherer's refusals (§4.11). */
export const kitErrors = defineErrorCodes("kit", {
  /** A reporter's answer repeats an `entry_id`: that reporter's answer is dropped and listed among the issues. */
  report_invalid: "invalid",
});

const id = { type: "string", minLength: 1, maxLength: 200 } as const;
const text = { type: "string", maxLength: KIT_LIMITS.descriptionChars } as const;
const keys = { type: "array", items: { type: "string", minLength: 1, maxLength: 420 } } as const;
const PACK_STATE_SCHEMA = { oneOf: [object({ kind: { const: "uninstalled" } }), object({ kind: { const: "disabled" } }),
  object({ kind: { const: "unknown" }, issues: { type: "array", minItems: 1, items: { type: "integer", minimum: 0 } } }),
  object({ kind: { const: "attention" }, items: { type: "array", minItems: 1, items: object({ entry: keys.items, reason: id }) } }),
  object({ kind: { const: "active" } })] };
/** `KitPack`, closed. */
export const KIT_PACK_SCHEMA: ActionSchema = object({
  pack_id: KIT_PACK_ID_SCHEMA, kind: { enum: ["plugin", "builtin", "characters"] }, name: { ...id, maxLength: KIT_LIMITS.nameChars }, description: text,
  source: KIT_PLUGIN_SOURCE_SCHEMA, version: KIT_VERSION_SCHEMA, upgraded: KIT_UPGRADED_SCHEMA, state: PACK_STATE_SCHEMA,
  roles: { type: "array", maxItems: KIT_LIMITS.rolesPerPack, items: object({ role: keys.items, prompts: keys }) }, skills: keys, mcp: keys, tools: keys,
  manage: KIT_MANAGE_LINK_SCHEMA, export: object({ package: { type: "boolean" }, prompt_overrides: { type: "boolean" }, references: { type: "boolean" } }),
}, ["pack_id", "kind", "name", "description", "state", "roles", "skills", "mcp", "tools", "export"]);

/**
 * The one query (§4.7), registered once by the Host as `system.kit`: only the person may call it (Agents, plugins and MCP clients are
 * refused). The gatherer discovers reporters through the caller's own client and calls each once, in parallel, so it waits on other
 * providers and is `concurrent`; it commits nothing.
 */
export const kitCatalogActions = {
  list: { capability_id: "kit.catalog.list", version: /* @version action.kit.catalog.list */ 1, operation: "query", action: {
    title: "列出能力包", description: "列出这个范围里的能力包：每个插件的安装、Molis Work 自带、你的角色；每个包里的角色（带提示词）、技能、MCP 和工具，以及包的状态。只读，不连接服务器、不调用工具。",
    kind: "query", scope: "home", effect: "read", scheduling: "concurrent", audiences: ["user"], permissions: [KIT_READ_PERMISSION], subject_kinds: [],
    input_schema: inputSchemaFor<KitCatalogListRequest>()(object({})),
    output_schema: object({ packs: { type: "array", items: KIT_PACK_SCHEMA }, entries: { type: "array", items: KIT_ENTRY_SCHEMA },
      issues: { type: "array", items: object({ provider_id: id, title: { ...id, maxLength: KIT_LIMITS.nameChars }, message: text }) } }) } } as ActionDefinition<KitCatalogListRequest, KitCatalog>,
};
