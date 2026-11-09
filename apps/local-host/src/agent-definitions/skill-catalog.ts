import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ActionCallContext, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { SKILL_EXCERPT_CHARS, SKILL_SETTINGS_LOCKED_REASONS, skillErrors, type SkillAvailability, type SkillBodyReadResult,
  type SkillCatalogEntry, type SkillCatalogListRequest, type SkillReadRefusal, type SkillResourceContent, type SkillSettingsSetRequest } from "@molis-ai/molis-work-contracts/services/skills";
import type { AgentDefinitions } from "./agent-definitions.js";
import type { SkillSetting } from "./skill-settings.js";
import { currentSkillSelection } from "./skill-selection.js";

/** Ephemeral projection of the existing installation and Agent definition owners, never a second register. */
export interface CatalogSkill {
  ref: SkillRef;
  declaration: PluginMethodDeclaration;
  body: string;
  pack: SkillCatalogEntry["pack"];
  availability: SkillAvailability;
  assertCurrent(): void;
}
export interface SkillCatalogPorts {
  definitions: AgentDefinitions;
  /** One scope read per action, including all installations and their current grants. */
  skills(caller: ActionCallContext): Promise<CatalogSkill[]>;
  resource(skill: CatalogSkill, path: string): Uint8Array;
}

const settingKey = (install: string, skill: string) => `${install}\0${skill}`;
const scopeOf = (caller: ActionCallContext) => caller.project_id ?? "home";
const applicable = (skill: CatalogSkill, caller: ActionCallContext) => {
  const consumer = currentSkillSelection(caller)?.consumer;
  return (caller.audience === "user" && !consumer) || skill.declaration.applies_to === "both" || skill.declaration.applies_to === (consumer ?? "agent");
};

function entry(skill: CatalogSkill, setting: SkillSetting | undefined): SkillCatalogEntry {
  const d = skill.declaration, resources = d.resources ?? [];
  return { ref: skill.ref, name: d.name, description: d.description, applies_to: d.applies_to,
    ...(d.when_to_use ? { when_to_use: d.when_to_use } : {}), ...(d.when_not_to_use ? { when_not_to_use: d.when_not_to_use } : {}),
    ...(d.argument_hint ? { argument_hint: d.argument_hint } : {}), user_invocable: d.user_invocable ?? true, tools: [...d.tools],
    resources: resources.map(({ path, role, bytes }) => ({ path, role, bytes })), connector_categories: [...d.connector_categories ?? []],
    runs_scripts: resources.some(resource => resource.role === "script"), excerpt: Array.from(skill.body).slice(0, SKILL_EXCERPT_CHARS).join(""),
    pack: skill.pack, state: setting?.state ?? "off", settings_revision: setting?.revision ?? 0, availability: skill.availability,
    ...(setting ? { enabled: { at: setting.enabled_at, by: setting.enabled_by, scope: setting.scope_ref === "home" ? "home" as const : "project" as const } } : {}) };
}

export class SkillCatalog {
  constructor(private readonly ports: SkillCatalogPorts) {}

  private async snapshot(caller: ActionCallContext) {
    const skills = await this.ports.skills(caller);
    const settings = new Map(this.ports.definitions.skills.settings(scopeOf(caller)).map(row => [settingKey(row.install_id, row.skill_id), row]));
    return { skills, settings };
  }

  async list(caller: ActionCallContext, input: SkillCatalogListRequest): Promise<{ skills: SkillCatalogEntry[] }> {
    const { skills, settings } = await this.snapshot(caller);
    const latest = this.ports.definitions.skills.latestUses(scopeOf(caller));
    return { skills: skills.filter(skill => (!input.applies_to || skill.declaration.applies_to === "both" || skill.declaration.applies_to === input.applies_to)
      && (caller.audience === "user" || applicable(skill, caller))).map(skill => entry(skill, settings.get(settingKey(skill.ref.install_id, skill.ref.skill_id))))
      .map(row => { const used = latest.get(settingKey(row.ref.install_id, row.ref.skill_id)); return used ? { ...row, last_used: { at: used.at, caller: used.caller, ...(used.run_ref ? { run_ref: used.run_ref } : {}) } } : row; })
      .filter(row => (caller.audience === "user" || row.state !== "off") && (!input.states || input.states.includes(row.state))) };
  }

  private refusal(skill: CatalogSkill | undefined, ref: SkillRef, caller: ActionCallContext, setting: SkillSetting | undefined): SkillReadRefusal | undefined {
    if (!skill || !isDeepStrictEqual(skill.ref, ref)) return "not_current";
    try { skill.assertCurrent(); } catch { return "not_current"; }
    if (!skill.availability.available && !(skill.availability.reason === "native_only" && currentSkillSelection(caller)?.engine === "local")) return skill.availability.reason;
    if (!applicable(skill, caller)) return "not_applicable";
    if (!setting) return "off";
    if (setting.state === "manual" && !currentSkillSelection(caller)?.named.some(named => isDeepStrictEqual(named, ref))) return "not_named";
    return undefined;
  }

  async readBodies(caller: ActionCallContext, refs: readonly SkillRef[]): Promise<{ results: SkillBodyReadResult[] }> {
    const { skills, settings } = await this.snapshot(caller);
    const byKey = new Map(skills.map(skill => [settingKey(skill.ref.install_id, skill.ref.skill_id), skill]));
    return { results: refs.map(ref => {
      const key = settingKey(ref.install_id, ref.skill_id), skill = byKey.get(key), reason = this.refusal(skill, ref, caller, settings.get(key));
      return reason ? { ref, ok: false as const, reason } : { ref, ok: true as const, name: skill!.declaration.name, body: skill!.body };
    }) };
  }

  async readResource(caller: ActionCallContext, ref: SkillRef, path: string): Promise<SkillResourceContent> {
    const { skills, settings } = await this.snapshot(caller);
    const skill = skills.find(item => item.ref.install_id === ref.install_id && item.ref.skill_id === ref.skill_id);
    const reason = this.refusal(skill, ref, caller, settings.get(settingKey(ref.install_id, ref.skill_id)));
    if (reason) throw skillErrors.read_refused("这个技能当前不能读取", { reason });
    const resource = skill!.declaration.resources?.find(item => item.path === path);
    if (!resource) throw skillErrors.resource_undeclared("技能没有声明这个附带文件");
    let bytes: Buffer;
    try { bytes = Buffer.from(this.ports.resource(skill!, path)); }
    catch { throw skillErrors.read_refused("技能的附带文件无法读取", { reason: "resource_invalid" }); }
    if (bytes.length !== resource.bytes || createHash("sha256").update(bytes).digest("hex") !== resource.sha256)
      throw skillErrors.read_refused("技能的附带文件与声明不符", { reason: "resource_invalid" });
    const encoding = resource.media_type.startsWith("text/") || resource.media_type === "application/json" ? "utf8" : "base64";
    return { ref, ...resource, encoding, content: bytes.toString(encoding) };
  }

  /** The trusted round owner calls this only with its acceptance receipt; reads alone never count as use. */
  async recordAcceptedUses(caller: ActionExecutionContext, receipt: { accepted: boolean; refs: readonly SkillRef[]; run_ref?: string }): Promise<void> {
    if (!receipt.accepted) return;
    const selection = currentSkillSelection(caller);
    if (!selection) return;
    const { skills } = await this.snapshot(caller);
    await caller.beforeEffect();
    caller.assert_authority_current?.(); caller.signal?.throwIfAborted();
    const store = this.ports.definitions.skills, scope = scopeOf(caller), seen = new Set<string>();
    for (const ref of receipt.refs) {
      const id = settingKey(ref.install_id, ref.skill_id);
      if (seen.has(id)) continue;
      seen.add(id);
      const skill = skills.find(value => isDeepStrictEqual(value.ref, ref));
      if (this.refusal(skill, ref, caller, store.setting(scope, ref.install_id, ref.skill_id))) continue;
      store.recordUse({ ref, name: skill!.declaration.name, scope_ref: scope, caller: selection.consumer,
        ...(receipt.run_ref ? { run_ref: receipt.run_ref } : {}), at: new Date().toISOString() });
    }
  }

  async setState(caller: ActionExecutionContext, input: SkillSettingsSetRequest): Promise<SkillCatalogEntry> {
    if (input.scope === "project" && !caller.project_id) throw skillErrors.scope_mismatch("需要当前项目才能设置项目技能");
    const scoped = input.scope === "home" ? { ...caller, project_id: null } : caller;
    // Await authority, then recheck the captured installation synchronously before committing.
    const { skills } = await this.snapshot(scoped);
    await caller.beforeEffect();
    caller.assert_authority_current?.();
    caller.signal?.throwIfAborted();
    const skill = skills.find(item => item.ref.install_id === input.install_id && item.ref.skill_id === input.skill_id);
    if (!skill) throw skillErrors.not_found("这个范围里没有这个技能");
    skill.assertCurrent();
    if (input.scope === "home" && skill.pack.scope !== "home") throw skillErrors.scope_mismatch("项目技能不能设到个人空间");
    const availability = skill.availability;
    if (!availability.available && SKILL_SETTINGS_LOCKED_REASONS.some(reason => reason === availability.reason))
      throw skillErrors.settings_locked("请先恢复技能所在的插件", { reason: availability.reason });
    const store = this.ports.definitions.skills, scope = scopeOf(scoped);
    if (store.set(scope, input.install_id, input.skill_id, input.state, input.expected_revision, caller.actor_id) === "conflict")
      throw skillErrors.settings_conflict("技能状态已变化，请刷新后再改");
    return entry(skill, store.setting(scope, input.install_id, input.skill_id));
  }
}
