import { make } from "./dom.js";
import type { PagesPage } from "./page.js";

export function closeMore(page: PagesPage) {
  const { moreMenu, moreButton } = page;
  if (!moreMenu || !moreButton) return;
  moreMenu.hidden = true;
  moreButton.setAttribute("aria-expanded", "false");
}

export function toggleMore(page: PagesPage) {
  const { moreMenu, moreButton } = page;
  if (!moreMenu || !moreButton) return;
  const open = moreMenu.hidden;
  moreMenu.hidden = !open;
  moreButton.setAttribute("aria-expanded", String(open));
  if (open) closeCreate(page);
}

export function closeCreate(page: PagesPage) {
  const { createMenu, createMore } = page;
  if (!createMenu || !createMore) return;
  createMenu.hidden = true;
  createMore.setAttribute("aria-expanded", "false");
}

export function toggleCreate(page: PagesPage) {
  const { createMenu, createMore } = page;
  if (!createMenu || !createMore) return;
  const open = createMenu.hidden;
  createMenu.hidden = !open;
  createMore.setAttribute("aria-expanded", String(open));
  if (open) closeMore(page);
}

export function closeMove(page: PagesPage) {
  const { moveMenu } = page;
  if (!moveMenu) return;
  moveMenu.hidden = true;
  page.movingId = "";
  page.els("[data-pages-move][aria-expanded=true]").forEach((node) => {
    node.setAttribute("aria-expanded", "false");
  });
}

/** The folder menu of one document, under the button that opened it. */
export function openMove(page: PagesPage, trigger: HTMLElement, id: string) {
  const { moveMenu, L } = page;
  if (!moveMenu) return;
  const record = page.records.find((item) => item.id === id);
  if (!record) return;
  page.movingId = id;
  moveMenu.replaceChildren();
  const addItem = (folderId: string, label: string) => {
    const item = make("button", "mw-menu__item");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.dataset.pagesMoveTo = folderId;
    const on = (record.folder_id || "") === folderId;
    item.classList.toggle("is-current", on);
    item.setAttribute("aria-selected", String(on));
    item.textContent = label;
    moveMenu.append(item);
  };
  addItem("", L("pages.folder.unfiled"));
  page.folders.forEach((folder) => addItem(folder.id, folder.title));
  page.els("[data-pages-move]").forEach((node) => {
    node.setAttribute("aria-expanded", node === trigger ? "true" : "false");
  });
  moveMenu.hidden = false;
  const box = trigger.getBoundingClientRect();
  const width = Math.max(180, moveMenu.offsetWidth);
  const left = Math.min(Math.max(8, box.right - width), window.innerWidth - width - 8);
  const below = box.bottom + 4;
  const height = moveMenu.offsetHeight;
  const top = below + height > window.innerHeight - 8 ? Math.max(8, box.top - height - 4) : below;
  moveMenu.style.left = left + "px";
  moveMenu.style.top = top + "px";
}

export function fillGoalSelect(page: PagesPage) {
  const { goalSelect, L } = page;
  if (!goalSelect) return;
  const current = page.sel?.goal_id || "";
  goalSelect.replaceChildren();
  const none = document.createElement("option");
  none.value = "";
  none.textContent = L("pages.goal.none");
  goalSelect.append(none);
  page.goals.forEach((goal) => {
    const option = document.createElement("option");
    option.value = goal.id;
    option.textContent = goal.title;
    goalSelect.append(option);
  });
  goalSelect.value = page.goals.some((goal) => goal.id === current) ? current : "";
}

interface GoalsAnswer { readonly goals?: readonly { readonly goal?: { readonly goal_id?: string; readonly title?: string }; readonly goal_id?: string; readonly title?: string }[] }

export async function loadGoals(page: PagesPage) {
  try {
    const payload = await page.host.invokeAction<GoalsAnswer>({ capability_id: "goals.collection.read", version: 2 }, {});
    page.goals = (payload.goals || []).map((item) => ({
      id: item.goal?.goal_id || item.goal_id || "",
      title: item.goal?.title || item.title || "",
    })).filter((item) => item.id);
  } catch {
    page.goals = [];
  }
  fillGoalSelect(page);
}
