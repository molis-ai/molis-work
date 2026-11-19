import type { SkillDraft } from "@molis-ai/molis-work-contracts/services/skills";
import { isDraftDirty, mergeDraftRevision, type DraftChoice } from "./draft-revisions.js";
import { failureOf, messageOf, readDraft, sentFields, updateDraft, type Workshop } from "./drafts.js";
import type { WritingContext } from "./writing-context.js";

const dirty = (w: Workshop) => isDraftDirty(w.draft, w);

/** Owns the editor's save queue and its relationship to the version held by the Host. */
export function draftSave(
  { project, view }: Pick<WritingContext, "project" | "view">,
  { bar, side, editor }: Record<"bar" | "side" | "editor", (w: Workshop) => void>,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> | undefined;

  function cancel(): void { clearTimeout(timer); timer = undefined; }

  function schedule(w: Workshop): void {
    w.confirm = false;
    w.adoptFailure = undefined;
    if (w.save.kind === "conflict" || w.save.kind === "latest-failed") {
      if (w.compare === "draft") side(w);
      return;
    }
    if (w.save.kind !== "saving") { w.save = { kind: "saving" }; bar(w); }
    clearTimeout(timer);
    timer = setTimeout(() => void flush(w), 600);
  }

  function applyRevision(w: Workshop, latest: SkillDraft, edits: ReturnType<typeof mergeDraftRevision>): void {
    w.draft = latest;
    w.fields = edits.fields;
    w.replacements = { ...edits.replacements };
    w.save = { kind: dirty(w) ? "saving" : "saved" };
    w.confirm = false;
    w.adoptFailure = undefined;
    editor(w);
  }

  /** Only this editor and the base that issued the read can consume its result. */
  async function reread(w: Workshop, mayMerge: boolean, afterConflict: boolean): Promise<boolean> {
    const revision = w.draft.revision;
    const current = () => view.workshop === w && w.draft.revision === revision;
    let latest: SkillDraft;
    try { latest = await readDraft(project, w.draft.draft_id); }
    catch (cause) {
      if (!afterConflict) throw cause;
      if (current()) { w.save = { kind: "latest-failed", message: messageOf(cause) }; bar(w); }
      return false;
    }
    if (!current()) return false;
    if (latest.revision === revision && !afterConflict) { w.draft = latest; return true; }
    const edits = mergeDraftRevision(w.draft, w, latest);
    if (edits.conflict || (!mayMerge && dirty(w))) {
      w.save = { kind: "conflict", latest };
      w.confirm = false;
      w.adoptFailure = undefined;
      if (w.compare === "draft") editor(w);
      else bar(w);
      return false;
    }
    applyRevision(w, latest, edits);
    return true;
  }

  async function save(w: Workshop, mayMerge: boolean): Promise<void> {
    const fields = sentFields(w.fields), replacements = { ...w.replacements };
    try {
      const result = await updateDraft(project, w.draft, fields, replacements);
      w.draft = { ...w.draft, fields, replacements, revision: result.revision, updated_at: result.updated_at,
        untried: w.draft.cases.map(item => item.case_id), trial_needed: w.draft.cases.length > 0 };
      w.save = { kind: dirty(w) ? "saving" : "saved" };
    } catch (cause) {
      if (failureOf(cause).code === "skills.draft_conflict") {
        if (await reread(w, mayMerge, true) && dirty(w)) await save(w, false);
      } else w.save = { kind: "failed", message: messageOf(cause) };
    }
  }

  /** Flush the open editor before moving on, including any typing during a save. */
  async function flush(w = view.workshop): Promise<boolean> {
    if (view.workshop !== w) return false;
    cancel();
    while (saving) await saving;
    if (view.workshop !== w) return false;
    if (!w) return true;
    if (w.save.kind === "conflict") return false;
    const readFirst = w.save.kind === "latest-failed";
    if (!dirty(w) && !readFirst) {
      if (w.save.kind !== "saved") { w.save = { kind: "saved" }; bar(w); }
      return true;
    }
    w.save = { kind: "saving" };
    bar(w);
    const attempt = saving = (async () => {
      if (readFirst && !(await reread(w, true, true))) return;
      if (dirty(w)) await save(w, true);
      else w.save = { kind: "saved" };
    })();
    try { await attempt; } finally {
      if (saving === attempt) saving = undefined;
    }
    if (view.workshop !== w) return false;
    if (w.save.kind === "saving") return flush(w);
    bar(w);
    side(w);
    return w.save.kind === "saved";
  }

  /** A replay or model reply can discover a newer version. Refreshing it never resubmits the action. */
  async function refresh(w: Workshop, afterConflict = false): Promise<void> {
    while (saving) await saving;
    if (view.workshop === w) await reread(w, false, afterConflict);
  }

  async function resolve(w: Workshop, choice: DraftChoice): Promise<boolean> {
    if (w.save.kind !== "conflict" || view.workshop !== w) return false;
    const { latest } = w.save;
    applyRevision(w, latest, mergeDraftRevision(w.draft, w, latest, choice));
    return flush(w);
  }

  return {
    cancel, flush, refresh, resolve, schedule,
    pending: () => Boolean(timer || saving || view.workshop && dirty(view.workshop)),
  };
}
