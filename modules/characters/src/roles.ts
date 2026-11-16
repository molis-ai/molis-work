import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import type { BlueprintPartOrigin } from "@molis-ai/molis-work-contracts/modules/characters";
import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { characterErrors, type CharacterDefaultSelection, type CharacterDefaults, type CharacterDraft, type CharacterMemberEntry, type CharacterOriginalEntry,
  type CharacterRole, type CharacterRoleAvailability, type CharacterRoleCatalog, type CharacterRoleContent, type CharacterRoleReadQuery, type CharacterRoleReadResult, type CharacterRoleSection,
  type CharacterRoleVersionEntry, type CharacterTemplateAdoptionResult, type CharacterRoleSnapshot, type CharacterRoleResolution,
  type CharacterRoleVersionRef, type CharacterSectionStatus, type CharacterTaskSelection, type CharacterTemplateAdoptionInput, type EffectiveCharacterSelection, type PersonalCharacterRef,
  type PersonalCharacterVersionRef, type ProjectCharacterMemberRef, type ProjectCharacterVersionRef } from "@molis-ai/molis-work-contracts/modules/characters";

// A person's roles beyond the draft (specs/onboarding-coverage/role-service-design.md §2–§4): the fixed versions of an original, a
// project's members whose two sections each follow the original or are the project's own, the two default layers and how a new
// task's role is chosen from them. Every query names the owner, so another person's rows are never read; a member is found only in
// the project it belongs to.

/** What a section holds: the way of working, or what it may use. The title always comes from the original. */
type SectionValue = { work_style: { instructions: string }; capabilities: Pick<CharacterRoleContent, "host_tools" | "action_tools"> };
type StoredSection<S extends CharacterRoleSection> = { mode: "follow" }
  | { mode: "override"; based_on_original_version: number; acknowledged_original_version: number; value: SectionValue[S] };
type StoredSections = { [S in CharacterRoleSection]: StoredSection<S> };
const SECTIONS: readonly CharacterRoleSection[] = ["work_style", "capabilities"];
const FOLLOW: StoredSections = { work_style: { mode: "follow" }, capabilities: { mode: "follow" } };

interface MemberRow { member_id: string; project_id: string; character_id: string; state: "active" | "disabled" | "removed"; revision: string; member_version: number;
  sections: StoredSections; origin: BlueprintPartOrigin | null }

/** The project a call is in, or none: personal work starts at the personal layer and has no members. */
export const projectLayerOf = (projectId: string | null): string | null => projectId && projectId !== PERSONAL_SPACE_PROJECT_ID ? projectId : null;

export const sectionOf = <S extends CharacterRoleSection>(content: CharacterRoleContent, section: S): SectionValue[S] => (section === "work_style"
  ? { instructions: content.instructions }
  : { host_tools: content.host_tools, ...(content.action_tools === undefined ? {} : { action_tools: content.action_tools }) }) as SectionValue[S];
const withSection = (content: CharacterRoleContent, section: CharacterRoleSection, value: SectionValue[CharacterRoleSection]): CharacterRoleContent => {
  if (section === "work_style") return { ...content, instructions: (value as SectionValue["work_style"]).instructions };
  const { action_tools: _dropped, ...rest } = content, caps = value as SectionValue["capabilities"];
  return { ...rest, host_tools: caps.host_tools, ...(caps.action_tools === undefined ? {} : { action_tools: caps.action_tools }) };
};
export const roleContentOf = (draft: Pick<CharacterDraft, "title" | "instructions" | "host_tools" | "action_tools" | "import_snapshot">): CharacterRoleContent => ({
  title: draft.title, instructions: draft.instructions, host_tools: draft.host_tools,
  ...(draft.action_tools === undefined ? {} : { action_tools: draft.action_tools }), ...(draft.import_snapshot ? { import_snapshot: draft.import_snapshot } : {}) });

export class CharacterRoles {
  constructor(private readonly db: DatabaseSync, private readonly actorId: string, private readonly drafts: { get(id: string): CharacterDraft | null },
    private readonly now: () => string = () => new Date().toISOString()) {}

  // ---- the original's fixed versions ----------------------------------------------------------------------------------------------

  latestVersion(characterId: string): { version: number; content: CharacterRoleContent; saved_at: string } | null {
    const row = this.db.prepare("SELECT version, content, saved_at FROM character_versions WHERE character_id = ? AND owner_actor_id = ? ORDER BY version DESC LIMIT 1")
      .get(characterId, this.actorId) as { version: number; content: string; saved_at: string } | undefined;
    return row ? { version: row.version, content: JSON.parse(row.content) as CharacterRoleContent, saved_at: row.saved_at } : null;
  }

  version(characterId: string, version: number): { content: CharacterRoleContent; saved_at: string } | null {
    const row = this.db.prepare("SELECT content, saved_at FROM character_versions WHERE character_id = ? AND owner_actor_id = ? AND version = ?")
      .get(characterId, this.actorId, version) as { content: string; saved_at: string } | undefined;
    return row ? { content: JSON.parse(row.content) as CharacterRoleContent, saved_at: row.saved_at } : null;
  }

  versions(characterId: string): Array<{ version: number; content: CharacterRoleContent; saved_at: string }> {
    return (this.db.prepare("SELECT version, content, saved_at FROM character_versions WHERE character_id = ? AND owner_actor_id = ? ORDER BY version DESC")
      .all(characterId, this.actorId) as Array<{ version: number; content: string; saved_at: string }>).map(row => ({ version: row.version, content: JSON.parse(row.content) as CharacterRoleContent, saved_at: row.saved_at }));
  }

  /** The draft as saved now becomes the next version, unless it says what the latest version says. Called inside the draft's write. */
  saveVersion(draft: CharacterDraft): number {
    const content = roleContentOf(draft), latest = this.latestVersion(draft.character_id);
    if (latest && isDeepStrictEqual(latest.content, content)) return latest.version;
    const version = (latest?.version ?? 0) + 1;
    this.db.prepare("INSERT INTO character_versions (character_id, owner_actor_id, version, draft_revision, saved_at, content) VALUES (?, ?, ?, ?, ?, ?)")
      .run(draft.character_id, this.actorId, version, draft.revision, draft.updated_at, JSON.stringify(content));
    return version;
  }

  originOf(characterId: string): BlueprintPartOrigin | null {
    const row = this.db.prepare("SELECT origin FROM character_origins WHERE character_id = ? AND owner_actor_id = ?").get(characterId, this.actorId) as { origin: string } | undefined;
    return row ? JSON.parse(row.origin) as BlueprintPartOrigin : null;
  }

  recordOrigin(characterId: string, origin: BlueprintPartOrigin): void {
    this.db.prepare("INSERT INTO character_origins (character_id, owner_actor_id, origin) VALUES (?, ?, ?)").run(characterId, this.actorId, JSON.stringify(origin));
  }

  /** The original as a role, or null when it is deleted or has never been saved as a version. */
  personalRole(characterId: string): Extract<CharacterRole, { layer: "personal" }> | null {
    const draft = this.drafts.get(characterId), latest = draft && draft.state !== "tombstoned" ? this.latestVersion(characterId) : null;
    if (!draft || !latest || draft.state === "tombstoned") return null;
    return { layer: "personal", state: draft.state, draft_revision: draft.revision, current: { kind: "personal", character_id: characterId, version: latest.version }, origin: this.originOf(characterId) };
  }

  // ---- members of a project -------------------------------------------------------------------------------------------------------

  private memberRow(projectId: string, memberId: string): MemberRow | null {
    const row = this.db.prepare("SELECT member_id, project_id, character_id, state, revision, member_version, sections, origin FROM character_members WHERE member_id = ? AND owner_actor_id = ? AND project_id = ?")
      .get(memberId, this.actorId, projectId) as (Omit<MemberRow, "sections" | "origin"> & { sections: string; origin: string | null }) | undefined;
    return row ? { ...row, sections: JSON.parse(row.sections) as StoredSections, origin: row.origin ? JSON.parse(row.origin) as BlueprintPartOrigin : null } : null;
  }

  /** A live member of this project, or `not_found`: another project's member is not told apart from one that never existed. */
  private liveMember(projectId: string, memberId: string): MemberRow {
    const row = this.memberRow(projectId, memberId);
    if (!row || row.state === "removed") throw characterErrors.not_found("本项目里没有这个角色");
    return row;
  }

  memberIds(projectId: string): string[] {
    return (this.db.prepare("SELECT member_id FROM character_members WHERE owner_actor_id = ? AND project_id = ? AND state != 'removed' ORDER BY created_at, member_id")
      .all(this.actorId, projectId) as Array<{ member_id: string }>).map(row => row.member_id);
  }

  /** How many live members of each original there are, and how many of them changed a section (the global list's 「几个项目在用」). */
  memberUse(): Map<string, { projects: number; changed: number }> {
    const use = new Map<string, { projects: number; changed: number }>();
    for (const row of this.db.prepare("SELECT character_id, sections FROM character_members WHERE owner_actor_id = ? AND state != 'removed'").all(this.actorId) as Array<{ character_id: string; sections: string }>) {
      const entry = use.get(row.character_id) ?? { projects: 0, changed: 0 }, sections = JSON.parse(row.sections) as StoredSections;
      use.set(row.character_id, { projects: entry.projects + 1, changed: entry.changed + Number(SECTIONS.some(section => sections[section].mode === "override")) });
    }
    return use;
  }

  /** The member as a role, or null when it is removed or the original it follows is deleted or has no version. */
  memberRole(projectId: string, memberId: string): Extract<CharacterRole, { layer: "project" }> | null {
    const row = this.memberRow(projectId, memberId), original = row && row.state !== "removed" ? this.personalRole(row.character_id) : null;
    if (!row || !original) return null;
    const latest = this.version(row.character_id, original.current.version)!.content;
    const status = (section: CharacterRoleSection): CharacterSectionStatus => {
      const stored = row.sections[section];
      if (stored.mode === "follow") return { mode: "follow" };
      const seen = this.version(row.character_id, stored.acknowledged_original_version)?.content;
      return { mode: "override", based_on_original_version: stored.based_on_original_version, original_changed: !seen || !isDeepStrictEqual(sectionOf(seen, section), sectionOf(latest, section)) };
    };
    return { layer: "project", state: row.state === "active" && original.state === "active" ? "active" : "disabled", revision: row.revision,
      current: { kind: "project", member_id: memberId, member_version: row.member_version, original: original.current }, origin: row.origin,
      sections: { work_style: status("work_style"), capabilities: status("capabilities") } };
  }

  /** A new member of this project following the original in both sections. One live member per original per project. */
  addMember(projectId: string, characterId: string, origin: BlueprintPartOrigin | null = null): Extract<CharacterRole, { layer: "project" }> {
    if (!this.personalRole(characterId)) throw characterErrors.not_found("找不到这个角色，或它还没保存成版本");
    if (this.db.prepare("SELECT 1 FROM character_members WHERE owner_actor_id = ? AND project_id = ? AND character_id = ? AND state != 'removed'").get(this.actorId, projectId, characterId)) {
      throw characterErrors.conflict("这个角色已经在本项目里");
    }
    const memberId = randomUUID(), at = this.now();
    this.db.prepare("INSERT INTO character_members (member_id, owner_actor_id, project_id, character_id, state, revision, member_version, sections, origin, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, 1, ?, ?, ?, ?)")
      .run(memberId, this.actorId, projectId, characterId, `1.${randomUUID()}`, JSON.stringify(FOLLOW), origin ? JSON.stringify(origin) : null, at, at);
    this.db.prepare("INSERT INTO character_member_versions (member_id, member_version, original_version, saved_at, sections) VALUES (?, 1, ?, ?, ?)")
      .run(memberId, this.personalRole(characterId)!.current.version, at, JSON.stringify(FOLLOW));
    return this.memberRole(projectId, memberId)!;
  }

  /** The member's revision and the original version the caller saw both still hold, or `conflict`, which carries what is current. */
  private confirmedMember(projectId: string, memberId: string, expectedRevision: string, expectedOriginalVersion?: number): { row: MemberRow; original: number } {
    const row = this.liveMember(projectId, memberId), original = this.personalRole(row.character_id);
    if (!original) throw characterErrors.not_found("这个角色跟随的原件已删除");
    if (row.revision !== expectedRevision || (expectedOriginalVersion !== undefined && original.current.version !== expectedOriginalVersion)) {
      throw characterErrors.conflict("这个角色在别处刚改过，请看差异后再决定；当前修改尚未保存", { current: this.memberRole(projectId, memberId) });
    }
    return { row, original: original.current.version };
  }

  /** Writes the member's next version with these sections (and state), and a new revision. */
  private writeMember(row: MemberRow, original: number, sections: StoredSections, state: MemberRow["state"] = row.state, newVersion = true): void {
    const version = row.member_version + Number(newVersion), at = this.now();
    this.db.prepare("UPDATE character_members SET sections = ?, state = ?, revision = ?, member_version = ?, updated_at = ? WHERE member_id = ? AND owner_actor_id = ? AND revision = ?")
      .run(JSON.stringify(sections), state, `${version}.${randomUUID()}`, version, at, row.member_id, this.actorId, row.revision);
    if (newVersion) this.db.prepare("INSERT INTO character_member_versions (member_id, member_version, original_version, saved_at, sections) VALUES (?, ?, ?, ?, ?)")
      .run(row.member_id, version, original, at, JSON.stringify(sections));
  }

  /** Overrides the sections given and keeps the other one as it was: an earlier override of the other section is not cleared. */
  saveMember(projectId: string, memberId: string, expectedRevision: string, expectedOriginalVersion: number, values: Partial<SectionValue>): Extract<CharacterRole, { layer: "project" }> {
    const { row, original } = this.confirmedMember(projectId, memberId, expectedRevision, expectedOriginalVersion);
    const sections = { ...row.sections } as StoredSections;
    for (const section of SECTIONS) {
      const value = values[section];
      if (value !== undefined) (sections as Record<string, unknown>)[section] = { mode: "override", based_on_original_version: original, acknowledged_original_version: original, value };
    }
    this.writeMember(row, original, sections);
    return this.memberRole(projectId, memberId)!;
  }

  /** 「恢复跟随」 saves a version that follows again; 「保持本项目的」 only acknowledges the original's current version. */
  setSection(projectId: string, memberId: string, section: CharacterRoleSection, expectedRevision: string, expectedOriginalVersion: number, to: "follow" | "keep"): Extract<CharacterRole, { layer: "project" }> {
    const { row, original } = this.confirmedMember(projectId, memberId, expectedRevision, expectedOriginalVersion), stored = row.sections[section];
    if (stored.mode === "follow") return this.memberRole(projectId, memberId)!;
    this.writeMember(row, original, { ...row.sections, [section]: to === "follow" ? { mode: "follow" } : { ...stored, acknowledged_original_version: original } }, row.state, to === "follow");
    return this.memberRole(projectId, memberId)!;
  }

  setMemberState(projectId: string, memberId: string, expectedRevision: string, state: MemberRow["state"]): Extract<CharacterRole, { layer: "project" }> | null {
    const { row, original } = this.confirmedMember(projectId, memberId, expectedRevision);
    if (row.state !== state) this.writeMember(row, original, row.sections, state, false);
    return state === "removed" ? null : this.memberRole(projectId, memberId);
  }

  memberVersions(projectId: string, memberId: string): Array<{ member_version: number; original_version: number; saved_at: string; sections: StoredSections }> {
    this.liveMember(projectId, memberId);
    return (this.db.prepare("SELECT member_version, original_version, saved_at, sections FROM character_member_versions WHERE member_id = ? ORDER BY member_version DESC").all(memberId) as Array<{ member_version: number; original_version: number; saved_at: string; sections: string }>)
      .map(row => ({ member_version: row.member_version, original_version: row.original_version, saved_at: row.saved_at, sections: JSON.parse(row.sections) as StoredSections }));
  }

  /**
   * A member's past version saved as its next one: an overridden section takes its old value back; a section that followed then is
   * followed again if the original still says what it said in the version given, and otherwise is overridden here with what it said.
   */
  restoreMember(projectId: string, ref: ProjectCharacterVersionRef, expectedRevision: string, expectedOriginalVersion: number): Extract<CharacterRole, { layer: "project" }> {
    const { row, original } = this.confirmedMember(projectId, ref.member_id, expectedRevision, expectedOriginalVersion);
    const past = this.memberVersions(projectId, ref.member_id).find(version => version.member_version === ref.member_version);
    const then = this.version(row.character_id, ref.original.version)?.content, now = this.version(row.character_id, original)!.content;
    if (!past || !then || ref.original.character_id !== row.character_id) throw characterErrors.not_found("找不到这个版本");
    const sections = Object.fromEntries(SECTIONS.map(section => {
      const stored = past.sections[section];
      if (stored.mode === "override") return [section, { ...stored, acknowledged_original_version: original }];
      return [section, isDeepStrictEqual(sectionOf(then, section), sectionOf(now, section)) ? { mode: "follow" }
        : { mode: "override", based_on_original_version: ref.original.version, acknowledged_original_version: original, value: sectionOf(then, section) }];
    })) as StoredSections;
    this.writeMember(row, original, sections);
    return this.memberRole(projectId, ref.member_id)!;
  }

  // ---- fixed content --------------------------------------------------------------------------------------------------------------

  /**
   * What a fixed version says, rebuilt from the original's version and the member's overridden sections. A member is read only in
   * this project; a version that is gone (a removed member, a deleted original) is `not_found`.
   */
  content(projectId: string | null, ref: CharacterRoleVersionRef): { content: CharacterRoleContent; saved_at: string; character_id: string } {
    const characterId = ref.kind === "personal" ? ref.character_id : ref.original.character_id, version = ref.kind === "personal" ? ref.version : ref.original.version;
    const draft = this.drafts.get(characterId), original = draft && draft.state !== "tombstoned" ? this.version(characterId, version) : null;
    if (!original) throw characterErrors.not_found("这个角色版本已不在");
    if (ref.kind === "personal") return { content: original.content, saved_at: original.saved_at, character_id: characterId };
    const project = projectLayerOf(projectId), row = project ? this.memberRow(project, ref.member_id) : null;
    const past = row && row.state !== "removed" && row.character_id === characterId
      ? this.db.prepare("SELECT saved_at, sections FROM character_member_versions WHERE member_id = ? AND member_version = ?").get(ref.member_id, ref.member_version) as { saved_at: string; sections: string } | undefined : undefined;
    if (!past) throw characterErrors.not_found("这个角色版本已不在");
    const sections = JSON.parse(past.sections) as StoredSections;
    const content = SECTIONS.reduce((built, section) => { const stored = sections[section]; return stored.mode === "override" ? withSection(built, section, stored.value) : built; }, original.content);
    return { content, saved_at: past.saved_at > original.saved_at ? past.saved_at : original.saved_at, character_id: characterId };
  }

  // ---- defaults and the effective role --------------------------------------------------------------------------------------------

  defaults(projectId: string | null): { personal: PersonalCharacterRef | null; project: ProjectCharacterMemberRef | { kind: "assistant" } | null } {
    const read = (key: string) => {
      const row = this.db.prepare("SELECT selection FROM character_defaults WHERE owner_actor_id = ? AND project_id = ?").get(this.actorId, key) as { selection: string } | undefined;
      return row ? JSON.parse(row.selection) as never : null;
    };
    const project = projectLayerOf(projectId);
    return { personal: read(""), project: project ? read(project) : null };
  }

  /** The personal layer takes an original only; the project layer a member of this project, the Assistant itself, or null to inherit. */
  setDefault(projectId: string | null, selection: CharacterDefaultSelection): void {
    const project = projectLayerOf(projectId);
    if (selection.layer === "project" && !project) throw characterErrors.invalid("个人工作没有项目默认");
    const chosen = selection.selection;
    if (chosen?.kind === "personal" && !this.personalRole(chosen.character_id)) throw characterErrors.not_found("找不到这个角色，或它还没保存成版本");
    if (chosen?.kind === "project") this.liveMember(project!, chosen.member_id);
    const key = selection.layer === "personal" ? "" : project!;
    if (chosen === null) this.db.prepare("DELETE FROM character_defaults WHERE owner_actor_id = ? AND project_id = ?").run(this.actorId, key);
    else this.db.prepare("INSERT INTO character_defaults (owner_actor_id, project_id, selection, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (owner_actor_id, project_id) DO UPDATE SET selection = excluded.selection, updated_at = excluded.updated_at")
      .run(this.actorId, key, JSON.stringify(chosen), this.now());
  }

  /**
   * The role a new task gets: the task's own choice, else the project's default, else the person's, else the Assistant itself. A project
   * default whose member or original is turned off gives the Assistant and names it, without falling back to the person's default (user
   * 2026-11-08). A task's own choice that cannot run is refused, never replaced.
   */
  effective(projectId: string | null, selection?: CharacterTaskSelection): EffectiveCharacterSelection {
    const project = projectLayerOf(projectId);
    if (selection) {
      if (selection.kind === "assistant") return { kind: "assistant", source: "task" };
      const version = this.activeVersion(project, selection);
      if (!version) throw characterErrors.disabled("所选角色已停用或不在了，请另选一个或不指定角色");
      return { kind: "role", source: "task", version };
    }
    const defaults = this.defaults(projectId);
    if (project && defaults.project) {
      if (defaults.project.kind === "assistant") return { kind: "assistant", source: "project" };
      const version = this.activeVersion(project, defaults.project) as ProjectCharacterVersionRef | null;
      return version ? { kind: "role", source: "project", version } : { kind: "assistant", source: "assistant", stopped_project_default: defaults.project };
    }
    const personal = defaults.personal ? this.activeVersion(project, defaults.personal) as PersonalCharacterVersionRef | null : null;
    return personal ? { kind: "role", source: "personal", version: personal } : { kind: "assistant", source: "assistant" };
  }

  /** The current version of an active role, or null when it is turned off, removed, deleted or has no version. */
  activeVersion(project: string | null, ref: PersonalCharacterRef | ProjectCharacterMemberRef): CharacterRoleVersionRef | null {
    if (ref.kind === "personal") { const role = this.personalRole(ref.character_id); return role?.state === "active" ? role.current : null; }
    if (!project) return null;
    const role = this.memberRole(project, ref.member_id);
    return role?.state === "active" ? role.current : null;
  }

  // ---- what the picker and settings read ------------------------------------------------------------------------------------------

  /** One read for the picker and both settings pages (role-service-design §3 `roles.list`). */
  catalog(projectId: string | null, drafts: readonly CharacterDraft[]): CharacterRoleCatalog {
    const project = projectLayerOf(projectId), use = this.memberUse();
    const originals = drafts.filter(draft => draft.state !== "tombstoned").map((draft): CharacterOriginalEntry => {
      const latest = this.latestVersion(draft.character_id), content = latest?.content ?? roleContentOf(draft);
      const availability: CharacterRoleAvailability = !latest ? { available: false, reason: "unsaved" } : draft.state === "active" ? { available: true } : { available: false, reason: "disabled" };
      return { ref: { kind: "personal", character_id: draft.character_id }, title: content.title, state: draft.state as "active" | "disabled", draft_revision: draft.revision,
        version: latest?.version ?? null, origin: this.originOf(draft.character_id), use: use.get(draft.character_id) ?? { projects: 0, changed: 0 }, availability, ...toolsOf(content) };
    });
    const members = project ? this.memberIds(project).flatMap((memberId): CharacterMemberEntry[] => {
      const role = this.memberRole(project, memberId);
      if (!role) return [];
      const content = this.content(project, role.current).content, original = this.personalRole(role.current.original.character_id)!;
      const availability: CharacterRoleAvailability = role.state === "active" ? { available: true } : { available: false, reason: original.state === "active" ? "disabled" : "original_disabled" };
      return [{ role, title: content.title, availability, ...toolsOf(content) }];
    }) : [];
    return { in_project: project !== null, originals, members, defaults: this.defaults(projectId), effective: this.effective(projectId) };
  }

  /** A role's fixed versions, newest first. A member's version is paired with the original's version current when it was saved. */
  versionEntries(projectId: string | null, ref: PersonalCharacterRef | ProjectCharacterMemberRef): CharacterRoleVersionEntry[] {
    if (ref.kind === "personal") {
      const role = this.personalRole(ref.character_id);
      if (!role) throw characterErrors.not_found("找不到这个角色");
      return this.versions(ref.character_id).map(version => ({ ref: { kind: "personal", character_id: ref.character_id, version: version.version }, saved_at: version.saved_at,
        content: version.content, current: version.version === role.current.version }));
    }
    const project = projectLayerOf(projectId), role = project ? this.memberRole(project, ref.member_id) : null;
    if (!project || !role) throw characterErrors.not_found("本项目里没有这个角色");
    const characterId = role.current.original.character_id;
    return this.memberVersions(project, ref.member_id).map(version => {
      const versionRef: ProjectCharacterVersionRef = { kind: "project", member_id: ref.member_id, member_version: version.member_version,
        original: { kind: "personal", character_id: characterId, version: version.original_version } };
      const built = this.content(project, versionRef);
      return { ref: versionRef, saved_at: version.saved_at, content: built.content, current: version.member_version === role.current.member_version,
        sections: { work_style: version.sections.work_style.mode, capabilities: version.sections.capabilities.mode } };
    });
  }

  defaultsWithEffective(projectId: string | null): { defaults: CharacterDefaults; effective: EffectiveCharacterSelection } {
    return { defaults: this.defaults(projectId), effective: this.effective(projectId) };
  }

  /** What a fixed version says, as a round freezes it: whose it is, where, and when it was saved. */
  snapshot(projectId: string | null, ref: CharacterRoleVersionRef): CharacterRoleSnapshot {
    const built = this.content(projectId, ref);
    return { ...built.content, version: structuredClone(ref), character_id: built.character_id, project_id: ref.kind === "project" ? projectLayerOf(projectId) : null,
      owner_actor_id: this.actorId, saved_at: built.saved_at };
  }

  /** The role a new task gets (`roles.resolve`): the effective value, the stable choice to keep on the task, and its title. */
  resolve(projectId: string | null, selection?: CharacterTaskSelection): CharacterRoleResolution {
    const effective = this.effective(projectId, selection);
    if (effective.kind === "assistant") return { effective, selection: { kind: "assistant" } };
    return { effective, selection: stableRefOf(effective.version), title: this.content(projectId, effective.version).content.title };
  }

  // ---- template adoption (role-scope-contract §3) ---------------------------------------------------------------------------------

  /**
   * Creates or reuses a role for a template, once per request: the same request id with the same request replays the receipt, with
   * another request is `conflict`. Reusing a member gives it a new revision, so a release credential the creator held stops working.
   * `createOriginal` writes the draft and its first version in the caller's transaction.
   */
  adopt(projectId: string | null, input: CharacterTemplateAdoptionInput, createOriginal: (content: CharacterRoleContent) => CharacterDraft): CharacterTemplateAdoptionResult {
    const project = projectLayerOf(projectId);
    if (input.layer === "project" && !project) throw characterErrors.invalid("个人工作没有项目层");
    const scope = input.layer === "personal" ? "personal" : project!, digest = requestDigest(input);
    const stored = this.db.prepare("SELECT request_digest, receipt FROM character_adoptions WHERE owner_actor_id = ? AND scope = ? AND request_id = ?")
      .get(this.actorId, scope, input.request_id) as { request_digest: string; receipt: string } | undefined;
    if (stored) {
      if (stored.request_digest !== digest) throw characterErrors.conflict("这个采用请求已用于另一份内容");
      return JSON.parse(stored.receipt) as CharacterTemplateAdoptionResult;
    }
    let role: CharacterRole;
    if (input.selection.kind === "create") {
      const template = (input as Extract<CharacterTemplateAdoptionInput, { selection: { kind: "create" } }>).template;
      if (!("literal" in template.title)) throw characterErrors.invalid("角色标题须先按调用方的语言取出文字");
      const draft = createOriginal({ title: template.title.literal.trim(), instructions: template.instructions, host_tools: template.host_tools ?? null,
        ...(template.action_tools === undefined ? {} : { action_tools: template.action_tools }) });
      this.recordOrigin(draft.character_id, input.origin);
      role = input.layer === "personal" ? this.personalRole(draft.character_id)! : this.addMember(project!, draft.character_id, input.origin);
    } else if (input.layer === "personal") {
      const chosen = input.selection.role as PersonalCharacterVersionRef, current = this.personalRole(chosen.character_id);
      if (!current || !this.version(chosen.character_id, chosen.version)) throw characterErrors.not_found("找不到这个角色版本");
      role = current;
    } else {
      const selection = input.selection as { role: ProjectCharacterMemberRef; expected_revision: string; expected_original_version: number };
      const { row, original } = this.confirmedMember(project!, selection.role.member_id, selection.expected_revision, selection.expected_original_version);
      this.writeMember(row, original, row.sections, row.state, false);
      role = this.memberRole(project!, row.member_id)!;
    }
    const receipt: CharacterTemplateAdoptionResult = { outcome: input.selection.kind === "create" ? "created" : "reused", origin: input.origin, role };
    this.db.prepare("INSERT INTO character_adoptions (owner_actor_id, scope, request_id, request_digest, receipt, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(this.actorId, scope, input.request_id, digest, JSON.stringify(receipt), this.now());
    return receipt;
  }

  /** Batch read of roles and adoption receipts, in the order asked; another project's or person's is `missing`. */
  read(projectId: string | null, queries: readonly CharacterRoleReadQuery[]): CharacterRoleReadResult[] {
    const project = projectLayerOf(projectId);
    const roleOf = (ref: PersonalCharacterRef | ProjectCharacterMemberRef): CharacterRole | null => ref.kind === "personal" ? this.personalRole(ref.character_id)
      : project ? this.memberRole(project, ref.member_id) : null;
    return queries.map((query): CharacterRoleReadResult => {
      if (query.by === "role") { const role = roleOf(query.role); return role ? { kind: "role", role } : { kind: "missing" }; }
      const scope = query.layer === "personal" ? "personal" : project;
      const row = scope ? this.db.prepare("SELECT receipt FROM character_adoptions WHERE owner_actor_id = ? AND scope = ? AND request_id = ?").get(this.actorId, scope, query.request_id) as { receipt: string } | undefined : undefined;
      if (!row) return { kind: "missing" };
      const receipt = JSON.parse(row.receipt) as CharacterTemplateAdoptionResult;
      const ref = receipt.role.layer === "personal" ? { kind: "personal" as const, character_id: receipt.role.current.character_id } : { kind: "project" as const, member_id: receipt.role.current.member_id };
      return { kind: "receipt", receipt, current: roleOf(ref) };
    });
  }
}

const toolsOf = (content: CharacterRoleContent): Pick<CharacterOriginalEntry, "host_tools" | "action_tools" | "imported_skills"> =>
  ({ host_tools: content.host_tools, ...(content.action_tools === undefined ? {} : { action_tools: content.action_tools }),
    ...(content.import_snapshot ? { imported_skills: content.import_snapshot.skills.map(skill => ({ id: skill.id, name: skill.name, compatibility: skill.compatibility,
      ...(skill.reason ? { reason: skill.reason } : {}) })) } : {}) });

/** The request's own content, so a replay with other content under the same id is told apart. Key order does not matter. */
function requestDigest(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical)
    : item && typeof item === "object" ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical((item as Record<string, unknown>)[key])])) : item;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

/** The stable choice a fixed version belongs to: the original, or the member. */
export const stableRefOf = (ref: CharacterRoleVersionRef): PersonalCharacterRef | ProjectCharacterMemberRef =>
  ref.kind === "personal" ? { kind: "personal", character_id: ref.character_id } : { kind: "project", member_id: ref.member_id };

/**
 * The project is deleted: its members, their versions, its default and its adoption receipts go, whoever owns them. The person's
 * originals, their versions and personal default name no project, so they stay. Inside the caller's transaction.
 */
export function purgeRoleProjectRows(db: DatabaseSync, projectId: string): void {
  db.prepare("DELETE FROM character_member_versions WHERE member_id IN (SELECT member_id FROM character_members WHERE project_id = ?)").run(projectId);
  db.prepare("DELETE FROM character_members WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM character_defaults WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM character_adoptions WHERE scope = ?").run(projectId);
}
