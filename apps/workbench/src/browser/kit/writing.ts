import type { SkillScope } from "@molis-ai/molis-work-contracts/services/skills";
import { askingMarkup, draftFromSentence } from "./authoring.js";
import { draftEditing, type DraftEditing } from "./draft-editing.js";
import { draftTurns, type DraftTurns } from "./draft-turns.js";
import { listDrafts, messageOf, readDraft } from "./drafts.js";
import { skillActions } from "./skill-actions.js";
import { writingContext, type WritingContext, type WritingPage } from "./writing-context.js";
import { draftsStrip, workshopMarkup } from "./workshop.js";

export type { WritingFocus } from "./writing-context.js";

// What the person does with a Skill's drafts on the 「能力包」 page (batch 42, scheme B): open one (a new Skill, a change, a copy, a
// restored version, a source's newer version), write in it (saved as they type), ask the assistant to change it, keep known answers
// and replay them, compare, adopt or discard it. The page (page.ts) keeps the view and draws; this routes the page's actions and
// events to the parts that keep the draft's turns (draft-editing.ts, draft-turns.ts, skill-actions.ts).

const FOCUS: Record<string, string> = {
  "au-error": '[aria-invalid="true"]', "au-failure": ".au-failure", "sk-title": "#sk-title", "sk-ask": "[data-sk-ask-input]", "sk-replay": "[data-sk-replay] .mw-replay-grid",
  "sk-confirm": "[data-slot='leave-bar']", "sk-case": "[data-sk-case-form] [aria-invalid='true'], [data-sk-case-form] input", "sk-side": ".sk-side-tabs .is-active",
  "sk-tab": ".sk-narrow-tabs .is-active", "sk-conflict": "[data-sk-conflict]",
};
/** Where the focus goes after a draw the drafts asked for. */
function focusIn(body: HTMLElement, where?: string): void {
  if (!where?.startsWith("au") && !where?.startsWith("sk-")) return;
  const target = FOCUS[where] ?? (where === "au-applies" || where === "au-scope" ? `[data-kit-act="${where}"][aria-pressed="true"]` : "[data-au-field]");
  const found = body.querySelector<HTMLElement>(target);
  if (where === "sk-replay") found?.setAttribute("tabindex", "-1");
  (found ?? body.querySelector<HTMLElement>("#sk-title, #au-title"))?.focus();
}

/** Typing, choices and forms inside the sentence before a new Skill and inside an open draft. */
function listen(c: WritingContext, edit: DraftEditing, turns: DraftTurns): () => void {
  const { root, view, say } = c;
  root.addEventListener("input", event => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement, w = view.workshop;
    if (view.asking && target.dataset?.auField === "intent") {
      view.asking.intent = target.value;
      const go = root.querySelector<HTMLButtonElement>('[data-kit-act="au-draft"]');
      if (go) go.disabled = !view.asking.intent.trim();
      return;
    }
    if (!w) return;
    if (target.dataset?.auField) edit.typedField(w, target);
    else if (target.dataset?.skPlaceholder) edit.typedPlaceholder(w, target as HTMLInputElement);
    else if (target.dataset?.skAskInput !== undefined) w.ask = target.value;
    else if (target.dataset?.skCase && w.caseForm) w.caseForm[target.dataset.skCase as "title"] = target.value;
  });
  root.addEventListener("change", event => {
    const target = event.target as HTMLInputElement;
    if (view.workshop && target.dataset?.skTurnOff !== undefined) view.workshop.turnOffSource = target.checked;
  });
  root.addEventListener("submit", event => {
    const form = event.target as HTMLElement;
    if (!form.matches("[data-au], [data-sk-ask], [data-sk-case-form]")) return;
    event.preventDefault();
    const w = view.workshop;
    if (!w) return;
    if (form.matches("[data-sk-ask]") && !form.hasAttribute("data-busy")) { root.querySelector<HTMLElement>("[data-sk-ask-input]")?.focus(); void turns.ask(w).catch(cause => say(messageOf(cause), "danger")); }
    if (form.matches("[data-sk-case-form]")) void turns.saveCase(w).catch(cause => say(messageOf(cause), "danger"));
  });
  // Escape on the in-place question is 「回去改」.
  root.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !view.workshop?.confirm || !(event.target as Element).closest?.("[data-slot='leave-bar']")) return;
    event.preventDefault(); event.stopPropagation();
    void turns.run(view.workshop, "sk-confirm-back", undefined);
  });
  // Typed words remain ours until saved, including when the last request failed.
  const protect = (event: BeforeUnloadEvent) => { if (view.workshop && edit.pending()) event.preventDefault(); };
  addEventListener("beforeunload", protect);
  return () => removeEventListener("beforeunload", protect);
}

export function skillWriting(page: WritingPage) {
  const c = writingContext(page), { project, view, draw, say } = c;
  const edit = draftEditing(c), turns = draftTurns(c, edit), skill = skillActions(c, edit);
  const dispose = listen(c, edit, turns);
  const address = c.address.address();
  let addressedDraft = address.searchParams.get("draft");
  // Consume the current place before any read can finish after a category switch.
  if (addressedDraft) { address.searchParams.delete("draft"); c.address.replace(address, { history: "replace" }); }

  /** The sentence before a new Skill: draft from it, write it oneself, or leave it. */
  async function fromSentence(name: string, value: string | undefined): Promise<void> {
    const asking = view.asking!;
    if (name === "au-drop") { view.asking = undefined; return draw("detail"); }
    if (name === "au-scope") { asking.scope = value as SkillScope; return draw("au-scope"); }
    if (name === "au-self") return edit.create(asking.scope, { kind: "new" });
    if (name !== "au-draft") return;
    asking.busy = true; asking.failure = undefined; draw();
    try { const fields = await draftFromSentence(project, asking.intent); if (view.asking === asking) await edit.create(asking.scope, { kind: "new" }, fields); }
    catch (cause) { asking.busy = false; asking.failure = messageOf(cause); if (view.asking === asking) draw("au-failure"); }
  }

  /** One of the page's actions that is the drafts'; others are left to the page. */
  async function run(name: string, value: string | undefined, origin: HTMLElement): Promise<void> {
    if (await skill.start(name, value, origin) || await skill.inDetail(name, value)) return;
    if (view.asking && name.startsWith("au-")) return fromSentence(name, value);
    if (view.workshop) return turns.run(view.workshop, name, value);
  }

  /**
   * Before any other action of the page: the sentence before a new Skill is simply left; an open draft is saved first (it is kept
   * as written, so leaving it loses nothing) and then left.
   */
  function holds(name: string, go: () => void): boolean {
    if (name !== "retry") addressedDraft = null;
    const opensAnother = ["skill-new", "skill-edit", "skill-copy", "skill-delete", "sk-open", "sk-undiscard", "au-undelete", "sk-version-restore", "sk-up-take"].includes(name);
    if (!opensAnother && (name.startsWith("au-") || name.startsWith("sk-") || name.startsWith("skill-"))) return false;
    if (view.asking && !view.asking.busy) view.asking = undefined;
    const w = view.workshop;
    if (!w) return false;
    void edit.flush(w).then(saved => { if (saved && view.workshop === w) { view.workshop = undefined; go(); } });
    return true;
  }

  /** A draft named in the address (a receipt's 「打开草稿」 link) opens once the page has read the kit. */
  async function fromAddress(): Promise<void> {
    const drafts = await listDrafts(project, true).catch(() => []);
    if (!c.active()) return;
    c.drafts = drafts;
    const named = addressedDraft;
    if (!named) { if (!view.workshop && !view.asking) draw(); return; }
    try {
      const draft = await readDraft(project, named);
      if (c.active() && addressedDraft === named) { addressedDraft = null; edit.opened(draft); }
    } catch (cause) {
      if (c.active() && addressedDraft === named) { addressedDraft = null; draw(); say(messageOf(cause), "danger"); }
    }
  }

  return {
    beforeReplace: () => edit.flush(), dispose,
    run, holds, focus: focusIn, decorate: skill.decorate, fromAddress,
    strip: () => draftsStrip(c.drafts, c.kit() ? new Set(c.skills().map(entry => entry.skill.draft?.draft_id).filter((id): id is string => Boolean(id))) : undefined),
    asking: () => view.asking && askingMarkup(view.asking, c.limits, Boolean(project)),
    workshop: () => view.workshop && workshopMarkup(view.workshop, c.limits),
  };
}
