import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginModelClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { validateIssueImages, type IssueImage } from "./images.js";
import { nameIssue } from "./naming.js";
import type { Issue, IssueStore, IssueType } from "./store.js";

/** Where the person was when they wrote it, as their page reported it (never proof of what was on screen). */
interface IssuePage { url: string | null; title: string | null }
export interface IssueDraft { draft_id: string; description: string; images?: IssueImage[]; page?: IssuePage }
export interface IssueCapture { draft_id: string; title: string; type: IssueType }
export type IssueNamed = { status: "saved"; issue: Issue } | { status: "needs_input"; question: string };
interface HeldDraft { input: IssueDraft; expires: number; saved?: string; pending?: Promise<Issue> }
// Long enough to come back to a capture that could not be named while the person was elsewhere.
const lifetime = 2 * 60 * 60_000;
const missing = () => new ActionError("actions.conflict", "这份录入草稿已失效，请在 Issue 里重新记录");
const text = (value: unknown, max: number) => value === null || typeof value === "string" && [...value].length <= max;

/**
 * Unsaved input belongs to this activation. The model never copies or edits its words or image bytes: it only names
 * the record (title, type). A capture always creates a new record whose id is the draft id, so its undo can only ever
 * take back that record. Its writer is the caller's actor, never anything in the input or the model's answer.
 */
export class IssueCaptures {
  private readonly drafts = new Map<string, HeldDraft>();
  constructor(private readonly store: IssueStore) {}
  async prepare(input: IssueDraft, caller: ActionExecutionContext): Promise<{ draft_id: string }> {
    if (!/^[0-9a-f-]{36}$/.test(input.draft_id) || typeof input.description !== "string" || [...input.description].length > 100000
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
    // Unfinished drafts are bounded, but one whose page is gone (another browser, cleared storage) must not lock the person
    // out of recording: the oldest idle one makes room. Its page, if still open, finds it gone and offers to save by hand.
    const open = [...this.drafts].filter(([, draft]) => !draft.saved);
    if (open.length >= 8) {
      const oldest = open.filter(([, draft]) => !draft.pending).sort(([, a], [, b]) => a.expires - b.expires)[0];
      if (!oldest) throw new ActionError("actions.input_invalid", "还有 8 条记录正在保存，请稍候再记");
      this.drafts.delete(oldest[0]);
    }
    this.drafts.set(input.draft_id, { input: structuredClone(input), expires: Date.now() + lifetime });
    return { draft_id: input.draft_id };
  }
  async capture(input: IssueCapture, caller: ActionExecutionContext, named?: () => void): Promise<Issue> {
    const held = this.drafts.get(input.draft_id);
    if (!held || held.expires < Date.now()) throw missing();
    const already = await this.already(held, caller);
    if (already) return already;
    held.pending = this.save(input, held, caller, named);
    try { return await held.pending; } finally { held.pending = undefined; }
  }
  /**
   * Names a held draft with one model call and saves it (ISSUE-50), or hands back the one question to ask. A draft saved
   * meanwhile (by hand, or by an earlier call) is the result; one retired meanwhile is gone, and nothing is written.
   */
  async name(draftId: string, caller: ActionExecutionContext, model: PluginModelClient | undefined): Promise<IssueNamed> {
    const held = this.drafts.get(draftId);
    if (!held || held.expires < Date.now()) throw missing();
    const already = await this.already(held, caller);
    if (already) return { status: "saved", issue: already };
    const { naming, validate } = await nameIssue(model, held.input, caller.signal);
    if (naming.status === "needs_input") { await caller.beforeEffect(); return naming; }
    return { status: "saved", issue: await this.capture({ draft_id: draftId, title: naming.title, type: naming.type }, caller, validate) };
  }
  private async already(held: HeldDraft, caller: ActionExecutionContext): Promise<Issue | null> {
    if (held.saved) { await caller.beforeEffect(); return this.store.read(held.saved); }
    if (held.pending) { const saved = await held.pending; await caller.beforeEffect(); return this.store.read(saved.id); }
    return null;
  }
  private async save(input: IssueCapture, held: HeldDraft, caller: ActionExecutionContext, named?: () => void): Promise<Issue> {
    const current = () => { if (this.drafts.get(input.draft_id) !== held || held.expires < Date.now()) throw missing(); };
    // A model's answer is checked once more right before the synchronous commit, as the model service asks.
    const validate = () => { current(); named?.(); };
    const page = held.input.page ? { ...held.input.page, provenance: "client_reported" as const } : caller.page_context;
    const control = { ...caller, ...(page ? { page_context: page } : {}), beforeEffect: async () => { await caller.beforeEffect(); current(); } };
    const saved = await this.store.create({ description: held.input.description, images: held.input.images, title: input.title, type: input.type }, control,
      { id: input.draft_id, validate, named: Boolean(named) });
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
