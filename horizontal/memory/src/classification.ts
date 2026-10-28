import type { AgentMemoryMeta } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_FORMAL_KINDS, type MemoryChangeRequest, type MemoryRevision } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors } from "./errors.js";
import type { MemoryCaller } from "./service.js";

/** Classification for a new App input only. Existing records and imports never pass through these defaults. */
export function newMemoryClassification(caller: MemoryCaller, expiresAt: string | null): Pick<AgentMemoryMeta, "classification"> {
  // Match the Host's trusted caller binding; text, kind and scope do not establish a scene.
  const scene = caller.current_scene ?? (caller.plugin_id === "io.molis.work.coding" ? "coding" : caller.consumer === "assistant" ? "assistant" : "common");
  if (scene !== "coding" && scene !== "assistant" && scene !== "common") throw memoryErrors.invalid("当前记忆场景未定义，不能推断保存分类");
  if (expiresAt !== null && !Number.isFinite(Date.parse(expiresAt))) throw memoryErrors.invalid("记忆有效期不合格，不能推断保存期限");
  return { classification: { scenes: [scene], lifecycle: expiresAt === null ? "long-term" : "short-term" } };
}

/** An explicit correction never supplies new-input defaults or changes hidden canonical constraints. */
export function correctedMemoryMeta(previous: AgentMemoryMeta, request: MemoryChangeRequest, now: Date): AgentMemoryMeta {
  const target = request.classification;
  if (!request.kind || !MEMORY_FORMAL_KINDS.includes(request.kind))
    throw memoryErrors.invalid("请明确选择记忆类别");
  if (!target || Object.keys(target).some(key => !["scenes", "lifecycle"].includes(key)) || !Array.isArray(target.scenes)
    || !target.scenes.length || target.scenes.length > 3 || new Set(target.scenes).size !== target.scenes.length
    || target.scenes.some(scene => !["coding", "assistant", "common"].includes(scene)) || !["long-term", "short-term"].includes(target.lifecycle))
    throw memoryErrors.invalid("请选择已声明的场景和长期或短期保留方式");
  if (previous.session_ref || previous.classification?.lifecycle === "session") throw memoryErrors.invalid("会话记忆需要可信会话管理入口，本次没有修改");
  if (previous.expires_at_ms !== undefined && previous.expires_at_ms <= now.getTime()) throw memoryErrors.invalid("记忆已到期，需通过明确续期入口处理，本次没有修改");
  if (request.expires_at !== undefined && request.expires_at !== null && typeof request.expires_at !== "string") throw memoryErrors.invalid("记忆截止时间格式不合格");
  const expires = request.expires_at === undefined ? previous.expires_at_ms : request.expires_at === null ? undefined : Date.parse(request.expires_at);
  if (expires !== undefined && (!Number.isFinite(expires) || expires <= now.getTime())) throw memoryErrors.invalid("记忆截止时间必须是有效的未来时间");
  if (target.lifecycle === "short-term" && expires === undefined) throw memoryErrors.invalid("短期记忆需要明确截止时间");
  const { expires_at_ms: _oldExpiry, ...retained } = previous;
  return { ...retained, kind: request.kind, classification: { scenes: [...target.scenes], lifecycle: target.lifecycle,
    ...(previous.classification?.extra ? { extra: structuredClone(previous.classification.extra) } : {}) },
    ...(expires === undefined ? {} : { expires_at_ms: expires }) };
}

/** Snapshot completeness is a historical fact; current authority, expiry and Session access remain SDK decisions. */
export function completeRevisionSnapshot(revision: MemoryRevision): boolean {
  const meta = revision.snapshot?.meta, classification = meta?.classification;
  if (!meta || !classification || !MEMORY_FORMAL_KINDS.some(kind => kind === meta.kind)
    || !Array.isArray(classification.scenes) || !classification.scenes.length || classification.scenes.some(scene => !["coding", "assistant", "common"].includes(scene))
    || !["long-term", "short-term", "session"].includes(classification.lifecycle)) return false;
  if (classification.lifecycle === "session" && !meta.session_ref) return false;
  return meta.expires_at_ms === undefined ? classification.lifecycle !== "short-term" : Number.isFinite(meta.expires_at_ms);
}
