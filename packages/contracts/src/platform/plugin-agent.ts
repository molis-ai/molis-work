import type { LocalizedAgentBody } from "./model-prompts.js";
import type { ContractDescriptor } from "./package.js";

export const platformPluginAgentContract = {
  contractId: /* @version contract.io.molis.work.platform.plugin-agent "io.molis.work.platform.plugin-agent.v{version}" */ "io.molis.work.platform.plugin-agent.v1",
  kind: "platform",
  schemaVersion: /* @version contract.io.molis.work.platform.plugin-agent */ 1,
  maturity: "partial",
  ssot: "docs/horizontal/agent-host.md",
} as const satisfies ContractDescriptor;

/**
 * How far a role may act. Omitting it means read-only. A role can never widen
 * itself at start time; the Host freezes what the Manifest registered.
 */
export type AgentRoleExecution = "read-only" | "text-edit" | "workspace-write" | "operate";

/**
 * Host tools a business role (`workspace: "business"`) may name. None of them reads or writes a directory or runs a
 * command: asking the person, the round's todo list, looking up deferred tool schemas, the context room left,
 * registering a wait on the round's step (`board-wait`), and saying how it handles the person's supplements
 * (`acknowledge-inputs`: the runtime records it on its own input ledger as the AI's claim, and shows the model each
 * supplement's id only when a round lists it; specs/ai-input-receipts 3e-0). A business role's real work is the unified actions it is given at start; `operate` lets it call commands among them,
 * each under the effect policy, while `read-only` limits it to queries.
 */
export const BUSINESS_HOST_TOOLS = ["ask-user", "update-todo", "find-tools", "context-remaining", "board-wait", "acknowledge-inputs"] as const;

/**
 * Tools a method for business work may name: the capability gateway and the tools that touch no directory. A method a
 * Plugin offers to other Agents (the Assistant, a Character) is text that says how to use these; it grants nothing.
 * `change-reversible` is not among them: it runs a reversible change without the person's confirmation, granted by the role's
 * execution and the person's own "ask each time" setting, and a Skill's text cannot decide for the person to skip that.
 */
export const SKILL_TOOLS = ["find-capabilities", "read-capability", "change-capability", "suggest-action", ...BUSINESS_HOST_TOOLS] as const;

export interface AgentRoleDeclaration {
  role_id: string;
  version: number;
  name: string;
  execution?: AgentRoleExecution;
  /**
   * Explicit pure inference role (`none`), or a business role (`business`): no directory, but the unified actions it is
   * given and the root-free `BUSINESS_HOST_TOOLS`. Omission requires an authorized working directory.
   */
  workspace?: "required" | "none" | "business";
  /**
   * Prompt ids this role is composed from, in order.
   *
   * Omitted means every declared prompt, which is only right when all of them
   * are shared. Naming them is how a role keeps its own: a read-only role must
   * not be handed the prompt that tells a writer it may edit files.
   */
  prompts?: string[];
  /** Host tool names this role may call. Implementation and effect class stay with the Host. */
  host_tools?: string[];
  /** Read-only parent roles that must hand each child its own directory. */
  subagent_workspaces?: "required";
}

export interface AgentSubagentRoleDeclaration {
  /** Explicit child tools; omission grants none. */
  host_tools?: string[];
  role_id: string;
  version: number;
  name: string;
  execution?: AgentRoleExecution;
  /** Narrows which declared parent roles may dispatch this child. */
  parent_role_ids?: string[];
}

export interface AgentSubagentsDeclaration {
  parent_role_ids: string[];
  roles: AgentSubagentRoleDeclaration[];
}

/** Prompt bodies live in the Plugin package, never in the Manifest. */
/**
 * Which layer a prompt belongs to.
 *
 * A Run's instructions come from four different owners, and they answer to
 * different people: the product decides `base`, the Plugin's role decides
 * `role`, the project decides `project`, and the user decides `task`. Flattening
 * them into one string made the order the only thing distinguishing them — so
 * nothing could be replaced, shown or tested on its own.
 *
 * `task` is never a **declared** prompt. The task is what the user typed this
 * time; a package shipping one would be putting words in their mouth, and
 * `inspectAgentManifest` refuses it.
 */
export type AgentPromptLayer = "base" | "role" | "project" | "task";

/** Composition order. Later layers speak about the situation earlier ones set up. */
export const AGENT_PROMPT_LAYERS: readonly AgentPromptLayer[] = [
  "base", "role", "project", "task",
];

export interface AgentPromptDeclaration {
  prompt_id: string;
  version: number;
  /** Omitted means `role`, which is what a Plugin's own prompt almost always is. */
  layer?: AgentPromptLayer;
}

export interface AgentCompactionDeclaration {
  prompt_id: string;
  above_tokens: number;
}

/**
 * The prompt a writable round's last words are checked with against the round's facts when the round changed nothing
 * (D1②): what they say it did, or will now do, that the facts do not show is held once and continued. Absent: not checked.
 */
export interface AgentEndingReviewDeclaration {
  prompt_id: string;
}

/** Which built-in Agent may pick a method a Plugin offers to others (Manifest `methods`). */
export const SKILL_APPLIES_TO = ["assistant", "coding", "both"] as const;
export type SkillAppliesTo = (typeof SKILL_APPLIES_TO)[number];

/** What a file a Skill ships besides its body is for, and the folder under `skills/<skill_id>/` it lives in. */
export const SKILL_RESOURCE_FOLDERS = { reference: "references", script: "scripts", asset: "assets" } as const;
export type SkillResourceRole = keyof typeof SKILL_RESOURCE_FOLDERS;

/**
 * One file a Skill ships besides its body, read on demand (`references/`), run only in the permission island and sandbox
 * (`scripts/`, SKP-09), or used as is (`assets/`). The digest is checked when the package is assembled and on every read.
 */
export interface SkillResourceDeclaration {
  /** `skills/<skill_id>/<folder of role>/…`, relative to the package root. */
  path: string;
  role: SkillResourceRole;
  /** e.g. `text/markdown`, `text/x-python`, `image/png`. */
  media_type: string;
  bytes: number;
  /** Lower-case hex SHA-256 of the file's bytes. */
  sha256: string;
}

/**
 * Prologue's `MAX_SKILL_BODY_CHARS` (`@prologue/sdk`, `skill/core/invoke`): the longest body a round takes whole. Written here
 * again because contracts and the plugin SDK never depend on Prologue; change both together.
 */
export const MAX_SKILL_BODY_CHARS = 20_000;

/**
 * The limits a Skill declaration and its package are checked against (specs/skill-packs/contract-design.md §4.2). The package
 * limits are `CHARACTER_IMPORT_LIMITS`' (`modules/character-import`): an imported folder and a package are held to the same.
 */
export const SKILL_LIMITS = {
  /** A `skill_id`: lower-case letters, digits and hyphens, so it is also the folder name `skills/<skill_id>/`. */
  skillIdChars: 64,
  descriptionChars: 1024,
  whenChars: 500,
  argumentHintChars: 80,
  bodyLines: 500,
  bodyChars: MAX_SKILL_BODY_CHARS,
  resourcesPerSkill: 300,
  skillsPerPackage: 128,
  filesPerPackage: 4000,
  fileBytes: 8 * 1024 * 1024,
  packageBytes: 64 * 1024 * 1024,
} as const;

/**
 * A Skill: a versioned, on-demand way of doing something, which grants nothing. In Manifest `methods` it is offered to other
 * Agents (`PluginMethodDeclaration`, where `description` and `applies_to` are required); in `agent.skills` it is the Plugin's own
 * Agent's. The two differ only in what they may write, and the SDK's checks say so: `applies_to`, `user_invocable` and
 * `argument_hint` are only for `methods` (specs/skill-packs/contract-design.md §4.2).
 */
export interface AgentSkillDeclaration {
  skill_id: string;
  version: number;
  name: string;
  summary: string;
  /** A declaration, not a grant: each must be in `SKILL_TOOLS` for `methods`; a round still needs the action's authorization. */
  tools: string[];
  /** When to pick it, 1 to 1024 characters. */
  description?: string;
  when_to_use?: string;
  when_not_to_use?: string;
  /** `methods` only. */
  applies_to?: SkillAppliesTo;
  /** `methods` only. Omitted: the person may name it. */
  user_invocable?: boolean;
  /** `methods` only: what to write after the name when naming it, at most 80 characters. */
  argument_hint?: string;
  /** methods only: this Skill requires a local Agent; the signed reason survives import and restart (1–512 characters). */
  native_only_reason?: string;
  /** The body's path in the package, always `skills/<skill_id>/SKILL.md`; required in a signed package. */
  body?: string;
  resources?: SkillResourceDeclaration[];
  /** The connector categories the body writes placeholders for (`~~project tracker`), as lower-case tokens such as `project-tracker`. */
  connector_categories?: string[];
}

/**
 * A Skill a Plugin offers to other Agents (Manifest `methods`): every plugin, built in, sandboxed or with only declarations, writes
 * the same declaration, with when to pick it and which built-in Agent may. Nothing derives an id or fills in a default for it.
 */
export interface PluginMethodDeclaration extends AgentSkillDeclaration {
  description: string;
  applies_to: SkillAppliesTo;
}

export interface AgentSkillDefinition extends Omit<AgentSkillDeclaration, "body">, LocalizedAgentBody {
  /** The body's text, not the package path a declaration's `body` names. */
  body: string;
}

/** A method as a Plugin's code ships it (`PluginDefinition.methods`): its Manifest declaration, with the body's text. */
export interface PluginMethodDefinition extends Omit<PluginMethodDeclaration, "body">, LocalizedAgentBody {
  body: string;
}

export interface AgentPromptText extends LocalizedAgentBody {
  prompt_id: string;
  version: number;
  body: string;
  /** Omitted means `role`. The Host orders a composed role by this. */
  layer?: AgentPromptLayer;
  /** Set by the Host when this text is the person's edit of the default (its revision), not the shipped default. */
  user_revision?: number;
}

export function promptLayerOf(prompt: { layer?: AgentPromptLayer }): AgentPromptLayer {
  return prompt.layer ?? "role";
}

/**
 * Order prompts by layer, keeping the caller's order inside each layer.
 *
 * Stable on purpose: a role names its prompts in an order it meant, and
 * layering must not shuffle that — it only decides which group comes first.
 */
export function orderPromptsByLayer<T extends { layer?: AgentPromptLayer }>(
  prompts: readonly T[],
): T[] {
  return AGENT_PROMPT_LAYERS.flatMap(
    (layer) => prompts.filter((prompt) => promptLayerOf(prompt) === layer),
  );
}

/** A text material the Agent may read, taken from one of the Plugin's inputs. */
export interface AgentTextSourceDeclaration {
  input_port: string;
  output_port: string;
  artifact_type_id: string;
  schema_version: number;
}

export interface AgentManifest {
  /**
   * Input port carrying the working directory, for a Plugin that really does
   * receive it as an Artifact.
   *
   * Optional, and normally absent: the working directory is a **Host fact**.
   * The Host authorizes it, verifies its realpath, and passes it on the start
   * request; with none named, a run goes in the project's one output directory.
   * A Plugin reads the project's inputs and output through
   * `projects.directories.get`, not through a port. Declaring it here does not
   * make the Host believe it — start authority checks the directory either way.
   */
  directory_input_port?: string;
  text_sources?: AgentTextSourceDeclaration[];
  roles: AgentRoleDeclaration[];
  prompts: AgentPromptDeclaration[];
  compaction?: AgentCompactionDeclaration;
  ending_review?: AgentEndingReviewDeclaration;
  skills?: AgentSkillDeclaration[];
  mcp?: boolean;
  /** Absent means Character input is not accepted. Selection always names a fixed Artifact. */
  characters?: { selection: "optional-exact-artifact"; scope: "project-owner"; role_ids: string[] };
  subagents?: AgentSubagentsDeclaration;
}
