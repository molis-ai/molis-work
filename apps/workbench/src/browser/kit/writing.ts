import type { KitEntry } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { SkillAuthoredFields, SkillAuthoredSource, SkillCatalogEntry, SkillDraft, SkillDraftCreateTarget, SkillDraftSummary, SkillScope, SkillVersion } from "@molis-ai/molis-work-contracts/services/skills";
import type { AttrValue } from "@molis-ai/molis-work-plugin-sdk/ui";
import { askingMarkup, check, countOf, draftFromSentence, fieldsOfSource, ownership, readSource, removeSkill, setState, type SkillWritingLimits } from "./authoring.js";
import { act, readText, type Kit } from "./common.js";
import { adoptDraft, applyReplacements, createDraft, discardDraft, dismissSource, failureOf, fieldOf, fieldsOf, listDrafts, listVersions, messageOf, placeholdersOf, putCase, readDraft,
  removeCase, reviseDraft, runTrial, sentFields, updateDraft, workshopOf, type Fields, type Workshop } from "./drafts.js";
import type { View } from "./view.js";
import { adoptBar, diffOf, draftBand, draftsStrip, improve, sideMarkup, textOf, upstreamMarkup, versionsMarkup, workshopMarkup } from "./workshop.js";

// What the person does with a Skill's drafts on the 「能力包」 page (batch 42, scheme B): open one (a new Skill, a change, a copy, a
// restored version, a source's newer version), write in it (saved as they type), ask the assistant to change it, keep known answers
// and replay them, compare, adopt or discard it. The page (page.ts) keeps the view and draws; this keeps the draft's turns.

export type WritingFocus = "au" | "au-error" | "au-failure" | "au-applies" | "au-scope" | "sk-title" | "sk-ask" | "sk-replay" | "sk-confirm" | "sk-case" | "sk-side" | "sk-tab";
type SkillEntry = Extract<KitEntry, { kind: "skill" }>;
type FieldName = Exclude<keyof Fields, "applies_to">;

export interface WritingPage {
  root: HTMLElement;
  project: string;
  view: View;
  kit(): Kit | undefined;
  load(): Promise<void>;
  draw(focus?: "detail" | WritingFocus): void;
  say(text: string, tone?: "success" | "danger", next?: { label: string; attrs: Record<string, AttrValue> }): void;
  /** Opens this entry in its pack, with every filter cleared so it is in the list. */
  show(entry: KitEntry): void;
}

const same = (a: SkillAuthoredFields, b: SkillAuthoredFields) => JSON.stringify(sentFields(fieldsOf(a))) === JSON.stringify(sentFields(fieldsOf(b)));
const changedFields = (before: SkillAuthoredFields, after: SkillAuthoredFields) =>
  (["name", "description", "when_not_to_use", "argument_hint", "applies_to", "body"] as const).filter(key => (before[key] ?? "") !== (after[key] ?? "")).length;

export function skillWriting(page: WritingPage) {
  const { root, project, view, draw, load, say } = page;
  const limits = JSON.parse(root.dataset.skillLimits ?? "{}") as SkillWritingLimits, ownPacks = new Set((root.dataset.skillMine ?? "").split(" ")), pageScope: SkillScope = project ? "project" : "home";
  const modelsHref = `/projects/${encodeURIComponent(project || "personal")}/settings/models`;
  const written = (key: string, values?: Record<string, string | number>) => readText(`workbench.skill-authoring.${key}`, values);
  const isMine = (skill: SkillCatalogEntry) => ownPacks.has(skill.pack.plugin_id) && skill.pack.trust === "home_local";
  const skillOf = (key?: string): SkillEntry | undefined => { const entry = key ? page.kit()?.byKey.get(key) : undefined; return entry?.kind === "skill" ? entry : undefined; };
  const skills = () => (page.kit()?.catalog.entries ?? []).flatMap(entry => entry.kind === "skill" ? [entry] : []);
  const ownSkills = (scope: SkillScope) => skills().filter(entry => isMine(entry.skill) && entry.skill.pack.scope === scope);
  /** The Skill just deleted, for 撤销; drafts not adopted; each own Skill's versions; what is open in a detail. */
  let removed: { source: SkillAuthoredSource; state: SkillCatalogEntry["state"] } | undefined, drafts: SkillDraftSummary[] = [];
  const versions = new Map<string, SkillVersion[] | "failed">(), upstream = new Map<string, string>();
  let openVersion: { key: string; version: number } | undefined, timer: ReturnType<typeof setTimeout> | undefined, saving: Promise<void> | undefined;

  function showOwn(scope: SkillScope, skillId: string): SkillEntry | undefined {
    const entry = ownSkills(scope).find(candidate => candidate.skill.ref.skill_id === skillId);
    if (entry) page.show(entry);
    return entry;
  }
  async function reload(): Promise<void> {
    versions.clear(); upstream.clear();
    const [, listed] = await Promise.all([load(), listDrafts(project).catch(() => drafts)]);
    drafts = listed;
  }

  // ---------- opening a draft ----------
  function opened(draft: SkillDraft, side?: "compare"): void {
    const own = draft.target.kind === "own" ? draft.target : undefined, entry = own && ownSkills(draft.scope).find(item => item.skill.ref.skill_id === own.skill_id);
    const name = draft.target.kind === "custom" ? draft.target.source.name : entry?.name ?? draft.fields.name;
    const workshop = workshopOf(draft, name, own ? (draft.base?.version ?? own.base_version) + 1 : undefined);
    if (side) { workshop.side = side; workshop.tab = side; }
    // Opened from a link or the list: closing or discarding it comes back to the Skill it changes.
    if (entry && view.item !== entry.key) page.show(entry);
    view.asking = undefined; view.workshop = workshop; view.detail = true;
    draw("sk-title");
  }
  async function create(scope: SkillScope, target: SkillDraftCreateTarget, fields?: SkillAuthoredFields, side?: "compare"): Promise<void> {
    opened(await createDraft(project, scope, target, fields), side);
  }
  async function openDraft(draftId: string): Promise<void> { opened(await readDraft(project, draftId)); }

  // ---------- saving as the person types ----------
  const dirty = (w: Workshop) => !same(sentFields(w.fields), w.draft.fields) || JSON.stringify(w.replacements) !== JSON.stringify(w.draft.replacements);
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
      const count = countOf(w.fields.body, limits), shown = root.querySelector<HTMLElement>("[data-au-count] .mw-text-count__n");
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

  // ---------- the draft's turns ----------
  async function ask(w: Workshop): Promise<void> {
    if (w.asking || !w.ask.trim() || !(await flush())) return;
    w.asking = true; w.askFailure = undefined; w.changed = undefined; draw("sk-ask");
    try {
      const next = await reviseDraft(project, w.draft, w.ask);
      if (view.workshop !== w) return;
      w.changed = changedFields(w.draft.fields, next.fields);
      w.draft = next; w.fields = fieldsOf(next.fields); w.replacements = { ...next.replacements }; w.ask = ""; w.savedAt = next.updated_at;
    } catch (cause) { w.askFailure = messageOf(cause); }
    w.asking = false;
    if (view.workshop === w) draw("sk-ask");
  }
  async function replay(w: Workshop, caseId: string): Promise<void> {
    if (w.running || !(await flush())) return;
    w.running = caseId; w.runFailure = undefined; w.side = "try"; if (w.tab !== "edit") w.tab = "try";
    draw();
    try {
      const trial = await runTrial(project, w.draft, caseId);
      w.draft = { ...w.draft, trial, trial_needed: false };
    } catch (cause) {
      if (failureOf(cause).code === "skills.draft_conflict") w.draft = await readDraft(project, w.draft.draft_id);
      w.runFailure = messageOf(cause);
    }
    w.running = undefined;
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
      w.draft = await readDraft(project, w.draft.draft_id); w.caseForm = undefined;
      draw("sk-side");
    } catch (cause) { w.caseErrors = { title: messageOf(cause) }; draw("sk-case"); }
  }
  async function adopt(w: Workshop, anyway: boolean): Promise<void> {
    if (w.adopting || !(await flush())) return;
    const own = w.draft.target.kind === "own" ? w.draft.target.skill_id : undefined;
    w.errors = check(w.fields, limits, new Set(ownSkills(w.draft.scope).filter(entry => entry.skill.ref.skill_id !== own).map(entry => entry.skill.name.trim())));
    if (Object.keys(w.errors).length) { w.tab = "edit"; w.confirm = false; return draw("au-error"); }
    w.adopting = true; w.adoptFailure = undefined; draw();
    try {
      const result = await adoptDraft(project, w.draft, anyway);
      view.workshop = undefined;
      // The original is turned off in the same step where the copy now applies (a general Skill installed at Home is set per project);
      // the notice says so only when it was.
      let turnedOff = false, turnFailure: string | undefined;
      if (result.source && w.draft.target.kind === "custom" && w.turnOffSource) {
        const source = skills().find(entry => entry.skill.ref.install_id === result.source!.install_id && entry.skill.ref.skill_id === result.source!.skill_id);
        if (source) turnedOff = await setState(project, source.skill, "off", w.draft.scope).then(() => true, cause => { turnFailure = messageOf(cause); return false; });
      }
      await reload();
      const entry = showOwn(w.draft.scope, result.skill_id), name = w.fields.name.trim();
      draw("detail");
      if (w.draft.target.kind === "own") say(improve("adopted-version", { n: name, v: result.skill_version }));
      else if (turnFailure) say(`${improve("adopted-new", { n: name })} ${turnFailure}`, "danger");
      else if (entry) say(improve(turnedOff ? "adopted-copy" : "adopted-new", { n: name }), "success", { label: written("turn-auto"), attrs: act("au-auto", entry.key) });
      return;
    } catch (cause) {
      const code = failureOf(cause).code, field = fieldOf(cause) as FieldName;
      if (code === "skills.trial_differs") w.confirm = true;
      else if (code === "skills.trial_required" || code === "skills.draft_conflict") { w.draft = await readDraft(project, w.draft.draft_id).catch(() => w.draft); w.adoptFailure = messageOf(cause); }
      else if (field && field in w.fields) { w.errors = { [field]: messageOf(cause) }; w.tab = "edit"; }
      else w.adoptFailure = messageOf(cause);
    } finally { w.adopting = false; }
    if (view.workshop === w) draw(w.confirm ? "sk-confirm" : Object.keys(w.errors).length ? "au-error" : "au-failure");
  }
  async function discard(w: Workshop): Promise<void> {
    clearTimeout(timer);
    await discardDraft(project, w.draft.draft_id);
    view.workshop = undefined;
    await reload();
    draw("detail");
    say(improve("discarded"), "success", { label: readText("workbench.context-bus.undo"), attrs: act("sk-undiscard", w.draft.draft_id) });
  }

  /** Opening a draft, the sentence before a new one, deleting, and the notices' own next steps. */
  async function start(name: string, value: string | undefined, origin: HTMLElement): Promise<boolean> {
    if (name === "skill-new") { view.asking = { scope: pageScope, intent: "" }; view.workshop = undefined; view.detail = true; draw("au"); return true; }
    if (name === "sk-open" && value) { await openDraft(value); return true; }
    if (name === "sk-undiscard" && value) { await discardDraft(project, value, true); await reload(); await openDraft(value); return true; }
    if (name === "au-undelete") {
      if (!removed) return true;
      const { source, state } = removed;
      // Kept until it is back: a restore that fails leaves 撤销 in the notice to try again, and the deleted text is not lost.
      let skillId: string;
      try {
        const draft = await createDraft(project, source.scope, { kind: "new" }, fieldsOfSource(source));
        skillId = (await adoptDraft(project, draft, false)).skill_id;
      } catch (cause) { say(written("restore-failed", { n: source.name, m: messageOf(cause) }), "danger", { label: readText("common.control.retry"), attrs: act("au-undelete") }); return true; }
      removed = undefined;
      await reload();
      const entry = showOwn(source.scope, skillId);
      if (entry && state !== "off") { await setState(project, entry.skill, state); await reload(); showOwn(source.scope, skillId); }
      draw("detail");
      say(written("restored", { n: source.name }));
      return true;
    }
    if (name !== "skill-edit" && name !== "skill-copy" && name !== "skill-delete" && name !== "au-auto") return false;
    const entry = skillOf(value);
    if (!entry) return true;
    (origin as HTMLButtonElement).disabled = true;
    try { return await open(name, entry); } catch (cause) { (origin as HTMLButtonElement).disabled = false; throw cause; }
  }
  async function open(name: string, entry: SkillEntry): Promise<true> {
    if (name === "au-auto") { await setState(project, entry.skill, "auto"); await reload(); say(written("now-auto", { n: entry.name })); return true; }
    if (name === "skill-delete") {
      const source = await readSource(project, entry.skill);
      await removeSkill(project, entry.skill);
      removed = { source, state: entry.skill.state };
      view.item = undefined;
      await reload();
      draw("detail");
      say(written("deleted", { n: source.name }), "success", { label: readText("workbench.context-bus.undo"), attrs: act("au-undelete") });
      return true;
    }
    if (entry.skill.draft) { await openDraft(entry.skill.draft.draft_id); return true; }
    if (name === "skill-edit") await create(entry.skill.pack.scope, { kind: "own", skill_id: entry.skill.ref.skill_id });
    else await create(pageScope, { kind: "custom", ref: entry.skill.ref });
    return true;
  }

  /** The detail's own versions and source, for the Skill open now. */
  async function inDetail(name: string, value: string | undefined): Promise<boolean> {
    const entry = skillOf(view.item);
    if (!entry || !name.startsWith("sk-version") && !name.startsWith("sk-up-")) return false;
    const scope = entry.skill.pack.scope, skillId = entry.skill.ref.skill_id, based = entry.skill.based_on;
    if (name === "sk-versions-retry") { versions.delete(entry.key); draw(); return true; }
    if (name === "sk-version-diff") { const version = Number(value); openVersion = openVersion?.key === entry.key && openVersion.version === version ? undefined : { key: entry.key, version }; draw(); return true; }
    if (name === "sk-version-restore") { await create(scope, { kind: "own", skill_id: skillId, from_version: Number(value) }, undefined, "compare"); return true; }
    if (name === "sk-up-take") { await create(scope, { kind: "own", skill_id: skillId, from_source: true }, undefined, "compare"); return true; }
    if (name === "sk-up-later" && based?.newer_version) { await dismissSource(project, scope, skillId, based.newer_version); await reload(); draw("detail"); return true; }
    if (name === "sk-up-see" && based) {
      if (upstream.has(entry.key)) { upstream.delete(entry.key); draw(); return true; }
      const source = skills().find(item => item.skill.ref.install_id === based.source.install_id && item.skill.ref.skill_id === based.source.skill_id);
      if (!source) return true;
      const [mine, theirs] = await Promise.all([readSource(project, entry.skill), readSource(project, source.skill)]);
      upstream.set(entry.key, diffOf(textOf({ ...mine, when_not_to_use: mine.when_not_to_use ?? "" }), textOf({ ...theirs, when_not_to_use: theirs.when_not_to_use ?? "" })));
      draw();
      return true;
    }
    return true;
  }

  /** One of the page's actions that is the drafts'; others are left to the page. */
  async function run(name: string, value: string | undefined, origin: HTMLElement): Promise<void> {
    if (await start(name, value, origin) || await inDetail(name, value)) return;
    const asking = view.asking;
    if (asking && name.startsWith("au-")) {
      if (name === "au-drop") { view.asking = undefined; return draw("detail"); }
      if (name === "au-scope") { asking.scope = value as SkillScope; return draw("au-scope"); }
      if (name === "au-self") { await create(asking.scope, { kind: "new" }); return; }
      if (name === "au-draft") {
        asking.busy = true; asking.failure = undefined; draw();
        try { const fields = await draftFromSentence(project, asking.intent); if (view.asking === asking) await create(asking.scope, { kind: "new" }, fields); }
        catch (cause) { asking.busy = false; asking.failure = messageOf(cause); if (view.asking === asking) draw("au-failure"); }
        return;
      }
      return;
    }
    const w = view.workshop;
    if (!w) return;
    if (name === "sk-close") { await flush(); view.workshop = undefined; await reload(); return draw("detail"); }
    if (name === "sk-models") { await flush(); location.href = modelsHref; return; }
    if (name === "au-applies") { w.fields.applies_to = value as Fields["applies_to"]; schedule(w); return draw("au-applies"); }
    if (name === "sk-tab") { w.tab = value as Workshop["tab"]; if (w.tab !== "edit") w.side = w.tab; return draw("sk-tab"); }
    if (name === "sk-side") { w.side = value as Workshop["side"]; w.tab = w.side; return draw("sk-side"); }
    if (name === "sk-compare") { w.compare = value as Workshop["compare"]; return draw("sk-side"); }
    if (name === "sk-out" && value) { const [consumer, side] = value.split(":"); w.out = { consumer: consumer as "assistant", side: side as "draft" }; w.compare = "out"; w.side = w.tab = "compare"; return draw("sk-side"); }
    if (name === "sk-run" && value) return replay(w, value);
    if (name === "sk-case-add") { w.caseForm = { title: "", task: "", expected: "" }; w.caseErrors = {}; return draw("sk-case"); }
    if (name === "sk-case-edit" && value) { const known = w.draft.cases.find(item => item.case_id === value); if (known) { w.caseForm = { ...known }; w.caseErrors = {}; } return draw("sk-case"); }
    if (name === "sk-case-cancel") { w.caseForm = undefined; return draw("sk-side"); }
    if (name === "sk-case-save") return saveCase(w);
    if (name === "sk-case-remove" && value) { await removeCase(project, w.draft.draft_id, value); w.draft = await readDraft(project, w.draft.draft_id); return draw("sk-side"); }
    if (name === "sk-adopt") return adopt(w, false);
    if (name === "sk-adopt-anyway") { w.confirm = false; return adopt(w, true); }
    if (name === "sk-confirm-back") { w.confirm = false; w.tab = "edit"; return draw("au"); }
    if (name === "sk-discard") return discard(w);
  }

  /**
   * Before any other action of the page: the sentence before a new Skill is simply left; an open draft is saved first (it is kept
   * as written, so leaving it loses nothing) and then left.
   */
  function holds(name: string, go: () => void): boolean {
    if (name.startsWith("au-") || name.startsWith("sk-") || name.startsWith("skill-")) return false;
    if (view.asking && !view.asking.busy) view.asking = undefined;
    if (!view.workshop) return false;
    void flush().then(() => { view.workshop = undefined; go(); });
    return true;
  }

  function focus(body: HTMLElement, where?: string): void {
    if (!where?.startsWith("au") && !where?.startsWith("sk-")) return;
    const target = where === "au-error" ? '[aria-invalid="true"]' : where === "au-failure" ? ".au-failure" : where === "au-applies" || where === "au-scope" ? `[data-kit-act="${where}"][aria-pressed="true"]`
      : where === "sk-title" ? "#sk-title" : where === "sk-ask" ? "[data-sk-ask-input]" : where === "sk-replay" ? "[data-sk-replay] .mw-replay-grid" : where === "sk-confirm" ? "#sk-confirm-text"
      : where === "sk-case" ? "[data-sk-case-form] [aria-invalid='true'], [data-sk-case-form] input" : where === "sk-side" ? ".sk-side-tabs .is-active" : where === "sk-tab" ? ".sk-narrow-tabs .is-active" : "[data-au-field]";
    const found = where === "sk-confirm" ? body.querySelector<HTMLElement>("[data-slot='leave-bar']") : body.querySelector<HTMLElement>(target);
    if (where === "sk-replay") found?.setAttribute("tabindex", "-1");
    (found ?? body.querySelector<HTMLElement>("#sk-title, #au-title"))?.focus();
  }

  root.addEventListener("input", event => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement, w = view.workshop;
    if (view.asking && target.dataset?.auField === "intent") {
      view.asking.intent = target.value;
      const go = root.querySelector<HTMLButtonElement>('[data-kit-act="au-draft"]');
      if (go) go.disabled = !view.asking.intent.trim();
      return;
    }
    if (!w) return;
    if (target.dataset?.auField) typedField(w, target);
    else if (target.dataset?.skPlaceholder) typedPlaceholder(w, target as HTMLInputElement);
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
    if (form.matches("[data-sk-ask]") && !form.hasAttribute("data-busy")) { root.querySelector<HTMLElement>("[data-sk-ask-input]")?.focus(); void ask(w).catch(cause => say(messageOf(cause), "danger")); }
    if (form.matches("[data-sk-case-form]")) void saveCase(w).catch(cause => say(messageOf(cause), "danger"));
  });
  // Escape on the in-place question is 「回去改」.
  root.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !view.workshop?.confirm || !(event.target as Element).closest?.("[data-slot='leave-bar']")) return;
    event.preventDefault(); event.stopPropagation();
    void run("sk-confirm-back", undefined, root);
  });
  // Typed words are saved within a moment; only a save still waiting holds the window.
  addEventListener("beforeunload", event => { if (root.isConnected && view.workshop && (timer || saving)) event.preventDefault(); });

  /** What goes in a Skill's detail under 08's heading: a draft's band, a source's newer version, whose it is, its versions. */
  function decorate(box: HTMLElement, entry: SkillEntry): void {
    const mine = isMine(entry.skill), based = entry.skill.based_on;
    const top = [entry.skill.draft ? draftBand(entry.skill.ref.version) : "", based?.newer_version ? upstreamMarkup(based.source.name, based.newer_version, upstream.get(entry.key)) : "", ownership(entry.key, mine, Boolean(entry.skill.draft))].join("");
    box.querySelector(":scope > header")?.insertAdjacentHTML("afterend", top);
    if (!mine) return;
    const known = versions.get(entry.key), outer = box.querySelector(".kit-outer");
    const markup = versionsMarkup(known, entry.skill.ref.version, openVersion?.key === entry.key ? openVersion.version : undefined);
    if (outer) outer.insertAdjacentHTML("beforebegin", markup); else box.insertAdjacentHTML("beforeend", markup);
    if (known) return;
    listVersions(project, entry.skill.pack.scope, entry.skill.ref.skill_id).then(found => versions.set(entry.key, found), () => versions.set(entry.key, "failed")).then(() => {
      const shown = root.querySelector<HTMLElement>("[data-sk-versions]");
      if (shown && view.item === entry.key && !view.workshop) shown.outerHTML = versionsMarkup(versions.get(entry.key), entry.skill.ref.version, openVersion?.key === entry.key ? openVersion.version : undefined);
    });
  }

  /** A draft named in the address (a receipt's 「打开草稿」 link) opens once the page has read the kit. */
  async function fromAddress(): Promise<void> {
    drafts = await listDrafts(project).catch(() => []);
    // Inside the workbench's settings the page's own address is kept on the panel it was loaded into, not in the location.
    const holder = root.closest<HTMLElement>("[data-settings-search]"), asked = new URLSearchParams(holder ? holder.dataset.settingsSearch : location.search);
    const named = asked.get("draft");
    if (!named) return draw();
    asked.delete("draft");
    if (holder) holder.dataset.settingsSearch = asked.size ? `?${asked}` : "";
    else { const url = new URL(location.href); url.searchParams.delete("draft"); history.replaceState(history.state, "", url); }
    await openDraft(named).catch(cause => { draw(); say(messageOf(cause), "danger"); });
  }

  return {
    isMine, run, holds, focus, decorate, fromAddress,
    strip: () => draftsStrip(drafts),
    asking: () => view.asking && askingMarkup(view.asking, limits, Boolean(project)),
    workshop: () => view.workshop && workshopMarkup(view.workshop, limits),
  };
}
