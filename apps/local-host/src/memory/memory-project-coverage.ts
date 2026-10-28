import type { MemoryBackendPort } from "@molis-ai/molis-work-service-memory";
import { memoryErrors } from "@molis-ai/molis-work-service-memory";
import type { AgentMemoryPurgeCoverageQuery } from "@molis-ai/molis-work-contracts/services/agent-host";

/** A page-local result never proves the whole registry. The owner checks the same facts after every await. */
export async function verifyMemoryCoverage(backend: Pick<MemoryBackendPort, "verifyPurgeCoverage">, input: AgentMemoryPurgeCoverageQuery, current: () => void): Promise<void> {
  let cursor: string | undefined;
  do {
    current();
    const page = await backend.verifyPurgeCoverage({ ...input, ...(cursor ? { cursor } : {}) });
    current();
    if (page.status !== "covered" || page.issues.length) throw memoryErrors.conflict("记忆归属覆盖不完整，保留原删除决定待核对");
    if (page.exhausted) return;
    if (!page.cursor || page.cursor === cursor) throw memoryErrors.conflict("记忆归属覆盖尚未穷尽");
    cursor = page.cursor;
  } while (true);
}

/** Re-reading current identities is only an empty proof, never a new deletion plan. */
export async function verifyProjectMemoryEmpty(backend: Pick<MemoryBackendPort, "previewPurge">, input: {
  scopes: readonly { scope: "project" | "character"; owner: string }[]; actor: string; sessions: readonly string[];
}, current: () => void): Promise<void> {
  const targets = [...input.scopes.map(scope => ({ ...scope, session_ref: undefined as { kind: "session"; id: string; revision: number } | undefined })),
    ...input.sessions.map(id => ({ scope: "personal" as const, owner: input.actor, session_ref: { kind: "session" as const, id, revision: 1 } }))];
  for (const target of targets) for (const kind of ["memory", "memory-candidate"] as const) {
    let cursor: string | undefined;
    do {
      current();
      const page = await backend.previewPurge({ ...target, kind, ...(cursor ? { cursor } : {}) });
      current();
      if (page.outcome !== "completed" || page.issues.length || page.items.length) throw memoryErrors.conflict("项目仍有当前记忆原件或空态不明，不能沿旧计划追加删除或确认完成");
      if (page.exhausted) break;
      if (!page.cursor || page.cursor === cursor) throw memoryErrors.conflict("项目记忆空态尚未穷尽");
      cursor = page.cursor;
    } while (true);
  }
}
