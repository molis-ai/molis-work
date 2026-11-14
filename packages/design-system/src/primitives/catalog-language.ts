import { icon, renderButton, renderStatusMark, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { section, specimen } from "./catalog-parts.js";
import type { Say } from "./catalog-composer.js";

// The board's opening chapter: the design language the rest of the board is built from. What every screen answers, which colours
// may meet and what each one means, where each zone of the workbench stands, and (in the motion section) which change gets
// which motion. The specimens are made of the same tokens and controls as the product, so a change to a token shows here first.

/** 设计语言：每一屏回答什么，五条搭配规则。 */
export function languageSection(say: Say): string {
  const cards = [
    ["01", say("workbench.catalog.language.where-am-i"), say("workbench.catalog.language.where-am-i-body")],
    ["02", say("workbench.catalog.language.how-things-stand"), say("workbench.catalog.language.how-things-stand-body")],
    ["03", say("workbench.catalog.language.what-next"), say("workbench.catalog.language.what-next-body")],
  ].map(([no, title, body]) => `<article class="mw-lang-card"><small>${no}</small><strong>${title}</strong><p>${body}</p></article>`).join("");
  const list = [
    [say("workbench.catalog.language.rule-cool-is-the-system-warm-is-you"), say("workbench.catalog.language.rule-cool-is-the-system-warm-is-you-body")],
    [say("workbench.catalog.language.rule-one-ink-blue-per-screen"), say("workbench.catalog.language.rule-one-ink-blue-per-screen-body")],
    [say("workbench.catalog.language.rule-depth-by-lightness-not-lines"), say("workbench.catalog.language.rule-depth-by-lightness-not-lines-body")],
    [say("workbench.catalog.language.rule-motion-only-explains-change"), say("workbench.catalog.language.rule-motion-only-explains-change-body")],
    [say("workbench.catalog.language.rule-normal-things-get-one-line"), say("workbench.catalog.language.rule-normal-things-get-one-line-body")],
  ].map(([title, body]) => `<li><strong>${title}</strong><span>${body}</span></li>`).join("");
  return section("language", say("workbench.catalog.language.principles"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog.language.every-screen-answers-three-questions"), `<div class="mw-lang-three">${cards}</div>`)}
    ${specimen(say("workbench.catalog.language.five-pairing-rules"), `<ol class="mw-lang-rules">${list}</ol>`)}
  </div>`);
}

type Tone = "idle" | "progress" | "attention" | "hold" | "blocked" | "done";
const row = (tone: Tone, glyph: PluginIconName, state: string, title: string, note: string, action = "", attrs = "") =>
  `<div class="mw-lang-row"${attrs}>${renderStatusMark({ label: state, tone, icon: glyph })}<strong>${title}</strong><span>${note}</span>${action}</div>`;

const ownerHues = [["blue", "target"], ["indigo", "inbox"], ["purple", "rss"], ["slate", "library"], ["steel", "file"]] as const;

/** 色彩搭配：角色放在一起看、颜色的温度、字在面上的实测对比度、插件身份色。 */
export function pairingSection(say: Say): string {
  const stage = `<div class="mw-lang-stage">
    <div class="mw-lang-sheet">
      <header><small>${say("workbench.catalog.language.project-home")}</small><h3>FlyLeaf-V0.1</h3></header>
      <div class="mw-lang-list">
        ${row("attention", "status-needs-you", say("workbench.catalog.language.state-needs-your-review"), say("workbench.catalog.language.first-release-scope"), say("workbench.catalog.language.yesterday-2214-pages"), renderButton({ label: say("workbench.catalog.language.review"), variant: "primary", size: "sm" }))}
        ${row("progress", "status-progress", say("workbench.catalog.language.state-in-progress"), say("workbench.catalog.language.polish-the-first-run"), say("workbench.catalog.language.assistant-step-2-of-4"), renderButton({ label: say("workbench.catalog.language.view-progress"), variant: "secondary", size: "sm" }))}
        ${row("hold", "status-waiting", say("workbench.catalog.language.state-waiting-on-someone"), say("workbench.catalog.language.confirm-the-first-beta-list"), say("workbench.catalog.language.sent-to-lin"))}
        ${row("blocked", "status-blocked", say("workbench.catalog.language.state-could-not-read"), say("workbench.catalog.language.import-user-interviews"), say("workbench.catalog.language.local-service-not-responding"), renderButton({ label: say("workbench.catalog.language.try-again"), variant: "secondary", size: "sm" }))}
        ${row("done", "status-done", say("workbench.catalog.language.state-done"), say("workbench.catalog.language.finish-reading-page-prototype"), say("workbench.catalog.language.september-29"))}
      </div>
      <p class="mw-lang-note">${say("workbench.catalog.language.notes-are-grey")}<a href="#pairing">${say("workbench.catalog.language.links-are-mist-blue")}</a>${say("workbench.catalog.language.keyboard-focus-is-a-2px-mist-blue-ring")}<input class="mw-input" value="${say("workbench.catalog.language.tab-to-see-focus")}" aria-label="${say("workbench.catalog.language.focus-example")}"></p>
    </div>
    <aside class="mw-lang-soft"><small>${say("workbench.catalog.language.inner-block")}</small><span class="mw-lang-wash">${say("workbench.catalog.language.wash")}</span><span class="mw-lang-wash">${say("workbench.catalog.language.wash")}</span></aside>
  </div>`;
  const table = [
    ["--action", say("workbench.catalog.language.ink-blue"), say("workbench.catalog.language.what-you-do"), say("workbench.catalog.language.use-primary-action-selected-option-tooltip"), say("workbench.catalog.language.never-a-status-a-link-decoration")],
    ["--accent", say("workbench.catalog.language.mist-blue"), say("workbench.catalog.language.where-you-are-what-is-happening"), say("workbench.catalog.language.use-focus-links-progress-unread"), say("workbench.catalog.language.never-filling-a-button")],
    ["--tone-attention", say("workbench.catalog.language.amber"), say("workbench.catalog.language.your-turn"), say("workbench.catalog.language.use-waiting-for-your-decision-review-answer"), say("workbench.catalog.language.never-plugin-identity-decoration-notice")],
    ["--tone-hold", say("workbench.catalog.language.cyan"), say("workbench.catalog.language.someone-elses-turn"), say("workbench.catalog.language.use-handed-over-waiting-for-a-reply"), say("workbench.catalog.language.never-work-in-progress")],
    ["--tone-blocked", say("workbench.catalog.language.red"), say("workbench.catalog.language.it-cannot-go-on"), say("workbench.catalog.language.use-blocked-failed-destructive"), say("workbench.catalog.language.never-unread-emphasis")],
    ["--tone-done", say("workbench.catalog.language.green"), say("workbench.catalog.language.settled"), say("workbench.catalog.language.use-completed-connected-saved"), say("workbench.catalog.language.never-a-primary-action")],
    ["--tone-idle", say("workbench.catalog.language.grey"), say("workbench.catalog.language.at-rest"), say("workbench.catalog.language.use-ready-archived-normal"), say("workbench.catalog.language.never-anything-to-notice")],
  ].map(([token, name, meaning, use, never]) =>
    `<tr><td><i class="mw-lang-dot" style="background:var(${token})"></i>${name}<code>${token}</code></td><td>${meaning}</td><td>${use}</td><td>${never}</td></tr>`).join("");
  const surfaces = [["--page", say("workbench.catalog.language.surface-desk")], ["--paper", say("workbench.catalog.language.surface-surface")], ["--surface-soft", say("workbench.catalog.language.surface-soft")], ["--rail", say("workbench.catalog.language.surface-wash")]] as const;
  const inks = [
    ["--ink", say("workbench.catalog.language.ink-body")], ["--ink-soft", say("workbench.catalog.language.ink-secondary")], ["--muted", say("workbench.catalog.language.ink-caption")], ["--faint", say("workbench.catalog.language.ink-hint")],
    ["--accent", say("workbench.catalog.language.ink-link")], ["--tone-attention", say("workbench.catalog.language.ink-your-turn")], ["--tone-blocked", say("workbench.catalog.language.ink-blocked")], ["--tone-done", say("workbench.catalog.language.ink-done")],
  ] as const;
  const sample = say("workbench.catalog.language.text-sample-aa");
  const matrix = inks.map(([ink, label]) => `<tr><th scope="row">${label}</th>${surfaces.map(([surface]) =>
    `<td style="background:var(${surface});color:var(${ink})" data-lang-contrast data-lang-low-label="${say("workbench.catalog.language.contrast-low")}"><span>${sample}</span><small></small></td>`).join("")}</tr>`).join("");
  const tiles = ownerHues.map(([hue, glyph]) =>
    `<span class="mw-lang-tile" style="--h:var(--hue-${hue});--s:var(--hue-${hue}-soft)"><i>${icon(glyph)}</i><span>${hue}</span></span>`).join("");
  return section("pairing", say("workbench.catalog.language.pairing"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog.language.roles-together-one-ink-blue-per-screen"), stage)}
    ${specimen(say("workbench.catalog.language.colour-temperature"), `<div class="mw-lang-scroll"><table class="mw-table mw-lang-table"><thead><tr><th>${say("workbench.catalog.language.colour")}</th><th>${say("workbench.catalog.language.meaning")}</th><th>${say("workbench.catalog.language.use-for")}</th><th>${say("workbench.catalog.language.never-for")}</th></tr></thead><tbody>${table}</tbody></table></div>`)}
    ${specimen(say("workbench.catalog.language.text-on-surfaces"), `<div class="mw-lang-scroll"><table class="mw-lang-matrix"><thead><tr><th></th>${surfaces.map(([, name]) => `<th scope="col">${name}</th>`).join("")}</tr></thead><tbody>${matrix}</tbody></table></div>`)}
    ${specimen(say("workbench.catalog.language.plugin-identity-colours"), `<div class="mw-lang-tiles">${tiles}</div>`)}
  </div>`);
}

/** 布局分区：桌面上每个区回答哪个问题，用哪一层面、哪一种动效。 */
export function zonesSection(say: Say): string {
  const diagram = `<div class="mw-lang-zones" aria-hidden="true">
    <div class="mw-lang-zones__title"><i></i><i></i><b>${say("workbench.catalog.language.zones-diagram-title")}</b><span>Pages</span><span>${say("workbench.catalog.language.todo")}</span><em>${say("workbench.catalog.language.zones-diagram-titlebar")}</em></div>
    <div class="mw-lang-zones__sheet"><em>${say("workbench.catalog.language.zones-diagram-work-surface")}</em><u></u><u></u><u></u><u></u></div>
    <div class="mw-lang-zones__side"><em>${say("workbench.catalog.language.zones-diagram-right-side")}</em><u></u><u></u></div>
    <div class="mw-lang-zones__line"><span class="is-done"></span><span class="is-done"></span><span class="is-you"></span><b>${say("workbench.catalog.language.zones-diagram-composer")}</b><span></span><span></span><em>${say("workbench.catalog.language.zones-diagram-bottom-bar")}</em></div>
  </div>`;
  const table = [
    [say("workbench.catalog.language.zone-titlebar"), say("workbench.catalog.language.where-am-i"), say("workbench.catalog.language.surface-desk-no-lift"), say("workbench.catalog.language.motion-tab-moves-250ms")],
    [say("workbench.catalog.language.zone-work-surface"), say("workbench.catalog.language.how-things-stand"), say("workbench.catalog.language.surface-paper-sheet-shadow"), say("workbench.catalog.language.motion-content-arrives-420ms")],
    [say("workbench.catalog.language.zone-right-side"), say("workbench.catalog.language.reference-at-hand"), say("workbench.catalog.language.surface-paper-level-with-sheet"), say("workbench.catalog.language.motion-edge-sheet-slides-420ms")],
    [say("workbench.catalog.language.zone-bottom-bar"), say("workbench.catalog.language.what-next"), say("workbench.catalog.language.surface-lifted-from-desk"), say("workbench.catalog.language.motion-menus-rise-amber-ring")],
    [say("workbench.catalog.language.zone-floating-layer"), say("workbench.catalog.language.one-temporary-thing"), say("workbench.catalog.language.surface-popover-lift-3"), say("workbench.catalog.language.motion-grows-from-control")],
  ].map(([zone, answers, surface, motion]) => `<tr><td><strong>${zone}</strong></td><td>${answers}</td><td>${surface}</td><td>${motion}</td></tr>`).join("");
  return section("zones", say("workbench.catalog.language.zones"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog.language.four-zones-on-the-desk"), diagram)}
    ${specimen(say("workbench.catalog.language.which-surface-and-motion-per-zone"), `<div class="mw-lang-scroll"><table class="mw-table mw-lang-table"><thead><tr><th>${say("workbench.catalog.language.zone")}</th><th>${say("workbench.catalog.language.answers")}</th><th>${say("workbench.catalog.language.surface-and-lift")}</th><th>${say("workbench.catalog.language.motion")}</th></tr></thead><tbody>${table}</tbody></table></div>
      <p class="mw-catalog__hint">${say("workbench.catalog.language.bottom-bar-work-line-note")}</p>`)}
  </div>`);
}

/** 动效语法：哪一种变化用哪一种动效，以及三种新动效的可点标本。接在「动效标本」一节的开头。 */
export function motionGrammarSpecimens(say: Say): string {
  const table = [
    [say("workbench.catalog.language.something-appears"), say("workbench.catalog.language.rises-7px-while-fading-in"), say("workbench.catalog.language.clock-420ms-quint"), "craft-rise"],
    [say("workbench.catalog.language.shown-again"), say("workbench.catalog.language.fades-in"), say("workbench.catalog.language.clock-130ms-quint"), "craft-fade-in"],
    [say("workbench.catalog.language.same-object-somewhere-else"), say("workbench.catalog.language.object-travels-rest-cross-fades"), say("workbench.catalog.language.clock-420ms-quint"), "molisCraft.carry"],
    [say("workbench.catalog.language.forward-back"), say("workbench.catalog.language.slides-16px-from-origin"), say("workbench.catalog.language.clock-420ms-quint"), "molisCraft.turn"],
    [say("workbench.catalog.language.a-new-row"), say("workbench.catalog.language.one-mist-blue-wash"), say("workbench.catalog.language.clock-640ms-quint"), "molisCraft.land"],
    [say("workbench.catalog.language.it-becomes-your-turn"), say("workbench.catalog.language.one-amber-ring-once"), say("workbench.catalog.language.clock-640ms-quint"), "molisCraft.ask"],
    [say("workbench.catalog.language.completed"), say("workbench.catalog.language.mark-lands-one-celebration"), say("workbench.catalog.language.clock-640ms-spring"), "molisCraft.celebrate"],
    [say("workbench.catalog.language.pressed"), say("workbench.catalog.language.gives-to-97-and-springs-back"), say("workbench.catalog.language.clock-130ms-spring"), "mw-btn"],
    [say("workbench.catalog.language.menu-or-floating-layer"), say("workbench.catalog.language.grows-from-control-closes-back"), say("workbench.catalog.language.clock-in-250ms-out-130ms"), "craft-drop"],
  ].map(([change, motion, clock, name]) => `<tr><td><strong>${change}</strong></td><td>${motion}</td><td>${clock}</td><td><code>${name}</code></td></tr>`).join("");
  const demo = (id: string, label: string) => renderButton({ label, variant: "secondary", size: "sm", attrs: { "data-lang-demo": id } });
  const titles = [say("workbench.catalog.language.first-run-goal-collaboration"), say("workbench.catalog.language.one-coherent-experience"), say("workbench.catalog.language.focus-friendly-feed")];
  return `
      ${specimen(say("workbench.catalog.language.motion-grammar"), `<div class="mw-lang-scroll"><table class="mw-table mw-lang-table"><thead><tr><th>${say("workbench.catalog.language.change")}</th><th>${say("workbench.catalog.language.motion")}</th><th>${say("workbench.catalog.language.duration-and-curve")}</th><th>${say("workbench.catalog.language.name")}</th></tr></thead><tbody>${table}</tbody></table></div>`)}
      ${specimen(say("workbench.catalog.language.same-object-somewhere-else-420ms"), `<div class="mw-lang-carry" data-lang-carry>
        <ul>${titles.map(title => `<li><button type="button" data-lang-carry-open>${title}</button></li>`).join("")}</ul>
        <article hidden>${renderButton({ label: say("workbench.catalog.language.back-to-list"), variant: "ghost", size: "sm", icon: "back", attrs: { "data-lang-carry-back": "" } })}<h3 data-lang-carry-title></h3><p>${say("workbench.catalog.language.carry-explanation")}</p></article>
      </div>`)}
      ${specimen(say("workbench.catalog.language.forward-back-420ms"), `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("back", say("workbench.catalog.language.back"))}${demo("forward", say("workbench.catalog.language.forward"))}</div><div class="mw-lang-page" data-lang-page data-page-template="${say("workbench.catalog.language.page-template")}">${say("workbench.catalog.language.page-1")}</div></div>`)}
      ${specimen(say("workbench.catalog.language.your-turn-640ms-once"), `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("ask", say("workbench.catalog.language.assistant-finished-a-step"))}</div>
        <div class="mw-lang-list mw-lang-list--edge"><div class="mw-lang-row" data-lang-ask>
          <span data-lang-ask-state="progress">${renderStatusMark({ label: say("workbench.catalog.language.state-in-progress"), tone: "progress", icon: "status-progress" })}</span>
          <span data-lang-ask-state="attention" hidden>${renderStatusMark({ label: say("workbench.catalog.language.state-needs-your-review"), tone: "attention", icon: "status-needs-you" })}</span>
          <strong>${say("workbench.catalog.language.first-release-scope")}</strong><span>${say("workbench.catalog.language.ask-note")}</span></div></div></div>`)}`;
}

export const LANGUAGE_BOARD_STYLES = `
  .mw-lang-three { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); gap: 12px; inline-size: 100%; }
  .mw-lang-card { display: grid; gap: 4px; align-content: start; padding: 16px; border-radius: var(--r-card); background: var(--surface-soft); }
  .mw-lang-card small { color: var(--accent); font-size: 11px; font-variant-numeric: tabular-nums; }
  .mw-lang-card strong { font-size: 17px; font-weight: var(--weight-title, 600); }
  .mw-lang-card p { margin: 4px 0 0; color: var(--ink-soft); line-height: 1.6; }
  .mw-lang-rules { display: grid; gap: 0; inline-size: 100%; margin: 0; padding: 0; list-style: none; counter-reset: rule; border-radius: var(--r-card); box-shadow: 0 0 0 1px var(--line); }
  .mw-lang-rules li { display: grid; grid-template-columns: 2rem minmax(9rem, 14rem) minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 12px 16px; counter-increment: rule; }
  .mw-lang-rules li + li { border-block-start: 1px solid var(--line); }
  .mw-lang-rules li::before { content: counter(rule); color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .mw-lang-rules span { color: var(--ink-soft); line-height: 1.6; }
  .mw-lang-stage { display: grid; grid-template-columns: minmax(0, 1fr) 9rem; gap: 12px; inline-size: 100%; padding: 16px; border-radius: var(--r-dialog); background: var(--page); }
  .mw-lang-sheet { display: grid; gap: 12px; min-inline-size: 0; padding: 20px; border-radius: var(--r-sheet); background: var(--paper); box-shadow: var(--sheet-shadow, var(--surface-shadow)); }
  .mw-lang-sheet header { display: grid; gap: 2px; }
  .mw-lang-sheet header small, .mw-lang-soft small { color: var(--muted); font-size: 12px; }
  .mw-lang-sheet h3 { margin: 0; font-size: 20px; line-height: 1.3; }
  .mw-lang-list { border-radius: var(--r-card); box-shadow: 0 0 0 1px var(--line); }
  .mw-lang-list--edge { inline-size: 100%; }
  .mw-lang-row { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr) auto; grid-template-areas: "state title action" "state note action"; align-items: center; gap: 0 12px; min-block-size: 52px; padding: 8px 12px; border-radius: inherit; }
  .mw-lang-row + .mw-lang-row { border-block-start: 1px solid var(--line); border-radius: 0; }
  .mw-lang-row > :is(.mw-status, [data-lang-ask-state]) { grid-area: state; justify-self: start; }
  .mw-lang-row > strong { grid-area: title; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-lang-row > span:not(.mw-status, [data-lang-ask-state]) { grid-area: note; color: var(--muted); font-size: 12px; }
  .mw-lang-row > .mw-btn { grid-area: action; }
  .mw-lang-note { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; color: var(--muted); }
  .mw-lang-note a { color: var(--accent); }
  .mw-lang-note .mw-input { inline-size: 11rem; }
  .mw-lang-soft { display: grid; align-content: start; gap: 8px; padding: 12px; border-radius: var(--r-sheet); background: var(--surface-soft); }
  .mw-lang-wash { padding: 6px 8px; border-radius: var(--r-control); background: var(--rail); color: var(--ink-soft); font-size: 12px; }
  .mw-catalog :is(#language, #pairing, #zones) .mw-catalog__specimen { margin: 0; }
  .mw-lang-scroll { inline-size: 100%; min-inline-size: 0; overflow-x: auto; }
  .mw-lang-scroll > table { min-inline-size: 34rem; }
  .mw-lang-table { inline-size: 100%; }
  .mw-lang-table td { vertical-align: top; }
  .mw-lang-table td:first-child { white-space: nowrap; }
  .mw-lang-table code { margin-inline-start: 8px; color: var(--muted); font-size: 11px; }
  .mw-lang-dot { display: inline-block; inline-size: 10px; block-size: 10px; margin-inline-end: 8px; border-radius: 50%; vertical-align: -1px; }
  .mw-lang-matrix { inline-size: 100%; border-collapse: separate; border-spacing: 4px; }
  .mw-lang-matrix th { color: var(--muted); font-size: 11px; font-weight: var(--weight-control, 500); text-align: start; white-space: nowrap; }
  .mw-lang-matrix td { padding: 8px 10px; border-radius: var(--r-control); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-lang-matrix td span { display: block; font-size: 13px; }
  .mw-lang-matrix td small { font-size: 11px; font-variant-numeric: tabular-nums; }
  .mw-lang-matrix td[data-lang-low] small::after { content: " · " attr(data-lang-low-label); }
  .mw-lang-tiles { display: flex; flex-wrap: wrap; gap: 12px; }
  .mw-lang-tile { display: grid; grid-template-columns: auto auto; align-items: center; gap: 8px; padding: 6px 12px 6px 6px; border-radius: var(--r-row); background: var(--s); color: var(--ink-soft); font-size: 12px; }
  .mw-lang-tile i { display: grid; place-items: center; inline-size: 28px; block-size: 28px; border-radius: var(--r-control); background: var(--paper); color: var(--h); }
  .mw-lang-tile svg { inline-size: 16px; block-size: 16px; }
  .mw-lang-zones { display: grid; grid-template-columns: minmax(0, 1fr) 30%; grid-template-rows: 28px minmax(150px, auto) 44px; gap: 8px; inline-size: 100%; padding: 12px; border-radius: var(--r-dialog); background: var(--page); font-size: 11px; color: var(--muted); }
  .mw-lang-zones em { margin-inline-start: auto; font-style: normal; color: var(--accent); white-space: nowrap; }
  .mw-lang-zones__title { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; padding-inline: 4px; }
  .mw-lang-zones__title i { inline-size: 12px; block-size: 12px; border-radius: 50%; background: var(--nav-active); }
  .mw-lang-zones__title b { padding: 4px 10px; border-radius: var(--r-control); background: var(--nav-raised); color: var(--ink); font-weight: var(--weight-control, 500); box-shadow: var(--lift-1); }
  .mw-lang-zones__title span { padding: 4px 10px; }
  .mw-lang-zones__sheet, .mw-lang-zones__side { display: grid; align-content: start; gap: 10px; padding: 14px; border-radius: var(--r-sheet); background: var(--paper); box-shadow: var(--sheet-shadow, var(--surface-shadow)); }
  .mw-lang-zones__sheet em, .mw-lang-zones__side em { margin: 0; }
  .mw-lang-zones u { display: block; block-size: 8px; border-radius: 4px; background: var(--rail); text-decoration: none; }
  .mw-lang-zones u:nth-of-type(1) { inline-size: 46%; block-size: 12px; background: var(--nav-active); }
  .mw-lang-zones u:nth-of-type(3) { inline-size: 82%; }
  .mw-lang-zones u:nth-of-type(4) { inline-size: 64%; }
  .mw-lang-zones__line { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; padding-inline: 12px; }
  .mw-lang-zones__line span { inline-size: 10px; block-size: 10px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--line-strong); }
  .mw-lang-zones__line span.is-done { background: var(--tone-done); box-shadow: none; }
  .mw-lang-zones__line span.is-you { background: var(--tone-attention); box-shadow: 0 0 0 3px color-mix(in srgb, var(--tone-attention) 22%, transparent); }
  .mw-lang-zones__line b { flex: 0 1 46%; padding: 8px 14px; border-radius: var(--r-composer); background: var(--nav-raised); color: var(--ink-soft); font-weight: 400; box-shadow: var(--lift-2); }
  .mw-catalog .mw-motion-grid > .mw-catalog__specimen:has(.mw-lang-table) { grid-column: 1 / -1; }
  @media (min-width: 900px) { .mw-catalog .mw-motion-grid > .mw-catalog__specimen:has(.mw-lang-carry) { grid-column: span 2; } }
  .mw-lang-carry { inline-size: min(100%, 34rem); min-block-size: 9.5rem; }
  .mw-lang-carry ul { display: grid; margin: 0; padding: 0; list-style: none; border-radius: var(--r-card); box-shadow: 0 0 0 1px var(--line); }
  .mw-lang-carry li + li { border-block-start: 1px solid var(--line); }
  .mw-lang-carry li button { inline-size: 100%; min-block-size: 40px; padding: 0 12px; border: 0; border-radius: var(--r-card); background: none; color: var(--ink); font: inherit; font-weight: var(--weight-control, 500); text-align: start; cursor: pointer; }
  .mw-lang-carry li button:hover { background: var(--nav-hover); }
  .mw-lang-carry li button:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  .mw-lang-carry article { display: grid; justify-items: start; gap: 8px; }
  .mw-lang-carry article h3 { margin: 0; font-size: 20px; line-height: 1.3; }
  .mw-lang-carry article p { margin: 0; color: var(--muted); }
  .mw-lang-page { display: grid; place-items: center; inline-size: min(100%, 22rem); block-size: 72px; border-radius: var(--r-card); background: var(--surface-soft); color: var(--ink-soft); }
  .mw-catalog__index-find { position: sticky; top: 0; z-index: 1; padding-block-end: 8px; background: var(--paper); }
  .mw-catalog__index-find .mw-input { inline-size: 100%; }
  .mw-catalog__index-group { margin: 14px 0 4px; padding-inline: 12px; color: var(--faint); font-size: 11px; font-weight: var(--weight-control, 500); letter-spacing: .02em; }
  .mw-catalog__index-find + .mw-catalog__index-group { margin-block-start: 2px; }
  .mw-catalog__index-none { margin: 8px 12px; color: var(--muted); font-size: 12px; }
  @media (max-width: 720px) {
    .mw-lang-stage { grid-template-columns: minmax(0, 1fr); }
    .mw-lang-rules li { grid-template-columns: 2rem minmax(0, 1fr); }
    .mw-lang-rules li span { grid-column: 2; }
    .mw-lang-row { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "state action" "title action" "note action"; }
    .mw-lang-zones { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; }
    .mw-lang-zones__title span, .mw-lang-zones em { display: none; }
  }
`;
