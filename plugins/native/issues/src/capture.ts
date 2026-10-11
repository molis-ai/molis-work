import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { validateIssueImages, type IssueImage } from "./images.js";
import type { Issue, IssueStore, IssueType, IssueUpdate } from "./store.js";

export interface IssueDraft { draft_id: string; description: string; images?: IssueImage[]; target?: Pick<IssueUpdate, "id" | "expected_version"> }
export interface IssueCapture { draft_id: string; title: string; type: IssueType }
interface HeldDraft { input: IssueDraft; expires: number; saved?: string; pending?: Promise<Issue> }
const lifetime = 30 * 60_000;
const missing = () => new ActionError("actions.conflict", "这份录入草稿已失效，请返回 Issue 页面重新交给助理整理");

/** Unsaved input belongs to this activation. The model never copies or edits its words or image bytes. */
export class IssueCaptures {
  private readonly drafts = new Map<string, HeldDraft>();
  constructor(private readonly store: IssueStore) {}
  async prepare(input: IssueDraft, caller: ActionExecutionContext): Promise<{ draft_id: string }> {
    if (!/^[0-9a-f-]{36}$/.test(input.draft_id) || typeof input.description !== "string" || input.description.length > 100000
      || !input.description.trim() && !input.images?.length) throw new ActionError("actions.input_invalid", "请描述问题或添加图片");
    validateIssueImages(input.images ?? []);
    await caller.beforeEffect();
    for (const [id, draft] of this.drafts) if (draft.expires < Date.now()) this.drafts.delete(id);
    const held = this.drafts.get(input.draft_id);
    if (held) {
      if (held.saved) return { draft_id: input.draft_id };
      if (JSON.stringify(held.input) !== JSON.stringify(input)) throw new ActionError("actions.conflict", "这份草稿已经变化，请重新整理");
      return { draft_id: input.draft_id };
    }
    if (input.target && this.store.read(input.target.id).version !== input.target.expected_version) throw new ActionError("actions.conflict", "这条问题已被修改，请刷新详情后核对");
    if ([...this.drafts.values()].filter(draft => !draft.saved).length >= 8) throw new ActionError("actions.input_invalid", "待确认的问题过多，请先确认或取消已有草稿");
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
    const control = { ...caller, beforeEffect: async () => { await caller.beforeEffect(); validate(); } };
    const fields = { description: held.input.description, images: held.input.images, title: input.title, type: input.type };
    const saved = held.input.target
      ? await this.store.update({ ...fields, ...held.input.target }, control, validate)
      : await this.store.create(fields, control, { id: input.draft_id, validate });
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
