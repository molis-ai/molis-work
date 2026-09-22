import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { EXPERIMENTS_PLUGIN_ID, EXPERIMENTS_UI_CONTRIBUTION_ID } from "./manifest.js";
export const experimentsUiContribution: UiContribution<unknown> = {
  descriptor:{contribution_id:EXPERIMENTS_UI_CONTRIBUTION_ID,plugin_id:EXPERIMENTS_PLUGIN_ID,kind:"primary-page",navigation_id:"experiments",label:"实验",surfaces:[{surface_id:"workbench",target_slot_id:"workbench.main",format:"declarative-html"}],slots:[]},
  render:()=>renderExperimentsWorkbench(),
};
export function renderExperimentsWorkbench(): string {
  return `<section class="desktop-work-surface plugin-stage-shell experiments" data-work-surface="experiments" data-work-surface-label="实验" data-expanded="false" hidden>
    <div class="plugin-stage-list">
      <header class="plugin-stage-chrome"><button class="mw-btn mw-btn--secondary" data-exp-new>新建实验</button><button class="mw-btn mw-btn--ghost" data-exp-models>参试模型</button></header>
      <div data-exp-list aria-label="已保存的实验"></div>
    </div>
    <div class="plugin-stage-workspace" data-exp-workspace hidden><main data-exp-main></main></div>
    <p class="exp-notice" data-exp-note role="status" hidden></p>
    <dialog class="mw-dialog mw-dialog--form exp-model-dialog" data-exp-model-dialog aria-labelledby="exp-model-title">
      <div class="mw-form mw-dialog__shell">
        <header class="mw-form__header"><div><h2 id="exp-model-title">参试模型</h2><p>管理模型配置，供新实验选择。</p></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-exp-close-models aria-label="关闭"><svg aria-hidden="true"><use href="#icon-x"></use></svg></button></header>
        <div class="mw-form__body">
          <div data-exp-model-fields></div>
          <details class="exp-section exp-add-model"><summary>添加参试配置</summary><div class="exp-grid"><label>模型类型<select class="mw-input" data-exp-new-kind><option value="jev">Jev</option><option value="laya">Laya multilingual</option><option value="grok">Grok 4.6 / xhigh</option></select></label><label>配置名称<input class="mw-input" data-exp-new-model-name></label></div><button class="mw-btn mw-btn--secondary" type="button" data-exp-add-model>添加配置</button></details>
          <section class="exp-section"><h3>TypeSafe 凭据</h3><label>API Key<input class="mw-input" type="password" autocomplete="new-password" data-exp-key placeholder="留空保留现有凭据"></label><p>由宿主保管，与 Functions 共用。密钥不会写入实验结果。</p></section>
          <p class="exp-muted" data-exp-model-note role="status"></p>
        </div>
        <footer class="mw-form__footer"><button class="mw-btn mw-btn--primary" type="button" data-exp-save-models>保存配置</button></footer>
      </div>
    </dialog>
  </section>`;
}
export { EXPERIMENTS_STYLES } from "./styles.js";
