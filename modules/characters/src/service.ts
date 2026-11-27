import { parseExactActionReferences } from "@molis-ai/molis-work-contracts/platform/actions";
import { externalTool } from "@molis-ai/molis-work-contracts/platform/external-tools";
import type { CharacterImportSnapshot, CharacterImportSelection, CharacterContent, CharacterDraft, CharacterDraftPatch, CharacterMemberSaveInput, CharacterMemberSaveResult, CharacterRoleContent, CharacterState, CharactersCommand, CharactersQuery, PersonalCharacterVersionRef, ProjectCharacterVersionRef } from "@molis-ai/molis-work-contracts/modules/characters";
import { parseCharacterContent, parseCharacterTools, selectCharacterImportSnapshot } from "@molis-ai/molis-work-contracts/modules/characters";
import type { CharactersRepository } from "./repository.js";
import { normalizeMemberSections, type CharacterRoles } from "./roles.js";
import { characterErrors } from "@molis-ai/molis-work-contracts/modules/characters";

export class CharactersService implements CharactersQuery, CharactersCommand {
  constructor(private readonly repository: CharactersRepository, private readonly actorId: string, readonly roles: CharacterRoles,
    private readonly now: () => string = () => new Date().toISOString()) {}

  list(): CharacterDraft[] { return this.repository.list(); }
  get(id: string): CharacterDraft | null { return this.repository.get(id); }

  /** A new original, saved as its first version in the same write (role-service-design §3: 新建即保存成 v1). */
  create(patch: CharacterDraftPatch): CharacterDraft {
    const content = this.content(patch);
    return this.repository.immediate(() => this.insertSaved(content));
  }

  /** Writes a new original with this content and its first version; called inside the caller's transaction. */
  insertSaved(content: CharacterRoleContent): CharacterDraft {
    const at = this.now();
    const record: CharacterDraft = { character_id: crypto.randomUUID(), owner_actor_id: this.actorId, revision: 1, state: "active",
      title: content.title, instructions: content.instructions, host_tools: content.host_tools,
      ...(content.action_tools === undefined ? {} : { action_tools: content.action_tools }), ...(content.import_snapshot ? { import_snapshot: content.import_snapshot } : {}),
      created_at: at, updated_at: at };
    this.repository.insert(record);
    this.roles.saveVersion(record);
    return record;
  }

  /** Runs inside one immediate transaction on the Characters store (adoption writes a draft, a version and a receipt together). */
  transaction<T>(operation: () => T): T { return this.repository.immediate(operation); }

  import(snapshot: CharacterImportSnapshot, selection: CharacterImportSelection,
    existing?: { character_id: string; expected_revision: number }): { draft: CharacterDraft; replayed: boolean } {
    let selected: CharacterImportSnapshot;
    try { selected = selectCharacterImportSnapshot(snapshot, selection); }
    catch (error) { throw characterErrors.invalid((error as Error).message); }
    const sameSource = (source: CharacterImportSnapshot | undefined) => source && source.runtime_id === selected.runtime_id
      && source.config_root === selected.config_root && source.project_root === selected.project_root;
    return this.repository.immediate(() => {
      if (existing) {
        const current = this.confirmed(existing.character_id, existing.expected_revision);
        if (!sameSource(current.import_snapshot)) throw characterErrors.invalid("更新来源与原角色不同，请创建新的导入角色");
        // The explicit confirmed revision authorizes replacing the imported package, not personal edits.
        return { draft: this.save(current, { ...current, import_snapshot: selected }), replayed: false };
      }
      const previous = this.list().find(draft => draft.state !== "tombstoned" && sameSource(draft.import_snapshot));
      if (previous) return { draft: previous, replayed: true };
      const at = this.now();
      const draft: CharacterDraft = { character_id: crypto.randomUUID(), owner_actor_id: this.actorId, revision: 1, state: "active",
        title: `${externalTool(selected.runtime_id).display_name} 角色`, instructions: "遵循已导入规则的适用范围，按选定技能的方法完成任务。可在这里补充个人要求。",
        host_tools: null, created_at: at, updated_at: at, import_snapshot: selected };
      this.repository.insert(draft);
      this.roles.saveVersion(draft);
      return { draft, replayed: false };
    });
  }

  /** Saves the original: the draft and, when what it says changed, its next fixed version, in one write. */
  update(id: string, expectedRevision: number, patch: CharacterDraftPatch): CharacterDraft {
    return this.repository.immediate(() => {
      const current = this.confirmed(id, expectedRevision), content = this.content(patch, current.action_tools);
      const { action_tools: _previous, ...rest } = current;
      // Preserve instructions verbatim; editing an empty draft is valid, publishing it is not.
      return this.save(current, { ...rest, title: content.title, instructions: content.instructions, host_tools: content.host_tools,
        ...(content.action_tools === undefined ? {} : { action_tools: content.action_tools }) });
    });
  }

  /** An earlier version saved as the next one (`characters.versions.restore`): later versions stay. */
  restore(ref: PersonalCharacterVersionRef, expectedRevision: number): CharacterDraft {
    return this.repository.immediate(() => this.restoreDraft(ref, expectedRevision));
  }

  saveMember(projectId: string, input: CharacterMemberSaveInput): CharacterMemberSaveResult {
    const { member_id, expected_revision, expected_original_version, expected_original_draft_revision, work_style, capabilities } = input;
    const sections = normalizeMemberSections({ work_style, capabilities });
    return this.repository.immediate(() => {
      if (expected_original_draft_revision === undefined) {
        return { role: this.roles.saveMember(projectId, member_id, expected_revision, expected_original_version, sections) };
      }
      if (!sections.work_style && !sections.capabilities) throw characterErrors.invalid("至少选择一节保存到原件");
      let original_draft_revision: number | undefined;
      const role = this.roles.saveMemberFollowing(projectId, member_id, expected_revision, expected_original_version, sections, id => {
        const current = this.confirmed(id, expected_original_draft_revision);
        const next = { ...current, ...sections.work_style, ...sections.capabilities };
        if (sections.capabilities && sections.capabilities.action_tools === undefined) delete next.action_tools;
        original_draft_revision = this.save(current, next).revision;
        return this.roles.latestVersion(id)!.version;
      });
      return { role, original_draft_revision };
    });
  }

  restoreMember(projectId: string, ref: ProjectCharacterVersionRef, expectedRevision: string, expectedOriginalVersion: number, expectedDraftRevision?: number) {
    return this.repository.immediate(() =>
      this.roles.restoreMember(projectId, ref, expectedRevision, expectedOriginalVersion, expectedDraftRevision === undefined ? undefined : original => {
        this.restoreDraft(original, expectedDraftRevision);
        return this.roles.latestVersion(original.character_id)!.version;
      }));
  }

  private restoreDraft(ref: PersonalCharacterVersionRef, expectedRevision: number): CharacterDraft {
    const current = this.confirmed(ref.character_id, expectedRevision), past = this.roles.version(ref.character_id, ref.version);
    if (!past) throw characterErrors.not_found("找不到这个版本");
    const { action_tools: _a, import_snapshot: _i, ...rest } = current;
    return this.save(current, { ...rest, ...past.content });
  }

  private content(patch: CharacterDraftPatch, previousActions?: CharacterDraft["action_tools"]): CharacterRoleContent {
    if (!patch || typeof patch.title !== "string" || !patch.title.trim() || patch.title.length > 120
      || typeof patch.instructions !== "string" || patch.instructions.length > 20_000) {
      throw characterErrors.invalid("角色名称不能为空且最多 120 字符，指令最多 20000 字符");
    }
    let host_tools: string[] | null;
    try { host_tools = parseCharacterTools(patch.host_tools); }
    catch (error) { throw characterErrors.invalid((error as Error).message); }
    let action_tools = previousActions;
    try { if (patch.action_tools !== undefined) action_tools = patch.action_tools === null ? null : parseExactActionReferences(patch.action_tools); }
    catch (error) { throw characterErrors.invalid((error as Error).message); }
    return { title: patch.title.trim(), instructions: patch.instructions, host_tools, ...(action_tools === undefined ? {} : { action_tools }) };
  }

  setState(id: string, expectedRevision: number, state: CharacterState): CharacterDraft {
    if (!["active", "disabled", "tombstoned"].includes(state)) throw characterErrors.invalid("角色状态无效");
    const current = this.confirmed(id, expectedRevision);
    if (current.state === state) return current;
    return this.replace(current, { ...current, state });
  }

  /** Disabled/deleted profiles cannot start new tasks; old frozen Runs need no lookup here. */
  requireActive(id: string): CharacterDraft {
    const current = this.current(id);
    if (current.state !== "active") throw characterErrors.disabled("角色已停用，请启用或明确选择其他角色");
    return current;
  }

  /**
   * The publisher is the Host-bound Artifact client. This module neither opens
   * a project database nor owns a second publication registry. No async gap is
   * allowed between checking a confirmed draft and publishing its fixed body.
   */
  publish<T>(id: string, expectedRevision: number, publisher: (content: CharacterContent) => T extends PromiseLike<unknown> ? never : T): T {
    return this.repository.immediate(() => {
      const current = this.confirmed(id, expectedRevision);
      this.requireActive(id);
      let content: CharacterContent;
      try { content = parseCharacterContent({ character_id: current.character_id, title: current.title,
        instructions: current.instructions, host_tools: current.host_tools,
        ...(current.action_tools === undefined ? {} : { action_tools: current.action_tools }),
        ...(current.import_snapshot ? { import_snapshot: current.import_snapshot } : {}),
        source: { owner_actor_id: current.owner_actor_id, draft_revision: current.revision } }); }
      catch (error) { throw characterErrors.invalid((error as Error).message); }
      const result = publisher(content);
      if (result && typeof result === "object" && "then" in result) throw characterErrors.invalid("角色发布必须同步保存固定成果");
      return result as T;
    });
  }

  private confirmed(id: string, expectedRevision: number): CharacterDraft {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw characterErrors.invalid("请提供已确认的角色修订号");
    }
    const current = this.current(id);
    if (current.revision !== expectedRevision) {
      throw characterErrors.conflict("角色在另一个窗口已改变，请重新读取后决定；当前修改尚未保存");
    }
    return current;
  }

  private current(id: string): CharacterDraft {
    const current = this.get(id);
    if (!current) throw characterErrors.not_found("找不到本人的角色");
    if (current.state === "tombstoned") throw characterErrors.deleted("角色已删除，旧执行仍保留原版本，请另建角色");
    return current;
  }

  /** Replaces the draft and saves its content as the next version when it changed; inside the caller's transaction. */
  private save(current: CharacterDraft, next: CharacterDraft): CharacterDraft {
    const saved = this.replace(current, next);
    this.roles.saveVersion(saved);
    return saved;
  }

  private replace(current: CharacterDraft, next: CharacterDraft): CharacterDraft {
    next = { ...next, revision: current.revision + 1, updated_at: this.now() };
    if (!this.repository.replace(current.revision, next)) throw characterErrors.conflict("角色在另一个窗口已改变，当前修改尚未保存");
    return next;
  }
}
