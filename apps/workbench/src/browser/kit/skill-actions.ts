import type { SkillAuthoredSource, SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { fieldsOfSource, ownership, readSource, removeSkill, setState } from "./authoring.js";
import { act, readText } from "./common.js";
import type { DraftEditing } from "./draft-editing.js";
import { adoptDraft, createDraft, discardDraft, dismissSource, listDrafts, listVersions, messageOf } from "./drafts.js";
import { written, type SkillEntry, type WritingContext } from "./writing-context.js";
import { diffOf, draftBand, textOf, upstreamMarkup, versionsMarkup } from "./workshop.js";

// A Skill's own actions on the 「能力包」 page (batches 41 and 42): open a draft of it (a change, a copy, a restored version, its source's
// newer version), delete it and take that back, set it to auto; and what its detail shows under 08's heading.

export function skillActions(c: WritingContext, edit: DraftEditing) {
  const { project, view, draw, say } = c;
  /** The Skill just deleted, for 撤销; the version compared in a detail. */
  let removed: { source: SkillAuthoredSource; state: SkillCatalogEntry["state"] } | undefined, openVersion: { key: string; version: number } | undefined;

  async function undelete(): Promise<void> {
    if (!removed) return;
    const { source, state } = removed;
    // Kept until it is back: a restore that fails leaves 撤销 in the notice to try again, and the deleted text is not lost.
    let skillId: string;
    try {
      const draft = await createDraft(project, source.scope, { kind: "new" }, fieldsOfSource(source));
      skillId = (await adoptDraft(project, draft, false)).skill_id;
    } catch (cause) { say(written("restore-failed", { n: source.name, m: messageOf(cause) }), "danger", { label: readText("common.control.retry"), attrs: act("au-undelete") }); return; }
    removed = undefined;
    await c.reload();
    const entry = c.showOwn(source.scope, skillId);
    if (entry && state !== "off") { await setState(project, entry.skill, state); await c.reload(); c.showOwn(source.scope, skillId); }
    draw("detail");
    say(written("restored", { n: source.name }));
  }
  async function open(name: string, entry: SkillEntry): Promise<void> {
    if (name === "au-auto") { await setState(project, entry.skill, "auto"); await c.reload(); return say(written("now-auto", { n: entry.name })); }
    if (name === "skill-delete") {
      const source = await readSource(project, entry.skill);
      await removeSkill(project, entry.skill);
      removed = { source, state: entry.skill.state };
      view.item = undefined;
      await c.reload();
      draw("detail");
      return say(written("deleted", { n: source.name }), "success", { label: readText("workbench.context-bus.undo"), attrs: act("au-undelete") });
    }
    if (entry.skill.draft) return edit.openDraft(entry.skill.draft.draft_id);
    if (name === "skill-edit") return edit.create(entry.skill.pack.scope, { kind: "own", skill_id: entry.skill.ref.skill_id });
    return edit.create(c.pageScope, { kind: "custom", ref: entry.skill.ref });
  }

  /** Opening a draft, the sentence before a new one, deleting, and the notices' own next steps. False when it is none of these. */
  async function start(name: string, value: string | undefined, origin: HTMLElement): Promise<boolean> {
    if (name === "skill-new") { view.asking = { scope: c.pageScope, intent: "" }; view.workshop = undefined; view.detail = true; draw("au"); return true; }
    if (name === "sk-open" && value) { await edit.openDraft(value); return true; }
    if (name === "sk-undiscard" && value) { await discardDraft(project, value, true); c.drafts = await listDrafts(project, true).catch(() => c.drafts); await c.reload(); await edit.openDraft(value); return true; }
    if (name === "au-undelete") { await undelete(); return true; }
    if (name !== "skill-edit" && name !== "skill-copy" && name !== "skill-delete" && name !== "au-auto") return false;
    const entry = c.skillOf(value);
    if (!entry) return true;
    (origin as HTMLButtonElement).disabled = true;
    try { await open(name, entry); return true; } catch (cause) { (origin as HTMLButtonElement).disabled = false; throw cause; }
  }

  /** The detail's own versions and source, for the Skill open now. False when it is none of these. */
  async function inDetail(name: string, value: string | undefined): Promise<boolean> {
    const entry = c.skillOf(view.item);
    if (!entry || !name.startsWith("sk-version") && !name.startsWith("sk-up-")) return false;
    const scope = entry.skill.pack.scope, skillId = entry.skill.ref.skill_id, based = entry.skill.based_on;
    if (name === "sk-versions-retry") { c.versions.delete(entry.key); draw(); return true; }
    if (name === "sk-version-diff") { const version = Number(value); openVersion = openVersion?.key === entry.key && openVersion.version === version ? undefined : { key: entry.key, version }; draw(); return true; }
    if (name === "sk-version-restore") { await edit.create(scope, { kind: "own", skill_id: skillId, from_version: Number(value) }, undefined, "compare"); return true; }
    if (name === "sk-up-take") { await edit.create(scope, { kind: "own", skill_id: skillId, from_source: true }, undefined, "compare"); return true; }
    if (name === "sk-up-later" && based?.newer_version) { await dismissSource(project, scope, skillId, based.newer_version); await c.reload(); draw("detail"); return true; }
    if (name === "sk-up-see" && based) {
      if (c.upstream.has(entry.key)) { c.upstream.delete(entry.key); draw(); return true; }
      const source = c.skills().find(item => item.skill.ref.install_id === based.source.install_id && item.skill.ref.skill_id === based.source.skill_id);
      if (!source) return true;
      const [mine, theirs] = await Promise.all([readSource(project, entry.skill), readSource(project, source.skill)]);
      c.upstream.set(entry.key, diffOf(textOf({ ...mine, when_not_to_use: mine.when_not_to_use ?? "" }), textOf({ ...theirs, when_not_to_use: theirs.when_not_to_use ?? "" })));
      draw();
    }
    return true;
  }

  /** What goes in a Skill's detail under 08's heading: a draft's band, a source's newer version, whose it is, its versions. */
  function decorate(box: HTMLElement, entry: SkillEntry): void {
    const mine = c.isMine(entry.skill), based = entry.skill.based_on;
    const top = [entry.skill.draft ? draftBand(entry.skill.ref.version) : "", based?.newer_version ? upstreamMarkup(based.source.name, based.newer_version, c.upstream.get(entry.key)) : "", ownership(entry.key, mine, Boolean(entry.skill.draft))].join("");
    box.querySelector(":scope > header")?.insertAdjacentHTML("afterend", top);
    if (!mine) return;
    const shown = () => versionsMarkup(c.versions.get(entry.key), entry.skill.ref.version, openVersion?.key === entry.key ? openVersion.version : undefined);
    const outer = box.querySelector(".kit-outer");
    if (outer) outer.insertAdjacentHTML("beforebegin", shown()); else box.insertAdjacentHTML("beforeend", shown());
    if (c.versions.has(entry.key)) return;
    listVersions(project, entry.skill.pack.scope, entry.skill.ref.skill_id).then(found => c.versions.set(entry.key, found), () => c.versions.set(entry.key, "failed")).then(() => {
      const place = c.root.querySelector<HTMLElement>("[data-sk-versions]");
      if (place && view.item === entry.key && !view.workshop) place.outerHTML = shown();
    });
  }

  return { start, inDetail, decorate };
}
