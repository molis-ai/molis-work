import { dateArg } from "@molis-ai/molis-work-plugin-sdk/ui";
import { statusOf } from "./dom.js";
import { KIND_KEYS } from "./list.js";
import { isPending } from "./page.js";
import { issueNoteModels, issueNoteText } from "./note.js";
import type { Issue, IssuesPage } from "./types.js";

const t = globalThis.t;

const VIA_KEYS: Record<string, string> = { assistant: "issues.via.assistant", manual: "issues.via.manual", mcp: "issues.via.mcp" };

/** One record, or one capture that needs the person: reading it, editing it, saving it, and going back to the list. */
export function installDetail(page: IssuesPage): void {
  const { el, state, $ } = page;

  page.fill = (data) => {
    el.titleInput.value = data.title || "";
    page.pick(data.type);
    el.detailInput.value = data.text ?? data.description ?? "";
    state.edits = data.images || [];
    page.paint();
  };
  page.mode = () => {
    $("view").hidden = state.editing;
    el.editor.hidden = !state.editing;
    $("edit").hidden = $("delete").hidden = state.editing;
    $("redo").hidden = false;
    $("cancel").textContent = page.draft() ? t.text("issues.editor.discard") : t.text("issues.editor.cancel");
    if (!page.draft()) { page.primary("save"); page.primary("redo", false); }
    if (state.editing) page.scope.frame(() => page.fit(el.detailInput));
  };
  page.show = (issue) => {
    void page.stopReview();
    state.current = issue;
    state.editing = false;
    page.flag();
    el.home.hidden = true;
    el.detail.hidden = false;
    el.gone.hidden = true;
    $("type").textContent = KIND_KEYS[issue.type] ? t.text(KIND_KEYS[issue.type]!) : issue.type;
    $("when").textContent = t.text("issues.detail.date", { time: dateArg(issue.created_at, "datetime") });
    $("title").textContent = issue.title;
    $("text").textContent = issue.description;
    $("view-shots").innerHTML = page.shots(issue.images, false);
    const recordedOn = issue.context?.page?.title;
    $("source").textContent = [recordedOn && t.text("issues.detail.recorded-on", { page: recordedOn }), VIA_KEYS[issue.entered_via] ? t.text(VIA_KEYS[issue.entered_via]!) : issue.entered_via,
      issue.version > 1 && t.text("issues.detail.edited-on", { time: dateArg(issue.updated_at, "datetime") })].filter(Boolean).join(" · ");
    page.mode();
    $("page").scrollTop = 0;
    $("back").focus();
  };
  page.open = async (id) => {
    if (state.saving) return;
    await page.stopReview();
    const item = state.pending.find((entry) => entry.id === id);
    if (item) {
      if (item.state === "organizing") { page.toast(t.text("issues.detail.still-organizing")); return; }
      state.current = item;
      state.editing = true;
      page.fill(item.card ? { ...item, ...item.card } : item);
      page.flag(issueNoteText(item.note, item.missingShots), issueNoteModels(item.note));
      el.home.hidden = true;
      el.detail.hidden = false;
      page.mode();
      // Asked for a fact: the words come first and Issue tries again. Failed: name it by hand.
      const asked = item.kind === "question";
      page.primary("redo", asked);
      page.primary("save", !asked);
      if (asked) { el.detailInput.focus(); el.detailInput.setSelectionRange(el.detailInput.value.length, el.detailInput.value.length); } else el.titleInput.focus();
      return;
    }
    const epoch = ++state.readEpoch;
    const issue = await page.read(id);
    if (epoch === state.readEpoch) page.show(issue);
  };
  page.back = async () => {
    const current = state.current;
    if (isPending(current)) {
      current.text = el.detailInput.value;
      current.images = state.edits;
      current.card = { title: el.titleInput.value, type: el.editor.dataset.type ?? "" };
    } else if (state.editing && Object.keys(page.changed()).length && !await page.confirm(t.text("issues.editor.leave-title"), t.text("issues.editor.leave-text"), t.text("issues.editor.leave-ok"))) return;
    void page.stopReview();
    const id = current?.id;
    ++state.readEpoch;
    state.current = null;
    state.editing = false;
    el.detail.hidden = true;
    el.home.hidden = false;
    page.render();
    (el.list.querySelector<HTMLElement>('[data-issue-id="' + CSS.escape(id || "") + '"]') ?? el.desc).focus();
  };
  page.save = async () => {
    if (state.saving || state.importing || !state.editing) return;
    await page.stopReview();
    const data = page.values(), focus = document.activeElement as HTMLElement | null;
    if (!data.title || !data.type) {
      page.flag(t.text("issues.editor.need-title-type"));
      (data.title ? el.editor.querySelector<HTMLElement>("[data-type]") : el.titleInput)?.focus();
      return;
    }
    const target = state.current;
    const saveButton = $<HTMLButtonElement>("save");
    state.saving = el.editor.inert = saveButton.disabled = true;
    try {
      if (isPending(target)) { await page.keep(target, data); return; }
      if (!target) return;
      const patch = page.changed();
      if (!Object.keys(patch).length) { page.show(target as Issue); return; }
      try {
        const issue = await page.api<Issue>("update", { id: target.id, expected_version: target.version, ...patch });
        state.rows = state.rows.map((row) => (row.id === issue.id ? issue : row));
        page.show(issue);
        page.toast(t.text("issues.editor.saved"));
      } catch (error) {
        if (statusOf(error) !== 409) throw error;
        // Someone else saved first: their fields stay, this person's edits go on top, and nothing is written until they save again.
        const latest = await page.read(target.id);
        state.current = latest;
        page.fill({ ...latest, ...patch });
        page.flag(t.text("issues.editor.merged"));
      }
    } finally {
      state.saving = el.editor.inert = saveButton.disabled = false;
      if (state.editing) focus?.focus();
    }
  };
}
