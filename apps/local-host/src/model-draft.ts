import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createPrologueNodeAdapter, type PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import type { AgentDraftTextRequest, AgentDraftTextResult, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

const LIMITS = { purpose: 80, instructions: 4_000, material: 60_000 } as const;
const MATERIAL_CHUNK = 16_000;
const TIMEOUT_MS = 120_000;

/**
 * One short text from the model — a commit message, say. The call has no tools and no conversation, runs in a
 * directory of its own, and leaves nothing behind once the text is back: it is a draft for a person to read, not a round.
 */
export async function draftText(prologue: Omit<PrologueNodeAdapterOptions, "app" | "reviewQueue" | "storageRoot">, directory: string, boardId: string,
  input: AgentDraftTextRequest): Promise<AgentDraftTextResult> {
  for (const key of ["purpose", "instructions", "material"] as const) {
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].length > LIMITS[key]) throw new Error("起草的说明或材料为空或过长");
  }
  const root = path.join(directory, randomUUID());
  await mkdir(root, { recursive: true, mode: 0o700 });
  const adapter = await createPrologueNodeAdapter({ ...prologue, storageRoot: path.join(root, "runtime"), app: { appId: "io.molis.work.draft", appVersion: "1.0.0" } });
  try {
    const owner = { board_id: boardId, plugin_id: "io.molis.work.coding", install_id: "draft", actor_id: "web-user" };
    const place = { canonical_path: root, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory: place, title: input.purpose });
    const handle = await adapter.start({ ...owner, session, directory: place, role_id: "draft",
      role: { role_id: "draft", version: 1, execution: "read-only", prompts: [{ prompt_id: "draft", version: 1, layer: "base", body: input.instructions }], host_tools: [] },
      text_materials: Array.from({ length: Math.ceil(input.material.length / MATERIAL_CHUNK) }, (_, index) => ({
        material_id: `draft:${index + 1}`, title: `${input.purpose}的材料（${index + 1}）`, source_artifact_id: "draft", source_version: 1,
        text: input.material.slice(index * MATERIAL_CHUNK, (index + 1) * MATERIAL_CHUNK),
      })),
      task: `${input.purpose}。材料在附件里。只返回结果本身，不要调用工具，不要加其他文字。`,
      ...(input.model_selection ? { model_selection: input.model_selection } : {}),
    });
    let view: AgentRunView;
    for (const deadline = Date.now() + TIMEOUT_MS; ; await new Promise(resolve => setTimeout(resolve, 150))) {
      view = await adapter.read(handle.ref);
      if (["completed", "failed", "cancelled", "stopped", "reconcile-required"].includes(view.phase)) break;
      if (Date.now() > deadline) { await adapter.control(handle.ref, { kind: "cancel" }).catch(() => undefined); throw new Error("模型两分钟内没有写完，已停止"); }
    }
    if (view.phase !== "completed") throw new Error(view.stop_reason ?? "模型没有写完");
    const text = view.turns.filter(turn => turn.kind === "assistant").at(-1)?.text.trim() ?? "";
    if (!text) throw new Error("模型没有返回内容");
    const { input: used, output } = view.usage.tokens;
    return { text, usage: Number.isFinite(used) && Number.isFinite(output) ? { input: used, output } : null };
  } finally {
    await adapter.close().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}
