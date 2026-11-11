import type { ContractDescriptor } from "../platform/package.js";
import { defineErrorCodes } from "../platform/actions.js";
import type { AgentPromptLayer, AgentRoleExecution } from "../platform/plugin-agent.js";

/**
 * The Host's register of every Agent definition that reaches a model: prompts (the parts of a role, and the
 * instructions of a direct model call), roles and their Characters. The system registers its own; a Plugin's come with
 * its declaration. The person's edits are an overlay on top — kept apart from the default, restorable, and never able
 * to widen what a role may do: directories, tools, actions and reviews are enforced by the Host in code.
 */
export const servicesAgentDefinitionsContract = {
  contractId: /* @version contract.io.molis.work.service.agent-definitions "io.molis.work.service.agent-definitions.v{version}" */ "io.molis.work.service.agent-definitions.v1",
  kind: "service",
  schemaVersion: /* @version contract.io.molis.work.service.agent-definitions */ 1,
  maturity: "partial",
  ssot: "specs/archive/system-assistant/spec.md",
} as const satisfies ContractDescriptor;

/** Longest prompt the person may save. Long enough for any shipped prompt; short enough to stay a prompt. */
export const AGENT_PROMPT_MAX_CHARS = 20_000;

/**
 * The exact signed default of a role. A user edit is identified separately, never attributed to this signature. A method is a Skill and
 * is named by `SkillRef` only (specs/capability-pack/contract-design.md §2.2); `kind` stays so stored `prompt_uses.source_ref` rows read
 * as they were written.
 */
export interface SignedAgentReference {
  source: { kind: "plugin"; plugin_id: string; plugin_version: string; publisher_signature: string };
  kind: "role";
  entry_id: string;
}

/**
 * The exact reference to one Skill (specs/skill-packs/contract-design.md §4.3): the signed source of `SignedAgentReference` with the
 * Skill's own `version`, and the installation of `SignedAgentInstallation`. A round freezes these; a read is refused, never moved to
 * another version, once any part of it is no longer current. Delegation's "this round's Skills" use it too (batch 09, 9-1).
 */
export interface SkillRef {
  source: { kind: "plugin"; plugin_id: string; plugin_version: string; publisher_signature: string };
  skill_id: string;
  version: number;
  install_id: string;
  installation_generation: string;
}

/** Current installation selected by the Host, checked again at each new handoff. */
export interface SignedAgentInstallation {
  install_id: string;
  installation_generation: string;
  project_id: string | null;
}

export interface SignedAgentMaterial {
  default_ref: SignedAgentReference;
  effective: "default" | "user";
  user_revision: number | null;
  body: string;
}

/** Who a definition comes from. */
export type AgentDefinitionSource =
  | { kind: "system"; module: string; title: string }
  | { kind: "plugin"; plugin_id: string; plugin_version: string; title: string; publisher_signature?: string;
      /** How the Plugin came to be here: shipped with the system, or made in the Plugin Builder and installed. */
      origin?: "builtin" | "generated";
      /** An installed Plugin the person has stopped: its prompts stay visible and editable, but nothing calls them. */
      state?: "enabled" | "disabled" };

/**
 * `agent` — one part of a role the Host composes and freezes when a run starts; `instruction` — what a direct model
 * call is told before its data (a Plugin's writing helper, a summary, a naming step).
 */
export type AgentPromptKind = "agent" | "instruction";

export interface AgentPromptRegistration {
  default_ref?: SignedAgentReference;
  prompt_id: string;
  /** The shipped default's version. A newer default after the person's edit is shown as “default updated”. */
  version: number;
  kind: AgentPromptKind;
  layer?: AgentPromptLayer;
  title: string;
  purpose: string;
  /** Which roles or features use it, as the person reads them. */
  used_by: string[];
  /** An instruction's role (`InstructionPrompt.role_id`): one its owner declares, checked when the owner registers. Absent: the personal assistant's. */
  role_id?: string;
  body: string;
}

export interface AgentRoleRegistration {
  role_id: string;
  version: number;
  name: string;
  purpose: string;
  execution: AgentRoleExecution;
  workspace: "required" | "none" | "business";
  /** The prompts it is composed from, in order. */
  prompt_ids: string[];
  /** A child role another role dispatches. */
  subagent?: boolean;
}

/** One owner's definitions, registered together (the system module, or one Plugin version). */
export interface AgentDefinitionRegistration {
  /** `system:<module>` or the Plugin id. */
  owner_id: string;
  source: AgentDefinitionSource;
  prompts: AgentPromptRegistration[];
  roles: AgentRoleRegistration[];
  /** Methods this owner offers to other Agents for business work, with their bodies (the Manifest's `methods`). */
  methods?: AgentSkillRegistration[];
  /** What the Host knows is not registered for this owner, and why (shown in developer diagnostics). */
  notes?: string[];
}

export interface AgentSkillRegistration {
  skill_id: string;
  version: number;
  name: string;
  /** When it applies. */
  summary: string;
  tools: string[];
  body: string;
}

/**
 * A registered method as its owner declared it. Who may read it, and its exact reference (`SkillRef`), are the shared catalog's
 * (`skills.catalog.list@1`): this view names no second reference. A signed role is listed once, with the roles.
 */
export interface AgentSkillView {
  /** The installation that registered it, for a signed package's. */
  install_id?: string;
  /** `<owner_id>/<skill_id>`. */
  key: string;
  owner_id: string;
  source: AgentDefinitionSource;
  skill_id: string;
  version: number;
  name: string;
  summary: string;
  tools: string[];
}

export interface AgentPromptView {
  /** `<owner_id>/<prompt_id>`. */
  key: string;
  owner_id: string;
  source: AgentDefinitionSource;
  prompt_id: string;
  kind: AgentPromptKind;
  layer?: AgentPromptLayer;
  title: string;
  purpose: string;
  used_by: string[];
  default_ref?: SignedAgentReference;
  default_version: number;
  default_body: string;
  /** What runs now: the person's version when there is one, otherwise the default. */
  effective: "default" | "user";
  body: string;
  user?: { revision: number; base_version: number; default_ref?: SignedAgentReference; updated_at: string };
  /** The shipped default moved on after the person's edit; their version still runs until they choose. */
  default_updated: boolean;
  last_used?: { source_ref?: SignedAgentReference; at: string; version: number; user_revision: number | null; caller: string };
}

export interface AgentRoleView {
  key: string;
  owner_id: string;
  source: AgentDefinitionSource;
  role_id: string;
  version: number;
  name: string;
  purpose: string;
  execution: AgentRoleExecution;
  workspace: "required" | "none" | "business";
  subagent: boolean;
  prompt_keys: string[];
  /** Any of its prompts runs in the person's version. */
  edited: boolean;
}

/** A saved edit, for history and restore. */
export interface AgentPromptRevision {
  default_ref?: SignedAgentReference;
  revision: number;
  body: string | null;
  base_version: number;
  at: string;
  actor_id: string;
  /** `save` or `reset` (back to the default). */
  action: "save" | "reset";
}

/** What a model call used: the registered prompt, and whether it was the person's version. */
export interface AgentPromptUse {
  source_ref?: SignedAgentReference;
  key: string;
  version: number;
  user_revision: number | null;
  caller: string;
  at: string;
}

/** Developer diagnostics: what each owner registered, and what of it is not in effect, with why. */
export interface AgentDefinitionsDiagnostics {
  owners: Array<{
    owner_id: string;
    source: AgentDefinitionSource;
    prompts: number;
    instructions: number;
    roles: number;
    methods?: number;
    edited: number;
    issues: Array<{ level: "warning" | "info"; text: string }>;
  }>;
}

/** Most rows one prompt overrides file carries; a longer file is refused whole at preview (specs/capability-pack/contract-design.md §4.9). */
export const PROMPT_OVERRIDES_FILE_MAX_ROWS = 200;

/** The person's own edits of prompts, never a package and never installed. Also the `prompt_overrides` part of a kit pack file. */
export interface PromptOverridesFile {
  format: "molis.prompt-overrides";
  format_version: /* @version format.agent-definitions.prompt-overrides */ 1;
  exported_at: string;
  /** At most `PROMPT_OVERRIDES_FILE_MAX_ROWS`; each `body` at most `AGENT_PROMPT_MAX_CHARS`. `title` is a reminder only. */
  overrides: Array<{ owner_id: string; prompt_id: string; title: string; base_version: number; body: string }>;
}

/** The register's refusals its callers outside the Host see (specs/capability-pack/contract-design.md §4.2, §4.9, §4.11). */
export const agentDefinitionErrors = defineErrorCodes("agent_definitions", {
  /** A prompt overrides preview is unknown, already used, or another person's or another project's. */
  overrides_preview_unknown: "not_found",
  /** A confirmation names a preview row that is not `applicable`: the file's base is not the current default, or the prompt is gone. */
  overrides_row_not_applicable: "conflict",
  /** An instruction prompt's `role_id` is not a role its owner declares: the owner's registration is refused (`details`: owner, prompt, role). */
  instruction_role_unknown: "invalid",
});
