import { escapeHtml, renderButton, renderField, renderInput } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderAlertDialog, renderDialog } from "@molis-ai/molis-work-design-system";

type Say = (text: string) => string;

/**
 * The after-write checkers below the workspaces (specs/prologue-adoption §6.0p.13): the host writes every sentence of this part of
 * the page, in the page's language, so the page program (src/browser/write-checkers.ts) carries none. What it shows more than once
 * is a `<template>` with `{name}` slots: it clones one and fills the slots with `textContent`, and a part that only applies
 * sometimes has `data-if`. The two dialogs are the catalog's own (`renderDialog`, `renderAlertDialog`); deleting asks in the
 * alert dialog, never the browser's `confirm()`.
 */
export function renderWriteCheckersSection(L: Say): string {
  // Short sentences the program says about the whole part: reading, saved, nothing to show, stale, and the dialog titles.
  const say = escapeHtml(JSON.stringify({
    loading: L("正在读取写后检查器…"), saved: L("写后检查器已保存。"), none: L("先在上方关联目录，再给它配写后检查。"),
    stale: L("这组检查器已在别处改过，已重新读取，请再改一次。"), failed: L("写后检查器操作失败"), gone: L("这个目录已不在授权的目录里。"),
    add: L("添加检查器"), edit: L("修改检查器"),
  }));
  // A button of a group or a row: the visible word, and the name it is read out with (its checker or folder, by the slot).
  const act = (name: string, label: string, named: string, kind = "secondary", only = "") =>
    `<button class="mw-btn mw-btn--${kind}" type="button" data-act="${name}"${only} aria-label="${escapeHtml(named)}">${label}</button>`;
  const field = (label: string, hint: string | undefined, options: Parameters<typeof renderInput>[0]) => renderField({ label, hint, control: renderInput(options) });
  const cancel = (more: Record<string, boolean> = {}) => renderButton({ variant: "secondary", size: "md", label: L("取消"), attrs: { "data-dialog-close": true, ...more } });
  const text = { autocomplete: "off", spellcheck: "false" };

  const group = `<template data-wc="group"><div>
      <div class="settings-setting-row"><div class="settings-record-title"><div><h3>{folder}</h3><p data-if="saved">${L("第 {version} 版")}</p><p data-if="unsaved">${L("还没有保存过")}</p></div></div>${act("add", L("添加检查器"), L("添加检查器（{folder}）"))}</div>
      <p class="mw-field__hint" data-if="empty">${L("这个目录还没有配置写后检查器。")}</p>
    </div></template>`;
  const row = `<template data-wc="row"><div class="settings-setting-row">
      <span class="setting-copy"><strong>{name}</strong><code>{command}</code><span>${L("适用 {extensions} · 目录 {cwd} · 时限 {seconds} 秒")}</span></span>
      <span class="setting-value">${act("edit", L("修改"), L("修改 {name}"))}${act("up", L("上移"), L("上移 {name}"), "secondary", ' data-if="movable"')}${act("remove", L("删除"), L("删除 {name}"), "danger-outline")}</span>
    </div></template>`;
  const remove = `<template data-wc="remove">${renderAlertDialog({
    labelledBy: "write-checkers-remove-title", title: L("删除检查器「{name}」？"), closeLabel: L("关闭"),
    body: `<p>${escapeHtml(L("删除后，写入的文件不再用它检查。"))}</p>`,
    footer: `${cancel({ autofocus: true })}${renderButton({ variant: "danger", size: "md", type: "submit", label: L("删除"), attrs: { value: "remove" } })}`,
  })}</template>`;
  const editor = renderDialog({
    labelledBy: "write-checkers-title", title: L("添加检查器"), closeLabel: L("关闭"), className: "mw-dialog--form", attrs: { "data-wc": "dialog" },
    body: [
      field(L("名称"), undefined, { name: "display_name", required: true, attrs: { maxlength: 80, autocomplete: "off", autofocus: true } }),
      field(L("程序名"), L("只写程序名，不带路径。"), { name: "executable", required: true, placeholder: "node", attrs: { maxlength: 255, ...text } }),
      field(L("参数"), L("用空格分开，带空格的参数加双引号；引号内用 \\\" 和 \\\\ 表示双引号和反斜杠。写入的文件写成单独一项 {file}。"), { name: "args", required: true, placeholder: "--check {file}", attrs: text }),
      field(L("适用的扩展名"), L("用空格或逗号分开。"), { name: "applies_to", required: true, placeholder: ".js .mjs", attrs: text }),
      field(L("运行目录"), L("工作区根下的相对路径，空着就是根。"), { name: "cwd", placeholder: ".", attrs: text }),
      field(L("时限（秒）"), L("1 到 60 秒，空着是 30 秒。"), { name: "timeout_seconds", type: "number", placeholder: "30", attrs: { min: 1, max: 60, step: "0.001" } }),
      `<p class="form-error" data-wc="error" role="alert" hidden></p>`,
    ].join(""),
    footer: `${cancel()}${renderButton({ variant: "primary", size: "md", type: "submit", label: L("保存") })}`,
  });
  return `<section class="settings-section" data-say="${say}" data-write-checkers><h2>${L("写后检查")}</h2><p class="mw-field__hint">${L("Agent 写入文件后，按扩展名在这个目录的检查器里取第一个适用的去跑，顺序就是这里的顺序。每次检查都经命令审查，程序在 PATH 上找，不经 shell。")}</p><div data-wc="list"></div><p data-wc="status" role="status" aria-live="polite"></p>${editor}${group}${row}${remove}</section>`;
}
