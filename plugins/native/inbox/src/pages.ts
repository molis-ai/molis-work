import { createHash } from "node:crypto";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PagesGenerationRecord, PagesInputSnapshot, PagesRecord } from "@molis-ai/molis-work-contracts/modules/pages";
import type { InboxPagesInput } from "./actions.js";

export interface InboxPagesPorts {
  generation(requestId: string, caller: ActionCallContext): Promise<PagesGenerationRecord | null>;
  generations(caller: ActionCallContext): Promise<PagesGenerationRecord[]>;
  readDocument(id: string, caller: ActionCallContext): Promise<PagesRecord>;
  generate(input: Pick<PagesGenerationRecord, "request_id" | "request_hash" | "inputs" | "title" | "instructions">, caller: ActionCallContext): Promise<{ document: PagesRecord; replayed: boolean }>;
  readMaterial(entryId: string): PagesInputSnapshot;
}

/** Inbox owns material selection; Pages owns generation, persistence and recovery. */
export function createInboxPagesHandlers(ports: InboxPagesPorts) {
  return {
    pagesResults: async (caller: ActionCallContext) => (await ports.generations(caller))
      .map(({ inputs, ...record }) => ({ ...record, entry_ids: inputs.map(item => item.entry_id) })),
    generatePages: async (input: InboxPagesInput, caller: ActionCallContext) => {
      const entryIds = [...new Set(input.entry_ids)].sort();
      const instructions = input.instructions.trim(), title = input.title.trim();
      if (!instructions || !title) throw new ActionError("pages.invalid", "请填写标题和处理要求");
      const request_hash = createHash("sha256").update(JSON.stringify({ entryIds, instructions, title })).digest("hex");
      const existing = await ports.generation(input.request_id, caller);
      if (existing && existing.request_hash !== request_hash) throw new ActionError("pages.invalid", "材料或要求已改变，请重新生成");
      const inputs = existing ? [...existing.inputs] : entryIds.map(id => ports.readMaterial(id));
      const result = existing?.status === "completed" && existing.document_id
        ? { document: await ports.readDocument(existing.document_id, caller), replayed: true }
        : await ports.generate({ request_id: input.request_id, request_hash, inputs, instructions, title }, caller);
      return { ...result, request_id: input.request_id, entry_ids: entryIds };
    },
  };
}
