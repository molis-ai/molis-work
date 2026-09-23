import type { CharacterImportSnapshot, CharacterImportSelection, CharacterContent, CharacterDraft, CharacterDraftPatch, CharacterState, CharactersCommand, CharactersQuery } from "@molis-ai/molis-work-contracts/modules/characters";
import { parseCharacterContent, parseCharacterTools, selectCharacterImportSnapshot } from "@molis-ai/molis-work-contracts/modules/characters";
import type { CharactersRepository } from "./repository.js";

export class CharacterError extends Error {
  constructor(readonly code: "character.not_found" | "character.conflict" | "character.deleted" | "character.disabled" | "character.invalid", message: string) {
    super(message); this.name = "CharacterError";
  }
}

export class CharactersService implements CharactersQuery, CharactersCommand {
  constructor(private readonly repository: CharactersRepository, private readonly actorId: string,
    private readonly now: () => string = () => new Date().toISOString()) {}

  list(): CharacterDraft[] { return this.repository.list(); }
  get(id: string): CharacterDraft | null { return this.repository.get(id); }

  create(): CharacterDraft {
    const at = this.now();
    const record: CharacterDraft = { character_id: crypto.randomUUID(), owner_actor_id: this.actorId,
      revision: 1, state: "active", title: "新角色", instructions: "", host_tools: null, created_at: at, updated_at: at };
    this.repository.insert(record);
    return record;
  }

  import(snapshot: CharacterImportSnapshot, selection: CharacterImportSelection,
    existing?: { character_id: string; expected_revision: number }): { draft: CharacterDraft; replayed: boolean } {
    let selected: CharacterImportSnapshot;
    try { selected = selectCharacterImportSnapshot(snapshot, selection); }
    catch (error) { throw new CharacterError("character.invalid", (error as Error).message); }
    const sameSource = (source: CharacterImportSnapshot | undefined) => source && source.runtime_id === selected.runtime_id
      && source.config_root === selected.config_root && source.project_root === selected.project_root;
    return this.repository.immediate(() => {
      if (existing) {
        const current = this.confirmed(existing.character_id, existing.expected_revision);
        if (!sameSource(current.import_snapshot)) throw new CharacterError("character.invalid", "更新来源与原角色不同，请创建新的导入角色");
        // The explicit confirmed revision authorizes replacing the imported package, not personal edits.
        return { draft: this.replace(current, { ...current, import_snapshot: selected }), replayed: false };
      }
      const previous = this.list().find(draft => draft.state !== "tombstoned" && sameSource(draft.import_snapshot));
      if (previous) return { draft: previous, replayed: true };
      const at = this.now(), labels = { codex: "Codex", "claude-code": "Claude Code", cursor: "Cursor", opencode: "OpenCode", "grok-build": "Grok Build" };
      const draft: CharacterDraft = { character_id: crypto.randomUUID(), owner_actor_id: this.actorId, revision: 1, state: "active",
        title: `${labels[selected.runtime_id]} 角色`, instructions: "遵循已导入规则的适用范围，按选定技能的方法完成任务。可在这里补充个人要求。",
        host_tools: null, created_at: at, updated_at: at, import_snapshot: selected };
      this.repository.insert(draft);
      return { draft, replayed: false };
    });
  }

  update(id: string, expectedRevision: number, patch: CharacterDraftPatch): CharacterDraft {
    const current = this.confirmed(id, expectedRevision);
    if (!patch || typeof patch.title !== "string" || !patch.title.trim() || patch.title.length > 120
      || typeof patch.instructions !== "string" || patch.instructions.length > 20_000) {
      throw new CharacterError("character.invalid", "角色名称不能为空且最多 120 字符，指令最多 20000 字符");
    }
    let host_tools: string[] | null;
    try { host_tools = parseCharacterTools(patch.host_tools); }
    catch (error) { throw new CharacterError("character.invalid", (error as Error).message); }
    // Preserve instructions verbatim; editing an empty draft is valid, publishing it is not.
    return this.replace(current, { ...current, title: patch.title.trim(), instructions: patch.instructions, host_tools });
  }

  setState(id: string, expectedRevision: number, state: CharacterState): CharacterDraft {
    if (!["active", "disabled", "tombstoned"].includes(state)) throw new CharacterError("character.invalid", "角色状态无效");
    const current = this.confirmed(id, expectedRevision);
    if (current.state === state) return current;
    return this.replace(current, { ...current, state });
  }

  /** Disabled/deleted profiles cannot start new tasks; old frozen Runs need no lookup here. */
  requireActive(id: string): CharacterDraft {
    const current = this.current(id);
    if (current.state !== "active") throw new CharacterError("character.disabled", "角色已停用，请启用或明确选择其他角色");
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
        ...(current.import_snapshot ? { import_snapshot: current.import_snapshot } : {}),
        source: { owner_actor_id: current.owner_actor_id, draft_revision: current.revision } }); }
      catch (error) { throw new CharacterError("character.invalid", (error as Error).message); }
      const result = publisher(content);
      if (result && typeof result === "object" && "then" in result) throw new CharacterError("character.invalid", "角色发布必须同步保存固定 Artifact");
      return result as T;
    });
  }

  private confirmed(id: string, expectedRevision: number): CharacterDraft {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new CharacterError("character.invalid", "请提供已确认的角色修订号");
    }
    const current = this.current(id);
    if (current.revision !== expectedRevision) {
      throw new CharacterError("character.conflict", "角色在另一个窗口已改变，请重新读取后决定；当前修改尚未保存");
    }
    return current;
  }

  private current(id: string): CharacterDraft {
    const current = this.get(id);
    if (!current) throw new CharacterError("character.not_found", "找不到本人的角色");
    if (current.state === "tombstoned") throw new CharacterError("character.deleted", "角色已删除，旧执行仍保留原版本，请另建角色");
    return current;
  }

  private replace(current: CharacterDraft, next: CharacterDraft): CharacterDraft {
    next = { ...next, revision: current.revision + 1, updated_at: this.now() };
    if (!this.repository.replace(current.revision, next)) throw new CharacterError("character.conflict", "角色在另一个窗口已改变，当前修改尚未保存");
    return next;
  }
}
