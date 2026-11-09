import { escapeHtml, icon, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
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
export function renderProjectDirectoriesSection(L: Say, prefix: string): string {
  const say = escapeHtml(JSON.stringify({
    loading: L("正在读取输入与输出…"), failed: L("输入与输出没能改好"), stale: L("输入与输出刚在别处改过，已重新读取。请再改一次。"),
    added: L("「{name}」加为输入了。"), removed: L("「{name}」不再是输入，磁盘上的文件不动。"),
    output: L("输出改成「{name}」了。之前的输出不再写入，里面的文件不动。"), repaired: L("重新找到「{name}」了。"),
    mapped: L("改成在「{name}」里读了：引用按原来的路径去读，里面的文件不会被改动。"),
    unmapped: L("已取消对应：这些引用回到「未指定文件夹」，「{name}」还在这个项目里。"),
    remove_named: L("移除「{name}」"), output_named: L("把「{name}」设为输出"), change_named: L("换一个文件夹（{name}）"), unmap_named: L("取消对应（{name}）"),
    default_name: L("默认输出目录"), source_folder: L("另一台设备上的文件夹"), source_other_default: L("另一台设备的默认输出目录"),
    source_former_default: L("这个项目原来的默认输出目录"), stands: L("对应{source}"), input_role: L("输入目录"), output_role: L("输出目录"), choose_output: L("产出改写到哪里"), choose_source: L("这个文件夹以后从哪里读"),
  }));
  const button = (label: string, act: string, variant: "secondary" | "ghost" = "secondary", extra: Record<string, string | boolean> = {}) =>
    renderButton({ label, variant, size: "sm", attrs: { "data-act": act, ...extra } });
  // One folder: its glyph, name, roles, full path (cut, never wrapped; the whole path is its title), what is true of it now, and its buttons.
  const row = `<template data-pd="row"><div class="settings-setting-row project-directory" data-directory-row>
      <span class="project-directory__glyph" data-if="input-glyph">${icon("folder")}</span><span class="project-directory__glyph" data-if="output-glyph">${icon("output")}</span>
      <span class="setting-copy project-directory__copy">
        <strong class="project-directory__head"><span class="project-directory__name" data-text="name"></span><span class="project-directory__roles"><span class="mw-badge mw-badge--neutral" data-slot="badge" data-if="input">${L("输入目录")}</span><span class="mw-badge mw-badge--info" data-slot="badge" data-if="output">${L("输出目录")}</span></span></strong>
        <span class="project-directory__path" data-text="path"></span>
        <span class="project-directory__note is-warning" data-if="missing">${icon("circle-alert")}<span>${L("找不到这个文件夹。之前的引用还在，重新找到位置后照常读。")}</span></span>
        <span class="project-directory__note" data-if="unmade">${icon("clock")}<span>${L("还没建：第一次用到时才建，在这之前读到的是空的。")}</span></span>
        <span class="project-directory__note" data-if="same">${icon("edit")}<span>${L("既是输入也是输出：任务可以直接改这里的原文件。")}</span></span>
      </span>
      <div class="setting-value">${button(L("重新找到位置"), "repair", "secondary", { "data-if": "repair" })}${button(L("设为输出"), "set-output", "secondary", { "data-if": "set-output" })}${button(L("更改"), "change-output", "secondary", { "data-if": "change-output", "aria-haspopup": "dialog" })}${renderButton({ label: L("移除"), variant: "ghost", size: "sm", icon: "trash", iconOnly: true, attrs: { "data-act": "remove", "data-if": "remove" } })}</div>
    </div></template>`;
  // Which folder of another device this one is read for (B1 ④): change it or unlink it here, as from where the reference was met.
  const link = `<template data-pd="link"><div class="project-directory-link" data-directory-link>
      ${icon("link")}<span class="project-directory-link__copy"><span data-text="stands"></span><small>${L("同一个文件夹里的引用都在这里按原来的路径读")}</small></span>
      <span class="project-directory-link__acts">${button(L("换一个"), "map", "secondary", { "aria-haspopup": "dialog" })}${button(L("取消对应"), "unmap", "ghost")}</span>
    </div></template>`;
  // The one choice of a folder, from the button that asked: a folder of the project, its default output directory, or another one picked
  // in the system window; what it does is said under it, and only the confirm button acts (B1, the same popover wherever it is met).
  const item = (target: string, label: string, description: string, iconName?: "folder-open") =>
    renderMenuItem({ label, description, checked: iconName ? undefined : false, iconName, attrs: { "data-target": target } });
  const chooser = `<template data-pd="chooser"><div class="mw-popover project-directory-chooser" data-slot="popover" popover="auto" role="dialog" data-directory-chooser>
      <div class="project-directory-chooser__head"><strong data-text="title"></strong><small data-text="subject"></small></div>
      ${renderMenu({ items: renderMenuGroup({ label: L("这个项目的文件夹"), items: `<div data-chooser-folders></div>${item("default", L("这个项目的默认输出目录"), L("文件夹还没建也可以；第一次用到时才建"))}` })
        + renderMenuGroup({ items: item("pick", L("选择另一个文件夹…"), L("会加进这个项目，作为输入"), "folder-open") }) })}
      <p class="project-directory-chooser__say" data-chooser-say data-idle="${escapeHtml(L("选一个这台电脑上的文件夹。"))}"></p>
      <div class="project-directory-chooser__foot">${button(L("取消"), "chooser-cancel")}${renderButton({ label: L("接到这里"), variant: "primary", size: "sm", attrs: { "data-act": "chooser-confirm", "data-output-label": L("设为输出"), disabled: true } })}</div>
    </div></template>`;
  // A folder of the project in the chooser; its name and roles are filled in, and the tick goes in its check when it is chosen.
  const folderItem = `<template data-pd="folder-item">${renderMenuItem({ label: "-", description: "-", checked: false, attrs: { "data-target": "" } })}</template><template data-pd="tick">${icon("check")}</template>`;
  // What choosing does, by what is being chosen and for what; `{name}` is the folder.
  const consequence = escapeHtml(JSON.stringify({
    output: L("任务、终端和 Git 以后只写进「{name}」。现在的输出不再写入，里面的文件不动。"),
    output_pick: L("选中的文件夹加进这个项目，任务、终端和 Git 以后只写进它。"),
    source: L("这个文件夹的引用都改到「{name}」里按原来的路径读，里面的文件不会被改动。"),
    source_pick: L("选中的文件夹作为输入加进这个项目，引用按原来的路径去那里读。"),
  }));
  return `<section class="project-settings-page project-directories" data-project-directories data-directories-prefix="${escapeHtml(prefix)}" data-say="${say}" data-consequence="${consequence}">
      <header class="settings-page-heading"><h1>${L("输入与输出")}</h1><p>${L("任务和插件从输入里读资料，产出只写进输出。改了只对之后的任务生效；正在运行的那一轮还在它开始时的位置。")}</p></header>
      <section class="settings-section" aria-labelledby="project-directories-inputs">
        <div class="settings-setting-row"><span class="setting-copy"><strong id="project-directories-inputs">${L("参考哪些文件夹")}</strong><span>${L("只读，可以加多个；移除不会删除磁盘上的文件。")}</span></span></div>
        <div data-directories-inputs></div>
        <form class="settings-setting-row project-directories-add" data-directories-add><label class="setting-copy" for="project-directories-path"><strong>${L("添加文件夹")}</strong><span>${L("选本机的一个文件夹，或者填它的完整路径。")}</span></label>
          <div class="setting-value"><input id="project-directories-path" name="path" required autocomplete="off" spellcheck="false" placeholder="/path/to/folder">${button(L("选择…"), "pick")}${renderButton({ label: L("添加"), variant: "primary", size: "sm", type: "submit" })}</div></form>
      </section>
      <section class="settings-section" aria-labelledby="project-directories-output">
        <div class="settings-setting-row"><span class="setting-copy"><strong id="project-directories-output">${L("产出写到哪里")}</strong><span>${L("只有一个，所有任务和插件共用。")}</span></span></div>
        <div data-directories-output></div>
      </section>
      <p class="project-directories__status" data-directories-status role="status" aria-live="polite"></p>
      ${row}${link}${chooser}${folderItem}
      ${renderWriteCheckersSection(L)}
    </section>`;
}
