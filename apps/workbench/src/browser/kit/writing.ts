import type { KitEntry } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { SkillAuthoredSource, SkillCatalogEntry, SkillScope } from "@molis-ai/molis-work-contracts/services/skills";
import type { AttrValue } from "@molis-ai/molis-work-plugin-sdk/ui";
import { authoringMarkup, check, draft, fieldsOfSource, fromSource, isDirty, newSkill, readSource, removeSkill, save, saveFields, setState, typed, type SkillWritingLimits } from "./authoring.js";
import { act, readText, type Kit } from "./common.js";
import type { View } from "./view.js";

// What the person does while writing a Skill of their own on the 「能力包」 page (batch 41): the page (page.ts) keeps the view and
// draws; this keeps the form's turns — opening it, drafting, saving, leaving unsaved work, deleting and taking a deletion back.

export type WritingFocus = "au" | "au-leave" | "au-error" | "au-failure" | "au-applies" | "au-scope";
type SkillEntry = Extract<KitEntry, { kind: "skill" }>;

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

export function skillWriting(page: WritingPage) {
  const { root, project, view, draw, load, say } = page;
  const limits = JSON.parse(root.dataset.skillLimits ?? "{}") as SkillWritingLimits, ownPack = root.dataset.skillMine ?? "", pageScope: SkillScope = project ? "project" : "home";
  const written = (key: string, values?: Record<string, string | number>) => readText(`workbench.skill-authoring.${key}`, values);
  const isMine = (skill: SkillCatalogEntry) => skill.pack.plugin_id === ownPack && skill.pack.trust === "home_local";
  const skillOf = (key?: string): SkillEntry | undefined => { const entry = key ? page.kit()?.byKey.get(key) : undefined; return entry?.kind === "skill" ? entry : undefined; };
  const ownSkills = (scope: SkillScope) => (page.kit()?.catalog.entries ?? []).flatMap(entry => entry.kind === "skill" && isMine(entry.skill) && entry.skill.pack.scope === scope ? [entry] : []);
  /** What the person leaves unsaved work for, kept until they answer the bar; and the Skill just deleted, for 撤销. */
  let pending: (() => void) | undefined, removed: { source: SkillAuthoredSource; state: SkillCatalogEntry["state"] } | undefined;

  function showOwn(scope: SkillScope, skillId: string): SkillEntry | undefined {
    const entry = ownSkills(scope).find(candidate => candidate.skill.ref.skill_id === skillId);
    if (entry) page.show(entry);
    return entry;
  }

  async function commit(): Promise<boolean> {
    const writing = view.authoring!;
    writing.leave = false;
    if (!check(writing, limits, new Set(ownSkills(writing.scope).filter(entry => entry.skill.ref.skill_id !== writing.skill_id).map(entry => entry.skill.name.trim())))) { draw("au-error"); return false; }
    writing.busy = "save"; draw();
    const result = await save(writing, project);
    writing.busy = undefined;
    if (view.authoring !== writing) return false;
    if (!result) { draw(writing.failure ? "au-failure" : "au-error"); return false; }
    view.authoring = undefined;
    await load();
    const entry = showOwn(writing.scope, result.skill_id), name = writing.fields.name.trim();
    draw("detail");
    if (writing.origin !== "edit" && entry) say(written("saved-new", { n: name }), "success", { label: written("turn-auto"), attrs: act("au-auto", entry.key) });
    else say(written("saved-version", { n: name, v: result.skill_version }));
    return true;
  }

  /** Opening the form, deleting, and the notices' own next steps. */
  async function start(name: string, value: string | undefined, origin: HTMLElement): Promise<boolean> {
    if (name === "skill-new") { view.authoring = newSkill(pageScope); view.detail = true; draw("au"); return true; }
    if (name === "au-undelete") {
      if (!removed) return true;
      const { source, state } = removed;
      removed = undefined;
      const result = await saveFields(project, source.scope, fieldsOfSource(source));
      await load();
      const entry = showOwn(source.scope, result.skill_id);
      if (entry && state !== "off") { await setState(project, entry.skill, state); await load(); showOwn(source.scope, result.skill_id); }
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
    if (name === "au-auto") { await setState(project, entry.skill, "auto"); await load(); say(written("now-auto", { n: entry.name })); return true; }
    const source = await readSource(project, entry.skill);
    if (name === "skill-delete") {
      await removeSkill(project, entry.skill);
      removed = { source, state: entry.skill.state };
      view.item = undefined;
      await load();
      draw("detail");
      say(written("deleted", { n: source.name }), "success", { label: readText("workbench.context-bus.undo"), attrs: act("au-undelete") });
      return true;
    }
    view.authoring = fromSource(source, name === "skill-edit" ? "edit" : "copy", pageScope);
    view.detail = true;
    draw("au");
    return true;
  }

  /** One of the page's actions that is the form's; others are left to the page. */
  async function run(name: string, value: string | undefined, origin: HTMLElement): Promise<void> {
    if (await start(name, value, origin)) return;
    const writing = view.authoring;
    if (!writing || !name.startsWith("au-")) return;
    if (name === "au-self") { writing.step = "form"; writing.failure = undefined; return draw("au"); }
    if (name === "au-redraft") { writing.step = "ask"; writing.failure = undefined; return draw("au"); }
    if (name === "au-draft") {
      writing.busy = "draft"; draw();
      await draft(writing, project);
      writing.busy = undefined;
      if (view.authoring === writing) draw(writing.failure ? "au-failure" : "au");
      return;
    }
    if (name === "au-applies") { writing.fields.applies_to = value as typeof writing.fields.applies_to; return draw("au-applies"); }
    if (name === "au-scope") { writing.scope = value as SkillScope; return draw("au-scope"); }
    if (name === "au-save") { await commit(); return; }
    if (name === "au-drop") { view.authoring = undefined; pending = undefined; return draw("detail"); }
    if (name === "au-leave-stay") { writing.leave = false; pending = undefined; return draw("au"); }
    if (name === "au-leave-drop") { const go = pending; view.authoring = undefined; pending = undefined; draw(); return go?.(); }
    if (name === "au-leave-save") { const go = pending; if (await commit()) { pending = undefined; go?.(); } }
  }

  /**
   * Before any other action of the page while the form is open: unsaved work holds it (the bar above the form asks once, and what
   * the person was going to do waits for the answer); a form with nothing unsaved is simply left.
   */
  function holds(name: string, go: () => void): boolean {
    const writing = view.authoring;
    if (!writing || name.startsWith("au-")) return false;
    if (writing.busy === "save") return true;
    if (isDirty(writing)) { pending = go; writing.leave = true; draw("au-leave"); return true; }
    view.authoring = undefined;
    return false;
  }

  function focus(body: HTMLElement, where?: string): void {
    if (!where?.startsWith("au")) return;
    const form = body.querySelector<HTMLElement>("[data-au]");
    (form?.querySelector<HTMLElement>(where === "au-leave" ? "[data-au-leave]" : where === "au-error" ? '[aria-invalid="true"]' : where === "au-failure" ? ".au-failure"
      : where === "au-applies" || where === "au-scope" ? `[data-kit-act="${where}"][aria-pressed="true"]` : "[data-au-field]") ?? form?.querySelector<HTMLElement>("#au-title"))?.focus();
  }

  root.addEventListener("input", event => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (view.authoring && target.dataset?.auField) typed(view.authoring, target, root, limits);
  });
  root.addEventListener("submit", event => { if ((event.target as Element).matches("[data-au]")) event.preventDefault(); });
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!root.isConnected) return removeEventListener("beforeunload", beforeUnload);
    if (view.authoring && isDirty(view.authoring)) event.preventDefault();
  };
  addEventListener("beforeunload", beforeUnload);

  return { isMine, run, holds, focus, markup: () => view.authoring && authoringMarkup(view.authoring, limits, Boolean(project)) };
}
