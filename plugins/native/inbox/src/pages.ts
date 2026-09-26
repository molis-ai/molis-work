import { createHash } from "node:crypto";
import { ActionError, type ActionCallContext, type ActionExecutionContext, type SubjectOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { PAGES_PLUGIN_ID, type PagesGenerationRecord, type PagesInputSnapshot, type PagesRecord } from "@molis-ai/molis-work-contracts/modules/pages";
import type { InboxPagesInput, InboxPagesMaterialRef } from "./actions.js";

export interface InboxPagesPorts {
  generation(requestId: string, caller: ActionCallContext): Promise<PagesGenerationRecord | null>;
  generations(caller: ActionCallContext): Promise<PagesGenerationRecord[]>;
  readDocument(id: string, caller: ActionCallContext): Promise<PagesRecord>;
  generate(input: Pick<PagesGenerationRecord, "request_id" | "request_hash" | "inputs" | "title" | "instructions">, caller: ActionCallContext): Promise<{ document: PagesRecord; replayed: boolean }>;
  readMaterial(entryId: string, caller: ActionCallContext): PagesInputSnapshot | Promise<PagesInputSnapshot>;
}

export function inboxPagesMaterialReference(material: PagesInputSnapshot): InboxPagesMaterialRef {
  const { captured_at: _captured, ...content } = material;
  return { entry_id: material.entry_id, item_id: material.item_id, revision: material.revision,
    content_digest: createHash("sha256").update(JSON.stringify(content)).digest("hex") };
}

/** Keep the original manual request identity; prepared offers additionally pin their material. */
export function inboxPagesRequestHash(input: InboxPagesInput): string {
  return createHash("sha256").update(JSON.stringify({ entryIds: [...new Set(input.entry_ids)].sort(),
    instructions: input.instructions.trim(), title: input.title.trim(),
    ...(input.expected_materials ? { expected_materials: [...input.expected_materials].sort((a, b) => a.entry_id.localeCompare(b.entry_id)) } : {}),
  })).digest("hex");
}

/** Inbox owns material selection; Pages owns generation, persistence and recovery. */
export function createInboxPagesHandlers(ports: InboxPagesPorts) {
  return {
    preparePages: async (input: SubjectOffersInput, caller: ActionCallContext): Promise<InboxPagesInput | null> => {
      let material: PagesInputSnapshot;
      try { material = await ports.readMaterial(input.subject.id, caller); }
      catch (error) { caller.signal?.throwIfAborted(); if (error instanceof ActionError) return null; throw error; }
      return { request_id: `inbox-pages:${createHash("sha256").update(JSON.stringify([input.request_id, input.subject.id])).digest("hex")}`,
        entry_ids: [material.entry_id], title: "材料整理",
        instructions: "围绕所选材料整理一份简洁的综合工作稿，区分事实、作者自述、推断和待核查。每个主要结论标明材料编号，不把多条材料的差异抹平成共识。正文不重复标题。",
        expected_materials: [inboxPagesMaterialReference(material)] };
    },
    pagesResults: async (caller: ActionCallContext) => (await ports.generations(caller))
      .map(({ inputs, ...record }) => ({ ...record, entry_ids: inputs.map(item => item.entry_id) })),
    generatePages: async (input: InboxPagesInput, caller: ActionExecutionContext) => {
      const entryIds = [...new Set(input.entry_ids)].sort();
      const instructions = input.instructions.trim(), title = input.title.trim();
      if (!instructions || !title) throw new ActionError("pages.invalid", "请填写标题和处理要求");
      const expected = input.expected_materials;
      if (expected && (expected.length !== entryIds.length || new Set(expected.map(ref => ref.entry_id)).size !== entryIds.length
        || expected.some(ref => !entryIds.includes(ref.entry_id)))) throw new ActionError("pages.invalid", "固定材料与所选事项不一致");
      const request_hash = inboxPagesRequestHash(input);
      const existing = await ports.generation(input.request_id, caller);
      if (existing && existing.request_hash !== request_hash) throw new ActionError("pages.invalid", "材料或要求已改变，请重新生成");
      if (existing?.status === "completed" && existing.document_id) return { document: await ports.readDocument(existing.document_id, caller),
        replayed: true, request_id: input.request_id, entry_ids: entryIds };
      const matches = (materials: readonly PagesInputSnapshot[]) => {
        if (expected && (materials.length !== expected.length || materials.some(material => {
          const ref = expected.find(value => value.entry_id === material.entry_id), current = inboxPagesMaterialReference(material);
          return !ref || ref.item_id !== current.item_id || ref.revision !== current.revision || ref.content_digest !== current.content_digest;
        }))) throw new ActionError("actions.offer_changed", "原材料已变化，请重新载入后整理");
      };
      const currentMaterials = () => Promise.all(entryIds.map(id => ports.readMaterial(id, caller)));
      const inputs = existing ? [...existing.inputs] : await currentMaterials();
      matches(inputs);
      const guarded: ActionCallContext = { ...caller, validate_authority: async reference => {
        await caller.beforeEffect();
        await caller.validate_authority?.(reference);
        if (expected) matches(await currentMaterials());
        await caller.beforeEffect();
      } };
      await guarded.validate_authority!({ capability_id: "pages.generate", version: 1, provider_id: PAGES_PLUGIN_ID });
      const result = await ports.generate({ request_id: input.request_id, request_hash, inputs, instructions, title }, guarded);
      return { ...result, request_id: input.request_id, entry_ids: entryIds };
    },
  };
}
