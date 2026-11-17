import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { CharacterTemplateAdoptionInput } from "@molis-ai/molis-work-contracts/modules/characters";
import { createCharactersActionHandlers, openCharacters } from "@molis-ai/molis-work-module-characters";

// The role service (specs/onboarding-coverage/role-service-design.md §2–§4, §9): members whose two sections each follow the original
// or are the project's own, the prompt when the original changes, how a new task's role is chosen, template adoption and the reads
// the picker, the settings pages and the kit catalog make.

const PROJECT = "project-a";
const content = { title: "核对者", instructions: "先核对证据。", host_tools: ["read-file"] };

function space(t: { after(callback: () => void): void }, actor = "actor-a") {
  const home = mkdtempSync(join(tmpdir(), "molis-roles-service-")), store = openCharacters(home, actor);
  t.after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });
  return store.service;
}
const refused = (code: string) => (error: unknown) => (error as { code?: string }).code === code;

test("ROLE-02: a member follows the original's latest version in both sections; overriding one keeps the other following and an earlier override", t => {
  const service = space(t), original = service.create(content), member = service.roles.addMember(PROJECT, original.character_id);
  assert.deepEqual(member.sections, { work_style: { mode: "follow" }, capabilities: { mode: "follow" } });
  // The original changes: a member following both sections reads the new version.
  const saved = service.update(original.character_id, original.revision, { ...content, instructions: "先读需求。" });
  const following = service.roles.memberRole(PROJECT, member.current.member_id)!;
  assert.equal(following.current.original.version, 2);
  assert.equal(service.roles.content(PROJECT, following.current).content.instructions, "先读需求。");
  // Override the way of working: the capabilities still follow the original.
  const styled = service.roles.saveMember(PROJECT, member.current.member_id, following.revision, 2, { work_style: { instructions: "本项目先列清单。" } });
  assert.equal(styled.sections.work_style.mode, "override");
  assert.deepEqual(styled.sections.capabilities, { mode: "follow" });
  service.update(original.character_id, saved.revision, { ...content, instructions: "先读需求。", host_tools: ["read-file", "search"] });
  const later = service.roles.memberRole(PROJECT, member.current.member_id)!, built = service.roles.content(PROJECT, later.current).content;
  assert.deepEqual([built.instructions, built.host_tools], ["本项目先列清单。", ["read-file", "search"]], "the followed section takes the original's newer tools");
  // Then change only what it may use: the earlier override of the way of working is kept.
  const both = service.roles.saveMember(PROJECT, member.current.member_id, later.revision, 3, { capabilities: { host_tools: [] } });
  assert.deepEqual([both.sections.work_style.mode, both.sections.capabilities.mode], ["override", "override"]);
  const final = service.roles.content(PROJECT, both.current).content;
  assert.deepEqual([final.title, final.instructions, final.host_tools], ["核对者", "本项目先列清单。", []], "the title always comes from the original");
});

test("ROLE-03: only a change to a section the member overrode prompts; keeping clears it until that section changes again; following saves a version", t => {
  const service = space(t), original = service.create(content), member = service.roles.addMember(PROJECT, original.character_id);
  const id = member.current.member_id;
  let role = service.roles.saveMember(PROJECT, id, member.revision, 1, { work_style: { instructions: "本项目的做法。" } });
  let draft = service.update(original.character_id, original.revision, { ...content, host_tools: ["search"] });
  role = service.roles.memberRole(PROJECT, id)!;
  assert.equal((role.sections.work_style as { original_changed: boolean }).original_changed, false, "a change to the followed section does not prompt");
  draft = service.update(original.character_id, draft.revision, { ...content, instructions: "原件新做法。", host_tools: ["search"] });
  role = service.roles.memberRole(PROJECT, id)!;
  assert.equal((role.sections.work_style as { original_changed: boolean }).original_changed, true, "a change to the overridden section prompts");
  // 「保持本项目的」 acknowledges the original's version without saving a member version.
  const kept = service.roles.setSection(PROJECT, id, "work_style", role.revision, 3, "keep");
  assert.equal((kept.sections.work_style as { original_changed: boolean }).original_changed, false);
  assert.equal(kept.current.member_version, role.current.member_version);
  // A later change to the other section does not prompt; a change to this section prompts again.
  draft = service.update(original.character_id, draft.revision, { ...content, instructions: "原件新做法。", host_tools: ["read-file"] });
  assert.equal((service.roles.memberRole(PROJECT, id)!.sections.work_style as { original_changed: boolean }).original_changed, false);
  service.update(original.character_id, draft.revision, { ...content, instructions: "原件再改。", host_tools: ["read-file"] });
  role = service.roles.memberRole(PROJECT, id)!;
  assert.equal((role.sections.work_style as { original_changed: boolean }).original_changed, true);
  // 「改为跟随」 saves a new member version that reads the original's current section.
  const followed = service.roles.setSection(PROJECT, id, "work_style", role.revision, 5, "follow");
  assert.deepEqual(followed.sections.work_style, { mode: "follow" });
  assert.equal(followed.current.member_version, role.current.member_version + 1);
  assert.equal(service.roles.content(PROJECT, followed.current).content.instructions, "原件再改。");
  // A stale revision or a stale original version is refused with what is current.
  assert.throws(() => service.roles.setSection(PROJECT, id, "work_style", role.revision, 5, "keep"), refused("characters.conflict"));
  assert.throws(() => service.roles.saveMember(PROJECT, id, followed.revision, 4, { work_style: { instructions: "x" } }), refused("characters.conflict"));
});

test("ROLE-05: a new task's role is the task's own, else the project's, else the person's, else the Assistant; an explicit Assistant is not inheriting", t => {
  const service = space(t), mine = service.create(content), theirs = service.create({ ...content, title: "写作者" });
  const member = service.roles.addMember(PROJECT, theirs.character_id), memberRef = { kind: "project", member_id: member.current.member_id } as const;
  assert.deepEqual(service.roles.effective(PROJECT), { kind: "assistant", source: "assistant" }, "nothing set: the Assistant itself");
  service.roles.setDefault(null, { layer: "personal", selection: { kind: "personal", character_id: mine.character_id } });
  assert.deepEqual(service.roles.effective(PROJECT), { kind: "role", source: "personal", version: { kind: "personal", character_id: mine.character_id, version: 1 } });
  service.roles.setDefault(PROJECT, { layer: "project", selection: memberRef });
  assert.equal(service.roles.effective(PROJECT).source, "project");
  assert.equal(service.roles.effective(PROJECT, { kind: "personal", character_id: mine.character_id }).source, "task", "the task's own choice comes first");
  assert.deepEqual(service.roles.effective(PROJECT, { kind: "assistant" }), { kind: "assistant", source: "task" });
  // The project choosing the Assistant is told apart from the project inheriting the person's default.
  service.roles.setDefault(PROJECT, { layer: "project", selection: { kind: "assistant" } });
  assert.deepEqual(service.roles.effective(PROJECT), { kind: "assistant", source: "project" });
  service.roles.setDefault(PROJECT, { layer: "project", selection: null });
  assert.equal(service.roles.effective(PROJECT).source, "personal");
  assert.deepEqual(service.roles.defaults(PROJECT).project, null);
  // Personal work has no project layer: it starts at the person's default and refuses a project default.
  for (const personal of [null, PERSONAL_SPACE_PROJECT_ID]) {
    assert.equal(service.roles.effective(personal).source, "personal");
    assert.throws(() => service.roles.setDefault(personal, { layer: "project", selection: { kind: "assistant" } }), refused("characters.invalid"));
  }
});

test("ROLE-06: a turned-off project default gives the Assistant naming it, without falling back to the person's default; the setting stays", t => {
  const service = space(t), mine = service.create(content), original = service.create({ ...content, title: "写作者" });
  const member = service.roles.addMember(PROJECT, original.character_id), memberRef = { kind: "project", member_id: member.current.member_id } as const;
  service.roles.setDefault(null, { layer: "personal", selection: { kind: "personal", character_id: mine.character_id } });
  service.roles.setDefault(PROJECT, { layer: "project", selection: memberRef });
  const off = service.roles.setMemberState(PROJECT, memberRef.member_id, member.revision, "disabled")!;
  assert.deepEqual(service.roles.effective(PROJECT), { kind: "assistant", source: "assistant", stopped_project_default: memberRef });
  assert.deepEqual(service.roles.defaults(PROJECT).project, memberRef, "the project's setting is kept");
  // The member back on, its original turned off: the same.
  service.roles.setMemberState(PROJECT, memberRef.member_id, off.revision, "active");
  assert.equal(service.roles.effective(PROJECT).source, "project");
  service.setState(original.character_id, original.revision, "disabled");
  assert.deepEqual(service.roles.effective(PROJECT), { kind: "assistant", source: "assistant", stopped_project_default: memberRef });
  assert.equal(service.roles.resolve(PROJECT).selection.kind, "assistant");
});

test("ROLE-09: personal work can use roles: the person's default resolves and a chosen original is kept as a stable choice", t => {
  const service = space(t), mine = service.create(content);
  for (const personal of [null, PERSONAL_SPACE_PROJECT_ID]) {
    const chosen = service.roles.resolve(personal, { kind: "personal", character_id: mine.character_id });
    assert.deepEqual(chosen.selection, { kind: "personal", character_id: mine.character_id });
    assert.equal(chosen.title, "核对者");
  }
  service.roles.setDefault(PERSONAL_SPACE_PROJECT_ID, { layer: "personal", selection: { kind: "personal", character_id: mine.character_id } });
  const resolved = service.roles.resolve(PERSONAL_SPACE_PROJECT_ID);
  assert.deepEqual([resolved.effective.source, resolved.selection], ["personal", { kind: "personal", character_id: mine.character_id }]);
  assert.equal(service.roles.snapshot(PERSONAL_SPACE_PROJECT_ID, { kind: "personal", character_id: mine.character_id, version: 1 }).instructions, content.instructions);
});

test("ROLE-12: template adoption creates or reuses once per request, replays its receipt, and reuse ends the creator's release; a release and a reuse race to one", async t => {
  const service = space(t), origin = { source: { kind: "package", plugin_id: "io.molis.work.weekly-scene", version: "1.2.0" }, part_id: "weekly-writer" } as const;
  const handlers = createCharactersActionHandlers({ actorId: "actor-a", open: () => ({ service, close: () => {} }), references: () => [] },
    { projectId: PROJECT, artifacts: { publish: async () => { throw new Error("unused"); }, read: async () => { throw new Error("unused"); } } as never });
  const create: CharacterTemplateAdoptionInput = { origin, request_id: "adopt-1", layer: "project", selection: { kind: "create" },
    template: { title: { literal: " 周报写作者 " }, instructions: "总结本周。", host_tools: null, action_tools: [] } };
  const created = await handlers.fromTemplate(create);
  assert.equal(created.outcome, "created");
  assert.equal(created.role.layer, "project");
  const member = created.role as Extract<typeof created.role, { layer: "project" }>;
  assert.deepEqual(service.roles.originOf(member.current.original.character_id), origin);
  assert.equal(service.get(member.current.original.character_id)!.title, "周报写作者");
  // The same request replays the receipt and writes nothing; the same id with other content is refused.
  assert.deepEqual(await handlers.fromTemplate(create), created);
  assert.equal(service.list().length, 1);
  await assert.rejects(handlers.fromTemplate({ ...create, template: { ...create.template, instructions: "别的" } } as CharacterTemplateAdoptionInput), refused("characters.conflict"));
  // Reusing the member gives it a new revision: the creator's release credential (the revision it held) no longer works.
  const reuse: CharacterTemplateAdoptionInput = { origin, request_id: "adopt-2", layer: "project",
    selection: { kind: "reuse", role: { kind: "project", member_id: member.current.member_id }, expected_revision: member.revision, expected_original_version: 1 } };
  const reused = await handlers.fromTemplate(reuse);
  assert.equal(reused.outcome, "reused");
  assert.notEqual((reused.role as typeof member).revision, member.revision);
  assert.throws(() => service.roles.setMemberState(PROJECT, member.current.member_id, member.revision, "removed"), refused("characters.conflict"));
  // A release and a reuse holding the same revision: only the first succeeds.
  const holder = (reused.role as typeof member).revision;
  service.roles.setMemberState(PROJECT, member.current.member_id, holder, "removed");
  await assert.rejects(handlers.fromTemplate({ ...reuse, request_id: "adopt-3",
    selection: { ...(reuse.selection as object), expected_revision: holder } } as CharacterTemplateAdoptionInput), refused("characters.not_found"));
  // Reads return each receipt with what is current now: the released member is gone, the original stays.
  const [first, missing] = service.roles.read(PROJECT, [{ by: "receipt", layer: "project", request_id: "adopt-1" }, { by: "receipt", layer: "project", request_id: "adopt-3" }]);
  assert.equal(first.kind, "receipt");
  assert.equal((first as { current: unknown }).current, null);
  assert.equal(missing.kind, "missing");
  handlers.dispose();
});

test("ROLE-13: one roles.list read holds everything the picker and both settings pages show", t => {
  const service = space(t), mine = service.create(content), off = service.create({ ...content, title: "停用的" });
  service.setState(off.character_id, off.revision, "disabled");
  const member = service.roles.addMember(PROJECT, mine.character_id);
  service.roles.saveMember(PROJECT, member.current.member_id, member.revision, 1, { capabilities: { host_tools: [] } });
  service.roles.setDefault(null, { layer: "personal", selection: { kind: "personal", character_id: mine.character_id } });
  const catalog = service.roles.catalog(PROJECT, service.list());
  assert.equal(catalog.in_project, true);
  assert.deepEqual(catalog.originals.map(entry => [entry.title, entry.version, entry.availability, entry.use]).sort(),
    [["停用的", 1, { available: false, reason: "disabled" }, { projects: 0, changed: 0 }], ["核对者", 1, { available: true }, { projects: 1, changed: 1 }]]);
  assert.deepEqual(catalog.members.map(entry => [entry.title, entry.role.sections.capabilities.mode, entry.host_tools, entry.availability]),
    [["核对者", "override", [], { available: true }]]);
  assert.deepEqual(catalog.defaults, { personal: { kind: "personal", character_id: mine.character_id }, project: null });
  assert.equal(catalog.effective.source, "personal");
  // Personal work: the same read, with no members and no project layer.
  const personal = service.roles.catalog(PERSONAL_SPACE_PROJECT_ID, service.list());
  assert.deepEqual([personal.in_project, personal.members, personal.defaults.project], [false, [], null]);
});

test("ROLE-15: the kit catalog reads originals Home-wide with how many projects use them, and this project's members with the sections they changed", async t => {
  const service = space(t), action = { capability_id: "io.molis.work.goals.list", version: 1, provider_id: "io.molis.work.goals" } as const;
  const mine = service.create({ ...content, action_tools: [action] } as never), other = service.create({ ...content, title: "写作者" });
  const member = service.roles.addMember(PROJECT, mine.character_id);
  service.roles.addMember(PROJECT, other.character_id);
  service.roles.saveMember(PROJECT, member.current.member_id, member.revision, 1, { work_style: { instructions: "本项目。" } });
  const handlers = createCharactersActionHandlers({ actorId: "actor-a", open: () => ({ service, close: () => {} }), references: () => [],
    imports: { runs: async () => [] } as never }, { projectId: PROJECT, artifacts: {} as never });
  const report = await handlers.kitReport();
  const byId = new Map(report.entries.map(entry => [entry.entry_id, entry]));
  const original = byId.get(mine.character_id)!, inProject = byId.get(`member:${member.current.member_id}`)!;
  assert.deepEqual([original.scope, original.description, original.version.label], ["home", "1 个项目在用", "第 1 版"]);
  assert.deepEqual([inProject.scope, inProject.description, inProject.version.label], ["project", "本项目改过：做事方式", "本项目第 2 版 · 原件第 1 版"]);
  assert.equal(report.entries.length, 4);
  // `usages` reports by what each role's current version can call: the original and its member, not the other role.
  const usages = handlers.usages({ action } as never).usages.map(usage => usage.usage_id);
  assert.deepEqual(usages, [`original:${mine.character_id}`, `member:${member.current.member_id}`]);
  // A member that overrides what it may use drops the action; the original still lists.
  const current = service.roles.memberRole(PROJECT, member.current.member_id)!;
  service.roles.saveMember(PROJECT, member.current.member_id, current.revision, 1, { capabilities: { host_tools: ["read-file"], action_tools: [] } });
  assert.deepEqual(handlers.usages({ action } as never).usages.map(usage => usage.usage_id), [`original:${mine.character_id}`]);
  handlers.dispose();
});

test("ROLE-02 ROLE-13: a member's current version reads the original as it is now, and restoring it keeps a following section following", t => {
  const service = space(t), original = service.create(content), member = service.roles.addMember(PROJECT, original.character_id), id = member.current.member_id;
  const styled = service.roles.saveMember(PROJECT, id, member.revision, 1, { work_style: { instructions: "本项目先列清单。" } });
  // The original's tools change after the member was saved: the member's current version is the same, the original's is newer.
  service.update(original.character_id, original.revision, { ...content, host_tools: ["read-file", "search"] });
  const [current, earlier] = service.roles.versionEntries(PROJECT, { kind: "project", member_id: id });
  assert.equal(current!.current, true);
  assert.equal(current!.ref.kind === "project" && current!.ref.member_version, styled.current.member_version);
  assert.deepEqual(current!.ref.kind === "project" && current!.ref.original, { kind: "personal", character_id: original.character_id, version: 2 }, "paired with the original's latest version");
  assert.deepEqual([current!.content.instructions, current!.content.host_tools], ["本项目先列清单。", ["read-file", "search"]], "the followed section shows the original's newer tools");
  assert.equal(earlier!.current, false);
  assert.deepEqual(earlier!.ref.kind === "project" && earlier!.ref.original.version, 1, "an earlier version keeps the original it was saved with");
  // Undo restores the current entry: the section that followed still follows, so the newer tools are kept.
  const now = service.roles.memberRole(PROJECT, id)!;
  const restored = service.roles.restoreMember(PROJECT, current!.ref as never, now.revision, 2);
  assert.deepEqual(restored.sections.capabilities, { mode: "follow" });
  assert.deepEqual(service.roles.content(PROJECT, restored.current).content.host_tools, ["read-file", "search"]);
});
