import { renderBar } from "./bar.js";
import { admitFiles } from "./admit.js";
import { flushEdit } from "./edit.js";
import { filePathOf, hasFile, itemById, items, quotePath, runtime } from "./model.js";
import { expandShelfStage, paintPreview, readFullText } from "./preview.js";
import { load } from "./snapshot.js";
import type { ShelfPage, ShelfTui } from "./types.js";

const tui = (): ShelfTui | null => globalThis.molisWorkShelfTui ?? null;

/** Says something in the bar's hint and keeps it there until the next thing is said. */
function hint(page: ShelfPage, text: string): false {
  page.stickyHint = text;
  renderBar(page, page.lastBarKind);
  return false;
}

export function openTui(page: ShelfPage): void {
  const live = runtime(page);
  const actor = page.bench.querySelector("[data-shelf-tty-actor]");
  if (actor) actor.textContent = live.runtime_key ? page.L("shelf.tui.agent-sent-to-the-terminal", { agent: live.title }) : page.L("shelf.tui.no-terminal-agent-found");
  tui()?.open();
}

/** Sends a line to the terminal Agent; false when it did not go (and the person is told why). */
export function sendToTui(page: ShelfPage, text: string): boolean {
  const line = String(text || "").trim();
  if (!line) return false;
  if (!runtime(page).executable) return hint(page, page.L("shelf.tui.no-terminal-agent-found-the"));
  const bridge = tui();
  if (!bridge) return hint(page, page.L("shelf.tui.the-terminal-is-not-connected"));
  page.stage.classList.add("is-talk");
  expandShelfStage(page, true);
  openTui(page);
  renderBar(page, page.lastBarKind);
  if (bridge.send(line) === false) return hint(page, page.L("shelf.tui.the-terminal-is-not-connected"));
  return true;
}

const ttyInput = (page: ShelfPage) => page.bench.querySelector<HTMLInputElement>("[data-shelf-tty-input]");
const carriesShelf = (types: readonly string[]): boolean => types.includes("application/x-molis-shelf") || types.includes("Files");

/** The paths a drop on the terminal pane hands over: the shelf's own rows, or a file from outside shelved first. */
async function droppedPaths(page: ShelfPage, internal: string, files: File[]): Promise<string[]> {
  if (internal) {
    const picked = page.selection.has(internal) && page.selection.size > 1
      ? items(page).filter((item) => page.selection.has(item.item_id))
      : items(page).filter((item) => item.item_id === internal);
    return picked.filter(hasFile).map((item) => filePathOf(page, item)).filter(Boolean);
  }
  await admitFiles(page, files);
  return items(page).filter((item) => page.selection.has(item.item_id)).map((item) => filePathOf(page, item)).filter(Boolean);
}

async function dropOnTty(page: ShelfPage, event: Event): Promise<void> {
  const transfer = (event as DragEvent).dataTransfer;
  const internal = transfer?.getData("application/x-molis-shelf") || "";
  const files = [...(transfer?.files || [])];
  if (!internal && !files.length) return;
  // Dropping on the AI pane sends it to the terminal, with whatever is typed.
  event.preventDefault();
  event.stopPropagation();
  const field = ttyInput(page);
  const typed = field?.value?.trim() || "";
  const paths = await droppedPaths(page, internal, files);
  const line = [typed, ...paths.map(quotePath)].filter(Boolean).join(" ");
  if (line && sendToTui(page, line) && field) field.value = "";
}

/** The wheel's 发给终端 lands here: the copies go to the terminal, never to a job. */
async function sendFromWheel(page: ShelfPage, event: Event): Promise<void> {
  const detail = (event as CustomEvent<{ item_ids?: string[]; text?: string } | null>).detail;
  const ids = detail?.item_ids || [];
  if (!ids.length) return;
  try {
    await flushEdit(page);
    await load(page);
  } catch {
    return;
  }
  const live = runtime(page);
  if (live.runtime_key === "" || !live.executable) {
    page.stickyHint = page.L("shelf.tui.no-terminal-agent-found-the");
    paintPreview(page);
    return;
  }
  if (typeof detail?.text === "string" && detail.text.trim()) { sendToTui(page, detail.text); return; }
  const picked = ids.map((id) => itemById(page, id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const paths = await Promise.all(picked.map(async (item) => item.kind === "url" ? await readFullText(page, item) : quotePath(filePathOf(page, item))));
  if (paths.length) sendToTui(page, paths.join(" "));
}

export function installTui(page: ShelfPage): void {
  const { lifetime, bench, stage } = page;
  lifetime.listen(ttyInput(page), "keydown", (event) => {
    const key = event as KeyboardEvent;
    if (key.key !== "Enter" || key.isComposing) return;
    event.preventDefault();
    const field = event.currentTarget as HTMLInputElement;
    const text = field.value.trim();
    if (text && sendToTui(page, text)) field.value = "";
  });
  const tty = bench.querySelector<HTMLElement>("[data-shelf-tty]");
  lifetime.listen(tty, "dragover", (event) => {
    const transfer = (event as DragEvent).dataTransfer;
    if (!transfer || !carriesShelf([...transfer.types])) return;
    event.preventDefault();
    event.stopPropagation();
    transfer.dropEffect = "copy";
  });
  if (tty) window.molisDropZone?.(tty, (on) => tty.classList.toggle("is-drop", on), carriesShelf);
  lifetime.listen(tty, "drop", (event) => dropOnTty(page, event));
  lifetime.listen(bench.querySelector("[data-shelf-fold-talk]"), "click", () => {
    stage.classList.remove("is-talk");
    renderBar(page, page.lastBarKind);
  });
  lifetime.listen(window, "molis-shelf-tui-unsent", (event) => {
    const detail = (event as CustomEvent<{ texts?: string[]; message?: string } | null>).detail;
    const field = ttyInput(page);
    if (field) { field.value = [...(detail?.texts || []), field.value].filter(Boolean).join(" "); field.focus(); }
    page.stickyHint = String(detail?.message || page.L("shelf.tui.the-terminal-is-not-connected"));
    renderBar(page, page.lastBarKind);
  });
  lifetime.listen(window, "molis-shelf-send-tui", (event) => sendFromWheel(page, event));
}
