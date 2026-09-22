import { createHash } from "node:crypto";
import type { PagesGenerationRecord, PagesInputSnapshot } from "@molis-ai/molis-work-contracts/modules/pages";
import { generatePagesFromMaterials, openPagesStore, PagesError } from "@molis-ai/molis-work-plugin-pages";
import type { FeedApplication } from "@molis-ai/molis-work-plugin-feed";
import { hydrateFeedItemContent } from "./feed-content.js";
import { hostCompleteText, type HostCompleteText } from "./host-complete-text.js";

export function inboxPagesResults(home: string, projectId: string) {
  const store = openPagesStore(home);
  try { return store.generations(projectId).map(({ inputs, ...record }) => ({ ...record, entry_ids: inputs.map((item) => item.entry_id) })); }
  finally { store.close(); }
}

export async function generateInboxPages(options: {
  home: string; projectId: string; feed: FeedApplication; completeText?: HostCompleteText;
}, body: Readonly<Record<string, unknown>>) {
  const requestId = typeof body.request_id === "string" ? body.request_id : "";
  const entryIds = Array.isArray(body.entry_ids) ? [...new Set(body.entry_ids.filter((id): id is string => typeof id === "string"))].sort() : [];
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(requestId) || entryIds.length < 1 || entryIds.length > 20 || !instructions || instructions.length > 4000 || !title || title.length > 80) {
    throw new PagesError("pages.invalid", "请选择 1–20 条材料，填写标题和处理要求");
  }
  const requestHash = createHash("sha256").update(JSON.stringify({ entryIds, instructions, title })).digest("hex");
  const store = openPagesStore(options.home);
  try {
    const existing = store.generation(options.projectId, requestId);
    if (existing && existing.request_hash !== requestHash) throw new PagesError("pages.invalid", "材料或要求已改变，请重新生成");
    const inputs: PagesInputSnapshot[] = existing ? [...existing.inputs] : entryIds.map((entryId) => {
      const entry = options.feed.getInboxEntry(options.projectId, entryId);
      if (entry.subject_type !== "feed_item") throw new PagesError("pages.invalid", "只支持整理有原始内容的 Feed 材料");
      const item = hydrateFeedItemContent(options.feed.getFeedItem(options.projectId, entry.subject_id));
      const body = item.body || item.materials.map((material) => material.content || material.preview).join("\n\n") || item.summary;
      if (!body.trim()) throw new PagesError("pages.invalid", "所选材料没有可读取的正文");
      return { entry_id: entryId, item_id: item.item_id, revision: item.revision, title: item.title,
        body, url: item.url, source_label: item.source_label, captured_at: new Date().toISOString(),
        provenance: item.materials.map((material) => material.provenance) };
    });
    if (inputs.reduce((sum, input) => sum + input.body.length, 0) > 100_000) throw new PagesError("pages.invalid", "材料过长，请减少所选条目");
    const record: PagesGenerationRecord = existing ?? { request_id: requestId, project_id: options.projectId, request_hash: requestHash,
      status: "running", document_id: null, inputs, instructions, title, error: null, updated_at: new Date().toISOString() };
    const result = await generatePagesFromMaterials(store, record, options.completeText ?? hostCompleteText());
    return { ...result, request_id: requestId, entry_ids: entryIds };
  } finally { store.close(); }
}
