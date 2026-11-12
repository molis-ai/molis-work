import { rollbackPreservingError } from "@molis-ai/molis-work-storage";
import path from "node:path";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { applySqliteBaseline, openBaselineHomeSqlite, openHomeSqliteDatabase, type SqliteBaseline, type HomeStoreDeclaration } from "@molis-ai/molis-work-storage";
import { sandboxPromptId } from "@molis-ai/molis-work-plugin-sdk";
import { AgentDeclarations, notRunning } from "./agent-declarations.js";
import { SKILL_TABLES_SQL, SkillSettingsStore } from "./skill-settings.js";
import type { AgentManifest, AgentPromptText, AgentRoleExecution, AgentSkillDeclaration, AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { promptLayerOf } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { agentBodyIn, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { hostLog } from "../host-log.js";
import { cloneAgentRegistration, rememberComposedRoles } from "./display-words.js";
import {
  AGENT_PROMPT_MAX_CHARS, agentDefinitionErrors,
  type AgentDefinitionRegistration, type AgentDefinitionSource, type AgentPromptRegistration, type AgentPromptRevision, type AgentPromptUse,
  type AgentPromptView, type AgentRoleRegistration, type AgentRoleView, type AgentDefinitionsDiagnostics,
  type AgentSkillRegistration, type AgentSkillView, type SignedAgentReference, type SignedAgentMaterial,
} from "@molis-ai/molis-work-contracts/services/agent-definitions";

/** The Home SQLite handle, as the storage package opens it (the App boundary does not import `node:sqlite`). */
type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;

const AGENT_DEFINITIONS_STORE = "agent-definitions";
/** Uses kept per prompt: the AI kit says its counts are of this many recent rows. */
export const PROMPT_USES_KEPT = 200;

/**
 * The agent definitions store's one current schema (repository-anti-corruption §4.1), with the Skill settings and uses (specs/skill-packs/
 * contract-design.md §7, §8). 1 → 2 only creates those two tables, empty (user 2026-11-06, spec §9 item 6).
 */
export const AGENT_DEFINITIONS_BASELINE: SqliteBaseline = { version: /* @version database.agent_definitions_baseline */ 2, schema: `
CREATE TABLE prompt_overrides (
  key TEXT PRIMARY KEY, revision INTEGER NOT NULL, base_version INTEGER NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL, actor_id TEXT NOT NULL, default_ref TEXT
);
CREATE TABLE prompt_history (
  key TEXT NOT NULL, revision INTEGER NOT NULL, action TEXT NOT NULL, body TEXT, base_version INTEGER NOT NULL, at TEXT NOT NULL, actor_id TEXT NOT NULL, default_ref TEXT,
  PRIMARY KEY (key, revision)
);
CREATE TABLE prompt_uses (
  key TEXT NOT NULL, at TEXT NOT NULL, version INTEGER NOT NULL, user_revision INTEGER, caller TEXT NOT NULL, source_ref TEXT
);
CREATE INDEX prompt_uses_by_key ON prompt_uses(key, at);${SKILL_TABLES_SQL}`,
  upgrades: [{ from: 1, sql: SKILL_TABLES_SQL }] };

const agentDefinitionsErrors = defineErrorCodes("agent_definitions", { not_found: "not_found", invalid: "invalid", conflict: "conflict" });

/** A running signed package's role in one installation, with the signed default its material is read by. */
export interface SignedRoleView {
  install_id: string;
  owner_id: string;
  source: AgentDefinitionSource;
  role_id: string;
  version: number;
  name: string;
  purpose: string;
  default_ref: SignedAgentReference;
}

interface Override { default_ref: string | null; key: string; revision: number; base_version: number; body: string; updated_at: string; actor_id: string }

const keyOf = (ownerId: string, promptId: string) => `${ownerId}/${promptId}`;

const storedRef = (value: string | null | undefined): SignedAgentReference | undefined => value ? JSON.parse(value) as SignedAgentReference : undefined;
const sameRef = (left: SignedAgentReference | undefined, right: SignedAgentReference | undefined) => left?.kind === right?.kind && left?.entry_id === right?.entry_id
  && left?.source.plugin_id === right?.source.plugin_id && left?.source.plugin_version === right?.source.plugin_version && left?.source.publisher_signature === right?.source.publisher_signature;

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
  private readonly scopes = new Map<string, Map<string, AgentDefinitionRegistration>>();
  /** Each Skill's state in each scope and its uses: the catalog's two tables, in this store. */
  readonly skills: SkillSettingsStore;
  /** Each prompt's recent uses, kept per key. */
  readonly uses: PromptUses;

  constructor(private readonly db: DatabaseSync, private readonly now = () => new Date()) {
    applySqliteBaseline(db, AGENT_DEFINITIONS_STORE, AGENT_DEFINITIONS_BASELINE);
    this.skills = new SkillSettingsStore(db, now);
    this.uses = new PromptUses(db);
  }

  /** Renew one declaration. Installed plugins supply a Host-owned scope so another installation cannot withdraw it. */
  register(registration: AgentDefinitionRegistration, scope = ""): void {
    const ids = new Set<string>();
    for (const prompt of registration.prompts) {
      if (ids.has(prompt.prompt_id)) throw agentDefinitionsErrors.invalid(`${registration.owner_id} 重复登记了 ${prompt.prompt_id}`);
      ids.add(prompt.prompt_id);
      if (!prompt.body.trim()) throw agentDefinitionsErrors.invalid(`${registration.owner_id}/${prompt.prompt_id} 没有正文`);
    }
    for (const role of registration.roles) {
      const missing = role.prompt_ids.filter(id => !ids.has(id));
      if (missing.length) throw agentDefinitionsErrors.invalid(`角色 ${role.role_id} 引用了未登记的 Prompt：${missing.join("、")}`);
    }
    const methods = new Set<string>();
    for (const method of registration.methods ?? []) {
      if (methods.has(method.skill_id)) throw agentDefinitionsErrors.invalid(`${registration.owner_id} 重复登记了方法 ${method.skill_id}`);
      methods.add(method.skill_id);
      if (!method.body.trim() || method.body.length > 20_000) throw agentDefinitionsErrors.invalid(`${registration.owner_id}/${method.skill_id} 的方法正文为空或过长`);
    }
    const declarations = this.scopes.get(registration.owner_id) ?? new Map();
    declarations.set(scope, cloneAgentRegistration(registration));
    this.scopes.set(registration.owner_id, declarations);
    this.refreshOwner(registration.owner_id);
  }

  unregister(ownerId: string, scope = ""): void {
    this.scopes.get(ownerId)?.delete(scope);
    this.refreshOwner(ownerId);
  }

  /** Settings show one editable key; execution resolves the calling installation's declaration separately. */
  private refreshOwner(ownerId: string): void {
    const declarations = [...(this.scopes.get(ownerId)?.values() ?? [])];
    if (!declarations.length) { this.scopes.delete(ownerId); this.owners.delete(ownerId); return; }
    const enabled = declarations.filter(owner => owner.source.kind !== "plugin" || owner.source.state === "enabled");
    const preferred = enabled.length ? enabled : declarations;
    const prompts = new Map<string, AgentPromptRegistration>();
    // Keep older-only prompts editable too; an enabled declaration takes precedence over a disabled one.
    for (const group of [declarations, preferred]) {
      const selected = new Map<string, AgentPromptRegistration>();
      for (const owner of group) for (const prompt of owner.prompts) {
        if (!selected.has(prompt.prompt_id) || selected.get(prompt.prompt_id)!.version <= prompt.version) selected.set(prompt.prompt_id, prompt);
      }
      for (const [id, prompt] of selected) prompts.set(id, prompt);
    }
    const owner = preferred.at(-1)!;
    this.owners.set(ownerId, { ...owner, prompts: [...prompts.values()],
      ...(declarations.length > 1 ? { notes: [...new Set(declarations.flatMap(item => item.notes ?? [])),
        "此插件有多个安装：优先显示启用安装中的最新 Prompt 默认版本；各次调用仍使用自己的发布版本，你的修改由这些安装共享。"] } : {}) });
  }

  hasPrompt(ownerId: string, promptId: string): boolean { return Boolean(this.owners.get(ownerId)?.prompts.some(prompt => prompt.prompt_id === promptId)); }

  registrations(): AgentDefinitionRegistration[] { return [...this.owners.values()].map(cloneAgentRegistration); }

  /** What one installation registered, running or not, never the settings aggregation: the Skill catalog reads its bodies here. */
  installation(ownerId: string, installId: string): AgentDefinitionRegistration | undefined {
    const registration = this.scopes.get(ownerId)?.get(installId);
    return registration && cloneAgentRegistration(registration);
  }

  private override(key: string): Override | null {
    return (this.db.prepare("SELECT * FROM prompt_overrides WHERE key = ?").get(key) as Override | undefined) ?? null;
  }

  private registered(key: string): { owner: AgentDefinitionRegistration; prompt: AgentPromptRegistration } {
    const slash = key.indexOf("/");
    const owner = slash > 0 ? this.owners.get(key.slice(0, slash)) : undefined;
    const prompt = owner?.prompts.find(item => item.prompt_id === key.slice(slash + 1));
    if (!owner || !prompt) throw agentDefinitionsErrors.not_found("没有登记这段 Prompt");
    return { owner, prompt };
  }

  private view(owner: AgentDefinitionRegistration, prompt: AgentPromptRegistration, locale?: string): AgentPromptView {
    const key = keyOf(owner.owner_id, prompt.prompt_id);
    const edited = this.override(key), body = agentBodyIn(prompt, locale);
    const [used] = this.uses.list(key, 1);
    return {
      key, owner_id: owner.owner_id, source: structuredClone(owner.source), prompt_id: prompt.prompt_id, kind: prompt.kind,
      ...(prompt.layer ? { layer: prompt.layer } : {}), title: prompt.title, purpose: prompt.purpose, used_by: [...prompt.used_by],
      ...(prompt.default_ref ? { default_ref: structuredClone(prompt.default_ref) } : {}),
      default_version: prompt.version, default_body: body,
      effective: edited ? "user" : "default", body: edited?.body ?? body,
      ...(edited ? { user: { revision: edited.revision, base_version: edited.base_version, ...(edited.default_ref ? { default_ref: storedRef(edited.default_ref) } : {}), updated_at: edited.updated_at } } : {}),
      default_updated: Boolean(edited && (prompt.default_ref ? !sameRef(prompt.default_ref, storedRef(edited.default_ref)) : prompt.version > edited.base_version)),
      ...(used ? { last_used: { ...(used.source_ref ? { source_ref: used.source_ref } : {}), at: used.at, version: used.version, user_revision: used.user_revision, caller: used.caller } } : {}),
    };
  }

  prompts(locale?: string): AgentPromptView[] {
    return [...this.owners.values()].flatMap(owner => owner.prompts.map(prompt => this.view(owner, prompt, locale)));
  }

  prompt(key: string, locale?: string): AgentPromptView {
    const { owner, prompt } = this.registered(key);
    return this.view(owner, prompt, locale);
  }

  /**
   * Methods running owners declare for business work, one per declaring installation for a signed package's. Not a reference: who may
   * read one, and its exact `SkillRef`, are the shared catalog's (`skills.catalog.list@1`), which reads the bodies with `installation`.
   * Since 9-2 the Assistant and Coding read the catalog, so nothing in production calls this: it is the register's own read view,
   * kept for tests and the development pages. A new consumer should read the catalog instead of adding one.
   */
  methods(): AgentSkillView[] {
    const view = (owner: AgentDefinitionRegistration, method: AgentSkillRegistration, install_id?: string): AgentSkillView => ({ key: keyOf(owner.owner_id, method.skill_id),
      owner_id: owner.owner_id, source: structuredClone(owner.source), skill_id: method.skill_id, version: method.version, name: method.name, summary: method.summary,
      tools: [...method.tools], ...(install_id ? { install_id } : {}) });
    const native = [...this.owners.values()].filter(owner => offering(owner) && !signedSourceOf(owner)).flatMap(owner => (owner.methods ?? []).map(method => view(owner, method)));
    return [...native, ...signedScopes(this.scopes).flatMap(([install_id, owner]) => (owner.methods ?? []).map(method => view(owner, method, install_id)))];
  }

  /** Each running signed package's roles, per installation: the role material a round may be handed (`signedMaterial`). */
  signedRoles(): SignedRoleView[] {
    return signedScopes(this.scopes).flatMap(([install_id, owner]) => owner.roles.map(role => ({ install_id, owner_id: owner.owner_id, source: structuredClone(owner.source),
      role_id: role.role_id, version: role.version, name: role.name, purpose: role.purpose, default_ref: { source: signedSourceOf(owner)!, kind: "role" as const, entry_id: role.role_id } })));
  }

  /** Read the selected installation's role, never the settings aggregation or a newer default. No use is recorded here. */
  signedMaterial(installId: string, ref: SignedAgentReference, locale?: string): SignedAgentMaterial {
    const owner = this.scopes.get(ref.source.plugin_id)?.get(installId), source = owner?.source;
    if (!owner || !offering(owner) || source?.kind !== "plugin" || source.plugin_version !== ref.source.plugin_version
      || source.publisher_signature !== ref.source.publisher_signature) throw agentDefinitionsErrors.not_found("签名正文来源已变化，请重新选择");
    const role = owner.roles.find(item => item.role_id === ref.entry_id);
    const prompt = role && owner.prompts.find(item => role.prompt_ids.includes(item.prompt_id) && sameRef(item.default_ref, ref));
    if (!prompt) throw agentDefinitionsErrors.not_found("没有登记这个角色资料版本");
    const edited = this.override(keyOf(owner.owner_id, prompt.prompt_id));
    return { default_ref: structuredClone(ref), effective: edited ? "user" : "default", user_revision: edited?.revision ?? null, body: edited?.body ?? agentBodyIn(prompt, locale) };
  }

  /** Called only after an accepted handoff; a later withdrawal does not erase the accepted historical fact. */
  recordSignedUse(material: SignedAgentMaterial, caller: string): void {
    const ref = material.default_ref;
    this.uses.record({ key: keyOf(ref.source.plugin_id, sandboxPromptId(ref.entry_id)), source_ref: ref,
      version: /* @version format.sandbox.agent-prompt */ 1, user_revision: material.user_revision, caller, at: this.now().toISOString() });
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
    return (this.db.prepare("SELECT revision, body, base_version, at, actor_id, action, default_ref FROM prompt_history WHERE key = ? ORDER BY revision DESC").all(key) as unknown as Array<Omit<AgentPromptRevision, "default_ref"> & { default_ref: string | null }>)
      .map(({ default_ref, ...row }) => ({ ...row, ...(default_ref ? { default_ref: storedRef(default_ref) } : {}) }));
  }

  /** Save the person's version. `expected` is the revision they edited (null when they edited the default). */
  save(key: string, body: string, expected: number | null, actorId: string, locale?: string): AgentPromptView {
    const { owner, prompt } = this.registered(key);
    if (typeof body !== "string" || !body.trim()) throw agentDefinitionsErrors.invalid("Prompt 不能为空；要回到原来的文字请用“恢复默认”");
    if (body.length > AGENT_PROMPT_MAX_CHARS) throw agentDefinitionsErrors.invalid(`Prompt 最长 ${AGENT_PROMPT_MAX_CHARS} 字`);
    const current = this.override(key);
    if ((current?.revision ?? null) !== expected) throw agentDefinitionsErrors.conflict("这段 Prompt 已在别处修改，请刷新后再改");
    const revision = this.nextRevision(key);
    const at = this.now().toISOString();
    this.transaction(() => {
      this.db.prepare("INSERT INTO prompt_overrides(key,revision,base_version,body,updated_at,actor_id,default_ref) VALUES (?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET revision=excluded.revision, base_version=excluded.base_version, body=excluded.body, updated_at=excluded.updated_at, actor_id=excluded.actor_id, default_ref=excluded.default_ref")
        .run(key, revision, prompt.version, body, at, actorId, prompt.default_ref ? JSON.stringify(prompt.default_ref) : null);
      this.db.prepare("INSERT INTO prompt_history(key,revision,action,body,base_version,at,actor_id,default_ref) VALUES (?,?,?,?,?,?,?,?)").run(key, revision, "save", body, prompt.version, at, actorId, prompt.default_ref ? JSON.stringify(prompt.default_ref) : null);
    });
    return this.view(owner, prompt, locale);
  }

  /** Back to the shipped default. The person's versions stay in the history. */
  reset(key: string, expected: number | null, actorId: string, locale?: string): AgentPromptView {
    const { owner, prompt } = this.registered(key);
    const current = this.override(key);
    if (!current) return this.view(owner, prompt, locale);
    if (current.revision !== expected) throw agentDefinitionsErrors.conflict("这段 Prompt 已在别处修改，请刷新后再改");
    const revision = this.nextRevision(key);
    this.transaction(() => {
      this.db.prepare("DELETE FROM prompt_overrides WHERE key = ?").run(key);
      this.db.prepare("INSERT INTO prompt_history(key,revision,action,body,base_version,at,actor_id,default_ref) VALUES (?,?,?,?,?,?,?,?)").run(key, revision, "reset", null, prompt.version, this.now().toISOString(), actorId, prompt.default_ref ? JSON.stringify(prompt.default_ref) : null);
    });
    return this.view(owner, prompt, locale);
  }

  /** The Agent Host's resolver: the text a registered prompt runs with now. Unregistered prompts run as given. */
  effective(ownerId: string, declaration: AgentPromptText, locale?: string): AgentPromptText {
    const prompt = selectedBody(declaration, locale), key = keyOf(ownerId, prompt.prompt_id);
    if (!this.hasPrompt(ownerId, prompt.prompt_id)) return prompt;
    const edited = this.override(key);
    this.uses.record({ key, version: prompt.version, user_revision: edited?.revision ?? null, caller: `agent:${ownerId}`, at: this.now().toISOString() });
    return edited ? { ...prompt, body: edited.body, user_revision: edited.revision } : prompt;
  }

  /** A direct model call's instructions, as registered and as the person left them. */
  instruction(ownerId: string, promptId: string, caller: string, locale?: string, deferUse?: (record: () => void) => void): { body: string; version: number; user_revision: number | null } {
    const { prompt } = this.registered(keyOf(ownerId, promptId));
    return this.instructionForDeclaration(ownerId, prompt, caller, locale, deferUse);
  }

  /**
   * Host-selected release declaration, never a prompt body supplied by a model action's business input. With `deferUse` the caller records the use
   * when the call it was read for is dispatched; a retried dispatch hook records one use, and a call refused before dispatch records none.
   */
  instructionForDeclaration(ownerId: string, prompt: Pick<AgentPromptRegistration, "prompt_id" | "version" | "kind" | "body" | "body_by_locale">, caller: string, locale?: string, deferUse?: (record: () => void) => void): { body: string; version: number; user_revision: number | null } {
    if (prompt.kind !== "instruction") throw agentDefinitionsErrors.invalid("这段 Prompt 不是模型调用的指令");
    const key = keyOf(ownerId, prompt.prompt_id), edited = this.override(key);
    const selected = { body: edited?.body ?? agentBodyIn(prompt, locale), version: prompt.version, user_revision: edited?.revision ?? null };
    let recorded = false;
    const record = () => { if (recorded) return; recorded = true; this.uses.record({ key, version: selected.version, user_revision: selected.user_revision, caller, at: this.now().toISOString() }); };
    if (deferUse) deferUse(record); else record();
    return selected;
  }

  /** What each owner registered and what of it is not in effect, for developers; plus calls known to bypass the register. */
  diagnostics(): AgentDefinitionsDiagnostics {
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
    return { owners };
  }

  private nextRevision(key: string): number {
    return Number((this.db.prepare("SELECT COALESCE(MAX(revision), 0) + 1 AS next FROM prompt_history WHERE key = ?").get(key) as { next: number }).next);
  }

  private transaction(run: () => void): void {
    if (this.db.isTransaction) { run(); return; }
    this.db.exec("BEGIN IMMEDIATE");
    try { run(); this.db.exec("COMMIT"); } catch (error) { rollbackPreservingError(error, () => this.db.exec("ROLLBACK")); throw error; }
  }
}

/** Each prompt's uses, the newest `PROMPT_USES_KEPT` per key: what the 「提示词」 page shows and the AI kit counts. A use that fails to record never stops the call. */
class PromptUses {
  constructor(private readonly db: DatabaseSync) {}

  record(use: AgentPromptUse): void {
    try {
      this.db.prepare("INSERT INTO prompt_uses(key,at,version,user_revision,caller,source_ref) VALUES (?,?,?,?,?,?)").run(use.key, use.at, use.version, use.user_revision, use.caller, use.source_ref ? JSON.stringify(use.source_ref) : null);
      this.db.prepare("DELETE FROM prompt_uses WHERE key = ? AND rowid NOT IN (SELECT rowid FROM prompt_uses WHERE key = ? ORDER BY at DESC LIMIT ?)").run(use.key, use.key, PROMPT_USES_KEPT);
    } catch (error) { const [owner, prompt] = use.key.split("/"); hostLog.warn("agents", "prompt_use_unrecorded", error, { owner, prompt }); } // Written as owner and prompt, since a key has no `/`.
  }

  list(key: string, limit = 20): AgentPromptUse[] {
    return (this.db.prepare("SELECT * FROM prompt_uses WHERE key = ? ORDER BY at DESC LIMIT ?").all(key, limit) as unknown as Array<Omit<AgentPromptUse, "source_ref"> & { source_ref: string | null }>).map(({ source_ref, ...row }) => ({ ...row, ...(source_ref ? { source_ref: storedRef(source_ref) } : {}) }));
  }

  /** How many uses each prompt has on record and the last one, by key: one read for a whole list. */
  counts(): Map<string, { count: number; last_at: string }> {
    const rows = this.db.prepare("SELECT key, COUNT(*) AS count, MAX(at) AS last_at FROM prompt_uses GROUP BY key").all() as Array<{ key: string; count: number; last_at: string }>;
    return new Map(rows.map(row => [row.key, { count: Number(row.count), last_at: row.last_at }]));
  }
}

/** The prompts an Agent sends on the side of its rounds, never composed into a role: what the person reads them as. */
const SIDE_PROMPTS = {
  compaction: { title: "上下文整理", purpose: "长任务接近上下文上限时，整理较早的内容" },
  ending_review: { title: "收尾核对", purpose: "可写的一轮什么也没改就要结束时，对照这一轮的事实核对它最后说的话" },
} as const;
const EXECUTION_WORDS: Record<AgentRoleExecution, string> = { "read-only": "只读", "text-edit": "可改文字", "workspace-write": "可改文件、运行命令", operate: "可调用业务能力" };

/**
 * One Agent's declaration as registrations: its prompts named after the roles that use them, its roles with what
 * they may do (for the person to read; enforced elsewhere), its child roles, and the prompts it sends on the side
 * (compaction, the ending review).
 */
export function agentRegistration(ownerId: string, source: AgentDefinitionSource, manifest: AgentManifest, texts: readonly AgentPromptText[],
  names: { prompts?: Record<string, { title: string; purpose?: string }> } = {}): AgentDefinitionRegistration {
  const roles: AgentRoleRegistration[] = manifest.roles.map(role => {
    const prompt_ids = role.prompts ?? manifest.prompts.map(prompt => prompt.prompt_id).filter(id => id !== manifest.compaction?.prompt_id && id !== manifest.ending_review?.prompt_id);
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
    const composed = roles.filter(role => role.prompt_ids.includes(text.prompt_id));
    const users = composed.map(role => role.name);
    const side = manifest.compaction?.prompt_id === text.prompt_id ? SIDE_PROMPTS.compaction : manifest.ending_review?.prompt_id === text.prompt_id ? SIDE_PROMPTS.ending_review : undefined;
    const layer = promptLayerOf(declared.get(text.prompt_id) ?? text);
    const named = names.prompts?.[text.prompt_id];
    const title = named?.title ?? side?.title ?? (layer === "base" ? "基础约束" : users.length === 1 ? users[0]! : text.prompt_id);
    const purpose = named?.purpose ?? side?.purpose;
    const prompt: AgentPromptRegistration = { prompt_id: text.prompt_id, version: text.version, kind: "agent", layer, title,
      purpose: purpose ?? (users.length ? `组成角色：${users.join("、")}` : "未被任何角色使用"),
      used_by: side ? [side.title] : users, body: text.body, ...(text.body_by_locale ? { body_by_locale: text.body_by_locale } : {}) };
    if (purpose === undefined && composed.length) rememberComposedRoles(prompt, composed.map(role => role.role_id));
    return prompt;
  });
  return { owner_id: ownerId, source, prompts, roles };
}

export interface BuiltinAgent { owner_id: string; source: AgentDefinitionSource; manifest: AgentManifest; prompts: readonly AgentPromptText[]; skills?: readonly AgentSkillDefinition[] }

const registries = new Map<string, AgentDefinitions>(), declarations = new Map<string, AgentDeclarations>();

/** A language preview may inspect an already opened register; it must never create its stores. */
export const openedAgentDefinitions = (homeDirectory: string): AgentDefinitions | undefined => registries.get(path.resolve(homeDirectory));

/** Whether an owner's methods are offered: not while its plugin does not run (a remembered declaration, PG-051 RAC-196). */
const offering = (owner: AgentDefinitionRegistration) => owner.source.kind !== "plugin" || owner.source.state !== "disabled";
function selectedBody<T extends { body: string; body_by_locale?: Readonly<Record<string, string>> }>(declaration: T, locale?: string): Omit<T, "body_by_locale"> {
  const { body_by_locale, ...selected } = declaration;
  return { ...selected, body: agentBodyIn({ body: selected.body, body_by_locale }, locale) };
}

/** A signed package's source, as its role material names it; none for the system and an unsigned Plugin. */
const signedSourceOf = ({ source }: AgentDefinitionRegistration): SignedAgentReference["source"] | undefined => source.kind === "plugin" && source.publisher_signature
  ? { kind: "plugin", plugin_id: source.plugin_id, plugin_version: source.plugin_version, publisher_signature: source.publisher_signature } : undefined;
/** Running signed installations across scopes, each with its install id. */
const signedScopes = (scopes: ReadonlyMap<string, ReadonlyMap<string, AgentDefinitionRegistration>>): Array<[string, AgentDefinitionRegistration]> =>
  [...scopes.values()].flatMap(scope => [...scope].filter(([, owner]) => offering(owner) && signedSourceOf(owner)));

/** The Home's remembered installation declarations (PG-051 Q1 b), opened once. */
export function agentDeclarationsFor(homeDirectory: string): AgentDeclarations {
  const home = path.resolve(homeDirectory);
  let opened = declarations.get(home);
  if (!opened) { opened = AgentDeclarations.open(home); declarations.set(home, opened); }
  return opened;
}

/**
 * One register per Home, opened once, with the system's and built-in Plugins' definitions registered, and each installation's
 * remembered declaration as not running until the installation starts again.
 */
export function agentDefinitionsFor(homeDirectory: string, registrations: () => readonly AgentDefinitionRegistration[]): AgentDefinitions {
  const home = path.resolve(homeDirectory);
  let registry = registries.get(home);
  if (!registry) {
    registry = new AgentDefinitions(openBaselineHomeSqlite(home, AGENT_DEFINITIONS_STORE, AGENT_DEFINITIONS_BASELINE));
    registries.set(home, registry);
    for (const registration of registrations()) registry.register(registration);
    for (const kept of agentDeclarationsFor(home).all()) registry.register(notRunning(kept.registration), kept.install_id);
  }
  return registry;
}

/**
 * A Plugin's Manifest methods with the bodies its package ships, exactly as declared: a declared method is registered only with
 * the body of its id and version, and one without a body is left out with a note for the developer diagnostics.
 */
export function declaredMethods(declared: readonly AgentSkillDeclaration[], bodies: readonly AgentSkillDefinition[] = []): { methods: AgentSkillRegistration[]; notes: string[] } {
  const methods = declared.flatMap(method => {
    const content = bodies.find(item => item.skill_id === method.skill_id && item.version === method.version);
    return content?.body ? [{ skill_id: method.skill_id, version: method.version, name: method.name, summary: method.summary, tools: [...method.tools], body: content.body, ...(content.body_by_locale ? { body_by_locale: content.body_by_locale } : {}) }] : [];
  });
  const notes = declared.filter(method => !methods.some(item => item.skill_id === method.skill_id)).map(method => `方法 ${method.skill_id} 声明了但包里没有正文，未登记`);
  return { methods, notes };
}

/** Instruction prompts as registrations, grouped under their owners and merged into any Agent registration of the same owner. */
export function withInstructions(registrations: readonly AgentDefinitionRegistration[], instructions: readonly InstructionPrompt[],
  sourceOf: (ownerId: string) => AgentDefinitionSource): AgentDefinitionRegistration[] {
  const merged = new Map(registrations.map(registration => [registration.owner_id, cloneAgentRegistration(registration)]));
  for (const instruction of instructions) {
    const owner = merged.get(instruction.owner_id) ?? { owner_id: instruction.owner_id, source: sourceOf(instruction.owner_id), prompts: [], roles: [] };
    owner.prompts.push(instructionRegistration(instruction));
    merged.set(instruction.owner_id, owner);
  }
  return [...merged.values()];
}

/** One instruction as its owner registers it, with the role it works for when it names one. */
export function instructionRegistration(instruction: InstructionPrompt): AgentPromptRegistration {
  return { prompt_id: instruction.prompt_id, version: instruction.version, kind: "instruction", title: instruction.title, purpose: instruction.purpose,
    used_by: [...instruction.used_by], ...(instruction.role_id ? { role_id: instruction.role_id } : {}), body: instruction.body,
    ...(instruction.body_by_locale ? { body_by_locale: instruction.body_by_locale } : {}) };
}

/**
 * An instruction's `role_id` must be a role the same owner declares (specs/capability-pack/contract-design.md §4.2): otherwise the owner's
 * whole registration is refused, wherever it registers — a plugin's (`pluginAgentRegistration`) or the Host's own (`builtinRegistrations`).
 */
export function assertInstructionRoles(registration: AgentDefinitionRegistration): void {
  const roles = new Set(registration.roles.map(role => role.role_id));
  const stray = registration.prompts.find(prompt => prompt.role_id !== undefined && !roles.has(prompt.role_id));
  if (stray) throw agentDefinitionErrors.instruction_role_unknown(`指令 ${stray.prompt_id} 说它为角色 ${stray.role_id} 做事，但 ${registration.owner_id} 没有声明这个角色`,
    { owner_id: registration.owner_id, prompt_id: stray.prompt_id, role_id: stray.role_id! });
}

/** This store in the Home's store registry (W4-11). */
export const AGENT_DEFINITIONS_HOME_STORE: HomeStoreDeclaration = { path: AGENT_DEFINITIONS_STORE, library: { baseline: AGENT_DEFINITIONS_BASELINE } };
