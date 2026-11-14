import { readFileSync } from "node:fs";
import { t as uiText, escapeHtml, renderAlert, renderButton, renderCheckbox, renderChoice, renderField, renderRadioGroup, renderStatusMark } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderConnectorMark } from "./settings-connectors.js";
import {
  renderConnectionCard, renderConnectionItem, renderConnectionProgress, SERVICE_CONNECTION_PART_STYLES,
  type ConnectionProgressState,
} from "./service-connection-parts.js";

/**
 * The component board's 服务连接 section: the three parts plan A of the service-connection decision added
 * (specs/assistant-service-connections §13.1; the prototype is docs/design/service-connections/), each in every state it
 * has — not started, under way, signed out, switching account, not one-click yet, refused, cancelled, rate limited, done. The
 * services, accounts and keys are sample data;
 * nothing signs in or is stored. The two 试一下 specimens move on timers, the way a real connection would.
 */
type Say = (text: string, values?: Record<string, string | number>) => string;

const SIGN_IN = ["workbench.service-connection-specimens.sign-in", "workbench.service-connection-specimens.see-what-it-can-do", "workbench.service-connection-parts.ready"] as const;
const KEY = ["workbench.service-connection-parts.add-key", "workbench.service-connection-parts.verify-key", "workbench.service-connection-parts.ready"] as const;

function figure(caption: string, body: string): string {
  return `<figure class="mw-catalog__specimen"><figcaption>${escapeHtml(caption)}</figcaption>${body}</figure>`;
}

function steps(readText: Say, names: readonly string[], at: number, state: ConnectionProgressState, live?: boolean): string {
  return renderConnectionProgress({ steps: names.map((name) => uiText.text(name)), at, state, live }, readText);
}

function feedback(status: string, body: string): string {
  return `<div class="settings-connector-feedback" role="status">${status}<p>${escapeHtml(body)}</p></div>`;
}

function primary(label: string, attrs: Record<string, string> = {}): string {
  return renderButton({ label, variant: "primary", key: "↵", attrs });
}

function capabilities(_readText: Say, can: readonly string[], not?: string): string {
  return `<ul class="settings-connector-capabilities">${can.map((one) => `<li data-fulfillment="live"><span>${escapeHtml(uiText.text("workbench.service-connection-specimens.can"))}</span>${escapeHtml(uiText.text(one))}</li>`).join("")}${not ? `<li data-fulfillment="not"><span>${escapeHtml(uiText.text("workbench.service-connection-specimens.not-asked"))}</span>${escapeHtml(uiText.text(not))}</li>` : ""}</ul>`;
}

const state = (tone: string, ring: string, label: string) => `<span class="settings-state settings-state--${tone}" data-mw-state="${ring}">${escapeHtml(label)}</span>`;
const running = (label: string) => renderStatusMark({ label, state: "running", tone: "progress", plain: true });
const actions = (body: string) => `<div class="settings-connection-row__actions">${body}</div>`;

function keyField(_L: Say, rejected: boolean): string {
  return renderField({
    label: uiText.text("workbench.service-connection-specimens.mini-max-api-key"),
    hint: rejected ? undefined : uiText.text("workbench.service-connection-specimens.create-one-under-api-keys-mini-max-platform"),
    error: rejected ? uiText.text("workbench.service-connection-specimens.mini-max-refused-key-401-may-have-expired") : undefined,
    control: `<input class="mw-input" data-slot="input" type="password" autocomplete="off" value="sk-cp-7f3a"${rejected ? ' aria-invalid="true"' : ""} aria-label="${escapeHtml(uiText.text("workbench.service-connection-specimens.mini-max-api-key"))}">`,
  });
}

function rowsSpecimen(readText: Say): string {
  const item = (id: string, service: string, name: string, caption: string, mark: string, body: string, open = true) =>
    renderConnectionItem({ id: `board-conn-${id}`, mark: renderConnectorMark(service, escapeHtml), name, caption: uiText.text(caption), state: mark, body, open }, readText);
  const group = (title: string, rows: string) => `<section class="settings-connector-subgroup"><h3>${escapeHtml(uiText.text(title))}</h3>${rows}</section>`;
  const expired = item("github", "github", "GitHub", "workbench.service-connection-specimens.read-notifications-see-repositories-push-code", state("warning", "reauth", uiText.text("workbench.service-connection-specimens.reauthorization-required")),
    `${renderStatusMark({ label: uiText.text("workbench.service-connection-specimens.sign-expired-since-time", { time: "11-03 21:40" }), state: "reauth", tone: "attention", plain: true })}<p class="mw-field__hint">${escapeHtml(uiText.text("workbench.service-connection-specimens.value-2-pieces-work-waiting-stay-where-they-after"))}</p>${actions(`${primary(uiText.text("workbench.service-connection-specimens.sign-again-account", { account: "yijunw0212" }))}${renderButton({ label: uiText.text("workbench.service-connection-specimens.switch-account"), variant: "secondary" })}`)}`);
  // Switching account is switching among accounts connected to the service (§13.2, user 11-05): the old one stays and works.
  // The row waits on the person's choice, so it carries the 等你 ring, not a running one.
  const gitlab = item("gitlab", "gitlab", "GitLab", "workbench.service-connection-specimens.see-merge-requests-read-pipelines", renderStatusMark({ label: uiText.text("workbench.service-connection-specimens.switch-account"), state: "answer", tone: "attention", plain: true }),
    `${renderRadioGroup({ legend: uiText.text("workbench.service-connection-specimens.which-account-places-using-name-switch", { name: "GitLab" }), name: "board-conn-gitlab-switch", items: [
      { value: "team", label: uiText.text("workbench.service-connection-specimens.account-connected-sees-40-molis-ai-projects", { account: "molis-bot" }), checked: true },
      { value: "add", label: uiText.text("workbench.service-connection-specimens.add-another-account-sign-browser-then-switch") },
    ] })}<p class="mw-field__hint">${escapeHtml(uiText.text("workbench.service-connection-specimens.account-stays-keeps-working-3-places-using-switch", { account: "yijunw0212" }))}</p>${actions(`${primary(uiText.text("workbench.service-connection-specimens.switch"))}${renderButton({ label: uiText.text("workbench.service-connection-specimens.not-now"), variant: "secondary" })}`)}`);
  const bitbucket = item("bitbucket", "bitbucket", "Bitbucket", "workbench.service-connection-specimens.see-repositories-read-pull-requests", state("neutral", "disconnected", uiText.text("workbench.service-connection-specimens.disconnected")),
    `<ol class="settings-connector-steps"><li><strong>${escapeHtml(uiText.text("workbench.service-connection-specimens.sign-name-browser-agree", { name: "Bitbucket" }))}</strong><p>${escapeHtml(uiText.text("workbench.service-connection-specimens.come-back-here-yourself-nothing-copy"))}</p></li></ol>${capabilities(readText, ["workbench.service-connection-specimens.see-repositories", "workbench.service-connection-specimens.read-pull-requests"], "workbench.service-connection-specimens.change-repository-contents")}${primary(uiText.text("workbench.service-connection-specimens.connect-name", { name: "Bitbucket" }))}`);
  const vercel = item("vercel", "vercel", "Vercel", "workbench.service-connection-specimens.see-deployments-preview-links", state("success", "connected", uiText.text("workbench.service-connection-specimens.connected-account", { account: "yijun" })),
    `${steps(readText, SIGN_IN, 2, "done")}${renderAlert({ title: uiText.text("workbench.service-connection-specimens.name-ready-account", { name: "Vercel", account: "yijun" }), tone: "success" })}${capabilities(readText, ["workbench.service-connection-specimens.see-deployments", "workbench.service-connection-specimens.see-preview-links"])}`, false);
  const linear = item("linear", "linear", "Linear", "workbench.service-connection-specimens.read-create-tasks", running(uiText.text("workbench.service-connection-specimens.connecting")),
    `${steps(readText, SIGN_IN, 0, "running")}${feedback(running(uiText.text("workbench.service-connection-specimens.waiting-sign-name-browser", { name: "Linear" })), uiText.text("workbench.service-connection-specimens.sign-agree-come-back-here-yourself-closing-page"))}${renderButton({ label: uiText.text("workbench.service-connection-specimens.open-sign-page-again"), variant: "secondary" })}`);
  const notion = item("notion", "notion", "Notion", "workbench.service-connection-specimens.read-pages-databases", state("neutral", "cancelled", uiText.text("workbench.service-connection-specimens.not-connected")),
    `${steps(readText, SIGN_IN, 0, "cancelled")}${feedback(renderStatusMark({ label: uiText.text("workbench.service-connection-specimens.not-connected-2"), state: "cancelled", tone: "quiet", plain: true }), uiText.text("workbench.service-connection-specimens.sign-page-was-closed-cancelled-name-nothing-changed", { name: "Notion" }))}${primary(uiText.text("workbench.service-connection-specimens.connect-again"))}`);
  const gmail = item("gmail", "gmail", "Gmail", "workbench.service-connection-specimens.read-mail-create-drafts", state("neutral", "unavailable", uiText.text("workbench.service-connection-specimens.not-one-click-yet")),
    `<div class="settings-connector-pending"><p>${escapeHtml(uiText.text("workbench.service-connection-specimens.google-still-reviewing-moliss-sign-app-one-click"))}</p></div>${actions(renderButton({ label: uiText.text("workbench.service-connection-specimens.use-own-google-app-advanced"), variant: "secondary" }))}`);
  const slack = item("slack", "slack", "Slack", "workbench.service-connection-specimens.read-channel-messages", state("warning", "retrying", uiText.text("workbench.service-connection-specimens.rate-limited")),
    `${steps(readText, SIGN_IN, 1, "hold")}${renderAlert({ title: uiText.text("workbench.service-connection-specimens.name-rate-limiting", { name: "Slack" }), body: uiText.text("workbench.service-connection-specimens.slack-rate-limiting-not-youre-connected-check-isnt"), tone: "warning" })}${renderButton({ label: uiText.text("workbench.service-connection-specimens.check-now"), variant: "secondary" })}`);
  const minimax = item("minimax", "model-api", "MiniMax", "workbench.service-connection-specimens.text-model", state("danger", "failed", uiText.text("workbench.service-connection-specimens.key-refused")),
    `${steps(readText, KEY, 0, "failed")}${keyField(readText, true)}${primary(uiText.text("workbench.service-connection-specimens.save-check"))}`);
  return `<div class="mw-conn-board__rows" data-connectors-settings><div class="settings-connector-catalog">${group("workbench.service-connection-specimens.code-projects", expired + gitlab + bitbucket + vercel)}${group("workbench.service-connection-specimens.docs-tasks", linear + notion)}${group("workbench.service-connection-specimens.mail-messages", gmail + slack)}${group("workbench.service-connection-specimens.model", minimax)}</div></div>`;
}

function progressSpecimen(readText: Say): string {
  const one = (label: string, names: readonly string[], at: number, s: ConnectionProgressState) => `<li><span>${escapeHtml(uiText.text(label))}</span>${steps(readText, names, at, s, false)}</li>`;
  const list = `<ul class="mw-conn-board__states">${one("workbench.service-connection-specimens.step-1-under-way", SIGN_IN, 0, "running")}${one("workbench.service-connection-specimens.step-2-under-way", SIGN_IN, 1, "running")}${one("workbench.service-connection-specimens.rate-limited-2", SIGN_IN, 1, "hold")}${one("workbench.service-connection-specimens.key-refused", KEY, 0, "failed")}${one("workbench.service-connection-specimens.sign-cancelled", SIGN_IN, 0, "cancelled")}${one("common.control.done", SIGN_IN, 2, "done")}</ul>`;
  const names = SIGN_IN.map((name) => uiText.text(name));
  const live = `<div class="mw-conn-board__try" data-conn-progress-demo>
    ${renderConnectionProgress({ steps: names, at: 0, state: "running" }, readText)}
    <div class="mw-catalog__row">${renderButton({ label: uiText.text("workbench.service-connection-specimens.next"), variant: "secondary", size: "sm", attrs: { "data-conn-step": "next" } })}${renderButton({ label: uiText.text("workbench.service-connection-specimens.rate-limit"), variant: "secondary", size: "sm", attrs: { "data-conn-step": "hold" } })}${renderButton({ label: uiText.text("workbench.service-connection-specimens.fail"), variant: "secondary", size: "sm", attrs: { "data-conn-step": "failed" } })}${renderButton({ label: uiText.text("common.control.cancel"), variant: "secondary", size: "sm", attrs: { "data-conn-step": "cancelled" } })}${renderButton({ label: uiText.text("workbench.service-connection-specimens.start-over"), variant: "ghost", size: "sm", attrs: { "data-conn-step": "reset" } })}</div>
  </div>`;
  return `${list}${figure(uiText.text("workbench.service-connection-specimens.try-screen-reader-hears-each-step"), live)}`;
}

function cardsSpecimen(readText: Say): string {
  const github = renderConnectorMark("github", escapeHtml), image = renderConnectorMark("image-api", escapeHtml), model = renderConnectorMark("model-api", escapeHtml);
  const connected = uiText.text("workbench.service-connection-specimens.name-connected-account", { name: "GitHub", account: "yijunw0212" });
  const ask = renderConnectionCard({ mark: github, state: "ask", title: uiText.text("workbench.service-connection-specimens.read-git-hub-notifications-connect-git-hub-first"), reason: uiText.text("workbench.service-connection-specimens.carries-once-connected"), connected, action: primary(uiText.text("workbench.service-connection-specimens.connect-name", { name: "GitHub" })) });
  const expired = renderConnectionCard({ mark: github, state: "ask", title: uiText.text("workbench.service-connection-specimens.git-hub-sign-expired-stopped-after-page-2"), reason: uiText.text("workbench.service-connection-specimens.after-signing-carries-page-3-not-start"), connected, action: primary(uiText.text("workbench.service-connection-specimens.sign-again-account", { account: "yijunw0212" })) });
  const busy = renderConnectionCard({ mark: image, state: "running", title: uiText.text("workbench.service-connection-specimens.cover-needs-image-model"), reason: uiText.text("workbench.service-connection-specimens.just-one-key-come-back-here-prompt-kept"), connected: "",
    body: `${steps(readText, KEY, 1, "running")}${feedback(running(uiText.text("workbench.service-connection-specimens.asking-image-model-one-line-reply")), uiText.text("workbench.service-connection-specimens.usually-few-seconds-closing-fine-checks-again-when"))}` });
  const refused = renderConnectionCard({ mark: model, state: "failed", title: uiText.text("workbench.service-connection-specimens.summary-needs-text-model"), reason: uiText.text("workbench.service-connection-specimens.just-one-key-carries-writing-once-connected-items"), connected: "",
    body: `${steps(readText, KEY, 0, "failed")}${keyField(readText, true)}`, action: primary(uiText.text("workbench.service-connection-specimens.save-check")) });
  const cancelled = renderConnectionCard({ mark: github, state: "cancelled", title: uiText.text("workbench.service-connection-specimens.name-not-connected", { name: "GitHub" }), reason: uiText.text("workbench.service-connection-specimens.waits-here-what-wrote-kept"), connected, action: primary(uiText.text("workbench.service-connection-specimens.connect-again")) });
  const choose = renderConnectionCard({ mark: github, state: "choose", title: uiText.text("workbench.service-connection-specimens.which-git-hub-account"), reason: uiText.text("workbench.service-connection-specimens.both-connected-they-see-different-repositories"), connected,
    body: `<div class="mw-choice-group" role="group" aria-label="${escapeHtml(uiText.text("workbench.service-connection-specimens.accounts"))}">${[
      uiText.text("workbench.service-connection-specimens.account-personal-sees-count-count", { account: "yijunw0212", count: 12 }),
      uiText.text("workbench.service-connection-specimens.account-team-sees-count-count-molis-ai", { account: "molis-bot", count: 40 }),
    ].map((label) => renderChoice({ label, icon: "user" })).join("")}</div>${renderCheckbox({ label: uiText.text("workbench.service-connection-specimens.use-project-now"), checked: true })}` });
  const done = renderConnectionCard({ mark: github, state: "done", title: "", reason: "", connected });
  const live = renderConnectionCard({ mark: github, state: "ask", title: uiText.text("workbench.service-connection-specimens.read-git-hub-notifications-connect-git-hub-first"), reason: uiText.text("workbench.service-connection-specimens.carries-once-connected"), connected,
    body: `${steps(readText, SIGN_IN, 0, "running")}<div class="settings-connector-feedback" role="status" data-conn-card-say="${escapeHtml(uiText.text("workbench.service-connection-specimens.seeing-what-account-can-do", { account: "yijunw0212" }))}">${running(uiText.text("workbench.service-connection-specimens.waiting-sign-name-browser", { name: "GitHub" }))}<p>${escapeHtml(uiText.text("workbench.service-connection-specimens.sign-agree-come-back-here-yourself-closing-page"))}</p></div>`, action: primary(uiText.text("workbench.service-connection-specimens.connect-name", { name: "GitHub" }), { "data-conn-card-go": "" }) });
  const tryIt = `<div class="mw-conn-board__try" data-conn-card-demo>${live}<div class="mw-catalog__row">${renderButton({ label: uiText.text("workbench.service-connection-specimens.start-over"), variant: "ghost", size: "sm", attrs: { "data-conn-card-reset": "" } })}</div></div>`;
  return `<div class="mw-conn-board__cards">${figure(uiText.text("workbench.service-connection-specimens.not-started"), ask)}${figure(uiText.text("workbench.service-connection-specimens.sign-expired"), expired)}${figure(uiText.text("workbench.service-connection-specimens.choosing-account"), choose)}${figure(uiText.text("workbench.service-connection-specimens.connecting-card"), busy)}${figure(uiText.text("workbench.service-connection-specimens.key-refused"), refused)}${figure(uiText.text("workbench.service-connection-specimens.sign-cancelled"), cancelled)}${figure(uiText.text("workbench.service-connection-specimens.connected-folded-into-one-line"), done)}</div>${figure(uiText.text("workbench.service-connection-specimens.try-card-folds-into-one-line-once-connected"), tryIt)}`;
}

/** The section the board places after 插件行视图: three specimens, each part in its states. */
export function renderServiceConnectionSection(readText: Say): string {
  return `<section class="mw-catalog__section" id="service-connections" data-primitive="service-connections"><h2>${escapeHtml(uiText.text("workbench.service-connection-specimens.service-connections"))}</h2>
    <div class="mw-catalog__specimens">
      ${figure(uiText.text("workbench.service-connection-specimens.service-row-that-opens-place-press-row-button"), rowsSpecimen(readText))}
      ${figure(uiText.text("workbench.service-connection-specimens.step-progress-which-step-how-many-doing-what"), progressSpecimen(readText))}
      ${figure(uiText.text("workbench.service-connection-specimens.place-connect-card-connect-where-connection-missing"), cardsSpecimen(readText))}
    </div>
  </section>`;
}

/** The board's own layout for the section (the parts' styles come first); the cards sit in a column as narrow as a conversation. */
export const SERVICE_CONNECTION_SECTION_STYLES = SERVICE_CONNECTION_PART_STYLES
  + `.mw-conn-board__rows{max-width:760px}.mw-conn-board__rows .settings-connector-catalog{display:grid;gap:24px;padding-top:0}`
  + `.mw-conn-board__states{display:grid;gap:8px;margin:0;padding:0;list-style:none}.mw-conn-board__states>li{display:grid;grid-template-columns:96px minmax(0,1fr);align-items:center;gap:12px;min-width:0}.mw-conn-board__states>li>span:first-child{color:var(--muted);font-size:12px}`
  + `.mw-conn-board__try{display:grid;gap:12px;max-width:560px;padding:16px;border-radius:var(--r-card);background:var(--surface-soft)}`
  + `.mw-conn-board__cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:24px;align-items:start}`
  + `@media (max-width:760px){.mw-conn-board__states>li{grid-template-columns:minmax(0,1fr);gap:4px}}`;

/** The section's program, written in `src/browser/board/service-connection-section.ts` and bundled into `dist/` when the package builds. */
export const SERVICE_CONNECTION_SECTION_SCRIPT = readFileSync(new URL("./board-service-connection-section.js", import.meta.url), "utf8").trim();
