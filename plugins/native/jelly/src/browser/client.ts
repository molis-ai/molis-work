import { escapeHtml as escapeText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { call, isConflict, messageOf } from "./api.js";
import { noteName } from "./markdown.js";
import { blankNote, civil, clockLabel, homeZone, parseClock } from "./util.js";
import { bindPageEvents } from "./events.js";
import { period, renderCalendar, renderCategories, renderHeader, renderNotes, renderPanel } from "./views.js";
import type {
  Draft,
  Failure,
  JellyCategory,
  JellyHost,
  JellyItem,
  JellyNote,
  JellyOccurrence,
  JellySeries,
  JellyState,
  NoteEditor,
  NoteSummary,
  Rows,
  JellyRestoreReceipt,
} from "./types.js";

const uiText = globalThis.t;
const SAVE_AFTER = 800;

/**
 * The Jelly page (batch 112, plan B): the calendar with the chosen day beside it, and the notes. Every change is one of Jelly's own actions on one
 * row, at the revision the page read; a deletion is undone from the workbench's toast, and a row changed elsewhere asks for that row alone.
 */
export function mountJelly(host: JellyHost): void {
  const root = document.querySelector<HTMLElement>('[data-jelly="workbench"]');
  const view = root?.querySelector<HTMLElement>("[data-jelly-page]");
  if (!root || !view || root.dataset.jellyInitialized === "true") return;
  root.dataset.jellyInitialized = "true";
  const today = civil();
  const state: JellyState = {
    tab: "calendar",
    mode: "month",
    anchor: today,
    selected: today,
    categories: [],
    occurrences: [],
    loaded: null,
    filter: new Set(),
    query: "",
    load: "loading",
    error: "",
    draft: null,
    dayNote: blankNote(),
    note: blankNote(),
    notes: [],
    noteQuery: "",
    noteRead: false,
    categoriesOpen: false,
    notice: null,
  };
  let noteDays = new Set<string>();
  // While an entry or a note is open it is what this page shows: the workbench knows the record is open, and the Assistant reads that one.
  const contextBefore = root.getAttribute("data-assistant-context");
  const shareContext = (): void => {
    const entry = state.draft?.occurrence,
      note = state.tab === "notes" ? state.note.note : null;
    const object = entry
      ? { kind: "jelly_item", id: entry.series_id ?? entry.id, version: String(entry.revision), title: entry.title }
      : note
        ? { kind: "jelly_note", id: note.id, version: String(note.revision), title: noteName(note) }
        : null;
    if (object)
      root.setAttribute(
        "data-assistant-context",
        JSON.stringify({ plugin_id: "io.molis.work.jelly", surface_title: "Jelly", object }),
      );
    else if (contextBefore === null) root.removeAttribute("data-assistant-context");
    else root.setAttribute("data-assistant-context", contextBefore);
  };
  let calendarSeq = 0;
  const toast = (key: string, values?: Record<string, string>, undo?: () => void) =>
    host.showToast(uiText.text(key, values), undo ? { undo } : undefined);
  const fail = (error: unknown) => host.showToast(messageOf(error), true);

  function paint(): void {
    const focused =
      document.activeElement instanceof HTMLElement && view!.contains(document.activeElement)
        ? focusKey(document.activeElement)
        : null;
    const selection =
      document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement
        ? [document.activeElement.selectionStart, document.activeElement.selectionEnd]
        : null;
    view!.innerHTML = `${renderHeader(state)}${state.notice ? `<p class="jelly-notice" role="status" data-jelly-notice>${"key" in state.notice ? uiText(state.notice.key) : escapeText(state.notice.text)}</p>` : ""}${state.tab === "notes" ? renderNotes(state) : renderCalendar(state, noteDays)}${state.draft ? renderPanel(state, state.draft) : ""}${state.categoriesOpen ? renderCategories(state) : ""}`;
    shareContext();
    if (focused) {
      const again = view!.querySelector<HTMLElement>(focused);
      again?.focus();
      if (
        selection &&
        (again instanceof HTMLTextAreaElement || again instanceof HTMLInputElement) &&
        again.type !== "date"
      )
        try {
          again.setSelectionRange(selection[0], selection[1]);
        } catch {
          /* not every input keeps a selection */
        }
    }
  }
  const focusKey = (element: HTMLElement): string | null => {
    for (const name of ["data-jelly-search", "data-jelly-note-search", "data-jelly-note-body", "data-jelly-quick"])
      if (element.hasAttribute(name)) return `[${name}]`;
    return null;
  };

  async function loadCalendar(): Promise<void> {
    const range = period(state),
      seq = ++calendarSeq;
    state.load = state.loaded ? state.load : "loading";
    try {
      const calendar = await call<{ categories: JellyCategory[]; items: JellyOccurrence[] }>(
        host, "jelly.calendar.list", range,
      );
      if (seq !== calendarSeq) return;
      state.categories = calendar.categories;
      state.occurrences = calendar.items;
      state.loaded = range;
      state.load = "ready";
      state.error = "";
    } catch (error) {
      if (seq !== calendarSeq) return;
      state.load = "failed";
      state.error = messageOf(error);
      return;
    }
    if (state.tab === "calendar" && state.mode === "month") {
      try {
        const { days } = await call<{ days: string[] }>(host, "jelly.note.days", range);
        if (seq === calendarSeq) noteDays = new Set(days);
      } catch (error) {
        if (seq === calendarSeq) {
          noteDays.clear();
          fail(error);
        }
      }
    }
  }
  async function loadDayNote(): Promise<void> {
    const day = state.selected;
    const editor = state.dayNote;
    const { notes } = await call<{ notes: NoteSummary[] }>(host, "jelly.note.list", { day, limit: 1 });
    const first = notes[0];
    const note = first ? (await call<{ note: JellyNote }>(host, "jelly.note.get", { id: first.id })).note : null;
    // Typing meanwhile wins: the editor the person is writing in stays, and its own save carries on.
    if (state.selected !== day || state.dayNote !== editor || (editor.day === day && (editor.dirty || editor.saving)))
      return;
    state.dayNote = { ...blankNote(day), note, body: note?.body ?? "" };
  }
  async function loadNotes(): Promise<void> {
    state.notes = (
      await call<{ notes: NoteSummary[] }>(host, "jelly.note.list", state.noteQuery ? { query: state.noteQuery } : {})
    ).notes;
  }
  async function refresh(): Promise<void> {
    await loadCalendar();
    if (state.tab === "calendar" && state.mode !== "list" && !state.dayNote.dirty) await loadDayNote().catch(fail);
    if (state.tab === "notes") await loadNotes().catch(fail);
    paint();
  }

  // ---- notes ----
  function queueSave(editor: NoteEditor): void {
    editor.dirty = true;
    clearTimeout(editor.timer);
    editor.timer = window.setTimeout(() => {
      void saveNote(editor).then(paintStatus, fail);
    }, SAVE_AFTER);
    paintStatus();
  }
  function paintStatus(): void {
    for (const box of view!.querySelectorAll<HTMLElement>("[data-jelly-note-status]")) {
      const editor = box.closest("[data-jelly-day-note]") ? state.dayNote : state.note;
      box.textContent = editor.saving
        ? uiText.text("jelly.note.saving")
        : editor.dirty
          ? uiText.text("jelly.note.editing")
          : editor.note
            ? uiText.text("jelly.note.saved")
            : "";
      box.dataset.mwState = editor.saving ? "saving" : editor.dirty ? "unsaved" : "saved";
    }
  }
  const saves = new WeakMap<NoteEditor, Promise<void>>();
  async function saveNote(editor: NoteEditor): Promise<void> {
    while (editor.dirty || saves.has(editor)) {
      if (editor.conflict) return;
      let pending = saves.get(editor);
      if (!pending) {
        pending = writeNote(editor).finally(() => saves.delete(editor));
        saves.set(editor, pending);
      }
      await pending;
    }
  }
  async function writeNote(editor: NoteEditor): Promise<void> {
    clearTimeout(editor.timer);
    if (!editor.note && !editor.body.trim()) {
      editor.dirty = false;
      return;
    }
    editor.saving = true;
    editor.dirty = false;
    paintStatus();
    const body = editor.body;
    try {
      const { note } = await call<{ note: JellyNote }>(
        host,
        "jelly.note.save",
        editor.note
          ? { id: editor.note.id, body, day: editor.day, expected_revision: editor.note.revision }
          : { body, day: editor.day },
      );
      editor.note = note;
      if (editor.body !== body) editor.dirty = true;
      // The same note open in the other editor (the day rail and the notes tab) follows, unless it is being written there too.
      const other = editor === state.dayNote ? state.note : state.dayNote;
      if (other.note?.id === note.id && !other.dirty && !other.saving) Object.assign(other, { note, body: note.body });
      if (note.day) noteDays.add(note.day);
      state.notes = [summaryOf(note), ...state.notes.filter(row => row.id !== note.id)];
      if (state.tab === "notes") {
        const list = view!.querySelector(".jelly-nlist");
        if (list && !list.querySelector(`[data-jelly-note="${CSS.escape(note.id)}"]`)) paint();
      }
    } catch (error) {
      editor.dirty = true;
      if (isConflict(error)) {
        editor.conflict = true;
        paint();
      } else throw error;
    } finally {
      editor.saving = false;
    }
  }
  function summaryOf(note: JellyNote): NoteSummary {
    return { id: note.id, title: note.title, day: note.day, revision: note.revision, updated_at: note.updated_at,
      excerpt: [...note.body.replace(/\s+/gu, " ").trim()].slice(0, 200).join("") };
  }
  async function openNote(id: string): Promise<boolean> {
    await saveNote(state.note);
    if (state.note.conflict) return false;
    const { note } = await call<{ note: JellyNote }>(host, "jelly.note.get", { id });
    state.note = { ...blankNote(note.day), note, body: note.body };
    state.noteRead = Boolean(note.body.trim());
    return true;
  }
  async function deleteNote(editor: NoteEditor): Promise<void> {
    if (!editor.note) return;
    clearTimeout(editor.timer);
    const note = editor.note;
    const { restore } = await call<{ restore: JellyRestoreReceipt }>(host, "jelly.note.delete", {
      id: note.id,
      expected_revision: note.revision,
    });
    state.notes = state.notes.filter((row) => row.id !== note.id);
    Object.assign(editor, blankNote(editor === state.dayNote ? state.selected : null));
    toast("jelly.note.deleted", { title: noteName(note) || uiText.text("jelly.note.untitled") }, () => {
      void undo(restore);
    });
  }

  // ---- calendar entries ----
  function draftFor(entry: JellyOccurrence | null, day = state.selected): Draft {
    if (!entry)
      return {
        occurrence: null,
        title: "",
        kind: "event",
        allDay: false,
        start_date: day,
        end_date: day,
        start_time: "09:00",
        end_time: "10:00",
        repeat: false,
        weekdays: [((new Date(`${day}T12:00:00`).getDay() + 6) % 7) + 1],
        until: "",
        category_id: "uncategorized",
        notes: "",
        scope: "onlyThis",
        conflict: false,
        error: "",
        busy: false,
      };
    return {
      occurrence: entry,
      title: entry.title,
      kind: entry.kind,
      allDay: entry.start_time === null,
      start_date: entry.start_date,
      end_date: entry.end_date,
      start_time: clockLabel(entry.start_time) || "09:00",
      end_time: clockLabel(entry.end_time) || "10:00",
      repeat: Boolean(entry.series_id),
      weekdays: [],
      until: "",
      category_id: entry.category_id,
      notes: entry.notes,
      scope: "onlyThis",
      conflict: false,
      error: "",
      busy: false,
    };
  }
  async function openEntry(id: string): Promise<void> {
    const entry = state.occurrences.find((occurrence) => occurrence.id === id);
    if (!entry) return;
    state.draft = draftFor(entry);
    if (entry.series_id) {
      const { series } = await call<{ series: JellySeries }>(host, "jelly.item.get", { id: entry.series_id });
      if (series && state.draft?.occurrence?.id === id) {
        state.draft.weekdays = series.weekdays;
        state.draft.until = series.until ?? "";
        state.draft.originalRule = { weekdays: [...series.weekdays], until: state.draft.until };
      }
    }
  }
  /** The form as the person left it, read into the draft so a repaint keeps it. */
  function readForm(): void {
    const draft = state.draft,
      form = view!.querySelector<HTMLFormElement>("[data-jelly-form]");
    if (!draft || !form) return;
    const value = (name: string) =>
      (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? "";
    draft.title = value("title");
    draft.start_date = value("start_date") || draft.start_date;
    draft.end_date = value("end_date") || draft.end_date;
    if (!draft.allDay) {
      draft.start_time = value("start_time") || draft.start_time;
      draft.end_time = value("end_time") || draft.end_time;
    }
    draft.until = form.elements.namedItem("until") ? value("until") : draft.until;
    draft.notes = value("notes");
  }
  async function saveEntry(): Promise<void> {
    readForm();
    const draft = state.draft!;
    if (!draft.title.trim()) {
      draft.error = uiText.text("jelly.error.title-required");
      paint();
      return;
    }
    const end = draft.end_date < draft.start_date ? draft.start_date : draft.end_date;
    const schedule = {
      start_date: draft.start_date,
      end_date: end,
      start_time: draft.allDay ? null : parseClock(draft.start_time),
      end_time: draft.allDay ? null : parseClock(draft.end_time),
    };
    if (
      !draft.allDay &&
      (schedule.start_time === null ||
        schedule.end_time === null ||
        (end === draft.start_date && schedule.end_time <= schedule.start_time))
    ) {
      draft.error = uiText.text("jelly.error.time-order");
      paint();
      return;
    }
    const fields = {
      title: draft.title.trim(),
      kind: draft.kind,
      category_id: draft.category_id,
      notes: draft.notes,
      ...schedule,
    };
    const rule = { weekdays: draft.weekdays, until: draft.until || null };
    draft.busy = true;
    draft.error = "";
    paint();
    try {
      const entry = draft.occurrence;
      if (!entry) {
        if (draft.repeat) {
          if (!draft.weekdays.length) throw new Error(uiText.text("jelly.error.weekdays"));
          await call(host, "jelly.series.create", { series: { ...fields, ...rule, time_zone: homeZone() } });
        } else await call(host, "jelly.item.create", { item: { ...fields, time_zone: homeZone() } });
      } else if (entry.series_id) {
        const patch: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([key, value]) => entry[key as keyof typeof fields] !== value));
        if (patch.start_date !== undefined) patch.end_date = fields.end_date;
        const originalRule = draft.originalRule;
        if (draft.scope !== "onlyThis" && originalRule) {
          if (draft.weekdays.join() !== originalRule.weekdays.join()) patch.weekdays = draft.weekdays;
          if (draft.until !== originalRule.until) patch.until = rule.until;
        }
        if (Object.keys(patch).length) await call(host, "jelly.series.update", {
          id: entry.series_id,
          expected_revision: entry.revision,
          original_date: entry.original_date,
          scope: draft.scope,
          patch,
        });
      } else await call(host, "jelly.item.update", { id: entry.id, expected_revision: entry.revision, patch: fields });
      state.draft = null;
      if (!state.dayNote.dirty && !state.dayNote.saving) {
        state.selected = draft.start_date;
      }
      await refresh();
    } catch (error) {
      draft.busy = false;
      if (isConflict(error)) draft.conflict = true;
      else draft.error = messageOf(error);
      paint();
    }
  }
  async function deleteEntry(entry: JellyOccurrence, scope: Draft["scope"] = "onlyThis"): Promise<void> {
    const { restore } = entry.series_id
      ? await call<{ restore: JellyRestoreReceipt }>(host, "jelly.series.delete", {
          id: entry.series_id,
          expected_revision: entry.revision,
          original_date: entry.original_date,
          scope,
        })
      : await call<{ restore: JellyRestoreReceipt }>(host, "jelly.item.delete", { id: entry.id, expected_revision: entry.revision });
    state.draft = null;
    await refresh();
    toast("jelly.item.deleted", { title: entry.title }, () => {
      void undo(restore);
    });
  }
  async function toggleDone(entry: JellyOccurrence): Promise<void> {
    const completed = entry.completed_at === null;
    if (entry.series_id)
      await call(host, "jelly.series.update", {
        id: entry.series_id,
        expected_revision: entry.revision,
        original_date: entry.original_date,
        scope: "onlyThis",
        patch: { completed },
      });
    else
      await call(host, "jelly.item.update", { id: entry.id, expected_revision: entry.revision, patch: { completed } });
    await refresh();
  }
  async function quickAdd(input: HTMLInputElement): Promise<void> {
    const title = input.value.trim();
    if (!title) return;
    input.value = "";
    await call(host, "jelly.item.create", {
      item: { title, kind: "task", start_date: state.selected, time_zone: homeZone() },
    });
    await refresh();
  }
  async function undo(rows: JellyRestoreReceipt): Promise<void> {
    try {
      const { rows: restored, skipped } = await call<{ rows: Required<Rows>; skipped: string[] }>(host, "jelly.restore", { rows });
      await refresh();
      if (skipped.length) host.showToast(uiText.text("jelly.undo.partial", {
        restored: Object.values(restored).reduce((count, group) => count + group.length, 0), skipped: skipped.length,
      }));
    } catch (error) {
      if (isConflict(error)) toast("jelly.undo.changed");
      else fail(error);
    }
  }

  // ---- categories ----
  async function saveCategory(id: string, patch: { name?: string; color?: string }): Promise<void> {
    const category = state.categories.find((entry) => entry.id === id);
    if (!category) return;
    try {
      await call(host, "jelly.category.save", { id, ...patch, expected_revision: category.revision });
    } catch (error) {
      if (isConflict(error)) toast("jelly.conflict.category");
      else fail(error);
    }
    await refresh();
  }
  async function deleteCategory(id: string): Promise<void> {
    const category = state.categories.find((entry) => entry.id === id);
    if (!category) return;
    const { restore } = await call<{ restore: JellyRestoreReceipt }>(host, "jelly.category.delete", {
      id,
      expected_revision: category.revision,
    });
    state.filter.delete(id);
    await refresh();
    toast("jelly.category.deleted", { name: category.name }, () => {
      void undo(restore);
    });
  }

  // ---- moving around ----
  async function show(change: () => void): Promise<void> {
    const editor = state.tab === "notes" ? state.note : state.dayNote;
    await saveNote(editor);
    if (editor.conflict) return;
    change();
    paint();
    await refresh();
  }
  const run = (work: () => Promise<unknown> | unknown) => {
    void Promise.resolve().then(work).catch(fail);
  };

  bindPageEvents({
    host,
    view,
    state,
    today,
    paint,
    paintStatus,
    run,
    show,
    refresh,
    loadNotes,
    loadDayNote,
    queueSave,
    saveNote,
    openNote,
    deleteNote,
    draftFor,
    openEntry,
    readForm,
    saveEntry,
    deleteEntry,
    toggleDone,
    quickAdd,
    saveCategory,
    deleteCategory,
  });

  // Opened by id (search, the side panel, an Assistant result): show the entry or note where it lives.
  root.addEventListener("molis-work:select-item", (event) => {
    const detail = (event as CustomEvent<{ itemId?: unknown; quiet?: unknown } | null>).detail,
      id = detail?.itemId,
      quiet = detail?.quiet === true;
    if (typeof id !== "string" || !id) return;
    event.preventDefault();
    run(async () => {
      // A refused read is said as the platform says it, never as gone (VUX-12).
      // Only a refusal or a row that is not there counts as unreadable; any other failure (the Host restarting, a damaged row) is a failure.
      let refused = "";
      const settle = (error: unknown): null => {
        const failure = error as Failure | null;
        refused ||= host.readRefusal(failure?.status ?? 0, failure?.code) ?? "";
        if (refused || failure?.status === 404 || failure?.code === "jelly.not_found") return null;
        throw error;
      };
      try {
        if (!await openNote(id)) return;
        state.noteQuery = "";
        await loadNotes();
        const selected = state.note.note;
        if (selected && !state.notes.some(note => note.id === selected.id)) state.notes.unshift(summaryOf(selected));
        state.tab = "notes";
        paint();
        return;
      } catch (error) {
        settle(error); /* not a note: an entry */
      }
      const found = refused
        ? null
        : await call<{ item?: JellyItem; series?: JellySeries }>(host, "jelly.item.get", { id }).catch(settle);
      const entry = found?.item ?? found?.series;
      // Gone or refused: the workbench is told, and the page says so where it would have been (user decision 2026-10-21); a reopen nobody asked for stays quiet.
      if (!entry) {
        root.dispatchEvent(new CustomEvent("molis-work:item-unreadable", { bubbles: true, detail: { itemId: id } }));
        if (!quiet || refused) {
          state.notice = refused ? { text: refused } : { key: "jelly.sync.gone" };
          paint();
        }
        return;
      }
      const day = found?.item ? entry.start_date : entry.start_date > today ? entry.start_date : today;
      await show(() => {
        state.tab = "calendar";
        state.anchor = day;
        state.selected = day;
      });
      if (found?.item) {
        await openEntry(entry.id);
        paint();
      }
    });
  });
  // The Assistant changed Jelly: read again. A note being written keeps its text; saving it then says if it was changed meanwhile.
  window.addEventListener("molis:assistant-effect", (event) => {
    const capability = (event as CustomEvent<{ capability_id?: unknown } | null>).detail?.capability_id;
    if (typeof capability === "string" && capability.startsWith("jelly.")) run(refresh);
  });
  const stop = new AbortController();
  window.addEventListener(
    "pagehide",
    () => {
      stop.abort();
      void saveNote(state.dayNote).catch(() => undefined);
      void saveNote(state.note).catch(() => undefined);
    },
    { once: true },
  );
  document.addEventListener("molis-work:language-changed", () => paint(), { signal: stop.signal });
  window.addEventListener(
    "beforeunload",
    (event) => {
      if (state.dayNote.dirty || state.note.dirty || state.dayNote.saving || state.note.saving) {
        event.preventDefault();
        event.returnValue = "";
      }
    },
    { signal: stop.signal },
  );

  paint();
  void refresh();
}
