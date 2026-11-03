import type { ContractDescriptor } from "./package.js";

export const platformPluginAgentContract = {
  contractId: "io.molis.work.platform.plugin-agent.v1",
  kind: "platform",
  schemaVersion: 1,
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
  /** The methods that go with this role's purpose. Omitted: the role names none of its own. */
  skills?: AgentRoleSkillsDeclaration;
  /** Read-only parent roles that must hand each child its own directory. */
  subagent_workspaces?: "required";
}

/**
 * One purpose's methods. `allowed` are the block's `skills` a person may pick for this role; `default` are already picked
 * when a round of this role starts, and the person may take them off. Every allowed method's tools are among the role's
 * `host_tools`, so a method never asks for what the role cannot give.
 */
export interface AgentRoleSkillsDeclaration {
  allowed: string[];
  default?: string[];
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

export interface AgentSkillDeclaration {
  skill_id: string;
  version: number;
  name: string;
  summary: string;
  tools: string[];
}

export interface AgentSkillDefinition extends AgentSkillDeclaration {
  body: string;
}

export interface AgentPromptText {
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
   * request; a Plugin reads it through `projects.workspace.read.v1`, not
   * through a port. Declaring it here does not make the Host believe it —
   * start authority checks the directory either way.
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
