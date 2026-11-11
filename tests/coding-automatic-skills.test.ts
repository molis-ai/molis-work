import assert from "node:assert/strict";
import test from "node:test";
import { automaticSkillMaterial, withAutomaticSkillRead } from "@molis-ai/molis-work-plugin-coding";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { SKILLS_PROVIDER_ID, skillCatalogActions } from "@molis-ai/molis-work-contracts/services/skills";

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
  assert.match(material.text, /本轮工具/u, "says it is one of the round's own tools");
  assert.doesNotMatch(material.text, /read-capability/u, "Coding has no capability gateway tool");
  assert.ok(material.text.includes("会议纪要") && material.text.includes("整理会议时使用。"), "lists the words the catalog gave");
  assert.ok(material.text.includes(ref.skill_id) && material.text.includes(ref.install_id), "lists the exact reference");
  assert.ok(!material.text.includes("Body of"), "no body is copied into the material");
});

test("SKP-10: without a catalog, without auto Skills, or when the read fails, the material is absent and the round goes on", async () => {
  assert.equal(await automaticSkillMaterial(listing({ skills: [] })), undefined, "no auto Skills, no material");
  assert.equal(await automaticSkillMaterial({ invoke: (() => Promise.reject(new Error("actions.dependency_missing"))) as never }), undefined,
    "a host without the catalog lists nothing instead of failing the round");
});

// SKP-10 (round-4 recheck): Coding's round cannot reach `skills.body.read@1` unless it is listed as one of the round's per-action
// tools. The listing is added exactly when the automatic Skills material exists, never twice.
const readTool = { capability_id: skillCatalogActions.readBodies.capability_id, version: skillCatalogActions.readBodies.version, provider_id: SKILLS_PROVIDER_ID };
const readOffered = { capability_id: readTool.capability_id, version: readTool.version, provider: { provider_id: SKILLS_PROVIDER_ID, audiences: [] }, availability: { available: true },
  action: { audiences: ["agent"] } } as never;
const offeredWith = (change: object) => ({ ...(readOffered as object), ...change }) as never;

test("SKP-10: the automatic listing adds the catalog body read to this round's per-action tools, only when it is offered to agents", () => {
  assert.deepEqual(withAutomaticSkillRead([], [readOffered], true), [readTool], "with the listing the round can open a body");
  assert.deepEqual(withAutomaticSkillRead([], [readOffered], false), [], "no listing, no read tool");
  assert.deepEqual(withAutomaticSkillRead([], [], true), [], "a Host that does not offer it adds nothing (the round must not turn unavailable)");
  assert.deepEqual(withAutomaticSkillRead([], [offeredWith({ availability: { available: false, reason: "unavailable" } })], true), [], "an unavailable provider adds nothing");
  assert.deepEqual(withAutomaticSkillRead([], [offeredWith({ action: { audiences: ["user", "plugin"] } })], true), [], "a view not offered to agents adds nothing");
  const existing = [{ capability_id: "demo.read", version: 1, provider_id: "demo" }];
  assert.deepEqual(withAutomaticSkillRead(existing, [readOffered], false), existing, "other tools kept, nothing added");
  assert.deepEqual(withAutomaticSkillRead([...existing, readTool], [readOffered], true), [...existing, readTool], "already present is not added twice");
});
