import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { ActionError, resolveActionSubject, type ActionCallContext, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeEventActions, type HomeEventsResult } from "./home-event-actions.js";
import type { HomeEventWindow } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeOfferActions, type HomeActionOffers } from "./home-offer-actions.js";
import { PersonalAssistantStore } from "./personal-assistant-store.js";
import type { AssistantAssessment, AssistantCategory, AssistantMaterial, AssistantPreferences, AssistantSuggestion, PersonalAssistantPorts } from "./personal-assistant-types.js";

const categories: AssistantCategory[] = ["requirement_change", "follow_up", "risk"];
const fail = (code: string, message: string): never => { throw new ActionError(`assistant.${code}`, message); };
const receipt = (row: AssistantSuggestion) => ({ id: row.id, revision: row.revision, status: row.status, issue: row.issue });
const active = (row: AssistantSuggestion) => ["ready", "snoozed"].includes(row.status);
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)])) : value;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const required = (value: unknown, max: number): string => typeof value === "string" && value.trim() && value.length <= max ? value.trim() : fail("quality", "建议内容不完整，可调整要求后重新判断");

export class PersonalAssistantService {
  constructor(readonly store: PersonalAssistantStore, private ports: PersonalAssistantPorts, private projectId: string,
    private actorId: string, private now = () => new Date()) {}
  private assertCaller(caller: ActionCallContext, permission = "home:read") {
    if (caller.project_id !== this.projectId || caller.actor_id !== this.actorId) fail("scope", "助理不属于当前项目或用户");
    if (!caller.permissions.includes(permission)) fail("forbidden", "当前没有助理所需权限");
    caller.signal?.throwIfAborted();
  }
  private async unchanged(materials: AssistantMaterial[], caller: ActionCallContext) {
    for (const material of materials) {
      const source = await this.ports.inspectMaterial(material.context.subject, caller);
      const current = await resolveActionSubject(this.ports.actions, caller, material.context.subject);
      if (!isDeepStrictEqual(current.context, material.context) || !isDeepStrictEqual(current.reader, material.reader) || !isDeepStrictEqual(source, material.source)) fail("stale", "引用的材料已变化，请重新判断后确认");
    }
  }
  private async readable(materials: AssistantMaterial[], caller: ActionCallContext) {
    for (const material of materials) {
      await this.ports.inspectMaterial(material.context.subject, caller);
      await resolveActionSubject(this.ports.actions, caller, material.context.subject);
    }
  }
  async state(caller: ActionCallContext) {
    this.assertCaller(caller);
    const now = this.now(), preferences = this.store.preferences();
    const rows: AssistantSuggestion[] = [];
    const unreadable = new Set<string>();
    for (let row of this.store.list()) {
      if (active(row)) {
        let issue: string | null = Date.parse(row.expires_at) <= now.getTime() ? "建议已过期，请用当前材料重新判断" : null;
        if (!issue) try { await this.unchanged(row.materials, caller); } catch { issue = "来源不可访问或材料已变化，请重新选择材料"; }
        if (issue) row = this.store.update(row.id, row.revision, { status: "expired", issue });
        else if (row.status === "snoozed" && Date.parse(row.remind_at!) <= now.getTime()) row = this.store.update(row.id, row.revision, { status: "ready", remind_at: null });
      }
      try { await this.readable(row.materials, caller); } catch { unreadable.add(row.id); }
      rows.push(row);
    }
    const quiet = !preferences.enabled || !!preferences.quiet_until && Date.parse(preferences.quiet_until) > now.getTime();
    return { preferences, quiet, suggestions: quiet ? [] : rows.filter(row => row.status === "ready" && !unreadable.has(row.id) && !preferences.disabled_categories.includes(row.category)).slice(0, preferences.max_visible),
      history: rows.filter(row => row.status !== "ready").map(row => ({ id: row.id, revision: row.revision, status: row.status,
        title: unreadable.has(row.id) ? "来源已不可访问" : row.title, remind_at: row.remind_at,
        issue: unreadable.has(row.id) ? "当前来源授权不足，请在来源设置中检查" : row.issue,
        has_result: !unreadable.has(row.id) && row.status === "completed", subject: unreadable.has(row.id) ? null : row.subject })), available_count: rows.filter(row => row.status === "ready" && !preferences.disabled_categories.includes(row.category)).length };
  }
  preferences(caller: ActionCallContext, expected: number, patch: Omit<AssistantPreferences, "revision">) {
    this.assertCaller(caller, "home:write");
    if (!Number.isSafeInteger(expected) || expected < 0 || !patch) fail("invalid", "偏好版本无效，请重新读取");
    if (typeof patch.enabled !== "boolean" || !Array.isArray(patch.disabled_categories) || patch.disabled_categories.some(item => !categories.includes(item))
      || !Number.isInteger(patch.max_visible) || patch.max_visible < 1 || patch.max_visible > 5 || typeof patch.instructions !== "string" || patch.instructions.length > 2000
      || patch.quiet_until !== null && !Number.isFinite(Date.parse(patch.quiet_until))
      || patch.character !== null && (typeof patch.character?.artifact_id !== "string" || !patch.character.artifact_id || !Number.isInteger(patch.character.version) || patch.character.version < 1)) fail("invalid", "偏好设置无效，请检查时间、角色版本或建议数量");
    return this.store.savePreferences({ ...patch, quiet_until: patch.quiet_until && Date.parse(patch.quiet_until) > this.now().getTime() ? patch.quiet_until : null, revision: expected, disabled_categories: [...new Set(patch.disabled_categories)] }, expected);
  }
  async evaluate(caller: ActionCallContext, input: { changes: ActionSubject[]; project_materials: ActionSubject[]; instructions?: string }): Promise<AssistantAssessment> {
    this.assertCaller(caller, "home:write");
    if (!caller.permissions.includes("model:invoke")) fail("forbidden", "当前没有模型判断权限");
    const preferences = this.store.preferences();
    if (!preferences.enabled || preferences.quiet_until && Date.parse(preferences.quiet_until) > this.now().getTime()) return { outcome: "quiet", suggestions: [], message: "助理已暂停，原材料仍可打开" };
    if (!Array.isArray(input.changes) || !Array.isArray(input.project_materials) || !input.changes.length || !input.project_materials.length
      || input.changes.length + input.project_materials.length > 12) fail("invalid", "请选择新内容和当前项目材料，总计不超过 12 项");
    const instructions = input.instructions === undefined ? "" : required(input.instructions, 2000);
    const subjects = [...input.changes, ...input.project_materials];
    if (new Set(subjects.map(subject => JSON.stringify(subject))).size !== subjects.length) fail("invalid", "新内容与项目材料不能重复");
    const materials: AssistantMaterial[] = [];
    try {
      for (const [index, subject] of subjects.entries()) {
        const source = await this.ports.inspectMaterial(subject, caller);
        const resolved = await resolveActionSubject(this.ports.actions, caller, subject);
        if (resolved.context.truncated || !resolved.context.content.trim()) fail("quality", "材料不完整，请打开原文或选择更具体的材料");
        materials.push({ key: `S${index + 1}`, role: index < input.changes.length ? "change" : "project", source, ...resolved });
      }
      const reuse = await this.ports.reuseSubjects?.({ materials, instructions }, caller) ?? [];
      for (const subject of reuse.slice(0, Math.max(0, 12 - materials.length))) {
        if (materials.some(material => isDeepStrictEqual(material.context.subject, subject))) continue;
        const source = await this.ports.inspectMaterial(subject, caller), resolved = await resolveActionSubject(this.ports.actions, caller, subject);
        if (resolved.context.truncated || !resolved.context.content.trim()) continue;
        materials.push({ key: `S${materials.length + 1}`, role: "project", source, ...resolved });
      }
      const fingerprint = digest({ materials: [...materials].sort((a, b) => JSON.stringify(a.context.subject).localeCompare(JSON.stringify(b.context.subject))).map(({ key: _key, ...rest }) => rest), instructions });
      const existing = this.store.byFingerprint(fingerprint);
      if (existing && existing.status !== "expired") return { outcome: "nothing_to_do", suggestions: [], message: "这组材料已处理，未重复提醒" };
      if (this.store.checked(fingerprint, preferences.revision, this.now().toISOString())) return { outcome: "nothing_to_do", suggestions: [], message: "当前材料已检查，未重复调用或提醒" };
      const requestId = existing?.request_id ?? randomUUID();
      const candidates = [];
      for (const material of materials) {
        const prepared = await this.ports.actions.invoke(caller, { ...homeOfferActions.offers, provider_id: this.ports.home_provider_id }, { subject: material.context.subject, request_id: requestId }) as HomeActionOffers;
        for (const offer of prepared.offers.filter(item => item.availability.available)) candidates.push({ key: `A${candidates.length + 1}`, subject: material.context.subject, offer });
      }
      if (!candidates.length) return { outcome: "needs_review", suggestions: [], message: "材料已保留，但当前没有已授权动作。可打开原事项手动继续。" };
      const beforeDispatch = async () => {
        this.assertCaller(caller, "home:write");
        if (!caller.permissions.includes("model:invoke")) fail("forbidden", "当前没有模型判断权限");
        await this.unchanged(materials, caller);
        await caller.validate_permissions?.(["home:write", "model:invoke"]);
        this.assertCaller(caller, "home:write");
        this.assertCaller(caller, "model:invoke");
        if (this.store.preferences().revision !== preferences.revision) fail("stale", "助理偏好已变化，请重新判断");
      };
      await beforeDispatch();
      const result = await this.ports.analysis.analyze({ current_time: this.now().toISOString(), materials, offers: candidates.map(({ key, subject, offer }) => ({ key, subject, title: offer.title })),
        instructions: [preferences.instructions, instructions].filter(Boolean).join("\n"), character: preferences.character }, caller, beforeDispatch);
      if (result.runtime !== "prologue") fail("runtime", "助理需要通过 Prologue 判断");
      caller.signal?.throwIfAborted();
      await this.unchanged(materials, caller);
      if (this.store.preferences().revision !== preferences.revision) fail("stale", "助理偏好已变化，请重新判断");
      const model = JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")) as Record<string, unknown>;
      if (model.outcome === "nothing_to_do") { this.store.rememberCheck(fingerprint, preferences.revision, new Date(this.now().getTime() + 86400000).toISOString()); return { outcome: "nothing_to_do", suggestions: [], message: "当前没有证据充分、需要你处理的变化" }; }
      if (model.outcome !== "suggested" || !categories.includes(model.category as AssistantCategory)) fail("quality", "判断缺少明确依据，可调整要求后重试");
      const candidate = candidates.find(item => item.key === model.offer_key);
      if (!candidate) fail("quality", "建议的动作不在当前授权范围");
      const evidence = Array.isArray(model.evidence) ? model.evidence.map(item => {
        const value = item as Record<string, unknown>, key = required(value.material_key, 16), quote = required(value.quote, 800);
        const material = materials.find(item => item.key === key);
        if (!material || !material.context.content.includes(quote)) fail("quality", "建议引用无法在原材料中核对，请手动检查");
        return { material_key: key, quote };
      }) : [];
      if (!["change", "project"].every(role => evidence.some(item => materials.find(material => material.key === item.material_key)?.role === role))) fail("quality", "建议必须同时给出新内容和项目材料的依据");
      const category = model.category as AssistantCategory;
      if (preferences.disabled_categories.includes(category)) return { outcome: "quiet", suggestions: [], message: "这一类建议已关闭" };
      const freshOffers = await this.ports.actions.invoke(caller, { ...homeOfferActions.offers, provider_id: this.ports.home_provider_id }, { subject: candidate!.subject, request_id: requestId }) as HomeActionOffers;
      if (!freshOffers.offers.some(offer => isDeepStrictEqual(offer, candidate!.offer) && offer.availability.available)) fail("stale", "动作已变化，请重新判断");
      await this.unchanged(materials, caller);
      if (this.store.preferences().revision !== preferences.revision) fail("stale", "助理偏好已变化，请重新判断");
      const cited = materials.filter(material => evidence.some(item => item.material_key === material.key));
      const proposalKey = digest({ materials: cited.map(({ key: _key, ...rest }) => rest).sort((a, b) => JSON.stringify(a.context.subject).localeCompare(JSON.stringify(b.context.subject))),
        category, action: candidate!.offer.action, offer_id: candidate!.offer.offer_id, subject: candidate!.subject, instructions });
      if (this.store.list().some(row => row.proposal_key === proposalKey && row.status !== "expired")) {
        this.store.rememberCheck(fingerprint, preferences.revision, new Date(this.now().getTime() + 86400000).toISOString());
        return { outcome: "nothing_to_do", suggestions: [], message: "这条变化已处理，没有再次提醒" };
      }
      const value = { fingerprint, proposal_key: proposalKey, request_id: requestId, status: "ready" as const, title: required(model.title, 160), reason: required(model.reason, 2000), category, evidence,
        materials, subject: candidate!.subject, offer: candidate!.offer, created_at: this.now().toISOString(), expires_at: new Date(this.now().getTime() + 86400000).toISOString(),
        remind_at: null, character: preferences.character, character_title: result.character_title, result: null, issue: null };
      // An expired proposal can be refreshed only for the same original request, never after execution.
      const suggestion = existing ? this.store.update(existing.id, existing.revision, value) : this.store.add(value);
      return { outcome: suggestion.status === "ready" ? "suggested" : "nothing_to_do", suggestions: suggestion.status === "ready" ? [suggestion] : [], message: "已关联当前材料，请检查依据后确认" };
    } catch (error) {
      caller.signal?.throwIfAborted();
      return { outcome: "needs_review", suggestions: [], message: error instanceof ActionError ? error.message : "本次判断没有完成，原材料已保留。可以重试或打开原事项手动继续。" };
    }
  }
  /** Shared scheduler/Home invokes this on arrivals or a bounded refresh. No second scheduler. */
  async observe(caller: ActionCallContext, window: HomeEventWindow, projectMaterials: ActionSubject[]): Promise<AssistantAssessment> {
    this.assertCaller(caller, "home:write");
    const prefs = this.store.preferences();
    if (!prefs.enabled || prefs.quiet_until && Date.parse(prefs.quiet_until) > this.now().getTime()) return { outcome: "quiet", suggestions: [], message: "助理已暂停" };
    if (!projectMaterials.length || projectMaterials.length > 6) return { outcome: "needs_review", suggestions: [], message: "请先选择当前项目的目标或成果材料" };
    const events = await this.ports.actions.invoke(caller, { ...homeEventActions.events, provider_id: this.ports.home_provider_id }, window) as HomeEventsResult;
    const changes: ActionSubject[] = [];
    for (const event of [...events.events].sort((a,b) => b.occurred_at.localeCompare(a.occurred_at))) {
      if (projectMaterials.some(subject => isDeepStrictEqual(subject,event.subject)) || changes.some(subject => isDeepStrictEqual(subject,event.subject))) continue;
      try { if (await this.ports.inspectMaterial(event.subject,caller)) changes.push(event.subject); } catch { /* A revoked or unavailable source cannot enter a model prompt. */ }
      if (changes.length >= 12-projectMaterials.length) break;
    }
    return changes.length ? this.evaluate(caller, { changes, project_materials: projectMaterials }) : { outcome: "nothing_to_do", suggestions: [], message: "当前没有已授权的新来源内容" };
  }
  feedback(caller: ActionCallContext, id: string, revision: number, choice: "dismiss" | "snooze", remindAt?: string) {
    this.assertCaller(caller, "home:write");
    const row = this.store.get(id);
    if (!active(row)) fail("state", "这条建议已处理，请重新读取");
    if (choice === "dismiss") return receipt(this.store.update(id, revision, { status: "dismissed", remind_at: null }));
    if (choice !== "snooze" || !remindAt || !Number.isFinite(Date.parse(remindAt)) || Date.parse(remindAt) <= this.now().getTime() || Date.parse(remindAt) >= Date.parse(row.expires_at)) fail("invalid", "稍后时间须晚于现在且早于材料过期时间");
    return receipt(this.store.update(id, revision, { status: "snoozed", remind_at: remindAt! }));
  }
  async execute(caller: ActionCallContext, id: string, revision: number) {
    this.assertCaller(caller, "home:write");
    const row = this.store.get(id), preferences = this.store.preferences();
    if (!active(row) || row.revision !== revision) fail("state", "建议已处理或变化，请重新读取");
    if (!preferences.enabled || preferences.disabled_categories.includes(row.category) || !isDeepStrictEqual(preferences.character, row.character)) fail("stale", "助理偏好已变化，请重新检查建议");
    if (Date.parse(row.expires_at) <= this.now().getTime()) fail("stale", "建议已过期，请重新判断");
    await this.unchanged(row.materials, caller);
    this.assertCaller(caller, "home:write");
    if (this.store.preferences().revision !== preferences.revision) fail("stale", "助理偏好已变化，请重新检查建议");
    const claimed = this.store.update(id, revision, { status: "executing", issue: null });
    try {
      const { availability: _availability, ...offer } = row.offer;
      const guarded: ActionCallContext = { ...caller, validate_authority: async reference => {
        await caller.validate_authority?.(reference);
        await this.unchanged(row.materials, caller);
        if (this.store.preferences().revision !== preferences.revision) fail("stale", "助理偏好已变化，请重新检查建议");
      } };
      const result = await this.ports.actions.invoke(guarded, { ...homeOfferActions.execute, provider_id: this.ports.home_provider_id }, { subject: row.subject, request_id: row.request_id, offer });
      return receipt(this.store.update(id, claimed.revision, { status: "completed", result: result as AssistantSuggestion["result"] }));
    } catch {
      return receipt(this.store.update(id, claimed.revision, { status: "needs_check", issue: "尚未取得执行结果。请打开原事项核对，助理不会重复提交。" }));
    }
  }
  async recover(caller: ActionCallContext, id: string) {
    this.assertCaller(caller, "home:write");
    const row = this.store.get(id);
    if (!["executing", "needs_check", "completed"].includes(row.status)) fail("state", "当前建议没有待核对的执行请求");
    // Original result owner performs its read authorization. Revisions legitimately change after a successful effect.
    const result = await this.ports.recover?.(row.request_id, row.offer, caller);
    const latest = this.store.update(id, row.revision, { status: result ? "completed" : "needs_check", result: result ?? null, issue: result ? null : "结果尚未确认。请到原事项查看保存的成果，本次请求不会重发。" });
    // A result has its own read authority; the cached suggestion title may derive from a now-revoked source.
    return { id: latest.id, revision: latest.revision, status: latest.status, title: result?.title ?? "核对执行结果", result: latest.result, issue: latest.issue };
  }
}
