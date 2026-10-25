import type {} from "@molis-ai/molis-work-plugin-sdk";
import { fresh } from "./bind-basic.js";
import { invoke, messageOf, refreshSettings, save, savePatch, say } from "./save.js";
import type { SettingsPage } from "./types.js";
import type { ShelfItemKind, ShelfShortcutAction } from "@molis-ai/molis-work-contracts/modules/shelf";

const fieldOf = (form: ParentNode, selector: string): HTMLInputElement | null => form.querySelector<HTMLInputElement>(selector);

/** The form that adds or edits one of the person's own actions. */
export function bindShortcutForm(page: SettingsPage, scope: ParentNode, reload: () => Promise<void>): void {
  const form = scope.querySelector<HTMLFormElement>("[data-shelf-shortcut-form]");
  if (!form || !fresh(form)) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const current = page.settings || await refreshSettings(page, scope);
    const id = fieldOf(form, "[data-shelf-shortcut-id]")?.value || "";
    const kinds = [...form.querySelectorAll<HTMLInputElement>("[data-shelf-shortcut-kind]")].filter((box) => box.checked).map((box) => box.dataset.shelfShortcutKind as ShelfItemKind);
    const action: ShelfShortcutAction = { id, name: fieldOf(form, "[data-shelf-shortcut-name]")?.value?.trim() || "", prompt: fieldOf(form, "[data-shelf-shortcut-prompt]")?.value?.trim() || "", kinds };
    const existing = current?.shortcuts || [];
    const next = id && existing.some((entry) => entry.id === id) ? existing.map((entry) => entry.id === id ? action : entry) : [...existing, action];
    try {
      page.settings = await savePatch(page, scope, { shortcuts: next });
      await reload();
    } catch (error) {
      say(scope, "[data-shelf-shortcut-error]", messageOf(error));
    }
  });
  form.querySelector("[data-shelf-shortcut-reset]")?.addEventListener("click", () => {
    form.reset();
    const idField = fieldOf(form, "[data-shelf-shortcut-id]");
    if (idField) idField.value = "";
  });
}

const shortcutIdOf = (slot: string): string => slot.startsWith("shortcut:") ? slot.slice("shortcut:".length) : "";

function fillShortcutForm(scope: ParentNode, action: ShelfShortcutAction): void {
  const form = scope.querySelector<HTMLFormElement>("[data-shelf-shortcut-form]");
  if (!form) return;
  const set = (selector: string, value: string) => { const field = fieldOf(form, selector); if (field) field.value = value; };
  set("[data-shelf-shortcut-id]", action.id);
  set("[data-shelf-shortcut-name]", action.name);
  const prompt = form.querySelector<HTMLTextAreaElement>("[data-shelf-shortcut-prompt]");
  if (prompt) prompt.value = action.prompt;
  form.querySelectorAll<HTMLInputElement>("[data-shelf-shortcut-kind]").forEach((box) => { box.checked = action.kinds.includes(box.dataset.shelfShortcutKind as ShelfItemKind); });
  form.scrollIntoView({ block: "center" });
}

/** A row of the action list: show or hide it, move it, edit it, delete it. */
function bindActionRow(page: SettingsPage, scope: ParentNode, row: HTMLElement, reload: () => Promise<void>): void {
  const slot = row.dataset.shelfActionSlot ?? "";
  const current = () => page.settings ? Promise.resolve(page.settings) : refreshSettings(page, scope);
  const change = async (patch: Parameters<typeof save>[2]) => {
    try {
      page.settings = await save(page, scope, patch, row);
      await reload();
    } catch {
      // Reported in its block.
    }
  };
  row.querySelector("[data-shelf-action-visible]")?.addEventListener("click", async () => {
    const hidden = new Set((await current())?.hidden_actions || []);
    if (hidden.has(slot)) hidden.delete(slot); else hidden.add(slot);
    await change({ hidden_actions: [...hidden] });
  });
  row.querySelectorAll<HTMLElement>("[data-shelf-action-move]").forEach((button) => {
    button.addEventListener("click", async () => {
      const order = [...((await current())?.action_order || [])];
      const index = order.indexOf(slot);
      const next = button.dataset.shelfActionMove === "up" ? index - 1 : index + 1;
      if (index < 0 || next < 0 || next >= order.length) return;
      order.splice(next, 0, ...order.splice(index, 1));
      await change({ action_order: order });
    });
  });
  row.querySelector("[data-shelf-action-edit]")?.addEventListener("click", async () => {
    const action = ((await current())?.shortcuts || []).find((entry) => entry.id === shortcutIdOf(slot));
    if (action) fillShortcutForm(scope, action);
  });
  row.querySelector("[data-shelf-action-delete]")?.addEventListener("click", async () => {
    const settings = await current();
    const id = shortcutIdOf(slot);
    if (!id || !settings) return;
    await change({ shortcuts: settings.shortcuts.filter((entry) => entry.id !== id), action_order: settings.action_order.filter((entry) => entry !== slot) });
  });
}

export function bindActionRows(page: SettingsPage, scope: ParentNode, reload: () => Promise<void>): void {
  scope.querySelectorAll<HTMLElement>("[data-shelf-action-slot]").forEach((row) => { if (fresh(row)) bindActionRow(page, scope, row, reload); });
}

/** Puts the sample PDF back among the materials. */
export function bindSample(page: SettingsPage, scope: ParentNode): void {
  const sample = scope.querySelector<HTMLButtonElement>("[data-shelf-try-sample]");
  if (!sample || !fresh(sample)) return;
  sample.addEventListener("click", async () => {
    sample.disabled = true;
    try {
      await molisWorkRequest(page.api + "/sample", { method: "POST", body: {} });
      say(scope, "[data-shelf-shortcut-error]", "");
      sample.textContent = page.L("shelf.settings.sample-back");
    } catch (error) {
      say(scope, "[data-shelf-shortcut-error]", messageOf(error));
    } finally {
      sample.disabled = false;
    }
  });
}

interface SetupStatus { accessibility?: boolean; clipboard_readable?: boolean; browsers?: string[] }

/** What this Mac lets Shelf do, in the lines the page drew for it. */
export function showPermissions(page: SettingsPage, scope: ParentNode): void {
  const { L } = page;
  invoke("shelf_setup_status").then((raw) => {
    const status = raw as SetupStatus | null;
    if (!status) return;
    const line = (selector: string, text: string) => {
      const node = scope.querySelector(selector);
      if (node && text) node.textContent = text;
    };
    line('[data-shelf-permission="accessibility"]', status.accessibility ? L("shelf.settings.accessibility-on") : L("shelf.settings.accessibility-off"));
    if (status.clipboard_readable === false) line('[data-shelf-permission="clipboard"]', L("shelf.settings.clipboard-blocked"));
    if (Array.isArray(status.browsers)) line('[data-shelf-permission="browsers"]', status.browsers.length ? L("shelf.settings.browsers-found") + status.browsers.join("、") : L("shelf.settings.browsers-none"));
  }).catch(() => undefined);
}
