import path from "node:path";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { AgentManifest, AgentPromptText, AgentRoleExecution, AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { promptLayerOf } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import {
  AGENT_PROMPT_MAX_CHARS,
  type AgentDefinitionRegistration, type AgentDefinitionSource, type AgentPromptRegistration, type AgentPromptRevision, type AgentPromptUse,
  type AgentPromptView, type AgentRoleRegistration, type AgentRoleView, type AgentDefinitionsDiagnostics, type AgentUnregisteredCall,
  type AgentMethodRegistration, type AgentMethodView,
} from "@molis-ai/molis-work-contracts/services/agent-definitions";

/** The Home SQLite handle, as the storage package opens it (the App boundary does not import `node:sqlite`). */
type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;

export const AGENT_DEFINITIONS_STORE = "agent-definitions";
const USES_KEPT = 200;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS prompt_overrides (
  key TEXT PRIMARY KEY, revision INTEGER NOT NULL, base_version INTEGER NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL, actor_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prompt_history (
  key TEXT NOT NULL, revision INTEGER NOT NULL, action TEXT NOT NULL, body TEXT, base_version INTEGER NOT NULL, at TEXT NOT NULL, actor_id TEXT NOT NULL,
  PRIMARY KEY (key, revision)
);
CREATE TABLE IF NOT EXISTS prompt_uses (
  key TEXT NOT NULL, at TEXT NOT NULL, version INTEGER NOT NULL, user_revision INTEGER, caller TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS prompt_uses_by_key ON prompt_uses(key, at);`;

export class AgentDefinitionsError extends Error {
  constructor(readonly code: "agent_definitions.not_found" | "agent_definitions.invalid" | "agent_definitions.conflict", message: string) {
    super(message);
    this.name = "AgentDefinitionsError";
  }
}

interface Override { key: string; revision: number; base_version: number; body: string; updated_at: string; actor_id: string }

const keyOf = (ownerId: string, promptId: string) => `${ownerId}/${promptId}`;

/**
 * The Host's register of Agent definitions and the person's edits of them.
 *
 * Registrations are what the system and each Plugin ship, held in memory and renewed every time the Host starts or a
 * Plugin's declaration is read. The person's edits are the only thing stored: an overlay keyed by owner and prompt,
 * with the default version it was made against, and a history. What a model call runs is resolved here, so a run's
 * record can say whether it used the default or the person's version.
 */
export class AgentDefinitions {
  private readonly owners = new Map<string, AgentDefinitionRegistration>();

  constructor(private readonly db: DatabaseSync, private readonly now = () => new Date()) {
    db.exec(SCHEMA);
  }

  /** Register (or renew) everything one owner ships. A later registration of the same owner replaces it. */
  register(registration: AgentDefinitionRegistration): void {
    const ids = new Set<string>();
    for (const prompt of registration.prompts) {
      if (ids.has(prompt.prompt_id)) throw new AgentDefinitionsError("agent_definitions.invalid", `${registration.owner_id} 重复登记了 ${prompt.prompt_id}`);
      ids.add(prompt.prompt_id);
      if (!prompt.body.trim()) throw new AgentDefinitionsError("agent_definitions.invalid", `${registration.owner_id}/${prompt.prompt_id} 没有正文`);
    }
    for (const role of registration.roles) {
      const missing = role.prompt_ids.filter(id => !ids.has(id));
      if (missing.length) throw new AgentDefinitionsError("agent_definitions.invalid", `角色 ${role.role_id} 引用了未登记的 Prompt：${missing.join("、")}`);
    }
    const methods = new Set<string>();
    for (const method of registration.methods ?? []) {
      if (methods.has(method.skill_id)) throw new AgentDefinitionsError("agent_definitions.invalid", `${registration.owner_id} 重复登记了方法 ${method.skill_id}`);
      methods.add(method.skill_id);
      if (!method.body.trim() || method.body.length > 20_000) throw new AgentDefinitionsError("agent_definitions.invalid", `${registration.owner_id}/${method.skill_id} 的方法正文为空或过长`);
    }
    this.owners.set(registration.owner_id, structuredClone(registration));
  }

  unregister(ownerId: string): void { this.owners.delete(ownerId); }

  hasPrompt(ownerId: string, promptId: string): boolean { return Boolean(this.owners.get(ownerId)?.prompts.some(prompt => prompt.prompt_id === promptId)); }

  registrations(): AgentDefinitionRegistration[] { return [...this.owners.values()].map(value => structuredClone(value)); }

  private override(key: string): Override | null {
    return (this.db.prepare("SELECT * FROM prompt_overrides WHERE key = ?").get(key) as Override | undefined) ?? null;
  }

  private registered(key: string): { owner: AgentDefinitionRegistration; prompt: AgentPromptRegistration } {
    const slash = key.indexOf("/");
    const owner = slash > 0 ? this.owners.get(key.slice(0, slash)) : undefined;
    const prompt = owner?.prompts.find(item => item.prompt_id === key.slice(slash + 1));
    if (!owner || !prompt) throw new AgentDefinitionsError("agent_definitions.not_found", "没有登记这段 Prompt");
    return { owner, prompt };
  }

  private view(owner: AgentDefinitionRegistration, prompt: AgentPromptRegistration): AgentPromptView {
    const key = keyOf(owner.owner_id, prompt.prompt_id);
    const edited = this.override(key);
    const used = this.db.prepare("SELECT * FROM prompt_uses WHERE key = ? ORDER BY at DESC LIMIT 1").get(key) as (AgentPromptUse & { user_revision: number | null }) | undefined;
    return {
      key, owner_id: owner.owner_id, source: structuredClone(owner.source), prompt_id: prompt.prompt_id, kind: prompt.kind,
      ...(prompt.layer ? { layer: prompt.layer } : {}), title: prompt.title, purpose: prompt.purpose, used_by: [...prompt.used_by],
      default_version: prompt.version, default_body: prompt.body,
      effective: edited ? "user" : "default", body: edited ? edited.body : prompt.body,
      ...(edited ? { user: { revision: edited.revision, base_version: edited.base_version, updated_at: edited.updated_at } } : {}),
      default_updated: Boolean(edited && prompt.version > edited.base_version),
      ...(used ? { last_used: { at: used.at, version: used.version, user_revision: used.user_revision, caller: used.caller } } : {}),
    };
  }

  prompts(): AgentPromptView[] {
    return [...this.owners.values()].flatMap(owner => owner.prompts.map(prompt => this.view(owner, prompt)));
  }

  prompt(key: string): AgentPromptView {
    const { owner, prompt } = this.registered(key);
    return this.view(owner, prompt);
  }

  /** Methods owners offer to other Agents for business work; the body is read with `method`. */
  methods(): AgentMethodView[] {
    return [...this.owners.values()].flatMap(owner => (owner.methods ?? []).map(method => ({ key: keyOf(owner.owner_id, method.skill_id), owner_id: owner.owner_id,
      source: structuredClone(owner.source), skill_id: method.skill_id, version: method.version, name: method.name, summary: method.summary, tools: [...method.tools] })));
  }

  /** One registered method with its body, by owner, id and (when given) exact version. */
  method(ownerId: string, skillId: string, version?: number): AgentMethodRegistration {
    const method = this.owners.get(ownerId)?.methods?.find(item => item.skill_id === skillId);
    if (!method || (version !== undefined && method.version !== version)) throw new AgentDefinitionsError("agent_definitions.not_found", "没有登记这个方法版本");
    return structuredClone(method);
  }

  roles(): AgentRoleView[] {
    return [...this.owners.values()].flatMap(owner => owner.roles.map(role => {
      const prompt_keys = role.prompt_ids.map(id => keyOf(owner.owner_id, id));
      return { key: keyOf(owner.owner_id, `role:${role.role_id}`), owner_id: owner.owner_id, source: structuredClone(owner.source), role_id: role.role_id,
        version: role.version, name: role.name, purpose: role.purpose, execution: role.execution, workspace: role.workspace, subagent: Boolean(role.subagent),
        prompt_keys, edited: prompt_keys.some(key => this.override(key) !== null) };
    }));
  }

  history(key: string): AgentPromptRevision[] {
    this.registered(key);
    return (this.db.prepare("SELECT revision, body, base_version, at, actor_id, action FROM prompt_history WHERE key = ? ORDER BY revision DESC").all(key) as unknown as AgentPromptRevision[])
      .map(row => ({ ...row }));
  }

  /** Save the person's version. `expected` is the revision they edited (null when they edited the default). */
  save(key: string, body: string, expected: number | null, actorId: string): AgentPromptView {
    const { owner, prompt } = this.registered(key);
    if (typeof body !== "string" || !body.trim()) throw new AgentDefinitionsError("agent_definitions.invalid", "Prompt 不能为空；要回到原来的文字请用“恢复默认”");
    if (body.length > AGENT_PROMPT_MAX_CHARS) throw new AgentDefinitionsError("agent_definitions.invalid", `Prompt 最长 ${AGENT_PROMPT_MAX_CHARS} 字`);
    const current = this.override(key);
    if ((current?.revision ?? null) !== expected) throw new AgentDefinitionsError("agent_definitions.conflict", "这段 Prompt 已在别处修改，请刷新后再改");
    const revision = this.nextRevision(key);
    const at = this.now().toISOString();
    this.transaction(() => {
      this.db.prepare("INSERT INTO prompt_overrides(key,revision,base_version,body,updated_at,actor_id) VALUES (?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET revision=excluded.revision, base_version=excluded.base_version, body=excluded.body, updated_at=excluded.updated_at, actor_id=excluded.actor_id")
        .run(key, revision, prompt.version, body, at, actorId);
      this.db.prepare("INSERT INTO prompt_history(key,revision,action,body,base_version,at,actor_id) VALUES (?,?,?,?,?,?,?)").run(key, revision, "save", body, prompt.version, at, actorId);
    });
    return this.view(owner, prompt);
  }

  /** Back to the shipped default. The person's versions stay in the history. */
  reset(key: string, expected: number | null, actorId: string): AgentPromptView {
    const { owner, prompt } = this.registered(key);
    const current = this.override(key);
    if (!current) return this.view(owner, prompt);
    if (current.revision !== expected) throw new AgentDefinitionsError("agent_definitions.conflict", "这段 Prompt 已在别处修改，请刷新后再改");
    const revision = this.nextRevision(key);
    this.transaction(() => {
      this.db.prepare("DELETE FROM prompt_overrides WHERE key = ?").run(key);
      this.db.prepare("INSERT INTO prompt_history(key,revision,action,body,base_version,at,actor_id) VALUES (?,?,?,?,?,?,?)").run(key, revision, "reset", null, prompt.version, this.now().toISOString(), actorId);
    });
    return this.view(owner, prompt);
  }

  /** The Agent Host's resolver: the text a registered prompt runs with now. Unregistered prompts run as given. */
  effective(ownerId: string, prompt: AgentPromptText): AgentPromptText {
    const key = keyOf(ownerId, prompt.prompt_id);
    const owned = this.owners.get(ownerId)?.prompts.find(item => item.prompt_id === prompt.prompt_id);
    if (!owned) return prompt;
    const edited = this.override(key);
    this.recordUse({ key, version: prompt.version, user_revision: edited?.revision ?? null, caller: `agent:${ownerId}`, at: this.now().toISOString() });
    return edited ? { ...prompt, body: edited.body, user_revision: edited.revision } : prompt;
  }

  /** A direct model call's instructions, as registered and as the person left them. */
  instruction(ownerId: string, promptId: string, caller: string): { body: string; version: number; user_revision: number | null } {
    const { prompt } = this.registered(keyOf(ownerId, promptId));
    if (prompt.kind !== "instruction") throw new AgentDefinitionsError("agent_definitions.invalid", "这段 Prompt 不是模型调用的指令");
    const edited = this.override(keyOf(ownerId, promptId));
    this.recordUse({ key: keyOf(ownerId, promptId), version: prompt.version, user_revision: edited?.revision ?? null, caller, at: this.now().toISOString() });
    return { body: edited ? edited.body : prompt.body, version: prompt.version, user_revision: edited?.revision ?? null };
  }

  /** What each owner registered and what of it is not in effect, for developers; plus calls known to bypass the register. */
  diagnostics(unregistered: readonly AgentUnregisteredCall[] = []): AgentDefinitionsDiagnostics {
    const used = new Set((this.db.prepare("SELECT DISTINCT key FROM prompt_uses").all() as Array<{ key: string }>).map(row => row.key));
    const owners = [...this.owners.values()].map(owner => {
      const views = owner.prompts.map(prompt => this.view(owner, prompt));
      const issues: AgentDefinitionsDiagnostics["owners"][number]["issues"] = [];
      if (owner.source.kind === "plugin" && owner.source.state === "disabled") issues.push({ level: "warning", text: "插件已停用：这些 Prompt 暂时不会被调用，你的修改会保留" });
      for (const note of owner.notes ?? []) issues.push({ level: "warning", text: note });
      const stale = views.filter(view => view.default_updated);
      if (stale.length) issues.push({ level: "warning", text: `${stale.length} 段你的版本基于旧默认，默认已更新：${stale.map(view => view.title).join("、")}` });
      const idle = views.filter(view => !used.has(view.key));
      if (idle.length) issues.push({ level: "info", text: `${idle.length} 段登记后还没有被调用过（功能可能还没用到）：${idle.map(view => view.title).join("、")}` });
      return { owner_id: owner.owner_id, source: structuredClone(owner.source), prompts: views.filter(view => view.kind === "agent").length,
        instructions: views.filter(view => view.kind === "instruction").length, roles: owner.roles.length, ...(owner.methods?.length ? { methods: owner.methods.length } : {}),
        edited: views.filter(view => view.effective === "user").length, issues };
    });
    return { owners, unregistered: unregistered.map(item => ({ ...item })) };
  }

  uses(key: string, limit = 20): AgentPromptUse[] {
    return (this.db.prepare("SELECT * FROM prompt_uses WHERE key = ? ORDER BY at DESC LIMIT ?").all(key, limit) as unknown as AgentPromptUse[]).map(row => ({ ...row }));
  }

  private recordUse(use: AgentPromptUse): void {
    try {
      this.db.prepare("INSERT INTO prompt_uses(key,at,version,user_revision,caller) VALUES (?,?,?,?,?)").run(use.key, use.at, use.version, use.user_revision, use.caller);
      this.db.prepare("DELETE FROM prompt_uses WHERE key = ? AND rowid NOT IN (SELECT rowid FROM prompt_uses WHERE key = ? ORDER BY at DESC LIMIT ?)").run(use.key, use.key, USES_KEPT);
    } catch { /* A use that fails to record never stops the call. */ }
  }

  private nextRevision(key: string): number {
    return Number((this.db.prepare("SELECT COALESCE(MAX(revision), 0) + 1 AS next FROM prompt_history WHERE key = ?").get(key) as { next: number }).next);
  }

  private transaction(run: () => void): void {
    if (this.db.isTransaction) { run(); return; }
    this.db.exec("BEGIN IMMEDIATE");
    try { run(); this.db.exec("COMMIT"); } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}

const EXECUTION_WORDS: Record<AgentRoleExecution, string> = { "read-only": "只读", "text-edit": "可改文字", "workspace-write": "可改文件、运行命令", operate: "可调用业务能力" };

/**
 * One Agent's declaration as registrations: its prompts named after the roles that use them, its roles with what
 * they may do (for the person to read; enforced elsewhere), its child roles, and its compaction prompt.
 */
export function agentRegistration(ownerId: string, source: AgentDefinitionSource, manifest: AgentManifest, texts: readonly AgentPromptText[],
  names: { prompts?: Record<string, { title: string; purpose?: string }> } = {}): AgentDefinitionRegistration {
  const roles: AgentRoleRegistration[] = manifest.roles.map(role => {
    const prompt_ids = role.prompts ?? manifest.prompts.map(prompt => prompt.prompt_id).filter(id => id !== manifest.compaction?.prompt_id);
    const execution = role.execution ?? "read-only";
    return { role_id: role.role_id, version: role.version, name: role.name, purpose: `${role.name}（${EXECUTION_WORDS[execution]}）`, execution,
      workspace: role.workspace ?? "required", prompt_ids };
  });
  for (const child of manifest.subagents?.roles ?? []) {
    const execution = child.execution ?? "read-only";
    roles.push({ role_id: child.role_id, version: child.version, name: child.name, purpose: `子任务：${child.name}（${EXECUTION_WORDS[execution]}）`, execution,
      workspace: "required", prompt_ids: texts.some(text => text.prompt_id === child.role_id) ? [child.role_id] : [], subagent: true });
  }
  const declared = new Map(manifest.prompts.map(prompt => [prompt.prompt_id, prompt]));
  const prompts: AgentPromptRegistration[] = texts.filter(text => declared.has(text.prompt_id) || roles.some(role => role.subagent && role.role_id === text.prompt_id)).map(text => {
    const users = roles.filter(role => role.prompt_ids.includes(text.prompt_id)).map(role => role.name);
    const compaction = manifest.compaction?.prompt_id === text.prompt_id;
    const layer = promptLayerOf(declared.get(text.prompt_id) ?? text);
    const named = names.prompts?.[text.prompt_id];
    const title = named?.title ?? (compaction ? "上下文整理" : layer === "base" ? "基础约束" : users.length === 1 ? users[0]! : text.prompt_id);
    return { prompt_id: text.prompt_id, version: text.version, kind: "agent", layer, title,
      purpose: named?.purpose ?? (compaction ? "长任务接近上下文上限时，整理较早的内容" : users.length ? `组成角色：${users.join("、")}` : "未被任何角色使用"),
      used_by: compaction ? ["上下文整理"] : users, body: text.body };
  });
  return { owner_id: ownerId, source, prompts, roles };
}

export interface BuiltinAgent { owner_id: string; source: AgentDefinitionSource; manifest: AgentManifest; prompts: readonly AgentPromptText[]; skills?: readonly AgentSkillDefinition[] }

const registries = new Map<string, AgentDefinitions>();

/** One register per Home, opened once, with the system's and built-in Plugins' definitions registered. */
export function agentDefinitionsFor(homeDirectory: string, registrations: () => readonly AgentDefinitionRegistration[]): AgentDefinitions {
  const home = path.resolve(homeDirectory);
  let registry = registries.get(home);
  if (!registry) {
    registry = new AgentDefinitions(openHomeSqliteDatabase(home, AGENT_DEFINITIONS_STORE));
    registries.set(home, registry);
    for (const registration of registrations()) registry.register(registration);
  }
  return registry;
}

/** Instruction prompts as registrations, grouped under their owners and merged into any Agent registration of the same owner. */
export function withInstructions(registrations: readonly AgentDefinitionRegistration[], instructions: readonly InstructionPrompt[],
  sourceOf: (ownerId: string) => AgentDefinitionSource): AgentDefinitionRegistration[] {
  const merged = new Map(registrations.map(registration => [registration.owner_id, structuredClone(registration)]));
  for (const instruction of instructions) {
    const owner = merged.get(instruction.owner_id) ?? { owner_id: instruction.owner_id, source: sourceOf(instruction.owner_id), prompts: [], roles: [] };
    owner.prompts.push({ prompt_id: instruction.prompt_id, version: instruction.version, kind: "instruction", title: instruction.title, purpose: instruction.purpose,
      used_by: [...instruction.used_by], body: instruction.body });
    merged.set(instruction.owner_id, owner);
  }
  return [...merged.values()];
}
