import { t as uiText, escapeHtml, icon, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMenu, renderMenuGroup, renderMenuItem } from "@molis-ai/molis-work-design-system";
import { renderWriteCheckersSection } from "./write-checkers-section.js";

type Say = (text: string, values?: Record<string, string | number>) => string;

/**
 * A project's 「输入与输出」 in its settings (design workbench-shared-paths, 03; 05-materials-directories B1 for what a folder stands in
 * for): the inputs, as many as the person likes, each one removable or made the output; the one output, the default one until another
 * is chosen and made only when it is first used; and under a folder, which folder of another device it is read for, to change or
 * unlink. The host writes every sentence here, in the page's language, as `data-say` and as `<template>`s whose `[data-text]` parts the
 * page program (src/browser/project-directories.ts) fills with `textContent`, so a folder's name is never read as markup. The same
 * section draws on its own settings page and in the workbench's settings, which loads it from that page.
 */
export function renderProjectDirectoriesSection(readText: Say, prefix: string): string {
  const say = escapeHtml(JSON.stringify({
    loading: uiText.text("workbench.project-directories-section.reading-inputs-output"), failed: uiText.text("workbench.project-directories-section.couldn-t-change-inputs-output"), stale: uiText.text("workbench.project-directories-section.inputs-output-were-just-changed-elsewhere-have-been"),
    added: uiText.text("workbench.project-directories-section.name-now-input"), removed: uiText.text("workbench.project-directories-section.name-no-longer-input-nothing-disk-changes"),
    output: uiText.text("workbench.project-directories-section.output-now-name-previous-output-no-longer-written"), repaired: uiText.text("workbench.project-directories-section.found-name-again"),
    mapped: uiText.text("workbench.project-directories-section.now-read-name-references-read-there-their-paths"),
    unmapped: uiText.text("workbench.project-directories-section.unlinked-these-references-back-folder-not-chosen-name"),
    remove_named: uiText.text("workbench.project-directories-section.remove-name"), output_named: uiText.text("workbench.project-directories-section.make-name-output"), change_named: uiText.text("workbench.project-directories-section.choose-another-folder-name"), unmap_named: uiText.text("workbench.project-directories-section.unlink-name"),
    default_name: uiText.text("workbench.project-directories-section.default-output-folder"), source_folder: uiText.text("workbench.project-directories-section.folder-another-device"), source_other_default: uiText.text("workbench.project-directories-section.another-device-s-default-output-folder"),
    source_former_default: uiText.text("workbench.project-directories-section.project-s-earlier-default-output-folder"), stands: uiText.text("workbench.project-directories-section.stands-source"), input_role: uiText.text("workbench.project-directories-section.input-folder"), output_role: uiText.text("workbench.project-directories-section.output-folder"), choose_output: uiText.text("workbench.project-directories-section.where-output-goes-now"), choose_source: uiText.text("workbench.project-directories-section.where-read-folder"),
  }));
  const button = (label: string, act: string, variant: "secondary" | "ghost" = "secondary", extra: Record<string, string | boolean> = {}) =>
    renderButton({ label, variant, size: "sm", attrs: { "data-act": act, ...extra } });
  // One folder: its glyph, name, roles, full path (cut, never wrapped; the whole path is its title), what is true of it now, and its buttons.
  const row = `<template data-pd="row"><div class="settings-setting-row project-directory" data-directory-row>
      <span class="project-directory__glyph" data-if="input-glyph">${icon("folder")}</span><span class="project-directory__glyph" data-if="output-glyph">${icon("output")}</span>
      <span class="setting-copy project-directory__copy">
        <strong class="project-directory__head"><span class="project-directory__name" data-text="name"></span><span class="project-directory__roles"><span class="mw-badge mw-badge--neutral" data-slot="badge" data-if="input">${uiText("workbench.project-directories-section.input-folder")}</span><span class="mw-badge mw-badge--info" data-slot="badge" data-if="output">${uiText("workbench.project-directories-section.output-folder")}</span></span></strong>
        <span class="project-directory__path" data-text="path"></span>
        <span class="project-directory__note is-warning" data-if="missing">${icon("circle-alert")}<span>${uiText("workbench.project-directories-section.can-t-find-folder-earlier-references-kept-read")}</span></span>
        <span class="project-directory__note" data-if="unmade">${icon("clock")}<span>${uiText("workbench.project-directories-section.not-made-yet-made-first-time-used-reads")}</span></span>
        <span class="project-directory__note" data-if="same">${icon("edit")}<span>${uiText("workbench.project-directories-section.both-input-output-tasks-can-change-files-here")}</span></span>
      </span>
      <div class="setting-value">${button(uiText.text("workbench.project-directories-section.find-again"), "repair", "secondary", { "data-if": "repair" })}${button(uiText.text("workbench.project-directories-section.make-output"), "set-output", "secondary", { "data-if": "set-output" })}${button(uiText.text("workbench.project-directories-section.change"), "change-output", "secondary", { "data-if": "change-output", "aria-haspopup": "dialog" })}${renderButton({ label: uiText.text("workbench.project-directories-section.remove"), variant: "ghost", size: "sm", icon: "trash", iconOnly: true, attrs: { "data-act": "remove", "data-if": "remove" } })}</div>
    </div></template>`;
  // Which folder of another device this one is read for (B1 ④): change it or unlink it here, as from where the reference was met.
  const link = `<template data-pd="link"><div class="project-directory-link" data-directory-link>
      ${icon("link")}<span class="project-directory-link__copy"><span data-text="stands"></span><small>${uiText("workbench.project-directories-section.every-reference-that-folder-read-here-its-path")}</small></span>
      <span class="project-directory-link__acts">${button(uiText.text("workbench.project-directories-section.use-another"), "map", "secondary", { "aria-haspopup": "dialog" })}${button(uiText.text("workbench.project-directories-section.unlink"), "unmap", "ghost")}</span>
    </div></template>`;
  // The one choice of a folder, from the button that asked: a folder of the project, its default output directory, or another one picked
  // in the system window; what it does is said under it, and only the confirm button acts (B1, the same popover wherever it is met).
  const item = (target: string, label: string, description: string, iconName?: "folder-open") =>
    renderMenuItem({ label, description, checked: iconName ? undefined : false, iconName, attrs: { "data-target": target } });
  const chooser = `<template data-pd="chooser"><div class="mw-popover project-directory-chooser" data-slot="popover" popover="auto" role="dialog" data-directory-chooser>
      <div class="project-directory-chooser__head"><strong data-text="title"></strong><small data-text="subject"></small></div>
      ${renderMenu({ items: renderMenuGroup({ label: uiText.text("workbench.project-directories-section.project-s-folders"), items: `<div data-chooser-folders></div>${item("default", uiText.text("workbench.project-directories-section.project-s-default-output-folder"), uiText.text("workbench.project-directories-section.fine-if-isn-t-made-yet-made-first"))}` })
        + renderMenuGroup({ items: item("pick", uiText.text("workbench.project-directories-section.choose-another-folder"), uiText.text("workbench.project-directories-section.joins-project-input"), "folder-open") }) })}
      <p class="project-directory-chooser__say" data-chooser-say data-idle="${escapeHtml(uiText.text("workbench.project-directories-section.pick-folder-computer"))}"></p>
      <div class="project-directory-chooser__foot">${button(uiText.text("common.control.cancel"), "chooser-cancel")}${renderButton({ label: uiText.text("workbench.project-directories-section.read-here"), variant: "primary", size: "sm", attrs: { "data-act": "chooser-confirm", "data-output-label": uiText.text("workbench.project-directories-section.make-output"), disabled: true } })}</div>
    </div></template>`;
  // A folder of the project in the chooser; its name and roles are filled in, and the tick goes in its check when it is chosen.
  const folderItem = `<template data-pd="folder-item">${renderMenuItem({ label: "-", description: "-", checked: false, attrs: { "data-target": "" } })}</template><template data-pd="tick">${icon("check")}</template>`;
  // What choosing does, by what is being chosen and for what; `{name}` is the folder.
  const consequence = escapeHtml(JSON.stringify({
    output: uiText.text("workbench.project-directories-section.tasks-terminals-git-will-write-only-name-current"),
    output_pick: uiText.text("workbench.project-directories-section.folder-pick-joins-project-tasks-terminals-git-write"),
    source: uiText.text("workbench.project-directories-section.folder-s-references-will-be-read-name-their"),
    source_pick: uiText.text("workbench.project-directories-section.folder-pick-joins-project-input-references-read-there"),
  }));
  return `<section class="project-settings-page project-directories" data-project-directories data-directories-prefix="${escapeHtml(prefix)}" data-say="${say}" data-consequence="${consequence}">
      <header class="settings-page-heading"><h1>${uiText("workbench.project-directories-section.inputs-output")}</h1><p>${uiText("workbench.project-directories-section.tasks-plugins-read-inputs-write-only-output-changes")}</p></header>
      <section class="settings-section" aria-labelledby="project-directories-inputs">
        <div class="settings-setting-row"><span class="setting-copy"><strong id="project-directories-inputs">${uiText("workbench.project-directories-section.folders-read")}</strong><span>${uiText("workbench.project-directories-section.read-only-add-many-like-removing-one-deletes")}</span></span></div>
        <div data-directories-inputs></div>
        <form class="settings-setting-row project-directories-add" data-directories-add><label class="setting-copy" for="project-directories-path"><strong>${uiText("workbench.project-directories-section.add-folder")}</strong><span>${uiText("workbench.project-directories-section.pick-folder-computer-enter-its-full-path")}</span></label>
          <div class="setting-value"><input id="project-directories-path" name="path" required autocomplete="off" spellcheck="false" placeholder="/path/to/folder">${button(uiText.text("workbench.project-directories-section.choose"), "pick")}${renderButton({ label: uiText.text("workbench.project-directories-section.add"), variant: "primary", size: "sm", type: "submit" })}</div></form>
      </section>
      <section class="settings-section" aria-labelledby="project-directories-output">
        <div class="settings-setting-row"><span class="setting-copy"><strong id="project-directories-output">${uiText("workbench.project-directories-section.where-output-goes")}</strong><span>${uiText("workbench.project-directories-section.just-one-shared-every-task-plugin")}</span></span></div>
        <div data-directories-output></div>
      </section>
      <p class="project-directories__status" data-directories-status role="status" aria-live="polite"></p>
      ${row}${link}${chooser}${folderItem}
      ${renderWriteCheckersSection(readText)}
    </section>`;
}
