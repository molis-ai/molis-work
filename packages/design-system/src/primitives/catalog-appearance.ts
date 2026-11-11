// The board's parts for choosing a look (docs/design/appearance-selection/README.md「组件板新增」, decided by the user 2026-11-04: plan C, a specimen beside
// the choices, then apply): the look card, the specimen card and the fade when the look changes. Batch 16's Settings page is the first product page that draws
// them; the render functions are not published yet (they are lifted with that page), and the rules are the board's own (catalog-appearance-styles.ts).
// Every control inside is an existing one: these parts only place them, and a look's tokens come from the interface's baseline files (catalog-appearance-looks.ts).
import { escapeHtml, renderBadge, renderButton, renderField, renderInput, renderStateRing, renderStatusMark, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMenu, renderMenuItem } from "./overlay.js";
import { section, specimen } from "./catalog-parts.js";
import type { Say } from "./catalog-composer.js";
import { BASELINE_FONT_NAME, SOFT_LOOK, TEAL_LOOK, WARM_LOOK, type BoardLook, type LookTheme } from "./catalog-appearance-looks.js";

/** Long enough to meet the narrowest card and the narrowest line, in both languages. */
const LONG_NAME = "workbench.catalog-appearance.a-look-with-a-very-long-name";
const LONG_FONT = "workbench.catalog-appearance.a-suggested-font-whose-name-is-also";
const PROBLEMS = ["workbench.catalog-appearance.in-dark-body-text-on-its-ground", "workbench.catalog-appearance.its-suggested-font-is-not-on-this"];
const LONG_PROBLEMS = [...PROBLEMS, "workbench.catalog-appearance.one-colour-points-at-a-role-the"];

export type AppearanceLook = Pick<BoardLook, "id" | "name" | "editable"> & { readonly previewSkin?: string; readonly by: string };

export interface LookCardState {
  readonly inUse?: boolean;
  readonly trying?: boolean;
  readonly fails?: boolean;
  readonly pressed?: boolean;
  readonly menuOpen?: boolean;
  readonly more?: boolean;
  readonly name?: string;
  readonly fontName?: string;
}

/**
 * One look as a card: the picture the look draws of itself, its name and where it came from, the type it suggests, and what state it is in, said in
 * words. The whole card is one button; the more-actions button beside it is the card's other control, not inside the first.
 */
export function renderLookCard(say: Say, look: AppearanceLook, state: LookCardState = {}): string {
  const t = (text: string, values?: Record<string, string | number>) => escapeHtml(say(text, values));
  const name = state.name ?? look.name;
  const badges = [
    `<span class="mw-look-card__current"${state.inUse ? "" : " hidden"}>${renderBadge({ label: say("workbench.appearance-picker.use"), tone: "success" })}</span>`,
    `<span class="mw-look-card__trial"${state.trying ? "" : " hidden"}>${renderBadge({ label: say("workbench.catalog-appearance.in-the-specimen"), tone: "info" })}</span>`,
    state.fails ? renderBadge({ label: say("workbench.settings-connector-account.check-failed"), tone: "warning" }) : "",
  ].join("");
  const picture = `<span class="mw-look-card__view" data-look="${escapeHtml(look.id)}"${look.previewSkin ? ` data-ui-skin="${escapeHtml(look.previewSkin)}"` : ""} aria-hidden="true"><span class="mw-look-card__sheet"><span class="mw-look-card__sample">Aa 你好 12</span><i class="mw-look-card__line"></i><i class="mw-look-card__line"></i><span class="mw-look-card__marks"><i class="mw-look-card__button"></i><i class="mw-look-card__dot"></i><i class="mw-look-card__dot"></i><i class="mw-look-card__dot"></i></span></span></span>`;
  const mine = look.editable === true;
  const items = renderMenuItem({ label: say("workbench.catalog-appearance.duplicate-as-mine"), iconName: "copy" })
    + (mine ? renderMenuItem({ label: say("workbench.catalog-appearance.export"), iconName: "download" }) + renderMenuItem({ label: say("workbench.context-onboarding.remove"), iconName: "trash", danger: true, disabled: state.inUse, ...(state.inUse ? { description: say("workbench.catalog-appearance.a-look-in-use-can-t-be") } : {}) }) : "");
  const more = renderButton({ label: say("workbench.catalog-appearance.more-actions-name", { name }), variant: "ghost", size: "sm", icon: "more", iconOnly: true, attrs: { "aria-haspopup": "menu", "aria-expanded": String(Boolean(state.menuOpen)), "data-compose-menu-toggle": "" } });
  return `<div class="mw-look-card" data-look-card="${escapeHtml(look.id)}">
    <button type="button" class="mw-look-card__pick" aria-pressed="${Boolean(state.pressed)}"${state.inUse ? " data-look-in-use" : ""}>
      ${picture}
      <span class="mw-look-card__text"><span class="mw-look-card__name">${escapeHtml(name)}</span><span class="mw-look-card__meta">${t("workbench.catalog-appearance.by-suggests-font", { by: look.by, font: state.fontName ?? say(BASELINE_FONT_NAME) })}</span></span>
      <span class="mw-look-card__badges">${badges}</span>
    </button>
    ${state.more ? `<div class="mw-look-card__more">${more}<div class="mw-compose__menu" data-compose-menu${state.menuOpen ? " data-menu-held" : " hidden"}>${renderMenu({ items })}</div></div>` : ""}
  </div>`;
}

export const renderLookGroup = (say: Say, cards: string, className = ""): string =>
  `<div class="mw-look-grid${className}" role="group" aria-label="${escapeHtml(say("workbench.env.skin"))}" data-look-cards>${cards}</div>`;

function boardLook(say: Say, look: BoardLook): AppearanceLook {
  return { ...look, name: look.nameKey ? say(look.nameKey) : look.name,
    by: say(look.editable ? "workbench.catalog-appearance-looks.mine" : "workbench.immersive-shell.built") };
}

export function lookCardSection(say: Say): string {
  const card = (look: BoardLook, state: LookCardState) => renderLookCard(say, boardLook(say, look), { ...state, more: true });
  return section("look-card", say("workbench.catalog-appearance.look-card"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-appearance.a-row-of-looks-in-use-in"), renderLookGroup(say, card(SOFT_LOOK, { inUse: true }) + card(TEAL_LOOK, { pressed: true, trying: true }) + card(WARM_LOOK, { fails: true })))}
    ${specimen(say("workbench.catalog-appearance.most-crowded-a-long-name-in-a"), renderLookGroup(say, card(WARM_LOOK, { fails: true, name: say(LONG_NAME), fontName: say(LONG_FONT) }), " mw-look-grid--narrow"))}
    ${specimen(say("workbench.catalog-appearance.more-actions-a-separate-button-in-the"), renderLookGroup(say, card(TEAL_LOOK, { inUse: true, menuOpen: true }), " mw-look-grid--narrow mw-look-grid--room"))}
  </div>`);
}

type ProofState = "idle" | "ready" | "loading" | "failed" | "invalid" | "conflict";

export interface LookProofOptions {
  readonly look: AppearanceLook;
  readonly state: ProofState;
  /** Keeps the canvas in one theme whatever the page does; left out it wears the page's. */
  readonly theme?: LookTheme;
  readonly problems?: readonly string[];
  readonly name?: string;
  readonly scopes?: { readonly skin: string; readonly font: string; readonly mono: string };
}

/** The picture of a look: the lists, forms, buttons, long text, numbers and code a look has to carry. A picture, not a form: inert, and named once as a whole. */
function renderLookCanvas(say: Say, look: AppearanceLook, name: string, theme?: LookTheme, scopes?: LookProofOptions["scopes"]): string {
  const t = (text: string) => escapeHtml(say(text));
  const row = (state: StateRingState, title: string, end: string) => `<li>${renderStateRing({ state })}<span>${t(title)}</span><span>${escapeHtml(end)}</span></li>`;
  return `<div class="mw-look-proof__picture" role="img" aria-label="${escapeHtml(say("workbench.appearance-picker.specimen-name-picture-not-operable", { name }))}">
    <div class="mw-look-proof__canvas" data-look="${escapeHtml(look.id)}"${theme ? ` data-look-theme="${theme}"` : ""}${scopes ? ` data-ui-skin="${escapeHtml(scopes.skin)}" data-ui-font="${escapeHtml(scopes.font)}" data-ui-mono="${escapeHtml(scopes.mono)}"` : ""} inert>
      <div class="mw-look-proof__sheet">
        <h4><span>${t("workbench.catalog-appearance.this-week")}</span>${renderBadge({ label: say("workbench.catalog-appearance.value-3-items"), tone: "info" })}</h4>
        <ul class="mw-look-proof__rows">${row("done", "workbench.catalog-appearance.tidy-the-interview-notes", "09:41")}${row("running", "workbench.catalog-appearance.draft-the-q4-plan", say("workbench.assistant-delivery.progress"))}${row("waiting", "workbench.catalog-appearance.wait-for-design-review", "11/06")}</ul>
        ${renderField({ label: say("workbench.context-onboarding.project-name"), control: renderInput({ value: say("workbench.catalog-appearance.molis-launch"), invalid: true }), error: say("workbench.catalog-appearance.a-project-with-this-name-already-exists") })}
        <div class="mw-look-proof__buttons">${renderButton({ label: say("common.control.save"), variant: "primary" })}${renderButton({ label: say("common.control.cancel"), variant: "secondary" })}${renderButton({ label: say("workbench.context-toolbar.more"), variant: "ghost", icon: "more" })}</div>
        <p class="mw-look-proof__read">${t("workbench.catalog-appearance.on-4-november-2026-1-284-notes")}</p>
        <pre class="mw-look-proof__code">const look = "<span data-look-code-name>${escapeHtml(look.id)}</span>";  // ${t("workbench.catalog-appearance.monospace")}</pre>
      </div>
    </div>
  </div>`;
}

/** What the card's foot says and offers in each state: loading, a failure, a failed check and a clash are said here, and the page underneath never changes. */
function proofFoot(say: Say, { state, problems = PROBLEMS.map(problem => say(problem)) }: LookProofOptions): { status: string; extra: string; disabled: boolean; primary: string } {
  const t = (text: string, values?: Record<string, string | number>) => escapeHtml(say(text, values));
  const mark = (ring: StateRingState, text: string, values?: Record<string, string | number>) => renderStatusMark({ state: ring, label: say(text, values), plain: true });
  const ask = renderButton({ label: say("workbench.catalog-appearance.ask-the-assistant-to-fix-it"), variant: "secondary", icon: "sparkles" });
  const use = say("workbench.appearance-picker.use-2");
  switch (state) {
    case "idle": return { status: t("workbench.catalog-appearance.pick-a-skin-or-a-font-the"), extra: "", disabled: true, primary: use };
    case "ready": return { status: t("workbench.catalog-appearance.the-page-hasn-t-changed-once-used"), extra: "", disabled: false, primary: use };
    case "loading": return { status: mark("running", "workbench.appearance-picker.font-loading-specimen-uses-fallback-font"), extra: "", disabled: true, primary: use };
    case "failed": return { status: mark("failed", "workbench.appearance-picker.font-didnt-load-specimen-uses-fallback-font-combination"), extra: "", disabled: true, primary: use };
    case "invalid": return { status: `${mark("blocked", "workbench.catalog-appearance.n-n-problem-problems-fix-n-it", { n: problems.length })}<ul>${problems.map((problem) => `<li>${escapeHtml(problem)}</li>`).join("")}</ul>`, extra: ask, disabled: true, primary: use };
    case "conflict": return { status: mark("conflict", "workbench.appearance-picker.another-window-just-switched-name-using-replaces", { name: SOFT_LOOK.name }), extra: "", disabled: false, primary: say("workbench.appearance-picker.use-mine-anyway") };
  }
}

/**
 * The specimen card: the card is the page's, the canvas in it is drawn in `look`. In use, nothing to try, it shows the look in use and offers nothing;
 * otherwise "Use it" is the one primary and "Not this time" lets go.
 */
export function renderLookProof(say: Say, options: LookProofOptions): string {
  const { look, state, theme } = options;
  const name = options.name ?? look.name;
  const trying = state !== "idle";
  const foot = proofFoot(say, options);
  return `<article class="mw-card mw-look-proof" data-slot="card" data-state="${state}">
    <header class="mw-card__header"><div><h3 class="mw-card__title">${escapeHtml(say("workbench.settings-appearance.specimen"))}</h3><p class="mw-card__description">${escapeHtml(say(trying ? "workbench.appearance-picker.trying-name" : "workbench.appearance-picker.use-name", { name }))}</p></div>${renderBadge({ label: say(trying ? "workbench.appearance-picker.not-applied" : "workbench.appearance-picker.use"), tone: trying ? "info" : "success" })}</header>
    <div class="mw-card__panel">${renderLookCanvas(say, look, name, theme, options.scopes)}</div>
    <footer class="mw-card__footer"><div class="mw-look-proof__status" role="status" aria-live="polite">${foot.status}</div><div class="mw-look-proof__actions">${foot.extra}${renderButton({ label: say("common.appearance.try-again"), variant: "secondary", attrs: { "data-look-retry": true, hidden: state !== "failed" } })}${renderButton({ label: say("workbench.catalog-appearance.not-this-time"), variant: "secondary", disabled: !trying, attrs: { "data-look-cancel": true } })}${renderButton({ label: foot.primary, variant: "primary", disabled: foot.disabled, attrs: { "data-look-apply": true } })}</div></footer>
  </article>`;
}

export function lookProofSection(say: Say): string {
  const card = (options: Omit<LookProofOptions, "look"> & { look: BoardLook }) => renderLookProof(say, { ...options, look: boardLook(say, options.look) });
  const side = (theme: LookTheme, caption: string) => `<figure><figcaption>${escapeHtml(say(caption))}</figcaption>${renderLookCanvas(say, boardLook(say, TEAL_LOOK), boardLook(say, TEAL_LOOK).name, theme)}</figure>`;
  return section("look-proof", say("workbench.catalog-appearance.look-specimen"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-appearance.try-a-look-the-page-stays-the"), card({ look: TEAL_LOOK, state: "ready" }))}
    ${specimen(say("workbench.catalog-appearance.nothing-to-try-the-specimen-shows-the"), card({ look: SOFT_LOOK, state: "idle" }))}
    ${specimen(say("workbench.catalog-appearance.font-loading-the-fallback-stands-in"), card({ look: TEAL_LOOK, state: "loading" }))}
    ${specimen(say("workbench.catalog-appearance.font-failed-the-look-stays-as-it"), card({ look: TEAL_LOOK, state: "failed" }))}
    ${specimen(say("workbench.catalog-appearance.fails-its-checks-it-can-be-seen"), card({ look: WARM_LOOK, state: "invalid" }))}
    ${specimen(say("workbench.catalog-appearance.another-window-just-changed-it-using-this"), card({ look: TEAL_LOOK, state: "conflict" }))}
    ${specimen(say("workbench.catalog-appearance.light-and-dark-side-by-side-they"), `<div class="mw-look-sides">${side("light", "workbench.context-onboarding.light")}${side("dark", "workbench.context-onboarding.dark")}</div>`)}
    ${specimen(say("workbench.catalog-appearance.most-crowded-a-long-name-long-problems"), `<div class="mw-look-narrow">${card({ look: WARM_LOOK, state: "invalid", name: say(LONG_NAME), problems: LONG_PROBLEMS.map(problem => say(problem)) })}</div>`)}
  </div>`);
}

/**
 * Putting a look to use changes the whole page at once. The shared fade in look-fade.ts lets the old page colour fade over the new look.
 */
const FADE_LOOK = WARM_LOOK;

export function lookFadeSection(say: Say): string {
  const now = (look: BoardLook) => say("workbench.catalog-appearance.using-name", { name: boardLook(say, look).name });
  // The look the page changes to is the one that differs most from the baseline in the page's own tones, so the change is seen.
  const data = `data-look-fade-look="${FADE_LOOK.id}" data-now-soft="${escapeHtml(now(SOFT_LOOK))}" data-now-look="${escapeHtml(now(FADE_LOOK))}"`;
  return section("look-fade", say("workbench.catalog-appearance.look-fade"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-appearance.when-a-look-is-used-undone-or"), `<div class="mw-look-fade" data-look-fade ${data}>
      <p class="mw-look-fade__now" role="status" aria-live="polite" data-look-fade-now>${escapeHtml(now(SOFT_LOOK))}</p>
      <div class="mw-catalog__row">${renderButton({ label: say("workbench.catalog-appearance.switch-to-name", { name: boardLook(say, FADE_LOOK).name }), variant: "secondary", attrs: { "data-look-fade-to": "" } })}${renderButton({ label: say("workbench.catalog-appearance.switch-back-to-name", { name: SOFT_LOOK.name }), variant: "ghost", disabled: true, attrs: { "data-look-fade-back": "" } })}</div>
      <p class="mw-look-fade__clock"><code>--dur-move</code><code>--ease-quint</code><span>${escapeHtml(say("workbench.catalog-appearance.when-the-system-asks-for-reduced-motion"))}</span></p>
    </div>`)}
  </div>`);
}

export function lookSections(say: Say): string {
  return lookCardSection(say) + lookProofSection(say) + lookFadeSection(say);
}
