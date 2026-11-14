import type { AgentMemoryMeta } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_FORMAL_KINDS, type MemoryChangeRequest, type MemoryRevision } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors } from "./errors.js";
import type { MemoryCaller } from "./service.js";

/** A historical fact only; current authority, expiry and Session access remain SDK decisions. */
export function completeRevisionSnapshot(revision: MemoryRevision): boolean {
  const meta = revision.snapshot?.meta, classification = meta?.classification;
  if (!meta || typeof revision.snapshot?.origin !== "string" || !classification || !MEMORY_FORMAL_KINDS.some(kind => kind === meta.kind)
    || !Array.isArray(classification.scenes) || !classification.scenes.length || classification.scenes.length > 3
    || new Set(classification.scenes).size !== classification.scenes.length || classification.scenes.some(scene => !["coding", "assistant", "common"].includes(scene))
    || !["long-term", "short-term", "session"].includes(classification.lifecycle)) return false;
  if (classification.lifecycle === "session" && (!meta.session_ref || meta.session_ref.kind !== "session" || !meta.session_ref.id
    || !Number.isSafeInteger(meta.session_ref.revision) || meta.session_ref.revision < 1)) return false;
  return meta.expires_at_ms === undefined ? classification.lifecycle !== "short-term" : Number.isFinite(new Date(meta.expires_at_ms).getTime());
}

export function belongsToMemorySession(caller: MemoryCaller, meta: AgentMemoryMeta): boolean {
  const binding = caller.memory_session;
  return !binding || meta.classification?.lifecycle === "session" && meta.session_ref?.kind === "session"
    && meta.session_ref.id === binding.session.session_id && meta.session_ref.revision === 1;
}

export function assertManagedMemorySession(caller: MemoryCaller, meta: AgentMemoryMeta): void {
  if (meta.session_ref || meta.classification?.lifecycle === "session") {
    if (caller.person && !caller.memory_session || !belongsToMemorySession(caller, meta))
      throw memoryErrors.forbidden("这条会话记忆只能在原业务会话中管理");
  }
}

/** Explicit write classification, with a Session identity only from the person's protected binding. */
export function requestedMemoryClassification(caller: MemoryCaller, expiresAt: string | null,
  target?: { scenes: string[]; lifecycle: "long-term" | "short-term" | "session" }): Pick<AgentMemoryMeta, "classification" | "session_ref"> {
  if (!target) return newMemoryClassification(caller, expiresAt);
  if (!Array.isArray(target.scenes) || !target.scenes.length || target.scenes.length > 3 || new Set(target.scenes).size !== target.scenes.length
    || target.scenes.some(scene => !["coding", "assistant", "common"].includes(scene)) || !["long-term", "short-term", "session"].includes(target.lifecycle))
    throw memoryErrors.invalid("请选择已声明的记忆场景和保留方式");
  if (target.lifecycle === "short-term" && expiresAt === null) throw memoryErrors.invalid("短期记忆需要明确截止时间");
  if (target.lifecycle === "session" && (!caller.person || !caller.memory_session)) throw memoryErrors.forbidden("会话记忆需要本人原业务绑定");
  return { classification: { scenes: [...target.scenes], lifecycle: target.lifecycle },
    ...(target.lifecycle === "session" ? { session_ref: { kind: "session" as const, id: caller.memory_session!.session.session_id, revision: 1 } } : {}) };
}

/** Classification for a new App input only. Existing records and imports never pass through these defaults. */
export function newMemoryClassification(caller: MemoryCaller, expiresAt: string | null): Pick<AgentMemoryMeta, "classification"> {
  // Match the Host's trusted caller binding; text, kind and scope do not establish a scene.
  const scene = caller.current_scene ?? (caller.plugin_id === "io.molis.work.coding" ? "coding" : caller.consumer === "assistant" ? "assistant" : "common");
  if (scene !== "coding" && scene !== "assistant" && scene !== "common") throw memoryErrors.invalid("当前记忆场景未定义，不能推断保存分类");
  if (expiresAt !== null && !Number.isFinite(Date.parse(expiresAt))) throw memoryErrors.invalid("记忆有效期不合格，不能推断保存期限");
  return { classification: { scenes: [scene], lifecycle: expiresAt === null ? "long-term" : "short-term" } };
}

/** An explicit correction never supplies new-input defaults or changes hidden canonical constraints. */
export function correctedMemoryMeta(previous: AgentMemoryMeta, request: MemoryChangeRequest, now: Date, caller?: MemoryCaller): AgentMemoryMeta {
  const target = request.classification;
  if (!request.kind || !MEMORY_FORMAL_KINDS.includes(request.kind))
    throw memoryErrors.invalid("请明确选择记忆类别");
  if (!target || Object.keys(target).some(key => !["scenes", "lifecycle"].includes(key)) || !Array.isArray(target.scenes)
    || !target.scenes.length || target.scenes.length > 3 || new Set(target.scenes).size !== target.scenes.length
    || target.scenes.some(scene => !["coding", "assistant", "common"].includes(scene)) || !["long-term", "short-term", "session"].includes(target.lifecycle))
    throw memoryErrors.invalid("请选择已声明的场景和长期或短期保留方式");
  if (previous.session_ref || previous.classification?.lifecycle === "session") {
    if (!caller?.person || !caller.memory_session) throw memoryErrors.invalid("会话记忆需要可信会话管理入口，本次没有修改");
    assertManagedMemorySession(caller, previous);
  }
  if (target.lifecycle === "session" && (!caller?.person || !caller.memory_session)) throw memoryErrors.forbidden("会话记忆需要本人原业务绑定");
  if (previous.expires_at_ms !== undefined && previous.expires_at_ms <= now.getTime()) throw memoryErrors.invalid("记忆已到期，需通过明确续期入口处理，本次没有修改");
  if (request.expires_at !== undefined && request.expires_at !== null && typeof request.expires_at !== "string") throw memoryErrors.invalid("记忆截止时间格式不合格");
  const expires = request.expires_at === undefined ? previous.expires_at_ms : request.expires_at === null ? undefined : Date.parse(request.expires_at);
  if (expires !== undefined && (!Number.isFinite(expires) || expires <= now.getTime())) throw memoryErrors.invalid("记忆截止时间必须是有效的未来时间");
  if (target.lifecycle === "short-term" && expires === undefined) throw memoryErrors.invalid("短期记忆需要明确截止时间");
  const { expires_at_ms: _oldExpiry, session_ref: _oldSession, ...retained } = previous;
  return { ...retained, kind: request.kind, classification: { scenes: [...target.scenes], lifecycle: target.lifecycle,
    ...(previous.classification?.extra ? { extra: structuredClone(previous.classification.extra) } : {}) },
    ...(expires === undefined ? {} : { expires_at_ms: expires }),
    ...(target.lifecycle === "session" ? { session_ref: { kind: "session" as const, id: caller!.memory_session!.session.session_id, revision: 1 } } : {}) };
}
