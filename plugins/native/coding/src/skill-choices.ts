import type { PluginActionClient, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { SKILL_EXCERPT_CHARS, skillCatalogActions, type SkillUnavailableReason } from "@molis-ai/molis-work-contracts/services/skills";
import { codingManifest } from "./manifest.js";
import type { CodingActivation } from "./route-activation.js";
import { unlessMissing } from "./route-selections.js";
import { codingSkills } from "./skills.js";

/** One Skill the method menu offers: Coding's own, or one of the shared catalog (`skills.catalog.list@1`); never its body. */
export interface CodingSkillChoice {
  ref: SkillRef;
  name: string;
  description: string;
  /** The body's opening, shown when the person asks to look at a Skill. */
  excerpt: string;
  available: boolean;
  reason?: SkillUnavailableReason;
  /**
   * A `manual` Skill of another plugin: only the Assistant can name it (D-1), so the menu shows it and does not keep it for the session;
   * a round that asks for it anyway is refused `not_named`.
   */
  assistant_only: boolean;
}

/**
 * Coding's own Skills (its Agent Manifest's `skills`) as a `SkillRef` names them: from this installation, which the Host checks against
 * its record when a round starts (specs/capability-pack/contract-design.md §3.1). They are not in the catalog's three states.
 */
export function ownSkillRefs(context: Pick<PluginStartContext, "plugin_id" | "version" | "install_id" | "installation_generation">): Array<{ ref: SkillRef; skill: (typeof codingSkills)[number] }> {
  const source = { kind: "plugin" as const, plugin_id: context.plugin_id, plugin_version: context.version, publisher_signature: codingManifest.publisher.signature };
  return codingSkills.map(skill => ({ skill, ref: { source, skill_id: skill.skill_id, version: skill.version, install_id: context.install_id, installation_generation: context.installation_generation } }));
}

/**
 * The Skills the method menu lists: Coding's own, then the catalog's for Coding (an Assistant-only one is not among them, SKP-03) that
 * are on in this scope, read as this installation with its own `skills:read`. A host without the catalog lists only Coding's own.
 */
export async function codingSkillChoices(a: CodingActivation, actions: PluginActionClient): Promise<CodingSkillChoice[]> {
  const own = ownSkillRefs(a.context).map(({ ref, skill }) => ({ ref, name: skill.name, description: skill.summary, excerpt: [...skill.body].slice(0, SKILL_EXCERPT_CHARS).join(""),
    available: true, assistant_only: false }));
  const listed = await unlessMissing(actions.invoke(skillCatalogActions.list, { applies_to: "coding", states: ["auto", "manual"] }), { skills: [] });
  return [...own, ...listed.skills.map(entry => ({ ref: entry.ref, name: entry.name, description: entry.description, excerpt: entry.excerpt,
    available: entry.availability.available, ...(entry.availability.available ? {} : { reason: entry.availability.reason }),
    assistant_only: entry.state === "manual" && entry.ref.install_id !== a.context.install_id }))];
}
