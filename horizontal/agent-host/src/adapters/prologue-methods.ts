import { createHash } from "node:crypto";
import { fillSkillBody, MAX_SKILL_BODY_CHARS, prepareSkillIntent, type Runtime, type Skill } from "@prologue/sdk";
import { MAX_SKILL_BODY_CHARS as CONTRACT_MAX_SKILL_BODY_CHARS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { AgentRoundSkill } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * The contract's body limit is Prologue's: a round takes a body whole, and the SDK refuses a longer one. Both are literal types, so
 * changing either side alone stops this from compiling (batch 09, 9-5).
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const bodyLimitsAgree: Same<typeof CONTRACT_MAX_SKILL_BODY_CHARS, typeof MAX_SKILL_BODY_CHARS> = true;
void bodyLimitsAgree;

/**
 * The Skills frozen for this round, registered with Prologue and filled in as instructions (specs/capability-pack/contract-design.md
 * §3.2, §3.3). What is registered is keyed by its own content, so two installations' Skills with one `skill_id`, or a Skill whose body
 * changed in an upgrade, are never one registration. A Skill's `tools` only describe it: the registration names those of them the role
 * has, so a Skill never asks Prologue for a tool the role does not grant.
 */
export function inlineMethods(runtime: Runtime, registered: Map<string, Skill>, skills: readonly AgentRoundSkill[],
  characterTools: readonly string[], toolName: (name: string) => string): string[] {
  return skills.map(definition => {
    const tools = definition.tools.map(toolName).filter(tool => characterTools.includes(tool));
    const digest = createHash("sha256").update(JSON.stringify([definition.body, definition.name, tools])).digest("hex");
    let skill = registered.get(digest);
    if (!skill) {
      skill = runtime.skills.register({ id: `molis-skill-${digest.slice(0, 48)}`, version: 1, label: definition.name, shape: "bounded",
        tools, body: definition.body, humanInvocable: true });
      registered.set(digest, skill);
    }
    prepareSkillIntent({ registry: runtime.skills, skillRef: skill.ref, parameters: {}, mode: "inline", parentTools: [...characterTools], hostTools: [...characterTools] });
    return `用户为本轮选择的方法：${definition.name}（${definition.ref.skill_id}@${definition.ref.version}）\n${fillSkillBody({ body: skill.manifest.body!, parameters: {} })}`;
  });
}
