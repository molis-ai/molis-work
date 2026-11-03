import { messageOf } from "./dom.js";
import * as record from "./record-commands.js";
import * as slide from "./slide-commands.js";
import type { Failure, PptPage } from "./types.js";

type Run = (page: PptPage, found: HTMLElement, button: HTMLButtonElement) => void | Promise<void>;

/** One thing a click can mean: how to find its control from the click, and what to do. `needsOpen` ones wait for a deck in the editor. */
interface Command {
  find(target: Element, button: HTMLButtonElement): HTMLElement | null;
  needsOpen: boolean;
  run: Run;
}

const at = (selector: string) => (target: Element) => target.closest<HTMLElement>(selector);
const always = (selector: string, run: Run): Command => ({ find: at(selector), needsOpen: false, run });
const withOpen = (selector: string, run: Run): Command => ({ find: at(selector), needsOpen: true, run });

/** In the order they are looked for: the first control the click is inside (and that can be used now) is the command. */
const COMMANDS: readonly Command[] = [
  { find: (_target, button) => button.closest<HTMLElement>("[data-ppt-reload]"), needsOpen: true, run: (page) => record.reload(page) },
  withOpen("[data-ppt-swatch]", (page, found) => slide.pickColor(page, found)),
  always("[data-ppt-new]", (page) => record.createDeck(page)),
  always("[data-ppt-artifact]", (page, found) => record.pinFixed(page, found.dataset.pptArtifact || "")),
  always("[data-ppt-id]", (page, found) => record.openDeck(page, found.dataset.pptId ?? "")),
  always("[data-ppt-back]", (page) => record.backToList(page)),
  withOpen("[data-ppt-outline-open]", (page) => page.openOutline()),
  withOpen("[data-ppt-add-slide]", (page) => slide.addSlide(page)),
  withOpen("[data-slide-select]", (page, found) => slide.selectSlide(page, found.closest<HTMLElement>("[data-slide-id]")!)),
  withOpen("[data-slide-move]", (page, found) => slide.moveSlide(page, found)),
  withOpen("[data-slide-remove]", (page, found) => slide.removeSlide(page, found)),
  withOpen("[data-ppt-present]", (page) => slide.presentDeck(page)),
  withOpen("[data-ppt-export]", (page, found) => record.exportDeck(page, found)),
  withOpen("[data-ppt-delete]", (page) => record.deleteDeck(page)),
];

/** Runs the command a click means, holding the editor busy for its whole length. */
async function onClick(page: PptPage, event: Event): Promise<void> {
  const { L, s } = page;
  const target = event.target as Element;
  const button = target.closest("button");
  if (!button || button.closest("dialog") || button.disabled || s.busy) return;
  page.setBusy(true);
  try {
    for (const command of COMMANDS) {
      const found = command.find(target, button);
      if (!found || (command.needsOpen && !s.selected)) continue;
      await command.run(page, found, button);
      return;
    }
  } catch (error) {
    if ((error as Failure).code === "ppt.conflict") s.saveError = error;
    page.showNote(messageOf(error) || L("ppt.error.request"), true);
  } finally {
    page.setBusy(false);
  }
}

/** The page's own controls: clicks, and typing in the deck's fields. */
export function installCommands(page: PptPage): void {
  const { el, s } = page;
  el.bench.addEventListener("click", (event) => void onClick(page, event));
  el.bench.addEventListener("input", (event) => {
    if (s.busy || !(event.target as Element).closest(".ppt-workspace") || !s.selected) return;
    s.selected = page.liveRecord();
    page.paintView(s.selected);
    if (event.target === el.slideTitle) page.syncSlideLabel();
    page.queueSave();
  });
}
