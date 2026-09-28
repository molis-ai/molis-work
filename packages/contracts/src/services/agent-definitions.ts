import type { ContractDescriptor } from "../platform/package.js";
import type { AgentPromptLayer, AgentRoleExecution } from "../platform/plugin-agent.js";

/**
 * The Host's register of every Agent definition that reaches a model: prompts (the parts of a role, and the
 * instructions of a direct model call), roles and their Characters. The system registers its own; a Plugin's come with
 * its declaration. The person's edits are an overlay on top — kept apart from the default, restorable, and never able
 * to widen what a role may do: directories, tools, actions and reviews are enforced by the Host in code.
 */
export const servicesAgentDefinitionsContract = {
  contractId: "io.molis.work.service.agent-definitions.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "specs/system-assistant/spec.md",
} as const satisfies ContractDescriptor;

/** Longest prompt the person may save. Long enough for any shipped prompt; short enough to stay a prompt. */
export const AGENT_PROMPT_MAX_CHARS = 20_000;

/** Who a definition comes from. */
export type AgentDefinitionSource =
  | { kind: "system"; module: string; title: string }
  | { kind: "plugin"; plugin_id: string; plugin_version: string; title: string };

/**
 * `agent` — one part of a role the Host composes and freezes when a run starts; `instruction` — what a direct model
 * call is told before its data (a Plugin's writing helper, a summary, a naming step).
 */
export type AgentPromptKind = "agent" | "instruction";

export interface AgentPromptRegistration {
  prompt_id: string;
  /** The shipped default's version. A newer default after the person's edit is shown as “default updated”. */
  version: number;
  kind: AgentPromptKind;
  layer?: AgentPromptLayer;
  title: string;
  purpose: string;
  /** Which roles or features use it, as the person reads them. */
  used_by: string[];
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
  default_version: number;
  default_body: string;
  /** What runs now: the person's version when there is one, otherwise the default. */
  effective: "default" | "user";
  body: string;
  user?: { revision: number; base_version: number; updated_at: string };
  /** The shipped default moved on after the person's edit; their version still runs until they choose. */
  default_updated: boolean;
  last_used?: { at: string; version: number; user_revision: number | null; caller: string };
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
  key: string;
  version: number;
  user_revision: number | null;
  caller: string;
  at: string;
}
