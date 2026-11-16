import assert from "node:assert/strict";
import test from "node:test";
import { isSkillPickConsumer, SKILL_PICK_CONSUMERS } from "@molis-ai/molis-work-contracts/services/skills";

// SKL-11: the frame and the shell accept the round's consumer from the Assistant, Coding, and a plugin Agent; an audience that
// cannot show a Skill line cannot use the same event to open the panel.
test("SKL-11: a Skill pick accepts assistant, coding and agent, and rejects every other consumer", () => {
  assert.deepEqual(SKILL_PICK_CONSUMERS, ["assistant", "coding", "agent"]);
  for (const consumer of ["assistant", "coding", "agent"]) assert.equal(isSkillPickConsumer(consumer), true, consumer);
  for (const consumer of ["mcp", "plugin", "workflow", "user", "", 1, null, undefined]) assert.equal(isSkillPickConsumer(consumer), false, String(consumer));
});
