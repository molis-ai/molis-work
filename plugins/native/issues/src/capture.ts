import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { validateIssueImages, type IssueImage } from "./images.js";
import type { Issue, IssueStore, IssueType } from "./store.js";

/** Where the person was when they wrote it, as their page reported it (never proof of what was on screen). */
export interface IssuePage { url: string | null; title: string | null }
export interface IssueDraft { draft_id: string; description: string; images?: IssueImage[]; page?: IssuePage }
export interface IssueCapture { draft_id: string; title: string; type: IssueType }
interface HeldDraft { input: IssueDraft; expires: number; saved?: string; pending?: Promise<Issue> }
// Long enough to come back to a capture the Assistant could not finish while the person was elsewhere.
const lifetime = 2 * 60 * 60_000;
const missing = () => new ActionError("actions.conflict", "这份录入草稿已失效，请在 Issue 里重新记录");
const text = (value: unknown, max: number) => value === null || typeof value === "string" && value.length <= max;

/**
 * Unsaved input belongs to this activation. The model never copies or edits its words or image bytes: it only names
 * the record (title, type). A capture always creates a new record whose id is the draft id, so its undo can only ever
 * take back that record.
 */
export class IssueCaptures {
  private readonly drafts = new Map<string, HeldDraft>();
  constructor(private readonly store: IssueStore) {}
  async prepare(input: IssueDraft, caller: ActionExecutionContext): Promise<{ draft_id: string }> {
    if (!/^[0-9a-f-]{36}$/.test(input.draft_id) || typeof input.description !== "string" || input.description.length > 100000
      || !input.description.trim() && !input.images?.length) throw new ActionError("actions.input_invalid", "请描述问题或添加图片");
    if (input.page !== undefined && !(input.page && text(input.page.url, 500) && text(input.page.title, 200))) throw new ActionError("actions.input_invalid", "记录页面格式不正确");
    validateIssueImages(input.images ?? []);
    await caller.beforeEffect();
    for (const [id, draft] of this.drafts) if (draft.expires < Date.now()) this.drafts.delete(id);
    const held = this.drafts.get(input.draft_id);
    if (held) {
      if (held.saved) return { draft_id: input.draft_id };
      if (JSON.stringify(held.input) !== JSON.stringify(input)) throw new ActionError("actions.conflict", "这份草稿已经变化，请重新记录");
      held.expires = Date.now() + lifetime;
      return { draft_id: input.draft_id };
    }
    if ([...this.drafts.values()].filter(draft => !draft.saved).length >= 8) throw new ActionError("actions.input_invalid", "还有 8 条记录没整理完，请先处理它们");
    this.drafts.set(input.draft_id, { input: structuredClone(input), expires: Date.now() + lifetime });
    return { draft_id: input.draft_id };
  }
  async capture(input: IssueCapture, caller: ActionExecutionContext): Promise<Issue> {
    const held = this.drafts.get(input.draft_id);
    if (!held || held.expires < Date.now()) throw missing();
    if (held.saved) { await caller.beforeEffect(); return this.store.read(held.saved); }
    if (held.pending) { const saved = await held.pending; await caller.beforeEffect(); return this.store.read(saved.id); }
    held.pending = this.save(input, held, caller);
    try { return await held.pending; } finally { held.pending = undefined; }
  }
  private async save(input: IssueCapture, held: HeldDraft, caller: ActionExecutionContext): Promise<Issue> {
    const validate = () => { if (this.drafts.get(input.draft_id) !== held || held.expires < Date.now()) throw missing(); };
    const page = held.input.page ? { ...held.input.page, provenance: "client_reported" as const } : caller.page_context;
    const control = { ...caller, ...(page ? { page_context: page } : {}), beforeEffect: async () => { await caller.beforeEffect(); validate(); } };
    const saved = await this.store.create({ description: held.input.description, images: held.input.images, title: input.title, type: input.type }, control,
      { id: input.draft_id, validate });
    held.saved = saved.id; held.input = { draft_id: input.draft_id, description: "" };
    return saved;
  }
  async cancel(draftId: string, caller: ActionExecutionContext): Promise<{ saved_id: string | null }> {
    await caller.beforeEffect();
    const held = this.drafts.get(draftId); this.drafts.delete(draftId);
    if (!held) return { saved_id: null };
    try { return { saved_id: this.store.read(held.saved ?? draftId).id }; }
    catch (error) { if (!(error instanceof ActionError) || error.code !== "actions.missing") throw error; return { saved_id: null }; }
  }
}
