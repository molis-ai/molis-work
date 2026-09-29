import { renderRadio } from "@molis-ai/molis-work-design-system";

/** Runtime management uses the existing Workbench form and dialog components. */
export function renderPluginEventRecovery(L: (text: string) => string): string {
  return `<section data-plugin-events hidden>
    <div class="plugin-market-section-head"><h2>${L("待核对的插件通知")}</h2><button type="button" class="mw-btn mw-btn--ghost" data-plugin-events-refresh>${L("重新读取")}</button></div>
    <p class="plugin-market-status" role="status" data-plugin-events-status></p>
    <div data-plugin-events-list></div>
    <details class="mw-disclosure" data-plugin-events-history hidden><summary>${L("处理记录")}</summary><div data-plugin-events-history-list></div></details>
    <dialog class="mw-dialog mw-dialog--form" data-plugin-event-dialog aria-labelledby="plugin-event-title">
      <form class="mw-form mw-dialog__shell" data-plugin-event-form>
        <header class="mw-form__header"><h2 id="plugin-event-title">${L("核对这条通知")}</h2></header>
        <div class="mw-form__body">
          <p data-plugin-event-description></p>
          <p>${L("原处理可能已经产生结果。先核对实际结果；重试可能重复执行，跳过只结束这一条通知。")}</p>
          <details class="mw-disclosure"><summary>${L("通知详情")}</summary><pre data-plugin-event-payload></pre></details>
          <label>${L("处理依据")}<textarea class="mw-textarea" name="reason" rows="3" maxlength="2000" required></textarea></label>
          <fieldset class="mw-radio-group" data-slot="radio-group" role="radiogroup"><legend>${L("处理方式")}</legend>
            ${renderRadio({ name: "decision", value: "skip", label: L("跳过这一条"), attrs: { required: true } })}
            ${renderRadio({ name: "decision", value: "retry", label: L("重新处理，接受重复执行的可能"), attrs: { required: true } })}
          </fieldset>
          <p class="form-error" role="alert" data-plugin-event-error hidden></p>
        </div>
        <footer class="mw-form__footer"><button type="button" class="mw-btn mw-btn--secondary" data-plugin-event-cancel>${L("取消")}</button><button type="button" class="mw-btn mw-btn--ghost" data-plugin-event-reload>${L("重新读取")}</button><button type="submit" class="mw-btn mw-btn--primary">${L("确认处理")}</button></footer>
      </form>
    </dialog>
  </section>`;
}
