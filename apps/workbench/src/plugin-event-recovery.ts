import { t as uiText, renderRadio } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Runtime management uses the existing Workbench form and dialog components. */
export function renderPluginEventRecovery(_L: (text: string) => string): string {
  return `<section data-plugin-events hidden>
    <div class="plugin-market-section-head"><h2 tabindex="-1" data-plugin-events-heading>${uiText("workbench.plugin-event-recovery.plugin-notifications-review")}</h2><button type="button" class="mw-btn mw-btn--ghost" data-plugin-events-refresh>${uiText("workbench.plugin-event-recovery.reload")}</button></div>
    <p class="plugin-market-status" role="status" data-plugin-events-status></p>
    <div data-plugin-events-list></div>
    <details class="mw-disclosure" data-plugin-events-history hidden><summary>${uiText("workbench.plugin-event-recovery.decision-history")}</summary><div data-plugin-events-history-list></div></details>
    <dialog class="mw-dialog mw-dialog--form" data-plugin-event-dialog aria-labelledby="plugin-event-title">
      <form class="mw-form mw-dialog__shell" data-plugin-event-form>
        <header class="mw-form__header"><h2 id="plugin-event-title">${uiText("workbench.plugin-event-recovery.review-notification")}</h2></header>
        <div class="mw-form__body">
          <p data-plugin-event-description></p>
          <p>${uiText("workbench.plugin-event-recovery.original-handler-may-already-have-produced-result-check")}</p>
          <details class="mw-disclosure"><summary>${uiText("workbench.plugin-event-recovery.notification-details")}</summary><pre data-plugin-event-payload></pre></details>
          <label>${uiText("workbench.plugin-event-recovery.reason-decision")}<textarea class="mw-textarea" name="reason" rows="3" maxlength="2000" required></textarea></label>
          <fieldset class="mw-radio-group" data-slot="radio-group" role="radiogroup"><legend>${uiText("workbench.plugin-event-recovery.treatment")}</legend>
            ${renderRadio({ name: "decision", value: "skip", label: uiText.text("workbench.plugin-event-recovery.skip-notification"), attrs: { required: true } })}
            ${renderRadio({ name: "decision", value: "retry", label: uiText.text("workbench.plugin-event-recovery.retry-accepting-that-effects-may-be-repeated"), attrs: { required: true } })}
          </fieldset>
          <p class="form-error" role="alert" data-plugin-event-error hidden></p>
        </div>
        <footer class="mw-form__footer"><button type="button" class="mw-btn mw-btn--secondary" data-plugin-event-cancel>${uiText("common.control.cancel")}</button><button type="button" class="mw-btn mw-btn--ghost" data-plugin-event-reload>${uiText("workbench.plugin-event-recovery.reload")}</button><button type="submit" class="mw-btn mw-btn--primary">${uiText("workbench.plugin-event-recovery.confirm-decision")}</button></footer>
      </form>
    </dialog>
  </section>`;
}
