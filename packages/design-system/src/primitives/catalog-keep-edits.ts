// The board's parts for keeping someone's edits when what they were editing changed elsewhere (docs/design/rule-stale-reload/
// README.md「组件板新增」, decided by the user 2026-11-06: plan A, caught in place): buttons inside an alert, the row that keeps what
// you wrote under its field, the dot on a step, and a field's arrival wash. Their rules are KEEP_EDITS_STYLES in the served sheets,
// since N14's rule editor and Feed's rule page draw them; the board's page loads the settings sheet. Every control is an existing one.
import { type MwButtonOptions, renderAlert, renderButton, renderField, renderKept, renderStepDot, renderTextarea } from "@molis-ai/molis-work-plugin-sdk/ui";
import { section, specimen } from "./catalog-parts.js";
import type { Say } from "./catalog-composer.js";

/** The board's own arrangement of the specimens; the parts' rules are KEEP_EDITS_STYLES in the served sheets. The held wash shows its
 * brightest frame, to judge it in both themes. */
export const KEEP_EDITS_BOARD_STYLES = `
  .mw-keep-stack { display: grid; gap: 8px; width: min(100%, 560px); min-width: 0; }
  .mw-keep-stack .functions-steps { flex-wrap: wrap; min-width: 0; padding: 8px 0; border-bottom: 0; }
  [data-keep-wash-hold]::after { animation: none; opacity: 1; }
`;

const LONG_TITLE = "workbench.catalog-keep-edits.this-rule-changed-elsewhere-and-in-exactly";
const LONG_BODY = "workbench.catalog-keep-edits.what-you-wrote-is-still-here-not";
const LONG_ACTION = "workbench.catalog-keep-edits.load-the-latest-version-then-decide-field";
const SHORT_KEPT = "workbench.catalog-keep-edits.only-messages-customers-sent-directly-forwarded-ones-2";
const LATEST_KEPT = "workbench.catalog-keep-edits.every-message-from-a-customer-counts-forwarded";
const LONG_KEPT = "workbench.catalog-keep-edits.only-messages-customers-sent-directly-forwarded-ones";

/**
 * 收起 already has two English texts in the served dictionaries and the translation gate allows no third, while the decided sample
 * says Dismiss on an alert and Show less on a fold. Until N14's interface gives them stable keys, the board picks by language itself.
 */

function alertActionsSection(say: Say): string {
  const load = (): MwButtonOptions => ({ label: say("workbench.ui.load-latest"), variant: "primary" });
  const keepAsNew = (): MwButtonOptions => ({ label: say("workbench.ui.save-new-rule") });
  const stack = (body: string) => `<div class="mw-keep-stack">${body}</div>`;
  const replay = (attr: string, label: string) => renderButton({ label: say(label), variant: "secondary", attrs: { [attr]: "" } });
  return section("alert-actions", say("workbench.catalog-keep-edits.alert-actions"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-keep-edits.something-to-deal-with-one-primary-button"), stack(renderAlert({ tone: "warning", title: say("workbench.ui.rule-changed-elsewhere"), body: say("workbench.ui.what-wrote-still-here-not-saved-yet"), actions: [load()] })))}
    ${specimen(say("workbench.catalog-keep-edits.two-ways-out-the-primary-comes-last"), stack(renderAlert({ tone: "warning", title: say("workbench.ui.rule-changed-again"), body: say("workbench.ui.someone-may-still-be-working-what-wrote-still"), actions: [keepAsNew(), load()] })))}
    ${specimen(say("workbench.catalog-keep-edits.a-spinner-only-when-it-is-slow"), stack(renderAlert({ tone: "warning", title: say("workbench.ui.rule-changed-elsewhere"), body: say("workbench.ui.what-wrote-still-here-not-saved-yet"), actions: [{ ...load(), loading: true }] })))}
    ${specimen(say("workbench.catalog-keep-edits.bad-news-said-calmly-with-a-next"), stack(renderAlert({ tone: "warning", title: say("workbench.ui.couldn-t-load-latest-version"), body: say("workbench.ui.connection-seems-down-what-wrote-still-here-try"), actions: [{ label: say("common.appearance.try-again"), variant: "primary" }] })))}
    ${specimen(say("workbench.catalog-keep-edits.only-telling-you-no-primary-button"), stack(renderAlert({ title: say("workbench.ui.rule-just-changed-elsewhere-so-re-latest-now"), body: say("workbench.ui.take-look-before-publish"), actions: [{ label: say("workbench.ui.see-what-changed") }] })))}
    ${specimen(say("workbench.catalog-keep-edits.done-rises-in-the-tick-settles"), stack(`<div data-keep-rise>${renderAlert({ tone: "success", state: "done", rise: true, title: say("workbench.ui.latest-version-loaded"), body: say("workbench.catalog-keep-edits.instructions-changed-on-both-sides-yours-is"), actions: [{ label: say("common.control.close") }] })}</div><div class="mw-catalog__row">${replay("data-keep-replay-rise", "workbench.catalog-keep-edits.play-again")}</div>`))}
    ${specimen(say("workbench.catalog-keep-edits.when-a-press-is-blocked-one-small"), stack(`<div data-keep-nudge>${renderAlert({ tone: "warning", title: say("workbench.ui.rule-changed-elsewhere"), body: say("workbench.ui.what-wrote-still-here-not-saved-yet"), attrs: { tabindex: "-1" }, actions: [load()] })}</div><div class="mw-catalog__row">${renderButton({ label: say("workbench.client-records.publish-v1"), variant: "secondary", attrs: { "data-keep-press": "" } })}</div>`))}
    ${specimen(say("workbench.catalog-keep-edits.most-crowded-a-long-title-long-text"), stack(renderAlert({ tone: "warning", title: say(LONG_TITLE), body: say(LONG_BODY), actions: [{ label: say("workbench.catalog-keep-edits.start-fresh-with-what-i-wrote") }, { label: say("workbench.catalog-keep-edits.load-latest-then-put-back"), variant: "primary" }] })))}
    ${specimen(say("workbench.catalog-keep-edits.most-crowded-a-button-s-words-wrap"), stack(renderAlert({ tone: "warning", title: say("workbench.ui.rule-changed-elsewhere"), body: say("workbench.ui.what-wrote-still-here-not-saved-yet"), actions: [{ label: say("workbench.ui.save-new-rule") }, { label: say(LONG_ACTION), variant: "primary", attrs: { "data-keep-long-label": "" } }] })))}
  </div>`);
}

function keptSection(say: Say): string {
  const put = say("workbench.client-keep.put-back"), back = say("workbench.client-keep.swap-back"), yours = say("workbench.client-keep.wrote"), latest = say("workbench.client-keep.latest-version");
  const putName = say("workbench.client-keep.put-back-what-wrote-field", { field: say("workbench.client-keep.judgment-instructions") }), backName = say("workbench.client-keep.swap-back-latest-field", { field: say("workbench.client-keep.judgment-instructions") });
  const more = () => ({ label: say("workbench.client-keep.show-all"), attrs: { "data-keep-more": "", "data-keep-open": say("workbench.client-keep.show-all"), "data-keep-close": say("workbench.catalog-keep-edits.show-less") } });
  const field = (value: string) => renderField({ label: say("workbench.client-keep.judgment-instructions"), control: renderTextarea({ rows: 3, value: say(value), attrs: { "data-keep-field": "" } }) });
  const row = (kept: string, options: { long?: boolean; swapped?: boolean; rise?: boolean; index?: number } = {}) => renderKept({
    who: options.swapped ? latest : yours,
    text: say(kept),
    swapped: options.swapped,
    rise: options.rise,
    index: options.index,
    action: { label: options.swapped ? back : put, attrs: { "data-keep-swap": "", "aria-label": options.swapped ? backName : putName } },
    ...(options.long ? { more: more() } : {}),
    attrs: { "data-keep-labels": JSON.stringify({ yours, latest, put, back, putName, backName }) },
  });
  const swapping = (value: string, kept: string, options: { long?: boolean; swapped?: boolean } = {}) => `<div class="mw-keep-stack" data-keep-pair><div data-keep-box>${field(value)}</div>${row(kept, options)}</div>`;
  return section("kept", say("workbench.catalog-keep-edits.kept-value"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-keep-edits.changed-on-both-sides-yours-sits-under"), swapping(LATEST_KEPT, SHORT_KEPT))}
    ${specimen(say("workbench.catalog-keep-edits.once-put-back-the-same-slot-holds"), swapping(SHORT_KEPT, LATEST_KEPT, { swapped: true }))}
    ${specimen(say("workbench.catalog-keep-edits.you-had-cleared-this-field"), `<div class="mw-keep-stack">${field(LATEST_KEPT)}${renderKept({ who: yours, text: "", blankText: say("workbench.client-keep.cleared-field"), action: { label: put, attrs: { "aria-label": putName } } })}</div>`)}
    ${specimen(say("workbench.catalog-keep-edits.most-crowded-long-text-folds-to-three"), swapping(LATEST_KEPT, LONG_KEPT, { long: true }))}
    ${specimen(say("workbench.catalog-keep-edits.a-group-one-after-another"), `<div class="mw-keep-stack"><div class="mw-keep-stack" data-keep-group>${[0, 1, 2].map((index) => renderKept({ who: yours, text: say(SHORT_KEPT), rise: true, index, action: { label: put, attrs: { "aria-label": say("workbench.client-keep.put-back-what-wrote-field", { field: say(["workbench.client-keep.judgment-instructions", "workbench.catalog-keep-edits.criteria", "workbench.catalog-keep-edits.how-the-result-is-used"][index]!) }) } } })).join("")}</div><div class="mw-catalog__row">${renderButton({ label: say("workbench.catalog-keep-edits.play-again"), variant: "secondary", attrs: { "data-keep-replay-group": "" } })}</div></div>`)}
  </div>`);
}

function stepDotSection(say: Say): string {
  const dot = () => renderStepDot({ label: say("workbench.ui.something-changed-step") });
  const steps = (names: readonly string[], current: number, dotted: readonly number[]) => `<nav class="functions-steps" aria-label="${say("workbench.catalog-keep-edits.rule-setup-steps")}" data-keep-steps>${names.map((name, index) => `<button type="button"${index === current ? ' aria-current="step"' : ""}><span>${index + 1}${dotted.includes(index) ? dot() : ""}</span>${say(name)}</button>`).join("")}</nav>`;
  return section("step-dot", say("workbench.catalog-keep-edits.step-dot"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-keep-edits.a-change-on-another-step-the-dot"), `<div class="mw-keep-stack">${steps(["workbench.ui.choose-use", "workbench.ui.judgment-rule", "workbench.ui.test-activate"], 0, [2])}</div>`)}
    ${specimen(say("workbench.catalog-keep-edits.on-two-steps"), `<div class="mw-keep-stack">${steps(["workbench.ui.choose-use", "workbench.ui.judgment-rule", "workbench.ui.test-activate"], 2, [0, 1])}</div>`)}
    ${specimen(say("workbench.catalog-keep-edits.most-crowded-long-step-names"), `<div class="mw-keep-stack">${steps(["workbench.catalog-keep-edits.first-choose-what-this-judgment-rule-is", "workbench.catalog-keep-edits.then-write-down-how-to-judge-and", "workbench.catalog-keep-edits.finally-try-a-few-samples-and-decide"], 1, [0, 2])}</div>`)}
  </div>`);
}

function fieldWashSection(say: Say): string {
  const field = (value: string) => renderField({ label: say("workbench.client-keep.judgment-instructions"), control: renderTextarea({ rows: 5, value: say(value) }) });
  return section("field-wash", say("workbench.catalog-keep-edits.field-arrival"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-keep-edits.held-at-its-brightest-frame"), `<div class="mw-keep-stack"><div data-craft-new="field" data-keep-wash-hold>${field(LATEST_KEPT)}</div></div>`)}
    ${specimen(say("workbench.catalog-keep-edits.the-real-thing-one-faint-glow"), `<div class="mw-keep-stack"><div data-keep-wash>${field(LONG_KEPT)}</div><div class="mw-catalog__row">${renderButton({ label: say("workbench.catalog-keep-edits.glow-again"), variant: "secondary", attrs: { "data-keep-replay-wash": "" } })}</div></div>`)}
  </div>`);
}

export function keepEditsSections(say: Say): string {
  return alertActionsSection(say) + keptSection(say) + stepDotSection(say) + fieldWashSection(say);
}
