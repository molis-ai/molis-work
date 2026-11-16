import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CHARACTER_TASK_SELECTION_SCHEMA, type CharacterRoleVersionRef } from "@molis-ai/molis-work-contracts/modules/characters";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { openCharacters } from "@molis-ai/molis-work-module-characters";

// S-character-role-scope: a role is the person's own and a member is one project's own. Characters resolves a choice only for the
// person the call is made as and only in the project the call is in; the choice is a stable reference with no body or version, and a
// version a round froze is read back only while it still exists where it was frozen.

const PROJECT_A = "project-a", PROJECT_B = "project-b";
const content = { title: "核对者", instructions: "先核对证据。", host_tools: ["read-file"] };

function space(t: { after(callback: () => void): void }) {
  const home = mkdtempSync(join(tmpdir(), "molis-role-scope-")), opened: Array<ReturnType<typeof openCharacters>> = [];
  t.after(() => { for (const handle of opened.reverse()) handle.close(); rmSync(home, { recursive: true, force: true }); });
  const as = (actor: string) => { const handle = openCharacters(home, actor); opened.push(handle); return handle.service; };
  return { as };
}
const refused = (code: string) => (error: unknown) => (error as { code?: string }).code === code;

test("S-character-role-scope ROLE-11: another person's role and another project's member resolve to nothing, and no version of theirs reads", t => {
  const { as } = space(t), owner = as("actor-a"), other = as("actor-b");
  const original = owner.create(content), member = owner.roles.addMember(PROJECT_A, original.character_id);
  const personal = { kind: "personal", character_id: original.character_id } as const, inProject = { kind: "project", member_id: member.current.member_id } as const;
  const frozen = owner.roles.snapshot(PROJECT_A, member.current);
  assert.equal(frozen.instructions, content.instructions, "the owner's own choice in its own project resolves");
  // Another person: the same ids name nothing of theirs, as a new choice or as a frozen version.
  assert.throws(() => other.roles.effective(PROJECT_A, personal), refused("characters.disabled"));
  assert.throws(() => other.roles.effective(PROJECT_A, inProject), refused("characters.disabled"));
  assert.throws(() => other.roles.snapshot(PROJECT_A, member.current), refused("characters.not_found"));
  assert.throws(() => other.roles.snapshot(null, { kind: "personal", character_id: original.character_id, version: 1 }), refused("characters.not_found"));
  // Another project: a member belongs to the project it was added to; its version is not read from elsewhere, nor from personal work.
  assert.throws(() => owner.roles.effective(PROJECT_B, inProject), refused("characters.disabled"));
  assert.throws(() => owner.roles.effective(null, inProject), refused("characters.disabled"));
  assert.throws(() => owner.roles.snapshot(PROJECT_B, member.current), refused("characters.not_found"));
});

test("S-character-role-scope ROLE-16: a version reference whose member and original disagree is refused, not read as either", t => {
  const { as } = space(t), owner = as("actor-a");
  const first = owner.create(content), second = owner.create({ ...content, title: "另一个", instructions: "别的做法" });
  const member = owner.roles.addMember(PROJECT_A, first.character_id);
  const mismatched: CharacterRoleVersionRef = { ...member.current, original: { kind: "personal", character_id: second.character_id, version: 1 } };
  assert.throws(() => owner.roles.snapshot(PROJECT_A, mismatched), refused("characters.not_found"));
  assert.throws(() => owner.roles.snapshot(PROJECT_A, { ...member.current, member_version: member.current.member_version + 1 }), refused("characters.not_found"));
  assert.throws(() => owner.roles.snapshot(null, { kind: "personal", character_id: first.character_id, version: 2 }), refused("characters.not_found"), "a version never saved does not read");
});

test("S-character-role-scope ROLE-16: a choice is a stable reference only; a version, a body or an owner riding along is refused by the start contract", () => {
  for (const choice of [{ kind: "personal", character_id: "c" }, { kind: "project", member_id: "m" }, { kind: "assistant" }]) assertActionInput(CHARACTER_TASK_SELECTION_SCHEMA, choice);
  for (const forged of [
    { kind: "personal", character_id: "c", version: 3 },
    { kind: "project", member_id: "m", member_version: 2 },
    { kind: "project", member_id: "m", instructions: "伪造正文" },
    { kind: "personal", character_id: "c", owner_actor_id: "actor-b" },
    { kind: "project", member_id: "m", project_id: PROJECT_B },
    { kind: "assistant", character_id: "c" },
    { kind: "personal", character_id: "" },
    { kind: "original", character_id: "c" },
  ]) assert.throws(() => assertActionInput(CHARACTER_TASK_SELECTION_SCHEMA, forged), refused("actions.input_invalid"), JSON.stringify(forged));
});

test("S-character-role-scope ROLE-08: a turned-off role is refused as a new choice while its frozen version still reads; a removed member's version does not", t => {
  const { as } = space(t), owner = as("actor-a");
  const original = owner.create(content), member = owner.roles.addMember(PROJECT_A, original.character_id);
  const choice = { kind: "project", member_id: member.current.member_id } as const, frozen = member.current;
  const off = owner.roles.setMemberState(PROJECT_A, choice.member_id, member.revision, "disabled")!;
  assert.throws(() => owner.roles.effective(PROJECT_A, choice), refused("characters.disabled"));
  assert.equal(owner.roles.snapshot(PROJECT_A, frozen).instructions, content.instructions, "a round already running keeps its version");
  owner.roles.setMemberState(PROJECT_A, choice.member_id, off.revision, "removed");
  assert.throws(() => owner.roles.snapshot(PROJECT_A, frozen), refused("characters.not_found"));
  // Deleting the original takes its versions away from every project and from personal work.
  const kept = owner.create(content), elsewhere = owner.roles.addMember(PROJECT_B, kept.character_id);
  owner.setState(kept.character_id, kept.revision, "tombstoned");
  assert.throws(() => owner.roles.snapshot(PROJECT_B, elsewhere.current), refused("characters.not_found"));
  assert.throws(() => owner.roles.snapshot(null, { kind: "personal", character_id: kept.character_id, version: 1 }), refused("characters.not_found"));
});
