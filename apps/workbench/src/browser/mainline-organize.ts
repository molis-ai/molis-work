import type { MainlineGroup } from "@molis-ai/molis-work-contracts/services/mainline";
import { escapeHtml as e, icon, renderButton, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { groupDisplayName, itemDisplayTitle, type MainlineViewResponse } from "./mainline-types.js";

export interface OrganizePorts {
  read(): MainlineViewResponse | null;
  refresh(): Promise<MainlineViewResponse | null>;
  call(path: string, body: Record<string, unknown>): Promise<unknown>;
  toast(message: string, isError?: boolean): void;
  notifyChanged(): Promise<void>;
}

function renderCard(view: MainlineViewResponse, groupId: string, itemId: string, pinned: boolean, index: number, total: number, selected: ReadonlySet<string>): string {
  const item = view.mainline.items.find((entry) => entry.item_id === itemId);
  const res = view.resolved[itemId];
  const title = itemDisplayTitle(res, item?.name);
  const count = view.counts.items[itemId] ?? { waiting: 0, running: 0 };
  const badges: string[] = [];
  if (count.waiting > 0) badges.push(`<span class="ml-badge-wait">${e(uiText.text("workbench.mainline.waiting-badge", { n: count.waiting }))}</span>`);
  if (count.running > 0) badges.push(`<span>${e(uiText.text("workbench.mainline.running-badge", { n: count.running }))}</span>`);
  if (res?.plugin_title) badges.push(`<span>${e(res.plugin_title)}</span>`);
  const checked = selected.has(itemId) ? " checked" : "";
  return `<div class="ml-org-card" draggable="true" data-org-card="${e(itemId)}" data-org-group="${e(groupId)}" data-org-index="${index}">`
    + `<input class="mw-check" type="checkbox" data-org-select="${e(itemId)}" aria-label="${e(uiText.text("workbench.mainline.select-item", { name: title }))}"${checked}>`
    + `<div class="ml-org-card-main"><span class="ml-org-card-title">${e(title)}</span>${badges.length ? `<div class="ml-org-card-meta">${badges.join("")}</div>` : ""}</div>`
    + `<div class="ml-org-card-acts">`
    + (index > 0 ? `<button class="ml-icon-btn" type="button" data-org-up="${e(itemId)}" data-org-group="${e(groupId)}" aria-label="${e(uiText.text("workbench.mainline.move-up"))}">${icon("chevron-up")}</button>` : "")
    + (index + 1 < total ? `<button class="ml-icon-btn" type="button" data-org-down="${e(itemId)}" data-org-group="${e(groupId)}" aria-label="${e(uiText.text("workbench.mainline.move-down"))}">${icon("chevron-down")}</button>` : "")
    + `<button class="ml-icon-btn" type="button" data-org-pin="${e(itemId)}" data-org-group="${e(groupId)}" data-org-pinned="${pinned}" aria-label="${e(uiText.text(pinned ? "workbench.mainline.unpin" : "workbench.mainline.pin"))}">${icon("pin")}</button>`
    + `<button class="ml-icon-btn" type="button" data-org-done="${e(itemId)}" aria-label="${e(uiText.text("workbench.mainline.mark-done"))}">${icon("check")}</button>`
    + `<button class="ml-icon-btn" type="button" data-org-remove="${e(itemId)}" aria-label="${e(uiText.text("workbench.mainline.remove-item"))}">${icon("x")}</button>`
    + `</div></div>`;
}

function renderColumn(view: MainlineViewResponse, group: MainlineGroup, selected: ReadonlySet<string>, canDelete: boolean, renamingId: string | null): string {
  const name = groupDisplayName(group);
  const head = renamingId === group.group_id
    ? `<form class="ml-organize-add" data-org-rename-form="${e(group.group_id)}"><input class="mw-input ml-create-input" type="text" data-org-rename-input value="${e(name)}" maxlength="200" required>${renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.mainline.save-name"), attrs: { type: "submit", "data-org-rename-submit": "" } })}</form>`
    : `<strong>${e(name)} (${group.items.length})</strong>`
      + `<button class="ml-icon-btn" type="button" data-org-group-rename="${e(group.group_id)}" aria-label="${e(uiText.text("workbench.mainline.rename-group"))}" title="${e(uiText.text("workbench.mainline.rename-group"))}">${icon("edit")}</button>`
      + (canDelete ? `<button class="ml-icon-btn" type="button" data-org-group-delete="${e(group.group_id)}" aria-label="${e(uiText.text("workbench.mainline.delete-group"))}" title="${e(uiText.text("workbench.mainline.delete-group"))}">${icon("x")}</button>` : "");
  const cards = group.items.map((entry, idx) => renderCard(view, group.group_id, entry.item_id, entry.pinned, idx, group.items.length, selected)).join("");
  return `<section class="ml-org-col" data-org-col="${e(group.group_id)}"><div class="ml-org-col-head">${head}</div><div class="ml-org-list">${cards}</div></section>`;
}

export function createMainlineOrganizeDialog(ports: OrganizePorts) {
  let dialog: HTMLDialogElement | null = null;
  let selected = new Set<string>();
  let renamingGroupId: string | null = null;
  let draggingId: string | null = null;

  const paint = () => {
    const view = ports.read();
    if (!dialog || !view) return;
    const batchTargets = view.mainline.groups.map((group) => renderButton({
      variant: "secondary",
      size: "sm",
      label: groupDisplayName(group),
      attrs: { "data-org-batch-target": group.group_id },
    })).join("");
    const cols = view.mainline.groups.map((group) =>
      renderColumn(view, group, selected, view.mainline.groups.length > 1, renamingGroupId),
    ).join("");
    dialog.innerHTML = `<div class="ml-organize-shell">`
      + `<header class="ml-organize-head"><div><h2>${e(uiText.text("workbench.mainline.organize-title"))}</h2><p>${e(uiText.text("workbench.mainline.organize-desc"))}</p></div>`
      + renderButton({ variant: "ghost", size: "sm", label: uiText.text("common.control.close"), attrs: { "data-org-close": "" } })
      + `</header>`
      + `<div class="ml-organize-toolbar">`
      + `<form class="ml-organize-add" data-org-add-group><input class="mw-input ml-create-input" type="text" data-org-add-input maxlength="200" placeholder="${e(uiText.text("workbench.mainline.add-group-placeholder"))}" aria-label="${e(uiText.text("workbench.mainline.add-group"))}">`
      + renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.mainline.add-group"), attrs: { type: "submit", "data-org-add-submit": "" } })
      + `</form>`
      + `<div class="ml-organize-batch" data-org-batch${selected.size ? "" : " hidden"}><span data-org-batch-label>${e(uiText.text("workbench.mainline.move-selected-to", { n: selected.size }))}</span>${batchTargets}</div>`
      + `</div><div class="ml-organize-cols" data-org-cols>${cols}</div></div>`;
  };

  const runBusy = <T>(btn: HTMLElement | null | undefined, work: () => Promise<T>): Promise<T> => {
    const busy = (globalThis as typeof globalThis & { molisBusy?: <R>(el: HTMLElement, fn: () => Promise<R>) => Promise<R> }).molisBusy;
    return btn && busy ? busy(btn, work) : work();
  };

  const syncBatchBar = () => {
    if (!dialog) return;
    const bar = dialog.querySelector<HTMLElement>("[data-org-batch]");
    const label = dialog.querySelector<HTMLElement>("[data-org-batch-label]");
    if (bar) bar.hidden = selected.size === 0;
    if (label) label.textContent = uiText.text("workbench.mainline.move-selected-to", { n: selected.size });
  };

  const runEdit = async (path: string, body: Record<string, unknown>, toastMsg?: string, triggerBtn?: HTMLElement | null): Promise<boolean> => {
    try {
      await runBusy(triggerBtn, async () => {
        await ports.call(path, body);
        await ports.notifyChanged();
      });
      paint();
      if (toastMsg) ports.toast(toastMsg);
      return true;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === "mainline.conflict") {
        await ports.refresh();
        paint();
        ports.toast(uiText.text("workbench.mainline.conflict-retry"), true);
      } else {
        ports.toast(error instanceof Error ? error.message : String(error), true);
      }
      return false;
    }
  };

  const handleAction = async (target: HTMLElement, view: MainlineViewResponse) => {
    const rev = view.mainline.revision;
    if (target.closest("[data-org-close]")) {
      dialog?.close();
      return;
    }
    const renameBtn = target.closest<HTMLElement>("[data-org-group-rename]");
    if (renameBtn) {
      renamingGroupId = renameBtn.dataset.orgGroupRename ?? null;
      paint();
      dialog?.querySelector<HTMLInputElement>("[data-org-rename-input]")?.focus();
      return;
    }
    const delBtn = target.closest<HTMLElement>("[data-org-group-delete]");
    if (delBtn?.dataset.orgGroupDelete) {
      await runEdit("/api/mainline/groups/edit", { expected_revision: rev, op: "delete", group_id: delBtn.dataset.orgGroupDelete }, uiText.text("workbench.mainline.delete-group-toast"));
      return;
    }
    const batchTarget = target.closest<HTMLElement>("[data-org-batch-target]");
    if (batchTarget?.dataset.orgBatchTarget && selected.size) {
      const groupId = batchTarget.dataset.orgBatchTarget;
      const ids = [...selected];
      try {
        for (const itemId of ids) {
          const latest = ports.read();
          if (!latest) break;
          const dest = latest.mainline.groups.find((g) => g.group_id === groupId);
          await ports.call("/api/mainline/items/move", { expected_revision: latest.mainline.revision, item_id: itemId, group_id: groupId, index: dest?.items.length ?? 0 });
          await ports.refresh();
        }
        selected.clear();
        await ports.notifyChanged();
        paint();
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        await ports.refresh();
        paint();
        ports.toast(code === "mainline.conflict" ? uiText.text("workbench.mainline.conflict-retry") : (error instanceof Error ? error.message : String(error)), true);
      }
      return;
    }
    const up = target.closest<HTMLElement>("[data-org-up]");
    const down = target.closest<HTMLElement>("[data-org-down]");
    if (up || down) {
      const btn = (up ?? down)!;
      const itemId = (up ? btn.dataset.orgUp : btn.dataset.orgDown)!;
      const groupId = btn.dataset.orgGroup!;
      const group = view.mainline.groups.find((g) => g.group_id === groupId);
      const idx = group?.items.findIndex((entry) => entry.item_id === itemId) ?? -1;
      if (idx < 0) return;
      await runEdit("/api/mainline/items/move", { expected_revision: rev, item_id: itemId, group_id: groupId, index: up ? Math.max(0, idx - 1) : idx + 1 });
      return;
    }
    const pin = target.closest<HTMLElement>("[data-org-pin]");
    if (pin?.dataset.orgPin) {
      const groupId = pin.dataset.orgGroup!;
      const group = view.mainline.groups.find((g) => g.group_id === groupId);
      const idx = group?.items.findIndex((entry) => entry.item_id === pin.dataset.orgPin) ?? 0;
      await runEdit("/api/mainline/items/move", { expected_revision: rev, item_id: pin.dataset.orgPin, group_id: groupId, index: Math.max(0, idx), pinned: pin.dataset.orgPinned !== "true" });
      return;
    }
    const done = target.closest<HTMLElement>("[data-org-done]");
    if (done?.dataset.orgDone) {
      await runEdit("/api/mainline/items/complete", { expected_revision: rev, item_id: done.dataset.orgDone, completed: true });
      return;
    }
    const rem = target.closest<HTMLElement>("[data-org-remove]");
    if (rem?.dataset.orgRemove) {
      selected.delete(rem.dataset.orgRemove);
      await runEdit("/api/mainline/items/remove", { expected_revision: rev, item_id: rem.dataset.orgRemove }, uiText.text("workbench.mainline.removed-toast"));
    }
  };

  const ensureDialog = () => {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "mw-dialog ml-organize-dialog";
    dialog.dataset.mainlineOrganizeDialog = "";
    dialog.setAttribute("aria-label", uiText.text("workbench.mainline.organize-title"));
    document.body.append(dialog);
    dialog.addEventListener("change", (event) => {
      const box = (event.target as Element)?.closest<HTMLInputElement>("[data-org-select]");
      if (!box?.dataset.orgSelect) return;
      if (box.checked) selected.add(box.dataset.orgSelect);
      else selected.delete(box.dataset.orgSelect);
      // Update batch toolbar in place so active inputs and checkbox focus are never clobbered.
      syncBatchBar();
    });
    dialog.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      const view = ports.read();
      if (target && view) void handleAction(target, view);
    });
    dialog.addEventListener("submit", (event) => {
      const form = event.target as HTMLFormElement;
      const view = ports.read();
      if (!view) return;
      event.preventDefault();
      if (form.matches("[data-org-add-group]")) {
        const input = form.querySelector<HTMLInputElement>("[data-org-add-input]");
        const submitBtn = form.querySelector<HTMLButtonElement>("[data-org-add-submit]");
        const name = input?.value.trim() ?? "";
        if (name) void runEdit("/api/mainline/groups/edit", { expected_revision: view.mainline.revision, op: "add", name }, undefined, submitBtn);
      } else if (form.matches("[data-org-rename-form]")) {
        const groupId = form.dataset.orgRenameForm!;
        const input = form.querySelector<HTMLInputElement>("[data-org-rename-input]");
        const submitBtn = form.querySelector<HTMLButtonElement>("[data-org-rename-submit]");
        const name = input?.value.trim() ?? "";
        if (!name) {
          renamingGroupId = null;
          paint();
          return;
        }
        void runEdit("/api/mainline/groups/edit", { expected_revision: view.mainline.revision, op: "rename", group_id: groupId, name }, undefined, submitBtn).then((ok) => {
          if (ok) {
            renamingGroupId = null;
            paint();
          } else {
            input?.focus();
          }
        });
      }
    });
    dialog.addEventListener("dragstart", (event) => {
      const card = (event.target as Element)?.closest<HTMLElement>("[data-org-card]");
      if (!card?.dataset.orgCard) return;
      draggingId = card.dataset.orgCard;
      card.classList.add("is-dragging");
      event.dataTransfer?.setData("text/plain", draggingId);
    });
    dialog.addEventListener("dragend", () => {
      draggingId = null;
      dialog?.querySelectorAll(".is-dragging, .is-drop-over").forEach((node) => node.classList.remove("is-dragging", "is-drop-over"));
    });
    dialog.addEventListener("dragover", (event) => {
      if (!draggingId) return;
      const col = (event.target as Element)?.closest<HTMLElement>("[data-org-col]");
      if (!col) return;
      event.preventDefault();
      dialog?.querySelectorAll(".ml-org-col.is-drop-over").forEach((node) => { if (node !== col) node.classList.remove("is-drop-over"); });
      col.classList.add("is-drop-over");
    });
    dialog.addEventListener("drop", (event) => {
      const col = (event.target as Element)?.closest<HTMLElement>("[data-org-col]");
      const view = ports.read();
      if (!draggingId || !col?.dataset.orgCol || !view) return;
      event.preventDefault();
      const targetCard = (event.target as Element)?.closest<HTMLElement>("[data-org-card]");
      const groupId = col.dataset.orgCol;
      const group = view.mainline.groups.find((g) => g.group_id === groupId);
      const index = targetCard?.dataset.orgIndex ? Number(targetCard.dataset.orgIndex) : (group?.items.length ?? 0);
      const itemId = draggingId;
      draggingId = null;
      void runEdit("/api/mainline/items/move", { expected_revision: view.mainline.revision, item_id: itemId, group_id: groupId, index });
    });
    return dialog;
  };

  return {
    async open() {
      await ports.refresh();
      selected.clear();
      renamingGroupId = null;
      const node = ensureDialog();
      paint();
      if (!node.open) node.showModal();
    },
    repaint: paint,
  };
}
