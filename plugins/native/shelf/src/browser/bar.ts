import { escText, escapeAttr, said } from "./dom.js";
import { actIdFor, agentMissing, ai, actionOrder, batch, hasFile, hiddenActions, recipeFor, runtime, shortcutFor, stageBusy } from "./model.js";
import { opSvg } from "./rows.js";
import type { BarKind, Item, Recipe, ShelfPage, Shortcut } from "./types.js";

const RECIPE_ICON: Record<string, string> = { extract: "file", summarize: "rows", extract_structure: "code", translate: "globe", redact: "shield", to_markdown: "note", combine: "impact" };

const defaultIcon = (id: string): string => id === "use" || id === "join" ? "download" : id === "talk" ? "message" : id === "pick" ? "plus" : "list";
const defaultTone = (id: string): string => id === "extract" ? "clay" : id === "use" || id === "join" ? "ochre" : id === "talk" ? "plum" : "slate";

export const recipeSvg = (id: string, tone?: string): string =>
  '<svg class="tone-' + (tone || defaultTone(id)) + '" aria-hidden="true"><use href="#icon-' + (RECIPE_ICON[id] || defaultIcon(id)) + '"></use></svg>';

export function actButton(page: ShelfPage, label: string, id: string, enabled: boolean, title?: string, tone?: string): string {
  return '<span class="shelf-act' + (id === "talk" && page.stage.classList.contains("is-talk") ? " is-on" : "") + '" role="button" tabindex="' + (enabled ? "0" : "-1") + '" data-shelf-act="' + escapeAttr(id) + '"'
    + (enabled ? "" : ' aria-disabled="true"') + (title ? ' title="' + escapeAttr(title) + '"' : "") + ">" + recipeSvg(id, tone) + escText(label) + "</span>";
}

function actChip(page: ShelfPage, id: string, label: string, enabled: boolean, title: string, tone: string, slot: string): string {
  const key = slot || id;
  const hide = page.arranging
    ? '<span class="shelf-act-hide" role="button" tabindex="0" data-shelf-hide-act="' + escapeAttr(key) + '" title="' + escapeAttr(page.L("shelf.bar.remove-from-bar")) + '">' + opSvg("hide") + "</span>"
    : "";
  const grip = page.arranging ? '<span class="shelf-act-grip" aria-hidden="true"></span>' : "";
  return '<span class="shelf-act-wrap" data-shelf-act-slot="' + escapeAttr(key) + '"' + (page.arranging ? ' draggable="true"' : "") + ">" + grip + actButton(page, label, id, enabled, title, tone) + hide + "</span>";
}

function moreButton(page: ShelfPage): string {
  const { L } = page;
  return '<span class="shelf-more"><span class="shelf-act" role="button" tabindex="0" data-shelf-more title="' + escapeAttr(L("shelf.bar.manage-actions")) + '" aria-haspopup="menu">···</span><div class="shelf-more-menu" data-shelf-more-menu hidden><span class="shelf-more-item" role="menuitem" tabindex="0" data-shelf-arrange>'
    + escText(page.arranging ? L("shelf.bar.done-arranging") : L("shelf.bar.arrange-actions")) + '</span><span class="shelf-more-item" role="menuitem" tabindex="0" data-shelf-new-action>' + escText(L("shelf.bar.new-action")) + "</span></div></span>";
}

/** The words under a recipe or shortcut chip: why it is greyed out, or what it does. */
function chipTitle(page: ShelfPage, action: Shortcut | null, recipe: Recipe | null, enough: boolean, needsVision: boolean): string {
  const { L } = page;
  const name = action ? said(L, action.name) : said(L, recipe?.short_title || recipe?.label || "");
  if (!enough) return L("shelf.bar.name-needs-at-least-two", { name });
  if (needsVision) return L("shelf.bar.this-mac-has-no-on");
  if (action) {
    const reason = ai(page).reason;
    return ai(page).available === true ? L("shelf.bar.run-on-a-copy-and") : reason ? said(L, reason) : L("shelf.bar.configure-an-ai-model-first");
  }
  if (recipe?.available === false) return recipe.reason ? said(L, recipe.reason) : "";
  return recipe?.blurb ? said(L, recipe.blurb) : "";
}

/** One action of the bar for the chosen materials, or a way to bring a hidden one back; nothing when it does not fit. */
function actionChip(page: ShelfPage, slot: string, picked: Item[], hidden: Set<string>): string {
  const { L } = page;
  const action = shortcutFor(page, slot);
  const recipe = action ? null : recipeFor(page, slot);
  const spec = action
    ? { id: slot, accepts: action.kinds || [], minimum: 1, tone: "ochre", label: action.name }
    : recipe ? { id: actIdFor(recipe.recipe), accepts: recipe.accepts || [], minimum: recipe.minimum_count || 1, tone: recipe.tone, label: said(L, recipe.short_title || recipe.label) } : null;
  // The kind decides whether an action belongs here at all; too few materials only greys it out, the way DropAgent shows 整合.
  if (!spec || !(picked.length > 0 && picked.every((item) => (spec.accepts as readonly string[]).includes(item.kind)))) return "";
  const enough = picked.length >= spec.minimum;
  if (hidden.has(slot)) {
    return page.arranging ? '<span class="shelf-act" role="button" tabindex="0" data-shelf-restore-act="' + escapeAttr(slot) + '">' + recipeSvg(spec.id, spec.tone) + escText(L("shelf.bar.add-back-to-bar")) + "</span>" : "";
  }
  const imageOnly = recipe?.recipe === "extract_text" && picked.some((item) => item.kind === "image");
  const needsVision = imageOnly && runtime(page).image_text === false;
  const available = action ? ai(page).available === true : recipe?.available !== false && !needsVision;
  return actChip(page, spec.id, spec.label, available && enough && !stageBusy(page), chipTitle(page, action, recipe, enough, needsVision), spec.tone, slot);
}

function paintHint(page: ShelfPage, kind: BarKind): void {
  const hint = page.bench.querySelector<HTMLElement>("[data-shelf-bar-hint]");
  if (!hint) return;
  if (page.stickyHint) {
    hint.hidden = false;
    hint.textContent = page.stickyHint;
    if (page.admitRetry?.hint === page.stickyHint) hint.insertAdjacentHTML("beforeend", ' <button type="button" class="mw-btn mw-btn--link mw-btn--sm" data-shelf-retry-admit>' + escText(page.L("shelf.bar.try-the-ones-not-added")) + "</button>");
    return;
  }
  hint.textContent = page.hintDefault;
  hint.hidden = !(kind === "pdf" || kind === "text" || kind === "markdown" || kind === "image" || kind === "url" || kind === "website") || !agentMissing(page);
}

/** The actions of the bar for the kind of thing chosen. */
function barActions(page: ShelfPage, kind: BarKind): string[] {
  const { L, selected } = page;
  if (kind === "result") return [actButton(page, L("shelf.bar.use-as-material"), "use", hasFile(selected))];
  if (kind === "clipboard") {
    const count = Math.max(page.clipSelection.size, page.selClip ? 1 : 0);
    return [actButton(page, count > 1 ? L("shelf.bar.add-to-materials") + " · " + count : L("shelf.bar.add-to-materials"), "join", true)];
  }
  const picked = batch(page);
  const hidden = hiddenActions(page);
  return actionOrder(page).map((slot) => actionChip(page, slot, picked, hidden)).filter(Boolean);
}

export function renderBar(page: ShelfPage, kind: BarKind): void {
  const { L, bar } = page;
  if (!page.lifetime.alive) return;
  page.lastBarKind = kind;
  paintHint(page, kind);
  if (kind === "empty") {
    bar.innerHTML = actButton(page, L("shelf.bar.new"), "pick", true);
    return;
  }
  bar.innerHTML = '<div class="shelf-bar-scroll">' + barActions(page, kind).join("") + "</div>"
    + '<span class="shelf-act-rule" data-shelf-act-rule aria-hidden="true"></span>'
    + actButton(page, L("shelf.bar.conversation"), "talk", true, L("shelf.bar.open-the-terminal-session-this"))
    + moreButton(page);
}

