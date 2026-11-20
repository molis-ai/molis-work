import type { SkillAuthoredFields, SkillDraft, SkillDraftCreateTarget, SkillScope } from "@molis-ai/molis-work-contracts/services/skills";
import { renderBadge } from "@molis-ai/molis-work-plugin-sdk/ui";
import { countOf } from "./authoring.js";
import { draftSave } from "./draft-save.js";
import { applyReplacements, createDraft, placeholdersOf, readDraft, workshopOf, type Workshop } from "./drafts.js";
import type { FieldName, WritingContext } from "./writing-context.js";
import { adoptBar, improve, sideMarkup } from "./workshop.js";

export type DraftEditing = ReturnType<typeof draftEditing>;

export function draftEditing(c: WritingContext) {
  const { root, project, view } = c;
  const save = draftSave(c, { bar: redrawBar, side: redrawSide, editor: redrawEditor });

  function opened(draft: SkillDraft, side?: "compare"): void {
    const own = draft.target.kind === "own" ? draft.target : undefined, entry = own && c.ownSkills(draft.scope).find(item => item.skill.ref.skill_id === own.skill_id);
    const name = draft.target.kind === "custom" ? draft.target.source.name : entry?.name ?? draft.fields.name;
    const workshop = workshopOf(draft, name, own ? (draft.base?.version ?? own.base_version) + 1 : undefined, draft.scope === c.pageScope);
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

  function redrawEditor(w: Workshop): void {
    if (view.workshop !== w) return;
    const current = document.activeElement;
    const input = (current instanceof HTMLInputElement || current instanceof HTMLTextAreaElement) && current.id && root.contains(current) ? current : undefined;
    const start = input?.selectionStart, end = input?.selectionEnd, direction = input?.selectionDirection, scroll = input?.scrollTop;
    const review = !input && w.compare === "draft" && w.save.kind === "conflict";
    c.draw(review ? "sk-conflict" : undefined);
    if (!input) return;
    const editing = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${CSS.escape(input.id)}`);
    editing?.focus({ preventScroll: true });
    if (editing && start != null && end != null) {
      editing.setSelectionRange(start, end, direction ?? undefined);
      editing.scrollTop = scroll ?? 0;
    }
  }

  function typedField(w: Workshop, target: HTMLInputElement | HTMLTextAreaElement): void {
    const name = target.dataset.auField as FieldName;
    w.fields[name] = target.value;
    if (name === "description" || name === "when_not_to_use" || name === "body") w.placeholderBase = undefined;
    if (w.errors[name]) { delete w.errors[name]; target.removeAttribute("aria-invalid"); root.querySelector(`[data-au-error="${name}"]`)?.remove(); }
    if (name === "body") {
      const count = countOf(w.fields.body, c.limits), shown = root.querySelector<HTMLElement>("[data-au-count] .mw-text-count__n");
      if (shown) { shown.textContent = count.text; shown.toggleAttribute("data-over", count.over); }
    }
    if (name === "name" && w.draft.target.kind === "new") { const title = root.querySelector("#sk-title"); if (title) title.textContent = w.fields.name.trim() || improve("title-new"); }
    save.schedule(w);
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
    else if (left && title) title.insertAdjacentHTML("beforeend", renderBadge({ label: improve("placeholders-left", { n: left }), tone: "neutral" }));
    else badge?.remove();
    save.schedule(w);
  }

  return {
    ...save, opened, typedField, typedPlaceholder,
    create: async (scope: SkillScope, target: SkillDraftCreateTarget, fields?: SkillAuthoredFields, side?: "compare") => opened(await createDraft(project, scope, target, fields), side),
    openDraft: async (draftId: string) => opened(await readDraft(project, draftId)),
  };
}
