import { el } from "./dom.js";
import { keyLabel, matches } from "./matching.js";
import type { Command } from "./slash-menu.js";
import type { PagePorts } from "./types.js";

/** A session the palette lists. */
export interface SessionLine { readonly session_id: string; readonly title: string; readonly state_label?: string }

export interface PalettePorts extends Pick<PagePorts, "lifetime" | "translate" | "q" | "current"> {
  readonly commands: () => readonly Command[];
  readonly sessions: () => readonly SessionLine[];
  readonly openSession: (id: string, title: string) => unknown;
}

/** One line of the palette: a command or a session. */
interface Entry {
  readonly kind: string;
  readonly label: string;
  readonly detail: string;
  readonly keys?: string;
  readonly run: () => unknown;
  readonly words: readonly string[];
}

interface Palette {
  readonly ports: PalettePorts;
  readonly run: (entry: { readonly run: () => unknown }) => Promise<void>;
  readonly dialog: HTMLDialogElement;
  readonly field: HTMLInputElement;
  readonly list: HTMLElement;
  entries: Entry[];
  selected: number;
  returnFocus: Element | null;
}

const LIMIT = 60;

function entriesOf(palette: Palette): Entry[] {
  const { ports } = palette, L = ports.translate;
  const commands = ports.commands().filter(command => command.enabled !== false).map((command): Entry => ({ kind: L("coding.slash.label"), label: command.label, detail: "/" + command.slash, keys: command.keys, run: command.run, words: [command.slash, ...(command.keywords || [])] }));
  const sessions = ports.sessions().filter(session => session.session_id !== ports.current()).map((session): Entry => ({ kind: L("coding.palette.session"), label: session.title, detail: session.state_label || "", run: () => ports.openSession(session.session_id, session.title), words: [] }));
  return [...commands, ...sessions];
}

function entryRow(palette: Palette, entry: Entry, index: number) {
  const item = el("li", "", "coding-palette-item");
  item.id = "coding-palette-" + index;
  item.setAttribute("role", "option");
  item.setAttribute("aria-selected", String(index === palette.selected));
  item.append(el("span", entry.kind, "coding-palette-kind"), el("span", entry.label, "coding-palette-label"), el("span", entry.detail, "coding-palette-detail"));
  if (entry.keys) item.append(el("kbd", keyLabel(entry.keys), "mw-kbd"));
  palette.ports.lifetime.listen(item, "mousedown", event => {
    event.preventDefault();
    choose(palette, index);
  });
  return item;
}

function draw(palette: Palette) {
  const { field, list } = palette;
  palette.entries = entriesOf(palette).filter(entry => matches(field.value, entry.label, entry.detail, ...entry.words)).slice(0, LIMIT);
  palette.selected = Math.min(palette.selected, Math.max(palette.entries.length - 1, 0));
  list.replaceChildren();
  if (!palette.entries.length) list.append(el("li", palette.ports.translate("coding.palette.none"), "coding-palette-empty"));
  palette.entries.forEach((entry, index) => list.append(entryRow(palette, entry, index)));
  field.setAttribute("aria-activedescendant", palette.entries.length ? "coding-palette-" + palette.selected : "");
  list.children[palette.selected]?.scrollIntoView({ block: "nearest" });
}

function choose(palette: Palette, index: number) {
  const entry = palette.entries[index];
  if (!entry) return;
  palette.dialog.close();
  void palette.run(entry);
}

export interface PaletteControl { readonly open: () => void; readonly close: () => void; readonly isOpen: () => boolean }

/** The palette: every command and every session, one list, opened with Mod+Shift+P. */
export function commandPalette(ports: PalettePorts, run: Palette["run"]): PaletteControl {
  const { lifetime, q } = ports;
  const palette: Palette = { ports, run, dialog: q<HTMLDialogElement>("[data-coding-palette]"), field: q<HTMLInputElement>("[data-coding-palette-input]"), list: q("[data-coding-palette-list]"), entries: [], selected: 0, returnFocus: null };
  const { dialog, field } = palette;
  const open = () => {
    if (dialog.open) return;
    palette.returnFocus = document.activeElement;
    field.value = "";
    palette.selected = 0;
    draw(palette);
    dialog.showModal();
    field.focus();
  };
  const close = () => {
    if (!dialog.open) return;
    dialog.close();
    if (palette.returnFocus instanceof HTMLElement && palette.returnFocus.isConnected) palette.returnFocus.focus({ preventScroll: true });
  };
  lifetime.listen(field, "input", () => {
    palette.selected = 0;
    draw(palette);
  });
  lifetime.listen(field, "keydown", event => {
    if (!(event instanceof KeyboardEvent) || event.isComposing || event.keyCode === 229) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (palette.entries.length) {
        palette.selected = (palette.selected + (event.key === "ArrowDown" ? 1 : palette.entries.length - 1)) % palette.entries.length;
        draw(palette);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(palette, palette.selected);
    }
  });
  lifetime.listen(dialog, "cancel", event => {
    event.preventDefault();
    close();
  });
  lifetime.listen(dialog, "click", event => {
    if (event.target === dialog) close();
  });
  return { open, close, isOpen: () => dialog.open };
}
