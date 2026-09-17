import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import type { ShelfDeviceSettings, ShelfHotKeyChord, ShelfHotKeySlot } from "@molis-ai/molis-work-contracts/modules/shelf";
import {
  HOTKEY_GUIDE,
  HOTKEY_RESET,
  chordLabel,
  chordsEqual,
  defaultHotKey,
} from "@molis-ai/molis-work-module-shelf";
import type { ShelfUiPrimitives } from "./ui.js";

export const SHELF_SETTINGS_UI_CONTRIBUTION_ID = "io.molis.work.native.shelf.settings.v1";

export interface ShelfSettingsUiModel {
  readonly settings: ShelfDeviceSettings;
  readonly primitives: ShelfUiPrimitives;
}

export const shelfSettingsUiDescriptor: UiContributionDescriptor = {
  contribution_id: SHELF_SETTINGS_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.native.shelf",
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

export function renderShelfSettings(model: ShelfSettingsUiModel): string {
  const { primitives: p, settings } = model;
  const checked = settings.drop_wheel_enabled ? " checked" : "";
  return `<section class="settings-document shelf-settings-document" data-shelf="settings" data-shelf-settings data-settings-panel="shelf" aria-labelledby="shelf-settings-title">
    <header class="settings-heading">
      <div class="settings-heading-title">
        <h1 id="shelf-settings-title">${p.text("Shelf")}</h1>
      </div>
      <p>${p.text("这些设置只改变 Shelf 在这台设备上的工作方式。")}</p>
    </header>
    <section class="settings-section" aria-labelledby="shelf-settings-appearance">
      <h2 id="shelf-settings-appearance">${p.text("外观")}</h2>
      <label class="settings-setting-row settings-toggle-row">
        <span class="setting-copy">
          <strong>${p.text("拖放轮盘")}</strong>
          <span>${p.text("从 Finder 拖到菜单栏时出现动作轮盘。关闭后不再出轮盘，不会开关 Shelf 面板，也不会改 Goal 胶囊。")}</span>
        </span>
        <input class="settings-switch" type="checkbox" role="switch" name="drop_wheel_enabled" data-shelf-drop-wheel${checked}>
      </label>
    </section>
    <section class="settings-section" aria-labelledby="shelf-settings-hotkeys">
      <h2 id="shelf-settings-hotkeys">${p.text("快捷键")}</h2>
      <p class="shelf-hotkey-lead">${p.text(HOTKEY_GUIDE)}</p>
      ${hotkeyRow(p, "toggle", "打开 / 关闭 Shelf", "置前主窗口并打开 Shelf。若已在 Shelf 且窗口在前，则隐藏主窗口。", settings.hotkeys.toggle)}
      ${hotkeyRow(p, "capture", "抓当前页", "把 Safari、Chrome 或 Edge 放到最前面，抓成钢蓝地球标的网站材料。不装浏览器扩展。", settings.hotkeys.capture)}
      ${hotkeyRow(p, "files", "加入前台选中文件", "优先读 Finder 选中的本地文件。浏览器在最前时请用抓页。", settings.hotkeys.files)}
    </section>
  </section>`;
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
