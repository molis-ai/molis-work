import type { ExactActionReference } from "./actions.js";
import type { SkillRef } from "../services/agent-definitions.js";

// The two Host-written call context fields that carry Skills the person named (specs/capability-pack/contract-design.md §2.3); the
// fields themselves, and who writes them, are on `ActionCallContext.named_skills` and `skill_round`. Re-exported by `platform/actions`.

/** Skills the person named, bound to the one action call the Host delivered them to. */
export interface ActionNamedSkills {
  /** The installation and the exact own action the Host bound them to; any other call never sees them. */
  readonly install_id: string;
  readonly action: ExactActionReference;
  /** `page`: the installation's own page named them in the route's envelope; `host`: the Host's delegation call handed them on. */
  readonly from: "page" | "host";
  readonly refs: readonly SkillRef[];
}

/** Who a round's Skill reads are for (`ActionCallContext.skill_round`). */
export interface ActionSkillRound {
  readonly consumer: "assistant" | "coding" | "agent";
  /** The round's frozen list of Skills the person named: a `manual` Skill outside it is `not_named`. */
  readonly named: readonly SkillRef[];
  /** `local`: a local Agent engine runs the round, so a `native_only` Skill may be read. */
  readonly engine?: "builtin" | "local";
}
