import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import type {
  ShelfCustomRuntime,
  ShelfDeviceSettings,
  ShelfHotKeyChord,
  ShelfHotKeySlot,
  ShelfItemKind,
  ShelfPanelKeySlot,
  ShelfRuntimeStatus,
  ShelfShortcutAction,
} from "@molis-ai/molis-work-contracts/modules/shelf";
import {
  HOTKEY_GUIDE,
  HOTKEY_RESET,
  SHELF_RECIPES,
  chordLabel,
  chordsEqual,
  defaultHotKey,
  defaultPanelKey,
  panelKeyLabel,
  panelKeysEqual,
  shortcutIdFromSlot,
} from "@molis-ai/molis-work-module-shelf";
import { SHELF_GLYPH } from "./glyphs.js";
import type { ShelfUiPrimitives } from "./ui.js";

export const SHELF_SETTINGS_UI_CONTRIBUTION_ID = "io.molis.work.native.shelf.settings.v1";

export interface ShelfSettingsUiModel {
  readonly settings: ShelfDeviceSettings;
  readonly runtime?: ShelfRuntimeStatus;
  readonly storage_path?: string;
  readonly primitives: ShelfUiPrimitives;
}

export const shelfSettingsUiDescriptor: UiContributionDescriptor = {
  contribution_id: SHELF_SETTINGS_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.shelf",
  kind: "settings-page",
  navigation_id: "shelf",
  label: "Shelf",
  surfaces: [
    { surface_id: "settings", target_slot_id: "workbench.settings", format: "declarative-html" },
  ],
  slots: [],
};

export const shelfSettingsUiContribution: UiContribution<ShelfSettingsUiModel> = {
  descriptor: shelfSettingsUiDescriptor,
  render(request: UiRenderRequest<ShelfSettingsUiModel>): string {
    if (request.surface !== "settings") {
      throw new Error(`Shelf settings surface ${request.surface} 不存在`);
    }
    return renderShelfSettings(request.model);
  },
};

/** DropAgent's settings sections: by purpose, not by data shape. */
const SECTIONS = [
  { id: "setup", title: "权限与连接", tone: "slate", glyph: SHELF_GLYPH.shield, detail: "按需要开启功能。暂存文件和本机文字提取无需这些权限。" },
  { id: "actions", title: "快捷动作", tone: "ochre", glyph: SHELF_GLYPH.bolt, detail: "管理动作，设置动作栏的内容与顺序。" },
  { id: "shortcuts", title: "快捷键", tone: "ochre", glyph: SHELF_GLYPH.keyboard, detail: "设置打开面板、添加文件和抓取网页的快捷键。" },
  { id: "guide", title: "使用指南", tone: "slate", glyph: SHELF_GLYPH.book, detail: "了解材料导入、文件处理和结果导出。" },
  { id: "machine", title: "Agent 与存储", tone: "blue", glyph: SHELF_GLYPH.terminal, detail: "选择本机 Agent，以及材料副本和结果的存放位置。" },
  { id: "appearance", title: "外观", tone: "plum", glyph: SHELF_GLYPH.sun, detail: "设置主题、语言和拖放显示。" },
] as const;

const KIND_LABELS: readonly { kind: ShelfItemKind; label: string }[] = [
  { kind: "pdf", label: "PDF" },
  { kind: "image", label: "图片" },
  { kind: "markdown", label: "Markdown" },
  { kind: "text", label: "文本" },
  { kind: "website", label: "网页" },
  { kind: "url", label: "链接" },
  { kind: "file", label: "其他文件" },
  { kind: "folder", label: "文件夹" },
];

export function renderShelfSettings(model: ShelfSettingsUiModel): string {
  const { primitives: p } = model;
  return `<section class="settings-document shelf-settings-document" data-shelf="settings" data-shelf-settings data-settings-panel="shelf" aria-labelledby="shelf-settings-title">
    <header class="settings-heading">
      <div class="settings-heading-title">
        <h1 id="shelf-settings-title">${p.text("Shelf")}</h1>
      </div>
      <p>${p.text("这些设置只改变 Shelf 在这台设备上的工作方式。")}</p>
    </header>
    <div class="shelf-settings-body">
      ${SECTIONS.map((section) => `<section class="settings-section" data-shelf-settings-pane="${section.id}" aria-labelledby="shelf-settings-${section.id}">
          <h2 id="shelf-settings-${section.id}"><span class="shelf-glyph tone-${section.tone}" aria-hidden="true">${section.glyph}</span>${p.text(section.title)}</h2>
          <p class="shelf-settings-detail">${p.text(section.detail)}</p>
          ${paneBody(section.id, model)}
        </section>`).join("")}
    </div>
  </section>`;
}

function paneBody(id: (typeof SECTIONS)[number]["id"], model: ShelfSettingsUiModel): string {
  switch (id) {
    case "setup": return setupPane(model);
    case "actions": return actionsPane(model);
    case "shortcuts": return shortcutsPane(model);
    case "guide": return guidePane(model);
    case "machine": return machinePane(model);
    default: return appearancePane(model);
  }
}

function setupPane(model: ShelfSettingsUiModel): string {
  const { primitives: p } = model;
  const fact = (key: string, copy: string) => `<div class="settings-setting-row shelf-settings-fact">
      <span class="setting-copy" data-shelf-permission="${key}">${p.text(copy)}</span>
    </div>`;
  return `${fact("accessibility", "辅助功能：加入前台选中文件时需要。")}
    ${fact("automation", "Finder 自动化：抓前台选中文件时系统会询问一次。")}
    ${fact("browsers", "已装浏览器：抓当前页支持 Safari、Chrome，Edge 尽力而为。")}
    ${fact("clipboard", "剪贴板：在别处复制会自动记进历史。")}
    <p class="settings-hint">${p.text("这些权限按需授予。不授权也能上架、预览、拖出和本机抽字。")}</p>`;
}

function actionsPane(model: ShelfSettingsUiModel): string {
  const { primitives: p, settings } = model;
  const rows = settings.action_order.map((slot) => {
    const shortcutId = shortcutIdFromSlot(slot);
    const action = shortcutId ? settings.shortcuts.find((entry) => entry.id === shortcutId) : undefined;
    const recipe = SHELF_RECIPES.find((entry) => entry.recipe === slot);
    const title = action ? action.name : recipe ? recipe.label : slot;
    if (!action && !recipe) return "";
    const hidden = settings.hidden_actions.includes(slot);
    return `<li class="shelf-action-row" data-shelf-action-slot="${p.escape(slot)}" draggable="true">
        <span class="shelf-act-grip" aria-hidden="true"></span>
        <span class="shelf-action-name">${p.escape(title)}</span>
        ${action ? `<span class="shelf-action-tag">${p.text("我的动作")}</span>` : ""}
        <span class="shelf-action-ops">
          <button class="shelf-paper quiet" type="button" data-shelf-action-move="up" aria-label="${p.text("上移")}">↑</button>
          <button class="shelf-paper quiet" type="button" data-shelf-action-move="down" aria-label="${p.text("下移")}">↓</button>
          <button class="shelf-paper quiet" type="button" data-shelf-action-visible aria-pressed="${!hidden}">${p.text(hidden ? "已隐藏" : "在栏上")}</button>
          ${action ? `<button class="shelf-paper quiet" type="button" data-shelf-action-edit>${p.text("编辑")}</button><button class="shelf-paper quiet is-danger" type="button" data-shelf-action-delete>${p.text("删除")}</button>` : ""}
        </span>
      </li>`;
  }).join("");
  return `<div class="shelf-settings-block">
      <h3>${p.text("动作栏")}</h3>
      <p class="settings-hint">${p.text("拖动或用上下键换序。拿掉的动作还能加回来。")}</p>
      <ul class="shelf-action-list" data-shelf-action-list>${rows}</ul>
    </div>
    <div class="shelf-settings-block">
      <h3>${p.text("我的动作")}</h3>
      <p class="settings-hint">${p.text("一句话说明要做什么。它在任务副本里跑，产出「原名-动作.md」。不开放任意 Shell。")}</p>
      ${shortcutForm(model)}
      <p class="shelf-settings-line" data-shelf-shortcut-error hidden></p>
    </div>`;
}

function shortcutForm(model: ShelfSettingsUiModel): string {
  const { primitives: p } = model;
  return `<form class="shelf-shortcut-form" data-shelf-shortcut-form>
      <input type="hidden" data-shelf-shortcut-id value="">
      <label class="shelf-field"><span>${p.text("名称")}</span><input type="text" data-shelf-shortcut-name maxlength="40" placeholder="${p.text("例如：抽联系人")}"></label>
      <label class="shelf-field"><span>${p.text("说明")}</span><textarea data-shelf-shortcut-prompt rows="3" maxlength="2000" placeholder="${p.text("把材料里的联系人写成一张表。")}"></textarea></label>
      <fieldset class="shelf-kinds"><legend>${p.text("适用材料")}</legend>${KIND_LABELS.map((entry) => `<label class="shelf-kind"><input type="checkbox" data-shelf-shortcut-kind="${entry.kind}"${["pdf", "markdown", "text", "website"].includes(entry.kind) ? " checked" : ""}><span>${p.text(entry.label)}</span></label>`).join("")}</fieldset>
      <div class="shelf-form-actions">
        <button class="shelf-primary" type="submit" data-shelf-shortcut-save>${p.text("保存动作")}</button>
        <button class="shelf-paper" type="button" data-shelf-shortcut-reset>${p.text("清空")}</button>
      </div>
    </form>`;
}

function shortcutsPane(model: ShelfSettingsUiModel): string {
  const { primitives: p, settings } = model;
  return `<div class="shelf-settings-block">
      <h3>${p.text("全局")}</h3>
      <p class="shelf-hotkey-lead">${p.text(HOTKEY_GUIDE)}</p>
      ${hotkeyRow(p, "toggle", "打开 / 关闭 Shelf", "置前主窗口并打开 Shelf。若已在 Shelf 且窗口在前，则隐藏主窗口。", settings.hotkeys.toggle)}
      ${hotkeyRow(p, "capture", "抓当前页", "把 Safari、Chrome 或 Edge 放到最前面，抓成钢蓝地球标的网站材料。不装浏览器扩展。", settings.hotkeys.capture)}
      ${hotkeyRow(p, "files", "加入前台选中文件", "优先读 Finder 选中的本地文件。浏览器在最前时请用抓页。", settings.hotkeys.files)}
    </div>
    <div class="shelf-settings-block">
      <h3>${p.text("面板内")}</h3>
      <p class="shelf-hotkey-lead">${p.text("点右边的键再按下新键。面板内的键可以不带修饰键。")}</p>
      ${panelKeyRow(p, "hide", "退出编辑 / 收起", "在预览里按它退出编辑副本。", settings.panel_keys.hide)}
      ${panelKeyRow(p, "paste", "把剪贴板上架", "直接把当前剪贴板加进材料。", settings.panel_keys.paste)}
      ${panelKeyRow(p, "copy", "复制选中", "复制选中的材料或结果。", settings.panel_keys.copy)}
      ${panelKeyRow(p, "delete", "隐藏 / 删除记录", "隐藏当前材料或结果；剪贴板焦点下删除所选历史。", settings.panel_keys.delete)}
      <section class="shelf-hotkey-row">
        <div class="setting-copy">
          <strong>${p.text("上一条 / 下一条")}</strong>
          <span>${p.text("目录里用方向键走。这一条不可改。")}</span>
        </div>
        <div class="shelf-hotkey-keys"><span class="shelf-paper quiet" aria-disabled="true">↑ ↓</span></div>
      </section>
    </div>`;
}

function guidePane(model: ShelfSettingsUiModel): string {
  const { primitives: p } = model;
  const rows: readonly [string, string][] = [
    ["拖到哪里", "菜单栏图标、拖放轮盘，或打开的 Shelf 工作面任意处。"],
    ["收什么", "文件、文件夹、PDF、图片、文字与 Markdown、链接、抓下来的网页，以及多份材料一起。"],
    ["读什么", "动作只读任务目录里的副本，Prompt 不写原路径，也不跟符号链接。"],
    ["写到哪", "结果写进任务目录的 output/，再作为新文件进结果组。原件从不被改。"],
    ["拖出去是什么", "系统认的文件、文字、图片和链接。接不住会弹回，架子上的还在。默认复制，不是移动。"],
    ["不联网", "本机文字提取不调用 Agent、不上网。联网与否在确认页写明。"],
  ];
  return `<div class="shelf-settings-block">
      <button class="shelf-primary" type="button" data-shelf-try-sample>${p.text("再试一次示例 PDF")}</button>
      <p class="settings-hint">${p.text("会在材料里放一份可抽字的示例 PDF，不需要 Agent、授权或联网。")}</p>
    </div>
    <div class="shelf-settings-block">
      <h3>${p.text("能做什么")}</h3>
      <dl class="shelf-guide-list">${rows.map(([key, value]) => `<div class="shelf-guide-row"><dt>${p.text(key)}</dt><dd>${p.text(value)}</dd></div>`).join("")}</dl>
    </div>`;
}

function machinePane(model: ShelfSettingsUiModel): string {
  const { primitives: p, settings } = model;
  const runtime = model.runtime;
  const line = !runtime || !runtime.runtime_key
    ? p.text("未发现终端 Agent。暂存、预览、拖出和本机文字提取仍然可用。")
    : runtime.capability_pending
      ? `${p.escape(runtime.title)} · ${p.text("执行时检查，登录尚未确认")}`
    : runtime.can_run_job
      ? `${p.escape(runtime.title)} · ${p.escape(runtime.isolation_fact)}`
      : `${p.escape(runtime.title)} · ${p.text("没有无界面执行入口，动作不能跑。")}`;
  const catalog = runtime?.catalog ?? [];
  const options = [{ runtime_key: "auto", title: "自动", executable: "auto", can_run_job: true, capability_pending: false, install_url: "" }, ...catalog];
  const rows = options.map((entry) => {
    const on = settings.engine === entry.runtime_key;
    const missing = entry.runtime_key !== "auto" && !entry.executable;
    const state = entry.runtime_key === "auto"
      ? p.text("按安装顺序挑一个")
      : missing
        ? p.text("未装")
        : entry.capability_pending
          ? p.text("执行时检查")
        : entry.can_run_job
          ? p.text("可跑动作")
          : p.text("只能对话");
    const install = entry.install_url
      ? `<a class="shelf-paper quiet" href="${p.escape(entry.install_url)}" target="_blank" rel="noreferrer">${p.text("安装说明")}</a>`
      : "";
    return `<div class="shelf-runtime-pick${missing ? " is-missing" : ""}">
        <label>
          <input type="radio" name="shelf-engine" value="${p.escape(entry.runtime_key)}" data-shelf-engine${on ? " checked" : ""}${missing ? " disabled" : ""}>
          <span class="shelf-runtime-name">${entry.runtime_key === "auto" ? p.text("自动") : p.escape(entry.title)}</span>
          <span class="shelf-runtime-state${entry.executable && entry.can_run_job && entry.runtime_key !== "auto" ? " is-on" : ""}">${state}</span>
        </label>
        ${install}
      </div>`;
  }).join("");
  return `<div class="shelf-settings-block">
      <h3>${p.text("本机 Agent")}</h3>
      <p class="shelf-settings-line" data-shelf-agent-line>${line}</p>
      <div class="shelf-runtime-picks">${rows}</div>
      <p class="settings-hint">${p.text("快捷动作和 CLI Recipe 都跟这一个。没有无界面执行入口的 Agent 仍可对话。")}</p>
    </div>
    <div class="shelf-settings-block">
      <h3>${p.text("自定义 Runtime")}</h3>
      <ul class="shelf-runtime-custom" data-shelf-runtime-list>${settings.custom_runtimes.map((runtime) => customRuntimeRow(p, runtime)).join("")}</ul>
      <form class="shelf-shortcut-form" data-shelf-runtime-form>
        <label class="shelf-field"><span>${p.text("名称")}</span><input type="text" data-shelf-runtime-title maxlength="60" placeholder="${p.text("例如：公司内部 CLI")}"></label>
        <label class="shelf-field"><span>${p.text("可执行文件")}</span><input type="text" data-shelf-runtime-path placeholder="/usr/local/bin/my-agent"></label>
        <label class="shelf-field"><span>${p.text("类型")}</span><select data-shelf-runtime-kind><option value="tui">${p.text("终端会话（TUI）")}</option><option value="cli">${p.text("无界面（CLI）")}</option></select></label>
        <div class="shelf-form-actions">
          <button class="shelf-primary" type="submit">${p.text("添加")}</button>
        </div>
      </form>
      <p class="shelf-settings-line" data-shelf-runtime-error hidden></p>
    </div>
    <div class="shelf-settings-block">
      <h3>${p.text("存放位置")}</h3>
      <p class="shelf-settings-line">${p.escape(model.storage_path ?? "~/.molis-work/shelf")}</p>
      <p class="settings-hint">${p.text("材料副本、任务目录和结果都在这里。删除副本只动这里，原件不动。")}</p>
    </div>`;
}

function customRuntimeRow(p: ShelfUiPrimitives, runtime: ShelfCustomRuntime): string {
  return `<li class="shelf-runtime-row" data-shelf-runtime-id="${p.escape(runtime.id)}">
      <span class="shelf-runtime-name">${p.escape(runtime.title)}</span>
      <span class="shelf-runtime-state">${p.escape(runtime.executable)}</span>
      <span class="shelf-runtime-state">${runtime.kind === "cli" ? p.text("无界面（CLI）") : p.text("终端会话（TUI）")}</span>
      <button class="shelf-paper quiet is-danger" type="button" data-shelf-runtime-delete>${p.text("删除")}</button>
    </li>`;
}

function appearancePane(model: ShelfSettingsUiModel): string {
  const { primitives: p, settings } = model;
  const checked = settings.drop_wheel_enabled ? " checked" : "";
  return `<label class="settings-setting-row settings-toggle-row">
      <span class="setting-copy">
        <strong>${p.text("拖放轮盘")}</strong>
        <span>${p.text("从 Finder 拖到菜单栏时出现动作轮盘。关闭后不再出轮盘，不会开关 Shelf 面板，也不会改 Goal 胶囊。")}</span>
      </span>
      <input class="settings-switch" type="checkbox" role="switch" name="drop_wheel_enabled" data-shelf-drop-wheel${checked}>
    </label>
    <p class="settings-hint">${p.text("主题与语言跟 Molis 的外观设置。")}</p>`;
}

function hotkeyRow(
  p: ShelfUiPrimitives,
  slot: ShelfHotKeySlot,
  title: string,
  caption: string,
  chord: ShelfHotKeyChord,
): string {
  const label = chordLabel(chord);
  const resetHidden = chordsEqual(chord, defaultHotKey(slot)) ? " hidden" : "";
  return `<section class="shelf-hotkey-row" data-shelf-hotkey-slot="${slot}">
        <div class="setting-copy">
          <strong>${p.text(title)}</strong>
          <span data-shelf-hotkey-caption data-idle-caption="${p.escape(caption)}">${p.text(caption)}</span>
        </div>
        <div class="shelf-hotkey-keys">
          <span class="shelf-paper shelf-hotkey-record" role="button" tabindex="0" data-shelf-hotkey-record data-key-code="${chord.key_code}" data-carbon-modifiers="${chord.carbon_modifiers}" aria-pressed="false">${p.text(label)}</span>
          <span class="shelf-paper quiet" role="button" tabindex="0" data-shelf-hotkey-reset${resetHidden}>${p.text(HOTKEY_RESET)}</span>
        </div>
      </section>`;
}

function panelKeyRow(
  p: ShelfUiPrimitives,
  slot: ShelfPanelKeySlot,
  title: string,
  caption: string,
  chord: ShelfDeviceSettings["panel_keys"][ShelfPanelKeySlot],
): string {
  const resetHidden = panelKeysEqual(chord, defaultPanelKey(slot)) ? " hidden" : "";
  return `<section class="shelf-hotkey-row" data-shelf-panel-slot="${slot}">
        <div class="setting-copy">
          <strong>${p.text(title)}</strong>
          <span data-shelf-panel-caption data-idle-caption="${p.escape(caption)}">${p.text(caption)}</span>
        </div>
        <div class="shelf-hotkey-keys">
          <span class="shelf-paper shelf-hotkey-record" role="button" tabindex="0" data-shelf-panel-record data-code="${p.escape(chord.code)}" data-meta="${chord.meta}" data-ctrl="${chord.ctrl}" data-alt="${chord.alt}" data-shift="${chord.shift}" aria-pressed="false">${p.text(panelKeyLabel(chord))}</span>
          <span class="shelf-paper quiet" role="button" tabindex="0" data-shelf-panel-reset${resetHidden}>${p.text(HOTKEY_RESET)}</span>
        </div>
      </section>`;
}

export type { ShelfShortcutAction };
