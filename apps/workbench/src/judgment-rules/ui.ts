import { t as uiText, icon, type MwButtonOptions, renderAlert, renderButton, renderKept, renderStepDot } from "@molis-ai/molis-work-plugin-sdk/ui";

export interface FunctionsUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

interface FunctionsUiModel {
  readonly functions?: readonly unknown[];
  readonly primitives: FunctionsUiPrimitives;
}

export function renderFunctionsWorkbench(model: FunctionsUiModel): string {
  const { primitives: p } = model;
  return `<section class="functions-system-editor plugin-stage-shell" data-functions="workbench" data-expanded="false">
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-functions="directory">
      <header class="plugin-stage-chrome functions-stage-chrome">
        <h1>${uiText("workbench.ui.judgment-rule")}</h1>
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-functions-new>${icon("plus")}<span>${uiText("workbench.ui.new-judgment")}</span></button>
      </header>
      <p class="functions-note" data-functions-list-note role="status" hidden></p>
      <div class="mw-empty" data-functions-empty>
        <span class="mw-empty__mark">${icon("zap")}</span>
        <strong>${uiText("workbench.ui.no-judgments-yet")}</strong>
        <p>${uiText("workbench.ui.turn-recurring-decisions-into-rules-test-them-then") }</p>
      </div>
      <div data-functions-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-functions-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-functions-back aria-label="${uiText("workbench.ui.back")}" title="${uiText("workbench.ui.back")}">${icon("chevron-right")}</button>
        <h1 data-functions-editor-title>${uiText("workbench.ui.evaluation")}</h1>
        <span data-functions-editor-status></span>
        <button class="mw-btn mw-btn--ghost" type="button" data-functions-delete hidden>${uiText("workbench.ui.delete-draft")}</button>
      </div>
      <form class="functions-editor" data-functions-editor>
        <nav class="functions-steps" aria-label="${uiText("workbench.ui.function-setup-steps")}">
          <button type="button" data-functions-step="look" aria-current="step"><span>1</span>${uiText("workbench.ui.choose-use")}</button>
          <button type="button" data-functions-step="fn"><span>2</span>${uiText("workbench.ui.judgment-rule")}</button>
          <button type="button" data-functions-step="use"><span>3</span>${uiText("workbench.ui.test-activate")}</button>
        </nav>
        <div class="functions-columns" data-functions-columns>
          <section class="functions-col" data-functions-col="look" aria-label="${uiText("workbench.ui.choose-use")}">
            <header class="functions-section-heading"><h2 tabindex="-1">${uiText("workbench.ui.what-should-ai-help-decide")}</h2><p data-functions-kind-description></p></header>
            <label class="functions-field functions-name">${uiText("workbench.ui.name")}<input class="mw-input" data-functions-name autocomplete="off" placeholder="${uiText("workbench.ui.example-find-messages-worth-following-up")}"></label>
            <fieldset class="functions-fieldset" data-functions-destinations>
              <legend>${uiText("workbench.ui.where-use-result")}</legend>
              <p class="functions-hint">${uiText("workbench.ui.choose-where-use-result-then-write-rules-can")}</p>
              <div class="functions-dest-list">
                <button class="functions-dest" type="button" data-functions-destination="" data-kind="none"><strong>${uiText("workbench.ui.standalone")}</strong><small>${uiText("workbench.ui.write-test-rules-without-connecting-page-yet")}</small></button>
              </div>
              <p class="functions-hint" data-functions-choice-only hidden>${uiText("workbench.ui.ratings-work-standalone-agents-page-actions-require-choice")}</p>
              <p class="functions-context-note" data-functions-destination-hint></p>
            </fieldset>
            <details class="functions-details" data-functions-subject-details><summary>${uiText("workbench.ui.limit-judgment-subjects-optional")}</summary>
              <fieldset class="functions-fieldset" data-functions-sources><legend>${uiText("workbench.ui.judgment-subjects")}</legend>
                <p class="functions-hint">${uiText("workbench.ui.leave-empty-show-all-actions-use-filters-suggestions")}</p>
                <div class="functions-chips" data-functions-subject-list></div>
              </fieldset>
            </details>
          </section>
          <section class="functions-col" data-functions-col="fn" aria-label="${uiText("workbench.ui.judgment-rule")}" hidden>
            <header class="functions-section-heading"><h2 tabindex="-1">${uiText("workbench.ui.tell-ai-how-judge")}</h2><p>${uiText("workbench.ui.explain-how-judge-then-define-possible-results-drafts")}</p></header>
            <label class="functions-field">${uiText("workbench.ui.judgment-instructions")}<textarea class="mw-input" data-functions-instructions rows="4" placeholder="${uiText("workbench.ui.example-follow-up-messages-related-project-that-need")}"></textarea></label>
            <section class="functions-criteria" data-functions-criteria-panel>
              <div class="functions-criteria-head" data-functions-criteria-head><strong data-functions-criteria-label>${uiText("workbench.ui.possible-results")}</strong><button class="mw-btn mw-btn--ghost" type="button" data-functions-add-criterion hidden>${uiText("workbench.ui.add")}</button></div>
              <p class="functions-hint" data-functions-criteria-hint></p>
              <div data-functions-criteria></div>
              <details class="functions-details" data-functions-palette-details><summary>${uiText("workbench.ui.add-results-plugin-capabilities")}</summary>
                <p class="functions-hint">${uiText("workbench.ui.choose-actions-judgment-may-return-nothing-runs-here")} ${uiText("workbench.ui.only-declared-plugin-tools-page-actions-listed") }</p>
                <label class="functions-field">${uiText("workbench.ui.search-capabilities")}<input class="mw-input" type="search" data-functions-palette-search placeholder="${uiText("workbench.ui.search-plugins-actions-uses")}"></label>
                <div class="functions-palette" data-functions-palette></div>
              </details>
            </section>
            <section class="functions-map" data-functions-map-panel>
              <div class="functions-criteria-head"><strong data-functions-map-title>${uiText("workbench.ui.map-results-page-actions")}</strong></div>
              <p class="functions-hint" data-functions-map-hint>${uiText("workbench.ui.map-every-result-action-before-activating-page")}</p>
              <div data-functions-map></div>
            </section>
            <details class="functions-details"><summary>${uiText("workbench.ui.advanced-invocation-key")}</summary><label class="functions-field">${uiText("workbench.ui.function-key")}<input class="mw-input" data-functions-key spellcheck="false" autocomplete="off"><small>${uiText("workbench.ui.generated-agent-api-calls-locked-after-publishing")}</small></label></details>
          </section>
          <section class="functions-col" data-functions-col="use" aria-label="${uiText("workbench.ui.test-activate")}" hidden>
            <header class="functions-section-heading"><h2 tabindex="-1">${uiText("workbench.ui.test-judgment-before-using")}</h2><p>${uiText("workbench.ui.tests-return-judgment-without-executing-selected-action-type")}</p></header>
            <section class="functions-try">
              <label class="functions-field">${uiText("workbench.ui.test-input")}<textarea class="mw-input" data-functions-preview-input rows="5" placeholder="${uiText("workbench.ui.paste-message-material-real-scenario-check-judgment")}"></textarea></label>
              <div class="functions-actions"><button class="mw-btn mw-btn--secondary" type="button" data-functions-preview>${uiText("workbench.ui.preview")}</button><button class="mw-btn mw-btn--ghost" type="button" data-functions-save-sample>${uiText("workbench.ui.save-sample")}</button></div>
              <details class="functions-details"><summary>${uiText("workbench.ui.saved-samples")}</summary><div data-functions-samples></div></details>
              <div class="functions-preview" data-functions-last-preview hidden aria-live="polite"></div>
            </section>
            <section class="functions-release"><h3>${uiText("workbench.ui.publish-activate")}</h3><p class="functions-hint" data-functions-release-hint></p><button class="mw-btn mw-btn--primary" type="button" data-functions-publish>${uiText("workbench.ui.publish-first-version")}</button><div class="functions-usages" data-functions-usages></div></section>
          </section>
        </div>
        <footer class="functions-editor-footer">
          <div class="functions-feedback"><span class="functions-save-status" data-functions-save-status role="status"></span><div class="functions-band" data-functions-band role="status"></div><p class="functions-note" data-functions-note role="status" hidden></p></div>
          <div class="functions-actions"><button class="mw-btn mw-btn--ghost" type="button" data-functions-prev>${uiText("workbench.ui.previous")}</button><button class="mw-btn mw-btn--primary" type="button" data-functions-next>${uiText("workbench.ui.next-judgment-rules")}</button></div>
        </footer>
      </form>
    </div>
    ${renderKeepEdits(p)}
    <dialog class="mw-dialog" data-functions-leave aria-labelledby="functions-leave-title">
      <form class="mw-form mw-dialog__shell" method="dialog">
        <header class="mw-form__header"><div><h2 id="functions-leave-title">${uiText("workbench.ui.what-wrote-isn-t-saved")}</h2></div></header>
        <div class="mw-form__body"><p>${uiText("workbench.ui.couldn-t-be-saved-time-if-leave-what")}</p></div>
        <footer class="mw-form__footer">${renderButton({ label: uiText.text("workbench.ui.discard-go-back"), variant: "secondary", type: "submit", attrs: { value: "discard", "data-functions-leave-discard": "" } })}${renderButton({ label: uiText.text("workbench.ui.stay-here"), type: "submit", attrs: { value: "stay", autofocus: true, "data-functions-leave-stay": "" } })}</footer>
      </form>
    </dialog>
    <dialog class="mw-dialog mw-dialog--form" data-functions-create-dialog aria-labelledby="functions-create-title">
      <form class="mw-form mw-dialog__shell" data-functions-create-form>
        <header class="mw-form__header"><div><h2 id="functions-create-title">${uiText("workbench.ui.new-judgment")}</h2></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-functions-create-close aria-label="${uiText("common.control.close")}">${icon("x")}</button></header>
        <div class="mw-form__body functions-create-choices">
          <button class="mw-btn mw-btn--secondary" type="submit" name="primitive" value="choice">${uiText("workbench.ui.choose-one-result")}<small>${uiText("workbench.ui.example-follow-up-save-ignore-choice")}</small></button>
          <button class="mw-btn mw-btn--secondary" type="submit" name="primitive" value="noul">${uiText("workbench.ui.decide-yes-no")}<small>${uiText("workbench.ui.example-material-sufficient-noul")}</small></button>
          <button class="mw-btn mw-btn--secondary" type="submit" name="primitive" value="score">${uiText("workbench.ui.rate-scale")}<small>${uiText("workbench.ui.example-rate-urgency-low-medium-high-score")}</small></button>
        </div>
        <p class="functions-note is-error" data-functions-create-note role="status"></p>
      </form>
    </dialog>
  </section>`;
}

const act = (name: string, label: string, primary = false): MwButtonOptions => ({ label, variant: primary ? "primary" : undefined, attrs: { "data-functions-keep-act": name } });
const band = (phase: string, alert: Parameters<typeof renderAlert>[0]): string =>
  `<template data-functions-keep="${phase}">${renderAlert({ role: null, rise: true, attrs: { tabindex: "-1" }, ...alert })}</template>`;

/**
 * What the editor shows when a rule changed elsewhere (docs/design/rule-stale-reload, plan A; specs/action-input-contracts §2.7):
 * one alert per state for the feedback slot, the kept row and the step's dot, drawn by the SDK's parts and cloned by the page.
 * `{version}` is filled in by the page from the record it read.
 */
function renderKeepEdits(_p: FunctionsUiPrimitives): string {
  const reload = act("reload", uiText.text("workbench.ui.load-latest"), true), saveNew = (primary: boolean) => act("save-new", uiText.text("workbench.ui.save-new-rule"), primary);
  return [
    band("conflict", { tone: "warning", title: uiText.text("workbench.ui.rule-changed-elsewhere"), body: uiText.text("workbench.ui.what-wrote-still-here-not-saved-yet"), actions: [reload] }),
    band("offline", { tone: "warning", title: uiText.text("workbench.ui.couldn-t-load-latest-version"), body: uiText.text("workbench.ui.connection-seems-down-what-wrote-still-here-try"), actions: [act("reload", uiText.text("workbench.ui.try-again"), true)] }),
    band("second", { tone: "warning", title: uiText.text("workbench.ui.rule-changed-again"), body: uiText.text("workbench.ui.someone-may-still-be-working-what-wrote-still"), actions: [saveNew(false), reload] }),
    band("deleted", { tone: "warning", title: uiText.text("workbench.ui.rule-was-deleted"), body: uiText.text("workbench.ui.what-wrote-still-here-can-keep-new-rule"), actions: [act("discard", uiText.text("workbench.ui.discard")), saveNew(true)] }),
    band("published", { tone: "warning", title: uiText.text("workbench.ui.rule-was-published-elsewhere-version", { version: "{version}" }), body: uiText.text("workbench.ui.published-rule-can-t-change-what-wrote-still"), actions: [act("view", uiText.text("workbench.ui.view-version", { version: "{version}" })), saveNew(true)] }),
    band("viewing", { title: uiText.text("workbench.ui.published-version", { version: "{version}" }), body: uiText.text("workbench.ui.what-wrote-still-kept-can-start-new-one"), actions: [saveNew(true)] }),
    band("settled", { title: uiText.text("workbench.ui.rule-was-published-elsewhere-version", { version: "{version}" }), body: uiText.text("workbench.ui.published-rule-can-t-change") }),
    band("clean", { title: uiText.text("workbench.ui.rule-just-changed-elsewhere-so-re-latest-now"), body: uiText.text("workbench.ui.take-look-before-publish"), actions: [act("goto", uiText.text("workbench.ui.see-what-changed"))] }),
    band("loaded", { tone: "success", state: "done", title: uiText.text("workbench.ui.latest-version-loaded"), body: " ", actions: [act("dismiss", uiText.text("workbench.ui.collapse"))] }),
    band("saved-new", { tone: "success", state: "done", title: uiText.text("workbench.ui.saved-new-rule"), body: uiText.text("workbench.ui.name-content-what-wrote"), actions: [act("dismiss", uiText.text("workbench.ui.collapse"))] }),
    `<template data-functions-keep="busy">${renderButton({ label: "", loading: true, attrs: { "data-functions-keep-act": "busy" } })}</template>`,
    `<template data-functions-keep="kept">${renderKept({ who: uiText.text("workbench.ui.wrote"), text: "", rise: true, action: { label: uiText.text("workbench.ui.put-back"), attrs: { "data-functions-kept-swap": "" } }, more: { label: uiText.text("workbench.ui.show-all"), attrs: { hidden: true, "data-functions-kept-more": "" } } })}</template>`,
    `<template data-functions-keep="dot">${renderStepDot({ label: uiText.text("workbench.ui.something-changed-step") })}</template>`,
  ].join("");
}
