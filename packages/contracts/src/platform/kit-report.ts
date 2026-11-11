// `platform/actions` first: it loads the action modules in the order their own cycle needs (`action-offers` alone cannot be loaded first).
import { ACTION_REFERENCE_SCHEMA, type ActionAudience, type ActionDefinition, type ActionReference, type ActionSchema } from "./actions.js";
import { inputSchemaFor } from "./action-input.js";
import { closedObjectSchema as object } from "./closed-object-schema.js";
import type { ExternalToolId } from "./external-tools.js";
import type { AgentRoleExecution } from "./plugin-agent.js";
import type { PersonalCharacterRef, ProjectCharacterMemberRef } from "../modules/character-role-scope.js";
import { SKILL_CATALOG_ENTRY_SCHEMA, type SkillCatalogEntry, type SkillPackTrust } from "../services/skills.js";

// What each owner reports of its own AI kit entries — Skills, prompts, roles, tools, MCP — for the kit page (`kit.catalog.list@1`,
// `services/kit`) to gather into packs (specs/capability-pack/contract-design.md §4.5, §4.6). The Host finds reporters by these two
// types, never by a list; the gatherer stamps where an entry comes from and which pack it is in. A subpath of its own, not re-exported
// by `platform/actions`: it takes the Skill catalog's entry, and `services/skills` imports `platform/actions`.

export const KIT_KINDS = ["skill", "prompt", "role", "tool", "mcp"] as const;
export type KitKind = (typeof KIT_KINDS)[number];
/** Where an Agent tool comes from (the Agent Host's tool set uses this type; contracts never import the Agent Host). */
export const KIT_TOOL_ORIGINS = ["runtime", "gateway", "business", "subagent", "plan-step", "builder"] as const;
export type KitToolOrigin = (typeof KIT_TOOL_ORIGINS)[number];

/** `plugin:<install_id>`, `system:builtin` or `system:characters` (§4.1). Never stored. */
export type KitPackId = string;
/** `<reporter provider_id>/<entry_id>`: one entry, wherever it is shown. */
export type KitEntryKey = string;

/** Where an entry comes from. Never a credential, an endpoint with a secret or a raw local path. */
export type KitSource =
  | { kind: "plugin"; plugin_id: string; title: string; version: string; install_id: string; publisher_label: string; trust: SkillPackTrust }
  | { kind: "system"; module: string; title: string }
  /** The Agent runtime's own tools. */
  | { kind: "runtime"; package: string; version: string }
  /** Batch 36's references (`modules/character-role-scope`). */
  | { kind: "character"; role: PersonalCharacterRef | ProjectCharacterMemberRef; title: string; revision: number }
  | { kind: "mcp_server"; owner: "project" | "connection"; server_id: string; label: string }
  /** Molis Work's own MCP server. */
  | { kind: "outbound"; title: string };

export interface KitVersion {
  /** As shown: 「第 3 版」, a SemVer, a revision, an SDK version with its shape fingerprint. */
  label: string;
  /** The one kind of difference this class shows (capability-pack §4.2); absent when there is none. */
  change?:
    /** A prompt the person edited, whose default has moved on. */
    | { kind: "default_updated"; base_version: number; default_version: number }
    /** An MCP server's last discovery. */
    | { kind: "discovered"; added: number; removed: number; changed: number };
}

/** Declared, never granted (capability-pack §7). */
export interface KitDeclared { tools: string[]; permissions: string[]; connector_categories: string[] }

/** What the entry's usage can honestly say (capability-pack §4.4); never a total from records that keep only recent rows. */
export type KitUsage =
  | { kind: "recent"; count: number; last_at: string | null; kept: { rows_per_key: number } | { days: number } }
  | { kind: "last_only"; last_at: string }
  /** No record of it. */
  | { kind: "none" }
  /** Tools without a cheap last use: the page shows no count and no reason. */
  | { kind: "not_counted" };

/** `reason` is the owner's own code (a Skill's is a `SkillUnavailableReason`); `detail` is words for the person. */
export type KitAvailability = { available: true } | { available: false; reason: string; detail?: string };

/** Where to change it: a path on the reporter's own surface (checked, §4.6). The kit itself changes only Skills' states. */
export interface KitManageLink { href: string; label: string }

/**
 * Which role a prompt belongs to, or a role entry is. Characters and the personal assistant use batch 36's own references
 * (`modules/character-role-scope`), imported, never redefined.
 */
export type KitRoleRef =
  | { kind: "plugin"; owner_id: string; role_id: string }
  | PersonalCharacterRef
  | ProjectCharacterMemberRef
  | { kind: "assistant" };

export type KitMcpRef =
  | { part: "server"; owner: "project" | "connection"; server_id: string; configuration_version: number }
  /** Registered as an action: the action directory's entry. */
  | { part: "action_tool"; action: ActionReference }
  /** Listed by the server, not an action. */
  | { part: "tool" | "prompt" | "resource"; server_id: string; name: string }
  | { part: "outbound"; client_id: string };

/** The three different 「开」, each said for what it is (capability-pack §4.3). */
export interface KitMcpState {
  /** The server is switched on in its settings. */
  server_enabled?: boolean;
  health?: "connected" | "disconnected" | "unavailable" | "not-reattached";
  /** Its tool's action is callable now. */
  action_available?: boolean;
  /** Clients Molis Work's own MCP server is open to: a known Runtime by batch 22's `ExternalToolId`, or another client by its id. */
  granted_to?: Array<{ client_id: string; title: string; external_tool?: ExternalToolId }>;
}

/** What a reporter returns for one entry. `source` and the pack are stamped by the gatherer for a plugin reporter (§4.6). */
export interface KitReportedCommon {
  /** Stable within its reporter; with the reporter it is the entry's `KitEntryKey`. */
  entry_id: string;
  name: string;
  description: string;
  version: KitVersion;
  declares: KitDeclared;
  /** The project of the call context, or the personal space (shown as 「个人空间」). */
  scope: "project" | "home";
  /** Where it takes effect, in the owner's words: the features a prompt serves, who an MCP server is for. */
  where: string[];
  availability: KitAvailability;
  usage: KitUsage;
  manage?: KitManageLink;
  /** How it leaves this Home (§4.9). */
  export: "package" | "user_data" | "reference" | "none";
  /** Only a named system reporter may give these (§4.6); a plugin reporter's entries get its own installation and pack. */
  source?: KitSource;
  pack?: KitPackId;
}

export type KitReportedEntry =
  | (KitReportedCommon & { kind: "skill"; skill: SkillCatalogEntry })
  | (KitReportedCommon & { kind: "prompt"; ref: { owner_id: string; prompt_id: string };
      /** The roles it belongs to (§4.2); empty means the personal assistant. */
      prompt: { use: "agent" | "instruction"; edited: boolean; roles: KitRoleRef[] } })
  | (KitReportedCommon & { kind: "role"; ref: KitRoleRef;
      /** `host_tools` as declared: the pack's tools are computed from these (§4.3). */
      role: { subagent: boolean; execution?: AgentRoleExecution; host_tools: string[] } })
  | (KitReportedCommon & { kind: "tool"; ref: { tool: string }; tool: { origin: KitToolOrigin; writes: boolean } })
  | (KitReportedCommon & { kind: "mcp"; ref: KitMcpRef; mcp: KitMcpState });

/** One entry as `kit.catalog.list` returns it. */
export type KitEntry = KitReportedEntry & {
  key: KitEntryKey;
  source: KitSource;
  reporter: { provider_id: string; title: string };
  /** The pack it belongs to; a tool's is `system:builtin`. */
  pack: KitPackId;
  /** Tools only: every pack that has it (§4.3). */
  in_packs?: KitPackId[];
};

export const KIT_REPORT_INPUT_TYPE = /* @version type.molis.kit-report.input "molis.kit-report.input.v{version}" */ "molis.kit-report.input.v1";
export const KIT_REPORT_OUTPUT_TYPE = /* @version type.molis.kit-report.output "molis.kit-report.output.v{version}" */ "molis.kit-report.output.v1";
/** Closed and empty: a reporter reports everything it owns in the call's scope; filtering by kind is the page's. */
export type KitReportInput = Record<string, never>;
/**
 * A pack header the plugin install service gives for a plugin installation (§4.4), from its own install record: who it is (name,
 * version, publisher, trust) and its state. Never from a plugin reporter.
 */
export interface KitReportedPack {
  source: Extract<KitSource, { kind: "plugin" }>;
  description: string;
  status: "enabled" | "disabled" | "uninstalled";
  /** Its signed content package is kept as installed, so 「导出这个包」 can carry it (`plugins.package.export@1`). */
  exportable?: true;
  upgraded?: { from: string; to: string; at: string };
}
export interface KitReport { entries: KitReportedEntry[]; packs?: KitReportedPack[] }

/** Limits written into the schemas (§4.5). */
export const KIT_LIMITS = { nameChars: 200, descriptionChars: 2000, where: 20, whereChars: 200, declared: 64, entriesPerReporter: 2000, rolesPerPack: 64 } as const;

const id = { type: "string", minLength: 1, maxLength: 200 } as const;
const text = (maxLength: number) => ({ type: "string", maxLength } as const);
const count = { type: "integer", minimum: 0 } as const;
const words = (maxLength: number) => ({ type: "array", maxItems: maxLength, items: id } as const);
const executions = { "read-only": true, "text-edit": true, "workspace-write": true, operate: true } satisfies Record<AgentRoleExecution, true>;
const trusts = { host: true, pinned: true, home_local: true } satisfies Record<SkillPackTrust, true>;

/** A pack id (§4.1): the only three forms there are. */
export const KIT_PACK_ID_SCHEMA: ActionSchema = { type: "string", maxLength: 220, pattern: "^(?:plugin:[^\\s]{1,200}|system:builtin|system:characters)$" };
/** A same-origin path: never another origin, never `//`. Whose surface it is the gatherer checks (§4.6). */
export const KIT_MANAGE_LINK_SCHEMA: ActionSchema = object({ href: { type: "string", maxLength: 1000, pattern: "^/(?!/)" }, label: text(KIT_LIMITS.nameChars) });
export const KIT_VERSION_SCHEMA: ActionSchema = object({ label: text(KIT_LIMITS.nameChars), change: { oneOf: [
  object({ kind: { const: "default_updated" }, base_version: count, default_version: count }),
  object({ kind: { const: "discovered" }, added: count, removed: count, changed: count }),
] } }, ["label"]);
const characterRef = { oneOf: [object({ kind: { const: "personal" }, character_id: id }), object({ kind: { const: "project" }, member_id: id })] };
const pluginSource = object({ kind: { const: "plugin" }, plugin_id: id, title: text(KIT_LIMITS.nameChars), version: id, install_id: id,
  publisher_label: text(KIT_LIMITS.nameChars), trust: { enum: Object.keys(trusts) } });
/** The plugin form of `KitSource`: a plugin pack's installation. */
export const KIT_PLUGIN_SOURCE_SCHEMA: ActionSchema = pluginSource;
export const KIT_SOURCE_SCHEMA: ActionSchema = { oneOf: [pluginSource,
  object({ kind: { const: "system" }, module: id, title: text(KIT_LIMITS.nameChars) }),
  object({ kind: { const: "runtime" }, package: id, version: id }),
  object({ kind: { const: "character" }, role: characterRef, title: text(KIT_LIMITS.nameChars), revision: count }),
  object({ kind: { const: "mcp_server" }, owner: { enum: ["project", "connection"] }, server_id: id, label: text(KIT_LIMITS.nameChars) }),
  object({ kind: { const: "outbound" }, title: text(KIT_LIMITS.nameChars) }),
] };
const roleRef = { oneOf: [object({ kind: { const: "plugin" }, owner_id: id, role_id: id }), ...characterRef.oneOf, object({ kind: { const: "assistant" } })] };
const mcpRef = { oneOf: [
  object({ part: { const: "server" }, owner: { enum: ["project", "connection"] }, server_id: id, configuration_version: count }),
  object({ part: { const: "action_tool" }, action: ACTION_REFERENCE_SCHEMA }),
  object({ part: { enum: ["tool", "prompt", "resource"] }, server_id: id, name: id }),
  object({ part: { const: "outbound" }, client_id: id }),
] };
const mcpState = object({ server_enabled: { type: "boolean" }, health: { enum: ["connected", "disconnected", "unavailable", "not-reattached"] },
  action_available: { type: "boolean" }, granted_to: { type: "array", maxItems: 200, items: object({ client_id: id, title: text(KIT_LIMITS.nameChars), external_tool: id }, ["client_id", "title"]) } }, []);
const usage = { oneOf: [
  object({ kind: { const: "recent" }, count, last_at: { type: ["string", "null"] }, kept: { oneOf: [object({ rows_per_key: count }), object({ days: count })] } }),
  object({ kind: { const: "last_only" }, last_at: id }), object({ kind: { const: "none" } }), object({ kind: { const: "not_counted" } }),
] };
const availability = { oneOf: [object({ available: { const: true } }),
  object({ available: { const: false }, reason: id, detail: text(KIT_LIMITS.descriptionChars) }, ["available", "reason"])] };

/** Each kind's own fields; the closed schemas below take nothing else, so a body, a credential, an endpoint or a path has no field. */
const KINDS = {
  skill: { skill: SKILL_CATALOG_ENTRY_SCHEMA },
  prompt: { ref: object({ owner_id: id, prompt_id: id }), prompt: object({ use: { enum: ["agent", "instruction"] }, edited: { type: "boolean" },
    roles: { type: "array", maxItems: KIT_LIMITS.rolesPerPack, items: roleRef } }) },
  role: { ref: roleRef, role: object({ subagent: { type: "boolean" }, execution: { enum: Object.keys(executions) }, host_tools: words(KIT_LIMITS.declared) }, ["subagent", "host_tools"]) },
  tool: { ref: object({ tool: id }), tool: object({ origin: { enum: [...KIT_TOOL_ORIGINS] }, writes: { type: "boolean" } }) },
  mcp: { ref: mcpRef, mcp: mcpState },
} satisfies Record<KitKind, Record<string, unknown>>;
const COMMON = { entry_id: id, name: { ...id, maxLength: KIT_LIMITS.nameChars }, description: text(KIT_LIMITS.descriptionChars), version: KIT_VERSION_SCHEMA,
  declares: object({ tools: words(KIT_LIMITS.declared), permissions: words(KIT_LIMITS.declared), connector_categories: words(KIT_LIMITS.declared) }),
  scope: { enum: ["project", "home"] }, where: { type: "array", maxItems: KIT_LIMITS.where, items: text(KIT_LIMITS.whereChars) }, availability, usage,
  manage: KIT_MANAGE_LINK_SCHEMA, export: { enum: ["package", "user_data", "reference", "none"] } };
const REQUIRED = ["entry_id", "name", "description", "version", "declares", "scope", "where", "availability", "usage", "export"];

/** One schema per kind: a reported entry (`source`, `pack` optional), or a gathered one (stamped, keyed, with its reporter). */
function entrySchema(gathered: boolean): ActionSchema {
  const extra = gathered ? { source: KIT_SOURCE_SCHEMA, pack: KIT_PACK_ID_SCHEMA, key: { type: "string", minLength: 1, maxLength: 420 },
    reporter: object({ provider_id: id, title: text(KIT_LIMITS.nameChars) }), in_packs: { type: "array", items: KIT_PACK_ID_SCHEMA } }
    : { source: KIT_SOURCE_SCHEMA, pack: KIT_PACK_ID_SCHEMA };
  const required = gathered ? [...REQUIRED, "source", "pack", "key", "reporter"] : REQUIRED;
  return { oneOf: Object.entries(KINDS).map(([kind, fields]) => ({ type: "object", additionalProperties: false,
    properties: { ...COMMON, ...extra, kind: { const: kind }, ...fields }, required: [...required, "kind", ...Object.keys(fields)] })) };
}
/** `KitReportedEntry`, closed: what the dispatcher checks a reporter's answer against. */
export const KIT_REPORTED_ENTRY_SCHEMA: ActionSchema = entrySchema(false);
/** `KitEntry`, closed: one entry of `kit.catalog.list@1`'s answer. */
export const KIT_ENTRY_SCHEMA: ActionSchema = entrySchema(true);

const upgraded = object({ from: id, to: id, at: id });
/** `{ from, to, at }` of a plugin pack's last upgrade, from the install record. */
export const KIT_UPGRADED_SCHEMA: ActionSchema = upgraded;
export const KIT_REPORT_INPUT_SCHEMA: ActionSchema = inputSchemaFor<KitReportInput>()(object({}));
/**
 * `KitReport`, closed. The dispatcher checks every answer against it: one extra field anywhere (a `body`, say) voids that reporter's
 * whole answer, which the gatherer lists among its issues.
 */
export const KIT_REPORT_OUTPUT_SCHEMA: ActionSchema = object({
  entries: { type: "array", maxItems: KIT_LIMITS.entriesPerReporter, items: KIT_REPORTED_ENTRY_SCHEMA },
  packs: { type: "array", maxItems: KIT_LIMITS.entriesPerReporter, items: object({ source: pluginSource, description: text(KIT_LIMITS.descriptionChars),
    status: { enum: ["enabled", "disabled", "uninstalled"] }, exportable: { const: true }, upgraded }, ["source", "description", "status"]) },
}, ["entries"]);

/**
 * One owner's report of its own kit entries in the call's scope. Read-only: it never connects a server, calls a tool or refreshes a
 * credential. Audiences are the owner's rule, `user` at least; it waits for no model, so it is not `concurrent`.
 */
export function defineKitReportAction(capabilityId: string, version: number, title: string, permissions: string[],
  options: { scope?: "project" | "home"; audiences?: ActionAudience[] } = {}): ActionDefinition<KitReportInput, KitReport> {
  return { capability_id: capabilityId, version, operation: "query", action: { title, description: "列出本插件在这个范围里拥有的技能、提示词、角色、工具或 MCP 条目；只读，不连接服务器、不调用工具、不刷新凭据。",
    kind: "query", scope: options.scope ?? "home", effect: "read", scheduling: "concurrent", permissions, audiences: [...new Set<ActionAudience>(["user", ...options.audiences ?? []])], subject_kinds: [],
    input_type: KIT_REPORT_INPUT_TYPE, output_type: KIT_REPORT_OUTPUT_TYPE, input_schema: KIT_REPORT_INPUT_SCHEMA, output_schema: KIT_REPORT_OUTPUT_SCHEMA } };
}
