import type { UiContribution, UiContributionDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon } from "@molis-ai/molis-work-design-system";
import { CHARACTER_IMPORT_HTML, CHARACTER_SOURCE_HTML } from "./import-ui.js";

export const CHARACTERS_UI_CONTRIBUTION_ID = "io.molis.work.native.characters.ui.v1";
export const CHARACTERS_SETTINGS_UI_CONTRIBUTION_ID = "io.molis.work.native.characters.settings.v1";
export interface CharactersUiModel { route_prefix: string; primitives: { escape(value: unknown): string } }

/** The page a project renders with its running plugin. It is the 角色 page of settings (it marks itself so). */
export const charactersUiContribution: UiContribution<CharactersUiModel> = {
  descriptor: { contribution_id: CHARACTERS_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.characters", kind: "primary-page", navigation_id: "characters", label: "Characters",
    surfaces: [{ surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" }, { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" }], slots: [] },
  render: request => request.surface === "directory" ? "" : renderCharacters(request.model),
};

export interface CharactersSettingsUiModel {
  readonly projects: readonly { readonly project_id: string; readonly name: string; readonly href: string }[];
  readonly primitives: { escape(value: unknown): string };
}

export const charactersSettingsUiDescriptor: UiContributionDescriptor = {
  contribution_id: CHARACTERS_SETTINGS_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.characters",
  kind: "settings-page",
  navigation_id: "characters",
  label: "角色",
  surfaces: [{ surface_id: "settings", target_slot_id: "workbench.settings", format: "declarative-html" }],
  slots: [],
};

/**
 * Settings › 角色 outside any project. Publishing lands in a project, so the page is managed from inside one;
 * here it says so and offers the projects.
 */
export const charactersSettingsUiContribution: UiContribution<CharactersSettingsUiModel> = {
  descriptor: charactersSettingsUiDescriptor,
  render(request) {
    if (request.surface !== "settings") throw new Error(`Characters settings surface ${request.surface} 不存在`);
    const { projects, primitives: p } = request.model;
    const rows = projects.map(project => `<a class="characters-project-link" href="${p.escape(project.href)}">${icon("folder")}<span>${p.escape(project.name)}</span>${icon("chevron-right")}</a>`).join("");
    return `<section class="settings-document characters-settings-entry" aria-labelledby="settings-title" data-settings-panel="characters">
      <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">角色</h1></div>
        <p>角色是交给 AI 的做事方式：你自己写的，以及系统和插件带来的。角色属于你，发布时固定到一个项目，所以在项目里管理。</p></header>
      <section class="settings-section"><h2>在哪个项目里打开</h2>${rows || `<p class="characters-hint">还没有项目。先创建一个项目，再回来写角色。</p>`}</section>
    </section>`;
  },
};

const STEPS: readonly [string, string][] = [
  ["写下做事方式", "像交代给同事一样：先做什么、怎么验证、哪些不能碰。"],
  ["发布到当前项目", "发布会固定一个版本；之后修改不影响已经在跑的任务。"],
  ["做事时选用", "在 Coding 或助理里选这个角色；它能做什么仍由系统授权决定。"],
];

export function renderCharacters(model: CharactersUiModel): string {
  const steps = STEPS.map(([title, detail], index) => `<li><span class="characters-step-mark" aria-hidden="true">${index + 1}</span><span><strong>${title}</strong><small>${detail}</small></span></li>`).join("");
  return `<section class="desktop-work-surface characters-page" data-work-surface="characters" data-work-surface-label="角色" data-settings-page="characters" hidden data-characters data-expanded="false" data-character-api="${model.primitives.escape(model.route_prefix)}/api/plugins/io.molis.work.characters">
    <div class="characters-list-view" data-character-list-view>
      <header class="settings-heading characters-heading"><div class="settings-heading-title"><h1>角色</h1></div>
        <p>角色是交给 AI 的做事方式。写你自己的角色，或调整系统与插件带来的角色；任务开始时再选用哪一个。</p></header>
      <ol class="characters-steps" aria-label="角色怎么用">${steps}</ol>
      <section class="settings-section characters-block" aria-labelledby="characters-mine-title">
        <header class="characters-block-head"><div><h2 id="characters-mine-title">我的角色</h2><p class="characters-hint">只属于你，所有项目都能用；发布到当前项目后，这个项目的任务才能选它。</p></div>
          <div class="characters-block-actions"><button class="mw-btn mw-btn--secondary" type="button" data-character-import-open>${icon("upload")}<span>从本机导入</span></button><button class="mw-btn mw-btn--primary" type="button" data-character-new>${icon("plus")}<span>新建角色</span></button></div></header>
        <div class="characters-rows" data-character-list role="list"></div>
        <div class="characters-empty" data-character-empty hidden><strong>还没有自己的角色</strong><p>新建一个，写下你希望 AI 怎么做事；或从 Codex、Claude Code 等本机 Agent 导入已有的规则与 Skills。</p></div>
      </section>
      <section class="settings-section characters-block characters-builtin" aria-labelledby="characters-builtin-title" data-character-builtin data-character-builtin-api="/api/agent-definitions/roles" data-character-builtin-settings="/settings/prompts">
        <header class="characters-block-head"><div><h2 id="characters-builtin-title">系统与插件带来的角色</h2>
          <p class="characters-hint">由系统和插件登记。打开一个，可以改组成它的提示词，从它的下一轮执行开始生效，随时能恢复默认；它能做什么仍由系统决定。</p></div></header>
        <div class="characters-rows" data-character-builtin-list role="list"><p class="characters-hint mw-loading">正在读取…</p></div>
      </section>
    </div>
    <div class="characters-editor-view" data-character-workspace hidden>
      <header class="characters-editor-bar"><button class="mw-btn mw-btn--ghost mw-btn--icon-only plugin-stage-back" type="button" data-character-back aria-label="返回角色列表" title="返回角色列表">${icon("chevron-right")}</button>
        <div class="characters-editor-title"><h1 data-character-heading tabindex="-1">角色</h1><span class="characters-state" data-character-status></span></div></header>
      <form class="characters-editor" data-character-editor>
        <section class="settings-section characters-block" aria-labelledby="characters-way-title">
          <h2 id="characters-way-title">做事方式</h2>
          <label>名称<input class="mw-input" data-character-title maxlength="120" required autocomplete="off"></label>
          <label>做事方式<textarea class="mw-input" data-character-instructions maxlength="20000" rows="12" placeholder="例如：先复现问题，修改后运行相关检查；未实际验证的事项明确列出。"></textarea><small>像交代给同事一样写：先做什么、怎么验证、哪些不能碰。</small></label>
        </section>
        ${CHARACTER_SOURCE_HTML}
        <section class="settings-section characters-block" aria-labelledby="characters-scope-title">
          <h2 id="characters-scope-title">能用什么</h2>
          <fieldset><legend>内置工具</legend><label class="characters-check"><input class="mw-check" type="checkbox" data-character-inherit checked>沿用调用方允许的内置工具</label>
            <label data-character-tools-field hidden>限制为这些工具<input class="mw-input" data-character-tools placeholder="read-file, search" autocomplete="off" spellcheck="false"><small>英文名称以逗号分隔；留空表示不用内置工具。选择超出调用方范围的工具会阻止执行。</small></label>
            <small>这些限制用于 Molis 内置引擎。外部原生 Agent 使用自己的工具与权限。</small>
          </fieldset>
          <fieldset><legend>动作能力</legend><label class="characters-check"><input class="mw-check" type="checkbox" data-character-actions-inherit checked>沿用任务选择的能力</label>
            <div data-character-actions-field hidden><p class="characters-hint">只允许使用下列能力；留空表示不使用动作能力。选择角色不会自动选择工具或授予权限。</p><div data-character-actions-list></div></div>
            <p class="characters-hint" data-character-actions-status role="status"></p>
            <div class="characters-inline-actions"><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-character-actions-refresh>${icon("refresh")}<span>刷新能力目录</span></button><a class="characters-link" href="/capabilities/access?client=agent%3Aprologue">管理内置 Agent 授权</a></div>
          </fieldset>
        </section>
        <section class="settings-section characters-block" aria-labelledby="characters-publish-title">
          <div class="characters-block-head"><div><h2 id="characters-publish-title">发布到当前项目</h2><p class="characters-hint">发布会固定当前内容，成为一个版本；Coding 与助理只能选已发布的版本，已有任务保持原版本。</p></div>
            <div class="characters-block-actions"><button class="mw-btn mw-btn--secondary" type="button" data-character-preview>预览并发布</button></div></div>
          <div class="characters-versions" data-character-publications aria-label="当前项目的角色版本"></div>
        </section>
        <section class="settings-section characters-block characters-danger" aria-labelledby="characters-state-title">
          <h2 id="characters-state-title">停用或删除</h2>
          <p class="characters-hint">停用后新的任务不能再选它，已完成的记录和版本都保留；删除不能恢复。</p>
          <div class="characters-inline-actions"><button class="mw-btn mw-btn--secondary" type="button" data-character-toggle>停用</button><button class="mw-btn mw-btn--ghost" type="button" data-character-delete>删除角色</button></div>
        </section>
        <footer class="characters-savebar"><p class="characters-hint" data-character-draft-note></p>
          <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-character-reload>重新读取已保存的草稿</button>
          <button class="mw-btn mw-btn--primary" type="submit" data-character-save>保存草稿</button></footer>
      </form>
    </div>
    <p class="characters-notice" data-character-notice role="status" aria-live="polite"></p>
    ${CHARACTER_IMPORT_HTML}
    <dialog class="mw-dialog mw-dialog--form characters-dialog" data-character-dialog aria-label="确认角色操作"><form class="mw-form mw-dialog__shell" method="dialog"><header class="mw-form__header"><h2 data-character-dialog-title></h2></header><section class="mw-form__body"><p data-character-dialog-description></p><pre data-character-dialog-content></pre></section><footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" value="cancel">取消</button><button class="mw-btn mw-btn--primary" type="button" data-character-confirm>确认</button></footer></form></dialog>
  </section>`;
}
