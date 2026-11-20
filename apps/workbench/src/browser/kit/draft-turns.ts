import type { SkillAuthoredFields } from "@molis-ai/molis-work-contracts/services/skills";
import { check, setState } from "./authoring.js";
import { act, readText } from "./common.js";
import type { DraftEditing } from "./draft-editing.js";
import { adoptDraft, discardDraft, failureOf, fieldOf, fieldsOf, messageOf, putCase, removeCase, reviseDraft, runTrial, type Fields, type Workshop } from "./drafts.js";
import { written, type FieldName, type WritingContext } from "./writing-context.js";
import { improve } from "./workshop.js";

// What the person does in an open draft (batch 42, scheme B): ask the assistant to change it, keep known answers and replay them,
// look at a comparison, adopt it (asked once in place when the replay differs) or discard it.

const changedFields = (before: SkillAuthoredFields, after: SkillAuthoredFields) =>
  (["name", "description", "when_not_to_use", "argument_hint", "applies_to", "body"] as const).filter(key => (before[key] ?? "") !== (after[key] ?? "")).length;

export type DraftTurns = ReturnType<typeof draftTurns>;

export function draftTurns(c: WritingContext, edit: DraftEditing) {
  const { project, view, draw, say } = c;
  // Model settings are Home-wide: a project settings path has no models page.
  const modelsHref = "/settings/models";

  async function reloadConflict(w: Workshop): Promise<string | undefined> {
    await edit.refresh(w, true);
    if (w.save.kind === "saved") return improve("draft-refreshed");
  }

  async function ask(w: Workshop): Promise<void> {
    if (w.asking || w.adopting || !w.ask.trim() || !(await edit.flush(w))) return;
    w.asking = true; w.confirm = false; w.askFailure = undefined; w.changed = undefined; draw("sk-ask");
    try {
      const next = await reviseDraft(project, w.draft, w.ask);
      if (view.workshop !== w) return;
      w.changed = changedFields(w.draft.fields, next.fields);
      w.draft = next; w.fields = fieldsOf(next.fields); w.replacements = { ...next.replacements }; w.placeholderBase = undefined; w.ask = "";
    } catch (cause) {
      w.askFailure = failureOf(cause).code === "skills.draft_conflict" ? await reloadConflict(w) : messageOf(cause);
    }
    w.asking = false;
    if (view.workshop === w) draw("sk-ask");
  }
  async function replay(w: Workshop, caseId: string): Promise<void> {
    if (w.running || !(await edit.flush(w))) return;
    w.running = caseId; w.confirm = false; w.runFailure = undefined; w.runFailureCode = undefined; w.side = "try"; if (w.tab !== "edit") w.tab = "try";
    draw();
    try {
      const trial = await runTrial(project, w.draft, caseId);
      if (view.workshop !== w || trial.draft_revision !== w.draft.revision) return;
      const untried = w.draft.untried.filter(id => id !== caseId);
      w.draft = { ...w.draft, trial, untried, trial_needed: untried.length > 0 };
    } catch (cause) {
      w.runFailureCode = failureOf(cause).code;
      w.runFailure = w.runFailureCode === "skills.draft_conflict" ? await reloadConflict(w) : messageOf(cause);
    } finally { w.running = undefined; }
    if (view.workshop === w) draw(w.runFailure ? "sk-side" : "sk-replay");
  }
  async function saveCase(w: Workshop): Promise<void> {
    const form = w.caseForm;
    if (!form) return;
    w.caseErrors = {};
    for (const key of ["title", "task", "expected"] as const) if (!form[key]?.trim()) w.caseErrors[key] = improve("case-error-empty");
    if (Object.keys(w.caseErrors).length) return draw("sk-case");
    try {
      await putCase(project, w.draft.draft_id, { title: form.title.trim(), task: form.task, expected: form.expected, ...(form.material?.trim() ? { material: form.material } : {}) }, form.case_id);
      await edit.refresh(w);
      if (view.workshop === w && w.caseForm === form) { w.confirm = false; w.caseForm = undefined; draw("sk-side"); }
    } catch (cause) { w.caseErrors = { title: messageOf(cause) }; if (view.workshop === w) draw("sk-case"); }
  }

  /** After adopting a copy, the original is turned off on this page's place, where the copy now applies (a general Skill installed at
   *  Home is set per project); offered only when the copy goes here. The notice says so only when it was. */
  async function turnOffSource(w: Workshop, source: { install_id: string; skill_id: string } | undefined): Promise<{ off: boolean; failure?: string }> {
    if (!source || w.draft.target.kind !== "custom" || !w.turnOffSource) return { off: false };
    const entry = c.skills().find(item => item.skill.ref.install_id === source.install_id && item.skill.ref.skill_id === source.skill_id);
    if (!entry) return { off: false };
    return setState(project, entry.skill, "off", w.draft.scope).then(() => ({ off: true }), cause => ({ off: false, failure: messageOf(cause) }));
  }
  async function adopt(w: Workshop, anyway: boolean): Promise<void> {
    if (w.adopting || !(await edit.flush(w))) return;
    const own = w.draft.target.kind === "own" ? w.draft.target.skill_id : undefined;
    w.errors = check(w.fields, c.limits, new Set(c.ownSkills(w.draft.scope).filter(entry => entry.skill.ref.skill_id !== own).map(entry => entry.skill.name.trim())));
    if (Object.keys(w.errors).length) { w.tab = "edit"; w.confirm = false; return draw("au-error"); }
    w.adopting = true; w.adoptFailure = undefined; draw();
    try {
      const result = await adoptDraft(project, w.draft, anyway);
      const turned = await turnOffSource(w, result.source);
      await c.reload();
      const current = view.workshop === w, name = w.fields.name.trim();
      if (current) view.workshop = undefined;
      const entry = current ? c.showOwn(w.draft.scope, result.skill_id) : undefined;
      if (current) draw("detail");
      if (w.draft.target.kind === "own") say(improve("adopted-version", { n: name, v: result.skill_version }));
      else if (turned.failure) say(`${improve("adopted-new", { n: name })} ${turned.failure}`, "danger");
      else if (entry) say(improve(turned.off ? "adopted-copy" : "adopted-new", { n: name }), "success", { label: written("turn-auto"), attrs: act("au-auto", entry.key) });
      return;
    } catch (cause) {
      const code = failureOf(cause).code, field = fieldOf(cause) as FieldName;
      if (code === "skills.trial_differs") {
        const count = (failureOf(cause).body as { details?: { differences?: unknown } } | null)?.details?.differences;
        w.confirm = typeof count === "number" && count > 0 ? count : true;
      }
      else if (code === "skills.draft_conflict") w.adoptFailure = await reloadConflict(w);
      else if (code === "skills.trial_required") {
        await edit.refresh(w);
        if (w.save.kind === "saved") w.adoptFailure = messageOf(cause);
      }
      else if (field && field in w.fields) { w.errors = { [field]: messageOf(cause) }; w.tab = "edit"; }
      else w.adoptFailure = messageOf(cause);
    } finally { w.adopting = false; }
    if (view.workshop === w) draw(w.confirm ? "sk-confirm" : Object.keys(w.errors).length ? "au-error" : "au-failure");
  }
  async function discard(w: Workshop): Promise<void> {
    edit.cancel();
    await discardDraft(project, w.draft.draft_id);
    await c.reload();
    if (view.workshop === w) { view.workshop = undefined; draw("detail"); }
    say(improve("discarded"), "success", { label: readText("workbench.context-bus.undo"), attrs: act("sk-undiscard", w.draft.draft_id) });
  }

  function resumeEditing(w: Workshop, saved: boolean): void {
    if (!saved || view.workshop !== w || w.compare !== "draft") return;
    w.tab = "edit";
    w.compare = "how";
    draw("sk-title");
  }

  /** One of the open draft's actions; nothing when it is not one. */
  async function run(w: Workshop, name: string, value: string | undefined): Promise<void> {
    if (name === "sk-close") { if (!(await edit.flush(w))) return; view.workshop = undefined; draw("detail"); await c.reload(); return; }
    if (name === "sk-models") { if (await edit.flush(w)) location.href = modelsHref; return; }
    if (name === "sk-retry-save") return resumeEditing(w, await edit.flush(w));
    if (name === "sk-review-conflict") {
      if (w.save.kind !== "conflict") return;
      w.side = w.tab = "compare"; w.compare = "draft";
      return draw("sk-conflict");
    }
    if (name === "sk-use-saved" || name === "sk-keep-edit") return resumeEditing(w, await edit.resolve(w, name === "sk-use-saved" ? "saved" : "mine"));
    if (name === "au-applies") { w.fields.applies_to = value as Fields["applies_to"]; edit.schedule(w); return draw("au-applies"); }
    if (name === "sk-tab") { w.tab = value as Workshop["tab"]; if (w.tab !== "edit") w.side = w.tab; return draw("sk-tab"); }
    if (name === "sk-side") { w.side = value as Workshop["side"]; w.tab = w.side; return draw("sk-side"); }
    if (name === "sk-compare") { w.compare = value as Workshop["compare"]; return draw("sk-side"); }
    if (name === "sk-out" && value) { const [consumer, side] = value.split(":"); w.out = { consumer: consumer as "assistant", side: side as "draft" }; w.compare = "out"; w.side = w.tab = "compare"; return draw("sk-side"); }
    if (name === "sk-run" && value) return replay(w, value);
    if (name === "sk-case-add") { w.caseForm = { title: "", task: "", expected: "" }; w.caseErrors = {}; return draw("sk-case"); }
    if (name === "sk-case-edit" && value) { const known = w.draft.cases.find(item => item.case_id === value); if (known) { w.caseForm = { ...known }; w.caseErrors = {}; } return draw("sk-case"); }
    if (name === "sk-case-cancel") { w.caseForm = undefined; return draw("sk-side"); }
    if (name === "sk-case-remove" && value) { await removeCase(project, w.draft.draft_id, value); await edit.refresh(w); if (view.workshop === w) { w.confirm = false; draw("sk-side"); } return; }
    if (name === "sk-adopt") return adopt(w, false);
    if (name === "sk-adopt-anyway") { w.confirm = false; return adopt(w, true); }
    if (name === "sk-confirm-back") { w.confirm = false; w.tab = "edit"; return draw("au"); }
    if (name === "sk-discard") return discard(w);
  }

  return { ask, saveCase, run };
}
