import { call } from "./api.js";
import { addDays, blankNote, civil, TONE_COLORS, toneOf, type Tone } from "./util.js";
import { period } from "./views.js";
import type { Draft, JellyHost, JellyOccurrence, JellyState, NoteEditor } from "./types.js";

/** What the page's controls need from the page (`mountJelly`): its state, how it draws, and the changes it makes. */
export interface JellyPage {
  readonly host: JellyHost;
  readonly view: HTMLElement;
  readonly state: JellyState;
  readonly today: string;
  paint(): void;
  paintStatus(): void;
  run(work: () => Promise<unknown> | unknown): void;
  show(change: () => void): Promise<void>;
  refresh(): Promise<void>;
  loadNotes(): Promise<void>;
  loadDayNote(): Promise<void>;
  queueSave(editor: NoteEditor): void;
  saveNote(editor: NoteEditor): Promise<void>;
  openNote(id: string): Promise<void>;
  deleteNote(editor: NoteEditor): Promise<void>;
  draftFor(entry: JellyOccurrence | null, day?: string): Draft;
  openEntry(id: string): Promise<void>;
  readForm(): void;
  saveEntry(): Promise<void>;
  deleteEntry(entry: JellyOccurrence, scope?: Draft["scope"]): Promise<void>;
  toggleDone(entry: JellyOccurrence): Promise<void>;
  quickAdd(input: HTMLInputElement): Promise<void>;
  saveCategory(id: string, patch: { name?: string; color?: string }): Promise<void>;
  deleteCategory(id: string): Promise<void>;
}

/** The page's own controls: clicks, typing, choices, forms and keys inside the Jelly view. */
export function bindPageEvents(page: JellyPage): void {
  const {
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
  } = page;
  const { draftFor, openEntry, readForm, saveEntry, deleteEntry, toggleDone, quickAdd, saveCategory, deleteCategory } =
    page;
  view.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (state.notice) {
      state.notice = null;
      view.querySelector("[data-jelly-notice]")?.remove();
    }
    const at = <T extends HTMLElement = HTMLElement>(selector: string) => target.closest<T>(selector);
    const tab = at("[data-jelly-tab]");
    if (tab) {
      const next = tab.dataset.jellyTab as JellyState["tab"];
      run(() =>
        show(() => {
          state.tab = next;
        }),
      );
      return;
    }
    const mode = at("[data-jelly-mode]");
    if (mode) {
      run(() =>
        show(() => {
          state.mode = mode.dataset.jellyMode as JellyState["mode"];
        }),
      );
      return;
    }
    const step = at("[data-jelly-step]");
    if (step) {
      const direction = Number(step.dataset.jellyStep);
      run(() =>
        show(() => {
          if (state.mode === "month") {
            const first = new Date(`${state.anchor.slice(0, 7)}-01T12:00:00`);
            first.setMonth(first.getMonth() + direction);
            state.anchor = civil(first);
          } else state.anchor = addDays(state.anchor, direction * (state.mode === "week" ? 7 : 14));
          const { start, end } = period(state);
          if (state.selected < start || state.selected > end)
            state.selected = state.mode === "month" ? state.anchor : start;
        }),
      );
      return;
    }
    const filter = at("[data-jelly-filter]");
    if (filter) {
      const id = filter.dataset.jellyFilter!;
      if (state.filter.has(id)) state.filter.delete(id);
      else state.filter.add(id);
      paint();
      return;
    }
    const toggle = at("[data-jelly-toggle]");
    if (toggle) {
      const entry = state.occurrences.find((occurrence) => occurrence.id === toggle.dataset.jellyToggle);
      if (entry) run(() => toggleDone(entry));
      return;
    }
    const open = at("[data-jelly-open]");
    if (open) {
      const id = open.dataset.jellyOpen!;
      run(async () => {
        readForm();
        await openEntry(id);
        paint();
        view.querySelector<HTMLInputElement>("[data-jelly-panel] input[name=title]")?.focus();
      });
      return;
    }
    const day = at("[data-jelly-day]");
    if (day && !state.draft) {
      const key = day.dataset.jellyDay!;
      if (key !== state.selected)
        run(() =>
          show(() => {
            state.selected = key;
          }),
        );
      return;
    }
    const kind = at("[data-jelly-kind]");
    if (kind && state.draft) {
      readForm();
      state.draft.kind = kind.dataset.jellyKind as Draft["kind"];
      paint();
      return;
    }
    const weekday = at("[data-jelly-weekday]");
    if (weekday && state.draft) {
      readForm();
      const value = Number(weekday.dataset.jellyWeekday);
      state.draft.weekdays = state.draft.weekdays.includes(value)
        ? state.draft.weekdays.filter((day) => day !== value)
        : [...state.draft.weekdays, value].sort();
      paint();
      return;
    }
    const draftCategory = at("[data-jelly-draft-category]");
    if (draftCategory && state.draft) {
      readForm();
      state.draft.category_id = draftCategory.dataset.jellyDraftCategory!;
      paint();
      return;
    }
    const note = at("[data-jelly-note]");
    if (note) {
      run(async () => {
        await openNote(note.dataset.jellyNote!);
        paint();
      });
      return;
    }
    const noteMode = at("[data-jelly-note-mode]");
    if (noteMode) {
      state.noteRead = noteMode.dataset.jellyNoteMode === "read";
      run(async () => {
        await saveNote(state.note);
        paint();
      });
      return;
    }
    const colour = at("[data-jelly-colour]");
    if (colour) {
      run(() =>
        saveCategory(colour.dataset.jellyCategory!, {
          color: TONE_COLORS[colour.dataset.jellyColour as Tone] ?? TONE_COLORS[toneOf("")],
        }),
      );
      return;
    }
    const removeCategory = at("[data-jelly-category-delete]");
    if (removeCategory) {
      run(() => deleteCategory(removeCategory.dataset.jellyCategoryDelete!));
      return;
    }
    const act = at("[data-jelly-act]")?.dataset.jellyAct;
    if (!act) return;
    if (act === "today")
      run(() =>
        show(() => {
          state.anchor = today;
          state.selected = today;
        }),
      );
    else if (act === "new") {
      state.draft = draftFor(null);
      paint();
      view.querySelector<HTMLInputElement>("[data-jelly-panel] input[name=title]")?.focus();
    } else if (act === "close") {
      state.draft = null;
      paint();
    } else if (act === "save-item") run(saveEntry);
    else if (act === "delete-item" && state.draft?.occurrence) {
      readForm();
      const entry = state.draft.occurrence,
        scope = state.draft.scope;
      run(() => deleteEntry(entry, scope));
    } else if (act === "complete-item" && state.draft?.occurrence) {
      const entry = state.draft.occurrence;
      state.draft = null;
      run(() => toggleDone(entry));
    } else if (act === "reload-item") {
      const id = state.draft?.occurrence?.id;
      state.draft = null;
      run(async () => {
        await refresh();
        if (id) {
          await openEntry(id);
          paint();
        }
      });
    } else if (act === "categories") {
      state.categoriesOpen = true;
      paint();
    } else if (act === "close-categories") {
      state.categoriesOpen = false;
      paint();
    } else if (act === "retry") run(refresh);
    else if (act === "new-note")
      run(async () => {
        await saveNote(state.note);
        if (state.note.conflict) return;
        state.tab = "notes";
        state.note = { ...blankNote(), open: true };
        state.noteRead = false;
        paint();
        view.querySelector<HTMLTextAreaElement>("[data-jelly-note-body]")?.focus();
      });
    else if (act === "note-back")
      run(async () => {
        await saveNote(state.note);
        if (state.note.conflict) return;
        state.note = blankNote();
        paint();
      });
    else if (act === "delete-note")
      run(async () => {
        await deleteNote(state.note);
        paint();
      });
    else if (act === "reload-note") {
      const editor = target.closest("[data-jelly-day-note]") ? state.dayNote : state.note,
        id = editor.note?.id;
      run(async () => {
        if (editor === state.dayNote) {
          state.dayNote = blankNote(state.selected);
          await loadDayNote();
        } else if (id) {
          state.note = blankNote();
          await openNote(id).catch(() => {
            state.note = blankNote();
          });
        }
        paint();
      });
    }
  });
  view.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (target.matches("[data-jelly-search]")) {
      state.query = target.value.trim();
      paint();
      return;
    }
    if (target.matches("[data-jelly-note-search]")) {
      state.noteQuery = target.value.trim();
      run(async () => {
        await loadNotes();
        paint();
      });
      return;
    }
    if (target.matches("[data-jelly-note-body]")) {
      const editor = target.closest("[data-jelly-day-note]") ? state.dayNote : state.note;
      editor.body = target.value;
      queueSave(editor);
    }
  });
  view.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.matches("[data-jelly-all-day]") && state.draft) {
      readForm();
      state.draft.allDay = target.checked;
      paint();
    } else if (target.matches("[data-jelly-repeat]") && state.draft) {
      readForm();
      state.draft.repeat = target.checked;
      paint();
    } else if (target.matches("[data-jelly-scope]") && state.draft) {
      readForm();
      state.draft.scope = target.value as Draft["scope"];
      paint();
    } else if (target.matches("[data-jelly-note-day]")) {
      state.note.day = target.value || null;
      queueSave(state.note);
      paint();
    } else if (target.matches("[data-jelly-category-name]")) {
      const name = target.value.trim();
      if (name) run(() => saveCategory(target.dataset.jellyCategoryName!, { name }));
    }
  });
  view.addEventListener("submit", (event) => {
    const form = event.target as HTMLFormElement;
    event.preventDefault();
    if (form.matches("[data-jelly-category-new]")) {
      const input = form.elements.namedItem("name") as HTMLInputElement,
        name = input.value.trim();
      if (name)
        run(async () => {
          await call(host, "jelly.category.save", {
            name,
            color:
              TONE_COLORS[(["blue", "green", "amber", "purple", "teal", "red"] as const)[state.categories.length % 6]!],
          });
          await refresh();
          view.querySelector<HTMLInputElement>("[data-jelly-category-new] input")?.focus();
        });
    } else if (form.matches("[data-jelly-form]")) run(saveEntry);
  });
  view.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement;
    if (event.key === "Enter" && target.matches("[data-jelly-quick]")) {
      event.preventDefault();
      run(() => quickAdd(target as HTMLInputElement));
    } else if (event.key === "Escape" && (state.draft || state.categoriesOpen)) {
      state.draft = null;
      state.categoriesOpen = false;
      paint();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      run(async () => {
        await saveNote(state.dayNote);
        await saveNote(state.note);
        paintStatus();
      });
    }
  });
  view.addEventListener("focusout", (event) => {
    const target = event.target as HTMLElement;
    if (target.matches("[data-jelly-note-body]")) {
      const editor = target.closest("[data-jelly-day-note]") ? state.dayNote : state.note;
      run(async () => {
        await saveNote(editor);
        paintStatus();
      });
    }
  });
}
