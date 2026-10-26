import type { AgentMemoryMeta } from "@molis-ai/molis-work-contracts/services/agent-host";
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
