import { openGeneric } from "./dialog.js";
import { flushEditor } from "./notes.js";
import { run } from "./page.js";
import { command } from "./workspace.js";
import { TONES, TONE_COLORS, esc, toneOf } from "./util.js";
import type { JellyPage } from "./types.js";

const paint = (page: JellyPage): string => {
  const { btn, tx } = page;
  const rows = page.ws().categories.map((entry) => {
    const fixed = entry.id === "uncategorized";
    const palette = TONES.map((tone) => `<button type="button" class="mw-btn mw-btn--ghost" data-jelly-category-color="${tone}" data-id="${esc(entry.id)}" aria-label="${tone}" aria-pressed="${toneOf(entry.color) === tone}"><span class="jelly-color" data-tone="${tone}"></span></button>`).join("");
    return `<div class="jelly-category-row" data-jelly-category-row="${esc(entry.id)}">${page.categoryDot(entry.id)}<input class="mw-input" data-jelly-category-name="${esc(entry.id)}" value="${page.catName(entry)}" aria-label="${tx("jelly.category.name")}" ${fixed ? "disabled" : ""}>`
      + `${btn("jelly.action.save", `data-jelly-category-save="${esc(entry.id)}"`, "check")}<div class="jelly-category-palette">${palette}</div>${btn("jelly.category.move-up", `data-jelly-category-up="${esc(entry.id)}"`, "chevron-up")}${fixed ? "" : btn("jelly.action.delete", `data-jelly-category-delete="${esc(entry.id)}"`, "trash")}</div>`;
  }).join("");
  return `${rows}<div class="jelly-category-row"><input class="mw-input" data-jelly-category-new placeholder="${tx("jelly.category.new-name")}">${btn("jelly.action.add", "data-jelly-category-add", "plus")}</div><p class="jelly-muted">${tx("jelly.category.delete-help")}</p>`;
};

/** One edit of the category list; false when the click was not an edit. */
async function applyCategoryEdit(page: JellyPage, target: HTMLElement, body: HTMLElement): Promise<boolean> {
  const data = target.dataset;
  if (target.hasAttribute("data-jelly-category-save")) {
    const id = data.jellyCategorySave ?? "";
    await command(page, { type: "category.update", id, patch: { name: page.$<HTMLInputElement>(`[data-jelly-category-name="${CSS.escape(id)}"]`, body).value } });
  } else if (target.hasAttribute("data-jelly-category-color")) {
    await command(page, { type: "category.update", id: data.id, patch: { color: TONE_COLORS[(data.jellyCategoryColor ?? "blue") as keyof typeof TONE_COLORS] } });
  } else if (target.hasAttribute("data-jelly-category-delete")) await command(page, { type: "category.delete", id: data.jellyCategoryDelete });
  else if (target.hasAttribute("data-jelly-category-up")) {
    const ids = page.ws().categories.map((entry) => entry.id);
    const index = ids.indexOf(data.jellyCategoryUp ?? "");
    if (index > 0) {
      [ids[index - 1], ids[index]] = [ids[index] ?? "", ids[index - 1] ?? ""];
      await command(page, { type: "category.reorder", ids });
    }
  } else if (target.hasAttribute("data-jelly-category-add")) {
    const name = page.$<HTMLInputElement>("[data-jelly-category-new]", body).value.trim();
    if (!name) return false;
    await command(page, { type: "category.create", category: { name, color: TONE_COLORS.blue } });
  } else return false;
  return true;
}

export async function openCategories(page: JellyPage): Promise<void> {
  await flushEditor(page);
  openGeneric(page, "jelly.category.manage", paint(page), "jelly.action.done", async () => undefined);
  const body = page.$("[data-jelly-dialog-body]");
  body.onclick = (event) => void run(page, async () => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (target && await applyCategoryEdit(page, target, body)) body.innerHTML = paint(page);
  });
  page.dialog.cleanup = () => { body.onclick = null; };
}
