import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon } from "@molis-ai/molis-work-design-system";
import { CHARACTER_IMPORT_HTML, CHARACTER_SOURCE_HTML } from "./import-ui.js";

export const CHARACTERS_UI_CONTRIBUTION_ID = "io.molis.work.native.characters.ui.v1";
export interface CharactersUiModel { route_prefix: string; primitives: { escape(value: unknown): string } }
export const charactersUiContribution: UiContribution<CharactersUiModel> = {
  descriptor: { contribution_id: CHARACTERS_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.characters", kind: "primary-page", navigation_id: "characters", label: "Characters",
    surfaces: [{ surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" }, { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" }], slots: [] },
  render: request => request.surface === "directory" ? "" : renderCharacters(request.model),
};

export function renderCharacters(model: CharactersUiModel): string {
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="characters" data-work-surface-label="Characters" hidden data-characters data-expanded="false" data-character-api="${model.primitives.escape(model.route_prefix)}/api/plugins/io.molis.work.characters">
    <div class="plugin-stage-list"><header class="plugin-stage-chrome"><button class="mw-btn mw-btn--ghost tree-create" type="button" data-character-new>${icon("plus")}<span>新建角色</span></button><button class="mw-btn mw-btn--secondary" type="button" data-character-import-open>从本机导入</button></header>
      <p class="characters-hint">个人角色库 · 编辑后可发布到当前项目</p><div data-character-list></div><p data-character-empty hidden>还没有角色。添加做事方式，供 Coding 按任务选择。</p>
    </div>
    <div class="plugin-stage-workspace" data-character-workspace hidden>
      <header class="plugin-stage-detail-bar"><button class="mw-btn mw-btn--ghost mw-btn--icon-only plugin-stage-back" type="button" data-character-back aria-label="返回角色列表">${icon("arrow")}</button><h1 data-character-heading>角色</h1><span data-character-status></span></header>
      <form class="characters-editor" data-character-editor>
        <label>名称<input class="mw-input" data-character-title maxlength="120" required autocomplete="off"></label>
        <label>做事方式<textarea class="mw-input" data-character-instructions maxlength="20000" rows="12" placeholder="例如：先复现问题，修改后运行相关检查；未实际验证的事项明确列出。"></textarea></label>
        ${CHARACTER_SOURCE_HTML}
        <fieldset><legend>内置工具范围</legend><label class="characters-check"><input class="mw-check" type="checkbox" data-character-inherit checked>沿用调用方允许的内置工具</label>
          <label data-character-tools-field hidden>限制为这些工具<input class="mw-input" data-character-tools placeholder="read-file, search" autocomplete="off" spellcheck="false"><small>英文名称以逗号分隔；留空表示不用内置工具。选择超出调用方范围的工具会阻止执行。</small></label>
          <small>MCP 工具由调用方另行选择，仍需原有权限和审查。</small>
        </fieldset>
        <div class="characters-actions"><button class="mw-btn mw-btn--primary" type="submit" data-character-save>保存草稿</button><button class="mw-btn mw-btn--secondary" type="button" data-character-preview>预览并发布</button><button class="mw-btn mw-btn--ghost" type="button" data-character-toggle>停用</button><button class="mw-btn mw-btn--ghost" type="button" data-character-delete>删除</button></div>
        <p class="characters-hint" data-character-draft-note></p><button class="mw-btn mw-btn--ghost" type="button" data-character-reload>重新读取已保存的草稿</button>
        <section aria-label="当前项目的角色版本"><h2>当前项目的发布版本</h2><div data-character-publications></div></section>
      </form>
    </div>
    <p class="characters-notice" data-character-notice role="status" aria-live="polite"></p>
    ${CHARACTER_IMPORT_HTML}
    <dialog class="mw-dialog mw-dialog--form characters-dialog" data-character-dialog aria-label="确认角色操作"><form class="mw-form mw-dialog__shell" method="dialog"><header class="mw-form__header"><h2 data-character-dialog-title></h2></header><section class="mw-form__body"><p data-character-dialog-description></p><pre data-character-dialog-content></pre></section><footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" value="cancel">取消</button><button class="mw-btn mw-btn--primary" type="button" data-character-confirm>确认</button></footer></form></dialog>
  </section>`;
}
