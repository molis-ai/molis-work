import { renderBar } from "./bar.js";
import { fillConfirm } from "./confirm.js";
import { closest } from "./dom.js";
import { showActionComposer, saveSettings } from "./composer.js";
import { flushEdit, stopEdit } from "./edit.js";
import { joinClips } from "./clips.js";
import { chosenOption, hiddenActions, items, recipeForAct, shortcutFor } from "./model.js";
import { expandShelfStage, paintPreview, syncShelfStage } from "./preview.js";
import { paintLists } from "./rows.js";
import { post } from "./request.js";
import { applySnapshot } from "./snapshot.js";
import { openTui } from "./tui.js";
import type { ShelfPage, SnapshotAnswer } from "./types.js";

type Handler = (page: ShelfPage, event: Event) => boolean | Promise<boolean>;

/** Opening or closing the dialog for a new action. */
const composerClick: Handler = async (page, event) => {
  if (closest(event, "[data-shelf-new-action]")) { await showActionComposer(page); return true; }
  if (closest(event, "[data-shelf-create-cancel]")) {
    page.composingAction = false;
    paintPreview(page);
    syncShelfStage(page);
    return true;
  }
  return false;
};

/** Back to the lists: nothing is chosen, the stage folds. */
const collapseClick: Handler = async (page, event) => {
  const back = closest(event, "[data-shelf-collapse]") as HTMLButtonElement | null;
  if (!back) return false;
  event.preventDefault();
  if (back.disabled) return true;
  const editor = page.preview.querySelector<HTMLTextAreaElement>("[data-shelf-editor]");
  back.disabled = true;
  if (editor) editor.readOnly = true;
  try {
    await flushEdit(page);
  } catch {
    editor?.focus();
    return true;
  } finally {
    back.disabled = false;
    if (editor) editor.readOnly = false;
  }
  Object.assign(page, { composingAction: false, selected: null, selection: new Set(), selClip: null, clipSelection: new Set(), selectedChild: null, pending: null, compare: false, editing: false });
  expandShelfStage(page, false);
  paintLists(page);
  paintPreview(page);
  return true;
};

/** A failed result's way back to the materials it came from. */
const retryClick: Handler = (page, event) => {
  if (!closest(event, "[data-shelf-retry]") || !page.selected) return false;
  const back = (page.selected.source_item_ids || []).filter((id) => items(page).some((item) => item.item_id === id));
  if (!back.length) return true;
  page.selected = items(page).find((item) => item.item_id === back[0]) || null;
  page.selection = new Set(back);
  page.selClip = null;
  page.pending = null;
  paintLists(page);
  paintPreview(page);
  syncShelfStage(page);
  return true;
};

const sourceClick: Handler = (page, event) => {
  const button = closest(event, "[data-shelf-source]");
  if (!button || !page.compare) return false;
  page.compareSourceId = button.dataset.shelfSource ?? null;
  paintPreview(page);
  return true;
};

/** The ··· menu of the bar: open or close it, start arranging. */
const moreClick: Handler = (page, event) => {
  const menu = page.bench.querySelector<HTMLElement>("[data-shelf-more-menu]");
  if (menu && !closest(event, ".shelf-more")) menu.hidden = true;
  if (closest(event, "[data-shelf-more]") && !closest(event, "[data-shelf-more-menu]")) {
    if (menu) menu.hidden = !menu.hidden;
    return true;
  }
  if (!closest(event, "[data-shelf-arrange]")) return false;
  page.arranging = !page.arranging;
  renderBar(page, page.lastBarKind);
  return true;
};

/** Taking an action off the bar, or putting it back. */
const hiddenActionClick: Handler = async (page, event) => {
  const hide = closest(event, "[data-shelf-hide-act]")?.dataset.shelfHideAct;
  const restore = closest(event, "[data-shelf-restore-act]")?.dataset.shelfRestoreAct;
  const slot = hide || restore;
  if (!slot) return false;
  const next = new Set(hiddenActions(page));
  if (hide) next.add(slot);
  else next.delete(slot);
  await saveSettings(page, { hidden_actions: [...next] }).catch(() => undefined);
  renderBar(page, page.lastBarKind);
  return true;
};

const pickClick: Handler = async (page, event) => {
  if (closest(event, "[data-shelf-pick]") || closest(event, "[data-shelf-act=pick]")) { page.fileInput?.click(); return true; }
  if (!closest(event, "[data-shelf-sample]")) return false;
  const payload = await post<SnapshotAnswer>(page, "/sample");
  applySnapshot(page, payload.snapshot, payload.item?.item_id);
  return true;
};

const choiceClick: Handler = (page, event) => {
  const item = closest(event, "[data-shelf-choice-id]");
  if (!item || !page.pending) return false;
  page.pending = { ...page.pending, option: item.dataset.shelfChoiceId ?? null };
  page.choices[page.pending.recipe] = page.pending.option ?? "";
  fillConfirm(page);
  return true;
};

/** One of the bar's actions: ask for confirmation, open the terminal, use a result as material, or join clips. */
const actClick: Handler = async (page, event) => {
  const act = closest(event, "[data-shelf-act]");
  if (act?.getAttribute("aria-disabled") === "true" || (page.arranging && act?.closest("[data-shelf-act-slot]"))) return true;
  const slot = act?.dataset.shelfAct || "";
  const shortcut = slot.startsWith("shortcut:") ? shortcutFor(page, slot) : null;
  const recipe = !shortcut && act ? recipeForAct(page, slot) : null;
  if ((shortcut || recipe) && page.selected && !page.selClip) {
    if (page.editing) await stopEdit(page);
    page.pending = recipe ? { recipe: recipe.recipe, option: chosenOption(page, recipe), shortcut: null } : { recipe: "shortcut", option: null, shortcut };
    page.stage.classList.add("is-confirm");
    fillConfirm(page);
    paintLists(page);
    renderBar(page, page.lastBarKind);
    return true;
  }
  if (slot === "talk") {
    page.stage.classList.toggle("is-talk");
    if (page.stage.classList.contains("is-talk")) openTui(page);
    renderBar(page, page.lastBarKind);
  } else if (slot === "use" && page.selected) {
    const payload = await post<SnapshotAnswer>(page, "/items/" + encodeURIComponent(page.selected.item_id) + "/use-material");
    applySnapshot(page, payload.snapshot, payload.item?.item_id);
  } else if (slot === "join") {
    const ids = page.clipSelection.size ? [...page.clipSelection] : (page.selClip ? [page.selClip.clip_id] : []);
    if (ids.length) await joinClips(page, ids);
  }
  return true;
};

const HANDLERS: readonly Handler[] = [composerClick, collapseClick, retryClick, sourceClick, moreClick, hiddenActionClick, pickClick, choiceClick, actClick];

/** Clicks outside the directory run through the handlers in turn; the first that takes it ends the turn. */
export async function benchClick(page: ShelfPage, event: Event): Promise<void> {
  if (page.directory.contains(event.target as Node)) return;
  for (const handler of HANDLERS) if (await handler(page, event)) return;
}

