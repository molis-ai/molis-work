import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import { closest } from "./dom.js";
import { flushEdit } from "./edit.js";
import { shortcutActions } from "./model.js";
import { expandShelfStage, paintPreview, syncShelfStage } from "./preview.js";
import { deviceChange, applyDeviceValues } from "./device-change.js";
import type { SettingsValues } from "@molis-ai/molis-work-contracts/platform/settings";
import { failureCode, post } from "./request.js";
import type { SettingsPatch, ShelfPage } from "./types.js";
import type { ShelfDeviceSettings, ShelfItemKind } from "@molis-ai/molis-work-module-shelf/contract";

const uiText = globalThis.t;

/** Submit against the bar shown to the person. A conflict refreshes just that group, keeping their draft open. */
export async function saveSettings(page: ShelfPage, patch: SettingsPatch, expected = page.snapshot.action_bar_revision): Promise<ShelfDeviceSettings> {
  const key = "shelf.action_bar", settings = page.snapshot.settings;
  if (!settings || !expected) throw new Error(uiText.text("shelf.settings.save-failed"));
  const remember = (response: SettingsValues) => {
    const item = response.values[0];
    if (item?.state !== "ok" || item.key !== key) throw new Error(uiText.text("shelf.settings.save-failed"));
    const current = applyDeviceValues(page.snapshot.settings ?? settings, response);
    page.snapshot = { ...page.snapshot, settings: current, action_bar_revision: item.revision };
    return current;
  };
  try {
    return remember(await post<SettingsValues>(page, "/preferences/write", { key, layer: "personal", expected_revision: expected,
      request_id: crypto.randomUUID(), change: deviceChange(settings, key, patch) }));
  } catch (error) {
    if (failureCode(error) === "shelf.conflict") remember(await post<SettingsValues>(page, "/preferences/read", { keys: [key] }));
    throw error;
  }
}

const COMPOSER_KINDS = ["pdf", "image", "markdown", "text", "website", "url", "file", "folder"] as const;
const DEFAULT_KINDS: readonly string[] = ["pdf", "markdown", "text", "website"];

function composerHtml(_page: ShelfPage): string {
  const names: Record<(typeof COMPOSER_KINDS)[number], string> = {
    pdf: "PDF", image: uiText.text("shelf.composer.images"), markdown: "Markdown", text: uiText.text("shelf.composer.text"), website: uiText.text("shelf.composer.web-page"), url: uiText.text("shelf.composer.link"), file: uiText.text("shelf.composer.other-files"), folder: uiText.text("shelf.composer.folder"),
  };
  const kinds = COMPOSER_KINDS.map((id) => '<label><input type="checkbox" name="kind" value="' + id + '"' + (DEFAULT_KINDS.includes(id) ? " checked" : "") + ">" + names[id] + "</label>").join("");
  return '<form class="shelf-action-composer" data-shelf-create-action><h2>' + uiText.text("shelf.bar.new-action") + "</h2><p>" + uiText.text("shelf.composer.one-line-about-what-to")
    + "</p><label>" + uiText.text("shelf.composer.name") + '<input class="shelf-action-field" name="name" maxlength="40" required placeholder="' + uiText.text("shelf.composer.for-example-extract-contacts") + '"></label><label>'
    + uiText.text("shelf.composer.description") + '<textarea class="shelf-action-field" name="prompt" rows="5" maxlength="2000" required placeholder="' + uiText.text("shelf.composer.list-every-contact-in-the") + '"></textarea></label><fieldset><legend>'
    + uiText.text("shelf.composer.works-with") + "</legend>" + kinds + '</fieldset><p role="status" data-shelf-create-error></p><div class="shelf-form-actions"><button class="shelf-paper" type="button" data-shelf-create-cancel>'
    + uiText.text("shelf.composer.cancel") + '</button><button class="shelf-primary" type="submit">' + uiText.text("shelf.composer.save-action") + "</button></div></form>";
}

export async function showActionComposer(page: ShelfPage): Promise<void> {
  await flushEdit(page);
  page.editing = false;
  page.composingAction = true;
  page.arranging = false;
  page.stage.classList.remove("is-confirm", "is-run", "is-fail", "is-compare");
  expandShelfStage(page, true);
  page.preview.innerHTML = composerHtml(page);
  const form = page.preview.querySelector<HTMLFormElement>("[data-shelf-create-action]")!;
  form.dataset.revision = page.snapshot.action_bar_revision ?? "";
  form.dataset.shortcut = crypto.randomUUID();
  page.bar.innerHTML = "";
  page.preview.querySelector<HTMLInputElement>("input[name=name]")?.focus();
}

export async function submitComposer(page: ShelfPage, event: Event): Promise<void> {
  const form = closest(event, "[data-shelf-create-action]") as HTMLFormElement | null;
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const status = form.querySelector<HTMLElement>("[data-shelf-create-error]");
  const kinds = data.getAll("kind").map(String);
  if (!kinds.length) { if (status) status.textContent = uiText.text("shelf.composer.choose-at-least-one-material"); return; }
  const buttons = [...form.querySelectorAll<HTMLButtonElement>("button")];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await saveSettings(page, { shortcuts: [...shortcutActions(page).filter(action => action.id !== form.dataset.shortcut), { id: form.dataset.shortcut!, name: String(data.get("name")).trim(), prompt: String(data.get("prompt")).trim(), kinds: kinds as ShelfItemKind[] }] }, form.dataset.revision);
    page.composingAction = false;
    page.stickyHint = uiText.text("shelf.composer.action-added-to-the-bar");
    paintPreview(page);
    syncShelfStage(page);
  } catch (error) {
    if (page.lifetime.alive && status) {
      if (failureCode(error) === "shelf.conflict") form.dataset.revision = page.snapshot.action_bar_revision ?? "";
      status.textContent = messageOf(error);
    }
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}
