import type { SkillAuthoredFields, SkillDraft, SkillDraftCreateTarget, SkillScope } from "@molis-ai/molis-work-contracts/services/skills";
import { countOf } from "./authoring.js";
import { applyReplacements, createDraft, failureOf, fieldsOf, messageOf, placeholdersOf, readDraft, sentFields, updateDraft, workshopOf, type Workshop } from "./drafts.js";
import type { FieldName, WritingContext } from "./writing-context.js";
import { adoptBar, improve, sideMarkup } from "./workshop.js";

// Opening a Skill's draft and keeping it saved as the person types (batch 42): what is typed is sent within a moment, against the
// revision read, and the adopt bar says where it stands; the side column is drawn again when the saved draft changes.

const same = (a: SkillAuthoredFields, b: SkillAuthoredFields) => JSON.stringify(sentFields(fieldsOf(a))) === JSON.stringify(sentFields(fieldsOf(b)));
const dirty = (w: Workshop) => !same(sentFields(w.fields), w.draft.fields) || JSON.stringify(w.replacements) !== JSON.stringify(w.draft.replacements);

export type DraftEditing = ReturnType<typeof draftEditing>;

export function draftEditing(c: WritingContext) {
  const { root, project, view } = c;
  let timer: ReturnType<typeof setTimeout> | undefined, saving: Promise<void> | undefined;

  function opened(draft: SkillDraft, side?: "compare"): void {
    const own = draft.target.kind === "own" ? draft.target : undefined, entry = own && c.ownSkills(draft.scope).find(item => item.skill.ref.skill_id === own.skill_id);
    const name = draft.target.kind === "custom" ? draft.target.source.name : entry?.name ?? draft.fields.name;
    const workshop = workshopOf(draft, name, own ? (draft.base?.version ?? own.base_version) + 1 : undefined);
    if (side) { workshop.side = side; workshop.tab = side; }
    // Opened from a link or the list: closing or discarding it comes back to the Skill it changes.
    if (entry && view.item !== entry.key) c.show(entry);
    view.asking = undefined; view.workshop = workshop; view.detail = true;
    c.draw("sk-title");
  }

  function redrawBar(w: Workshop): void {
    const bar = root.querySelector<HTMLElement>("[data-sk-bar]"), kept = bar?.contains(document.activeElement);
    if (!bar || view.workshop !== w) return;
    bar.outerHTML = adoptBar(w);
    if (kept) root.querySelector<HTMLElement>("[data-sk-bar] .mw-btn")?.focus();
  }
  function redrawSide(w: Workshop): void {
    const side = root.querySelector<HTMLElement>("[data-sk-side]");
    if (!side || view.workshop !== w || side.contains(document.activeElement)) return;
    side.innerHTML = sideMarkup(w);
  }
  function schedule(w: Workshop): void {
    w.confirm = false; w.adoptFailure = undefined;
    if (w.save !== "saving") { w.save = "saving"; redrawBar(w); }
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 600);
  }
  /** Saves what is typed now; waits for a save in flight first. False when it could not be saved. */
  async function flush(): Promise<boolean> {
    clearTimeout(timer); timer = undefined;
    while (saving) await saving;
    const w = view.workshop;
    if (!w) return true;
    if (!dirty(w)) { if (w.save === "saving") { w.save = "saved"; redrawBar(w); } return w.save !== "failed"; }
    const fields = sentFields(w.fields), replacements = { ...w.replacements };
    saving = (async () => {
      try {
        const result = await updateDraft(project, w.draft, fields, replacements);
        w.draft = { ...w.draft, fields, replacements, revision: result.revision, updated_at: result.updated_at, trial_needed: w.draft.cases.length > 0 };
        w.savedAt = result.updated_at; w.save = dirty(w) ? "saving" : "saved"; w.saveFailure = undefined;
      } catch (cause) {
        w.save = "failed"; w.saveFailure = messageOf(cause);
        if (failureOf(cause).code === "skills.draft_conflict") w.saveFailure = improve("save-conflict");
      }
    })();
    await saving; saving = undefined;
    redrawBar(w); redrawSide(w);
    if (w.save === "saving") return flush();
    return w.save === "saved";
  }

  function typedField(w: Workshop, target: HTMLInputElement | HTMLTextAreaElement): void {
    const name = target.dataset.auField as FieldName;
    w.fields[name] = target.value;
    if (w.errors[name]) { delete w.errors[name]; target.removeAttribute("aria-invalid"); root.querySelector(`[data-au-error="${name}"]`)?.remove(); }
    if (name === "body") {
      const count = countOf(w.fields.body, c.limits), shown = root.querySelector<HTMLElement>("[data-au-count] .mw-text-count__n");
      if (shown) { shown.textContent = count.text; shown.toggleAttribute("data-over", count.over); }
    }
    if (name === "name" && w.draft.target.kind === "new") { const title = root.querySelector("#sk-title"); if (title) title.textContent = w.fields.name.trim() || improve("title-new"); }
    schedule(w);
  }
  /** A placeholder's own word: written into the fields in place, and how many are left. */
  function typedPlaceholder(w: Workshop, target: HTMLInputElement): void {
    applyReplacements(w, target.dataset.skPlaceholder!, target.value);
    for (const key of ["description", "when_not_to_use", "body"] as const) {
      const shown = root.querySelector<HTMLTextAreaElement>(`[data-au-field="${key}"]`);
      if (shown && shown.value !== w.fields[key]) shown.value = w.fields[key];
    }
    const left = placeholdersOf(w).filter(placeholder => !w.replacements[placeholder]).length, title = root.querySelector<HTMLElement>(".mw-placeholders__title");
    const badge = title?.querySelector(".mw-badge");
    if (left && badge) badge.textContent = improve("placeholders-left", { n: left });
    else if (left && title) title.insertAdjacentHTML("beforeend", `<span class="mw-badge mw-badge--neutral" data-slot="badge">${improve("placeholders-left", { n: left })}</span>`);
    else badge?.remove();
    schedule(w);
  }

  return {
    opened, flush, schedule, typedField, typedPlaceholder,
    create: async (scope: SkillScope, target: SkillDraftCreateTarget, fields?: SkillAuthoredFields, side?: "compare") => opened(await createDraft(project, scope, target, fields), side),
    openDraft: async (draftId: string) => opened(await readDraft(project, draftId)),
    /** A save still waiting, which holds the window. */
    pending: () => Boolean(timer || saving),
    /** Stops a save that has not started (the draft is being discarded). */
    cancel: () => { clearTimeout(timer); timer = undefined; },
  };
}
