import assert from "node:assert/strict";
import test from "node:test";
import { automaticSkillMaterial } from "@molis-ai/molis-work-plugin-coding";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";

// SKP-10 (round-2 review, fixed): Coding's round lists the catalog's `auto`, `applies_to: coding` Skills by name and description and
// tells the model how to read a body on demand. Nothing is selected, no body is copied into the material, and a host without the
// catalog (or a failed read) simply lists nothing rather than failing the round.
const ref: SkillRef = { source: { kind: "plugin", plugin_id: "io.example.writing", plugin_version: "2.0.0", publisher_signature: "sig" },
  skill_id: "meeting-notes", version: 1, install_id: "writing-install", installation_generation: "g1" };

const listing = (answer: unknown) => ({ invoke: (() => Promise.resolve(answer)) as never });

test("SKP-10: the automatic Skills material lists names, descriptions and exact references, and how to read a body", async () => {
  const material = await automaticSkillMaterial(listing({ skills: [{ ref, name: "会议纪要", description: "整理会议时使用。", when_to_use: "开完会" }] }));
  assert.ok(material, "an auto Skill makes a material");
  assert.equal(material.material_id, "automatic-skills");
  assert.match(material.text, /skills\.body\.read/u, "names the action that reads a body");
  assert.match(material.text, /read-capability/u, "says which tool to use");
  assert.ok(material.text.includes("会议纪要") && material.text.includes("整理会议时使用。"), "lists the words the catalog gave");
  assert.ok(material.text.includes(ref.skill_id) && material.text.includes(ref.install_id), "lists the exact reference");
  assert.ok(!material.text.includes("Body of"), "no body is copied into the material");
});

test("SKP-10: without a catalog, without auto Skills, or when the read fails, the material is absent and the round goes on", async () => {
  assert.equal(await automaticSkillMaterial(listing({ skills: [] })), undefined, "no auto Skills, no material");
  assert.equal(await automaticSkillMaterial({ invoke: (() => Promise.reject(new Error("actions.dependency_missing"))) as never }), undefined,
    "a host without the catalog lists nothing instead of failing the round");
});
