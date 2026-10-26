import type { MemoryCandidate, MemoryLedgerPort, MemoryPrefs, MemoryPrefsView, MemoryPreset, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { completePrefs, presetPrefs, PERSONAL_PREFS_KEY, PROJECT_DEFAULT_PREFS_KEY, projectPrefsKey } from "./prefs.js";
import { memoryErrors } from "./errors.js";
import { personOnly, placeOf } from "./places.js";
import type { MemoryCaller } from "./service.js";

/** One Home's effective switches, persisted recipes and the existing Assistant settings projection. */
export class MemoryPreferences {
  constructor(private readonly ledger: MemoryLedgerPort) {}

  prefsFor(actorId: string, scope: MemoryScope, projectId: string | null): MemoryPrefs {
    if (scope === "personal") return completePrefs("personal", this.ledger.prefs(actorId, PERSONAL_PREFS_KEY));
    return completePrefs("project", this.ledger.prefs(actorId, PROJECT_DEFAULT_PREFS_KEY), projectId ? this.ledger.prefs(actorId, projectPrefsKey(projectId)) : null);
  }

  prefs(caller: MemoryCaller, scope: MemoryScope = caller.project_id ? "project" : "personal"): MemoryPrefsView {
    const where = placeOf(caller, scope);
    return { scope, project_id: where.project, prefs: this.prefsFor(caller.actor_id, scope, where.project) };
  }

  savePrefs(caller: MemoryCaller, scope: MemoryScope | undefined, input: Partial<MemoryPrefs> | MemoryPreset): MemoryPrefsView {
    personOnly(caller, "只有本人能改记忆开关");
    if (typeof input === "string" && !["off", "manual", "reviewed", "assisted"].includes(input)) throw memoryErrors.invalid("未知的记忆预设");
    const target = scope ?? (caller.project_id ? "project" : "personal");
    const where = placeOf(caller, target);
    const current = this.prefsFor(caller.actor_id, target, where.project);
    const next = typeof input === "string" ? presetPrefs(current, input) : completePrefs(target, current, input);
    // Plugin rules replace one plugin at a time; a plugin not named keeps its rule.
    if (typeof input !== "string" && input.plugins) for (const [pluginId, rule] of Object.entries(input.plugins)) if (rule && typeof rule.allowed === "boolean" && !Array.isArray(rule.kinds))
      next.plugins[pluginId] = { allowed: rule.allowed, kinds: current.plugins[pluginId]?.kinds ?? next.plugins[pluginId]!.kinds };
    this.ledger.savePrefs(caller.actor_id, target === "personal" ? PERSONAL_PREFS_KEY : projectPrefsKey(where.project!), next);
    return { scope: target, project_id: where.project, prefs: next };
  }

  /**
   * The five switches of the Assistant's first settings section, read from and written to the platform switches
   * (personal, and the project default), until that section becomes a summary with a link here.
   */
  assistantPrefs(actorId: string): { form: boolean; use_personal: boolean; use_project: boolean; learn_personal: boolean; learn_project: boolean } {
    const personal = this.prefsFor(actorId, "personal", null), projects = completePrefs("project", this.ledger.prefs(actorId, PROJECT_DEFAULT_PREFS_KEY));
    return { form: personal.form, use_personal: personal.consumers.assistant, use_project: projects.consumers.assistant, learn_personal: personal.learn_from_work, learn_project: projects.learn_from_work };
  }

  saveAssistantPrefs(actorId: string, input: Partial<{ form: boolean; use_personal: boolean; use_project: boolean; learn_personal: boolean; learn_project: boolean }>): ReturnType<MemoryPreferences["assistantPrefs"]> {
    const personal = this.prefsFor(actorId, "personal", null), projects = completePrefs("project", this.ledger.prefs(actorId, PROJECT_DEFAULT_PREFS_KEY));
    if (typeof input.form === "boolean") { personal.form = input.form; projects.form = input.form; }
    if (typeof input.use_personal === "boolean") personal.consumers.assistant = input.use_personal;
    if (typeof input.use_project === "boolean") projects.consumers.assistant = input.use_project;
    if (typeof input.learn_personal === "boolean") personal.learn_from_work = input.learn_personal;
    if (typeof input.learn_project === "boolean") projects.learn_from_work = input.learn_project;
    this.ledger.transaction(() => {
      this.ledger.savePrefs(actorId, PERSONAL_PREFS_KEY, personal);
      this.ledger.savePrefs(actorId, PROJECT_DEFAULT_PREFS_KEY, projects);
    });
    return this.assistantPrefs(actorId);
  }

  assertFormation(actorId: string, where: { scope: MemoryScope; owner: string; project?: string | null }, from: MemoryCandidate["from"], gate: boolean): void {
    this.assertEnabled(actorId, where);
    const prefs = this.prefsFor(actorId, where.scope, where.project ?? null);
    if (!prefs.form) throw memoryErrors.off("用户关掉了“允许记住”，不要提出记忆建议");
    if (gate) return;
    if ((from === "work" || from === "extraction") && !prefs.learn_from_work)
      throw memoryErrors.forbidden(where.scope === "project" ? "用户没有允许从项目工作里提出项目约定" : "用户没有允许从工作里提出个人偏好");
    if (from === "signal" && !prefs.learn_from_ui) throw memoryErrors.forbidden("用户没有允许从界面操作里学习");
  }

  assertEnabled(actorId: string, where: { scope: MemoryScope; owner: string; project?: string | null }): void {
    const project = where.scope === "project" ? where.owner : where.project ?? null;
    if (!this.prefsFor(actorId, where.scope, project).enabled) throw memoryErrors.off("这个范围的记忆已关闭；仍可查看和删除，启用后才能保存或恢复");
  }
}
