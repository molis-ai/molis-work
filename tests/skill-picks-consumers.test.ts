import assert from "node:assert/strict";
import test from "node:test";
import { isSkillPickConsumer } from "@molis-ai/molis-work-contracts/services/skills";

// SKL-11: the frame and the shell accept the round's consumer from the Assistant, a plugin Agent and any plugin's declared scene (Coding's
// `coding`, BL-b44-coding-scene-enum); a platform word that is no round's consumer, or a malformed name, cannot open the panel.
test("SKL-11: a Skill pick accepts assistant, agent and a plugin scene name, and rejects every other consumer", () => {
  for (const consumer of ["assistant", "agent", "coding", "writing-room"]) assert.equal(isSkillPickConsumer(consumer), true, consumer);
  for (const consumer of ["both", "common", "Coding", "1abc", "has space", "", 1, null, undefined]) assert.equal(isSkillPickConsumer(consumer), false, String(consumer));
});
