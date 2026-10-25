import { escText, escapeAttr, said, setText } from "./dom.js";
import { ai, aiLabel, batch, confirmRecipe, isLocalRecipe } from "./model.js";
import type { ConfirmRecipe, ShelfPage } from "./types.js";

/** The name a shortcut action's result gets: the source's name, a dash and the action's name. */
const shortcutOutput = (sourceName: string, actionName: string): string => {
  const base = String(sourceName || "").replace(/.[^.]+$/, "") || "output";
  const action = String(actionName || "").replace(/[/:*?"<>|]/g, "").trim() || "动作";
  return base + "-" + action + ".md";
};

function facts(page: ShelfPage, recipe: ConfirmRecipe, count: number) {
  const { L } = page;
  const local = isLocalRecipe(recipe);
  return {
    read: L("shelf.confirm.copies-of-count", { count: String(count) }),
    write: L("shelf.confirm.save-a-new-result-keep"),
    network: local ? L("shelf.confirm.off") : L("shelf.confirm.send-materials-to-the-selected"),
    isolation: local ? L("shelf.confirm.on-device-extraction-not-sent") : L("shelf.confirm.no-terminal-or-file-writing"),
  };
}

function actorLine(page: ShelfPage, recipe: ConfirmRecipe): string {
  const { L } = page;
  if (isLocalRecipe(recipe)) return page.selected?.kind === "image" ? L("shelf.confirm.on-device-recognition-not-sent") : L("shelf.confirm.on-device-extraction-not-sent-2");
  if (ai(page).available) return L("shelf.confirm.model-processes-the-selected-materials", { model: aiLabel(page) });
  const reason = ai(page).reason;
  return reason ? said(L, reason) : L("shelf.bar.configure-an-ai-model-first");
}

/** The plate is the same node across choices, so it springs across instead of blinking. */
function movePlate(page: ShelfPage, seg: HTMLElement, instant: boolean): void {
  const plate = seg.querySelector<HTMLElement>("[data-shelf-seg-plate]");
  const active = seg.querySelector<HTMLElement>('[aria-checked="true"]');
  if (!plate) return;
  if (instant) plate.style.transition = "none";
  if (!active) plate.style.width = "0px";
  else {
    plate.style.width = active.offsetWidth + "px";
    plate.style.transform = "translateX(" + (active.offsetLeft - seg.clientLeft) + "px)";
  }
  if (instant) page.lifetime.frame(() => { plate.style.transition = ""; });
}

function paintChoices(page: ShelfPage, recipe: ConfirmRecipe): void {
  const { L, bench, pending, selected } = page;
  const wrap = bench.querySelector<HTMLElement>("[data-shelf-choice]");
  const seg = bench.querySelector<HTMLElement>("[data-shelf-seg]");
  if (!wrap || !seg) return;
  const imageText = recipe.recipe === "extract_text" && selected?.kind === "image";
  const list = recipe.recipe === "extract_text" && !imageText ? [] : (recipe.choices || []);
  wrap.hidden = list.length === 0;
  if (!list.length) { seg.innerHTML = ""; return; }
  setText(bench, "[data-shelf-choice-label]", recipe.choice_label ? said(L, recipe.choice_label) : "");
  setText(bench, "[data-shelf-choice-hint]", recipe.choice_hint ? said(L, recipe.choice_hint) : "");
  const current = pending ? pending.option : recipe.default_choice;
  const rebuild = seg.dataset.shelfRecipe !== recipe.recipe;
  if (rebuild) {
    seg.dataset.shelfRecipe = recipe.recipe;
    seg.innerHTML = '<span class="shelf-seg-plate" data-shelf-seg-plate aria-hidden="true"></span>' + list.map((choice) =>
      '<span class="shelf-seg-item" role="radio" tabindex="0" data-shelf-choice-id="' + escapeAttr(choice.id) + '">' + escText(said(L, choice.title)) + "</span>").join("");
  }
  seg.querySelectorAll<HTMLElement>("[data-shelf-choice-id]").forEach((item) => {
    item.setAttribute("aria-checked", String(item.dataset.shelfChoiceId === current));
  });
  movePlate(page, seg, rebuild);
}

/** The result's file name the drawer promises. */
function outputName(page: ShelfPage, recipe: ConfirmRecipe): string {
  const { selected, pending } = page;
  if (!selected) return "";
  if (recipe.recipe === "shortcut") return shortcutOutput(selected.name, recipe.label);
  if (recipe.recipe === "extract_text") return selected.kind === "pdf" ? "pdf.md" : selected.kind === "image" ? "ocr.md" : "extract.md";
  return recipe.recipe === "extract_structure" && pending?.option !== "json" ? "extracted.md" : recipe.output_file;
}

function confirmTitle(page: ShelfPage, recipe: ConfirmRecipe): string {
  const { L, selected } = page;
  if (recipe.recipe !== "extract_text") return said(L, recipe.label);
  return selected?.kind === "pdf" ? L("shelf.confirm.extract-pdf-text") : selected?.kind === "image" ? L("shelf.confirm.extract-image-text") : L("shelf.confirm.extract-text");
}

export function fillConfirm(page: ShelfPage): void {
  const { L, bench, selected, pending } = page;
  const recipe = confirmRecipe(page);
  if (!recipe || !selected || !pending) return;
  const picked = batch(page);
  const title = confirmTitle(page, recipe);
  const option = (recipe.choices || []).find((choice) => choice.id === pending.option);
  setText(bench, "[data-shelf-confirm-title]", option ? title + " · " + said(L, option.title) : title);
  setText(bench, "[data-shelf-confirm-count]", L("shelf.confirm.count", { count: String(picked.length) }));
  setText(bench, "[data-shelf-confirm-out]", L("shelf.confirm.creates-name-your-original-file", { name: outputName(page, recipe) }));
  const fact = facts(page, recipe, picked.length);
  for (const key of ["read", "write", "network", "isolation"] as const) setText(bench, '[data-shelf-fact="' + key + '"]', fact[key]);
  setText(bench, "[data-shelf-actor]", actorLine(page, recipe));
  setText(bench, "[data-shelf-run]", isLocalRecipe(recipe) ? L("shelf.confirm.start-extraction") : L("shelf.confirm.start-processing"));
  setText(bench, "[data-shelf-back]", L("shelf.confirm.back"));
  paintChoices(page, recipe);
}
