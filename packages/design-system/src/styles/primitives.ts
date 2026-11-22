/** Shared mw-* control language. Loaded with the visual foundation. */
import { CONTAINED_FOCUS } from "./buttons.js";
import { ON_DEMAND_HELP_SHELL_STYLES } from "./on-demand-help.js";
import {
  PRIMITIVE_PLUGIN_CALENDAR,
  PRIMITIVE_PLUGIN_CONTROLS,
  PRIMITIVE_PLUGIN_CORE_HEAD,
  PRIMITIVE_PLUGIN_CORE_MID,
  PRIMITIVE_PLUGIN_DIALOG,
  PRIMITIVE_PLUGIN_DIALOG_FORM,
  PRIMITIVE_PLUGIN_DIR,
  PRIMITIVE_PLUGIN_FIELDS_EXTRA,
  PRIMITIVE_PLUGIN_KBD,
  PRIMITIVE_PLUGIN_LAYOUT,
  PRIMITIVE_PLUGIN_MEDIA,
  PRIMITIVE_PLUGIN_MENU,
  PRIMITIVE_PLUGIN_PREVIEW,
  PRIMITIVE_PLUGIN_SEVERITY,
  PRIMITIVE_PLUGIN_STYLES,
} from "./primitives-plugin.js";

const FIELD_FOCUS = "outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent); background-color: var(--popover, var(--paper))";

export { PRIMITIVE_PLUGIN_STYLES };

const PRIMITIVE_SHELL_EXTRAS = `
  ${ON_DEMAND_HELP_SHELL_STYLES}
  :is(.characters-location, .artifact-raw) {
    > summary:not(:has(svg)) {
      display: flex; align-items: center; gap: 8px; list-style: none; cursor: pointer;
      &::-webkit-details-marker { display: none; }
      &::before {
        content: ""; flex: none; width: 12px; height: 12px; background-color: currentColor; opacity: .72;
        --chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") center / 12px 12px no-repeat; -webkit-mask: var(--chevron); mask: var(--chevron);
        transform: rotate(-90deg); transition: transform 250ms var(--ease-quint);
      }
    }
    &[open] > summary:not(:has(svg))::before { transform: none; }
  }
  @media (prefers-reduced-motion: reduce) { :is(.characters-location, .artifact-raw) > summary::before { transition: none; } }
  /* The settings' return bar and a page's resume prompt (specs/draft-and-return §9): an alert with its answers under it, at any width. */
  .mw-return-bar > strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-return-bar__actions, .mw-resume-prompt__actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .mw-resume-prompt { display: grid; gap: 8px; animation: craft-rise var(--dur-arrive) var(--ease-quint) both; @media (prefers-reduced-motion: reduce) { animation: none; } }
  /* 91-0b shell & catalog primitives (stay in PRIMITIVE_STYLES; promote to PRIMITIVE_PLUGIN_STYLES in 91B when framed plugins adopt them). */
  .mw-badge--chip { border-radius: 6px; padding: 0 7px; min-height: 20px; }
  .mw-glyph-status { display: inline-grid; place-items: center; width: 20px; height: 20px; flex: none; border-radius: 6px; color: var(--status-tone, var(--ink-soft)); svg { width: 15px; height: 15px; display: block; } }
  .mw-signal-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex: none; background: var(--status-tone, var(--muted)); }
  .mw-signal { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font-size: 12px; line-height: 16px; font-variant-numeric: tabular-nums; white-space: nowrap; svg { width: 12px; height: 12px; flex: none; color: var(--faint); } }
  .mw-tabs__list--underline {
    gap: 16px; border-bottom: 1px solid var(--line);
    .mw-tabs__tab {
      min-height: 36px; padding: 0 2px; border-radius: 0; background: transparent;
      &:hover { background: transparent; color: var(--ink); }
      &::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 1px; background: var(--accent); opacity: 0; transform: scaleX(.4); transition: opacity var(--dur-move, 250ms) var(--ease-quint), transform var(--dur-move, 250ms) var(--ease-quint); }
      &.is-active { background: transparent; color: var(--ink); &::after { opacity: 1; transform: scaleX(1); } }
    }
  }
  .mw-section-well { padding: 4px; border-radius: var(--radius-surface, 14px); background: var(--surface-soft); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-inset-group { display: flex; flex-direction: column; border-radius: var(--radius-item, 10px); background: var(--paper); box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 5.5%, transparent), var(--shadow-soft), inset 0 1px 0 var(--edge-highlight, transparent); overflow: hidden; }
  .mw-inset-row {
    position: relative; display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; column-gap: 10px; align-items: start; padding: 11px 14px;
    transition: background-color var(--dur-hover, 130ms) var(--ease-quint);
    &:hover { background: color-mix(in srgb, var(--ink) 2.5%, transparent); }
    & + .mw-inset-row::before { content: ""; position: absolute; top: 0; left: var(--text-start, 44px); right: 14px; height: 1px; background: var(--line); pointer-events: none; }
    &[data-open="true"] .mw-inset-row__drawer { display: block; animation: craft-rise var(--dur-move) var(--ease-quint); }
  }
  .mw-inset-row--plain { grid-template-columns: minmax(0, 1fr) auto; & + .mw-inset-row--plain::before { left: 14px; } }
  .mw-inset-row__lead { display: inline-grid; place-items: center; width: 20px; height: 22px; flex: none; color: var(--ink-soft); svg { width: 16px; height: 16px; } }
  .mw-inset-row__body { min-width: 0; display: grid; gap: 3px; }
  .mw-inset-row__title { margin: 0; min-width: 0; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); line-height: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-inset-row__signals { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; min-width: 0; }
  .mw-inset-row__end { display: inline-flex; align-items: center; gap: 8px; min-height: 22px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .mw-inset-row__drawer { grid-column: 2 / -1; display: none; margin-top: 8px; > div { overflow: hidden; min-height: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .mw-tabs__list--underline .mw-tabs__tab::after, .mw-inset-row { transition: none; }
    .mw-inset-row[data-open="true"] .mw-inset-row__drawer { animation: none; }
  }
  .mw-return-bar__actions { padding-top: 4px; }
  .mw-return-bar[data-return-bar-state=gone] svg { display: none; }
  /* The Skills one round used (specs/prologue-strategies/skill.md §10): a line above the reply, each Skill a bounded button; it wraps, never cuts a name. */
  .mw-skill-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); > span { white-space: nowrap; } .mw-btn { max-width: 100%; } }
  /* Its 「依据」 panel, the shell's: why the Skill was used, then what to do about it — this round, and from now on. */
  .mw-skill-why { position: fixed; margin: 0; inset: auto; width: min(420px, calc(100vw - 16px)); padding: 12px; overflow: auto; color: var(--ink); font-size: 13px; }
  .mw-skill-why__body { display: grid; gap: 10px; }
  .mw-skill-why h4 { margin: 0; font-size: 13px; font-weight: var(--weight-title); overflow-wrap: anywhere; }
  .mw-skill-why__reason, .mw-skill-why__empty { margin: 0; color: var(--ink-soft); }
  .mw-skill-why__facts { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 10px; font-size: 12px; }
  .mw-skill-why__facts dt { color: var(--muted); white-space: nowrap; }
  .mw-skill-why__facts dd { margin: 0; min-width: 0; color: var(--ink-soft); overflow-wrap: anywhere; }
  .mw-skill-why__group { display: grid; gap: 2px; padding-top: 8px; border-top: 1px solid var(--line); }
  .mw-skill-why__body > .mw-skill-why__group:first-child { padding-top: 0; border-top: 0; }
  .mw-skill-why__label { margin: 0 0 2px; font-size: 11px; color: var(--muted); }
  .mw-skill-why .mw-alert { margin-top: 10px; }

  dialog.mw-command { width: min(560px, calc(100vw - 32px)); }
  .mw-command__shell { display: flex; flex-direction: column; max-height: min(480px, 70dvh); }
  .mw-command__shell header { padding: 12px 12px 8px; }
  .mw-command__list { overflow: auto; padding: 8px; }
  .mw-command__list [role="option"] {
    display: block; width: 100%; text-align: left; padding: 8px 12px; border: 0;
    border-radius: 8px; background: transparent; color: var(--ink); font: inherit;
  }
  .mw-command__list [role="option"]:hover { background: var(--nav-hover); }

  .mw-tooltip {
    padding: 4px 8px; border-radius: 6px; background: var(--action); color: var(--action-ink);
    font-size: 11px; line-height: 1.4;
  }
  .mw-hint { position: relative; display: inline-flex; flex: none; align-items: center; }
  .mw-hint__trigger {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; margin: 0; padding: 0; border: 0; border-radius: 999px;
    background: transparent; color: var(--muted); cursor: help;
  }
  .mw-hint__trigger:hover { color: var(--ink); background: var(--nav-hover); }
  .mw-hint__trigger:focus-visible { ${CONTAINED_FOCUS}; color: var(--ink); }
  .mw-hint__trigger svg { width: 14px; height: 14px; }
  .mw-hint__tooltip {
    box-sizing: border-box; width: max-content; max-width: min(36ch, calc(100vw - 32px));
    margin: 0; padding: 8px 12px; overflow: visible; white-space: normal;
    border: 0; border-radius: 10px;
    background: var(--paper); color: var(--ink);
    box-shadow: var(--shadow), inset 0 1px 0 var(--edge-highlight, transparent);
    font-size: 12px; line-height: 1.5; inset: unset;
  }
  .mw-hint__tooltip:not(:popover-open) { display: none; }
  .mw-hint__tooltip:popover-open {
    position: fixed; top: auto; bottom: 24px; left: 16px; right: 16px; width: auto;
    transform: none;
  }
  .mw-hint__tooltip code {
    padding: 0 4px; border-radius: 4px;
    background: color-mix(in srgb, var(--ink) 10%, transparent);
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 11px;
  }
  @supports (anchor-name: --x) {
    .mw-hint__tooltip:popover-open {
      position: fixed;
      top: anchor(top); left: calc(anchor(right) + 10px); right: auto; bottom: auto;
      width: max-content;
      position-try-fallbacks: flip-inline, flip-block;
    }
  }
  @media (max-width: 760px) {
    @supports (anchor-name: --x) {
      .mw-hint__tooltip:popover-open {
        top: calc(anchor(bottom) + 8px);
        left: 16px; right: 16px; width: auto; max-width: none;
      }
    }
  }

  .mw-accordion { display: grid; gap: 4px; }
  .mw-combobox { display: grid; gap: 4px; }
  .mw-combobox__list {
    border: 0; border-radius: 10px; padding: 4px;
    background: var(--paper); box-shadow: var(--shadow); max-height: 230px; overflow: auto;
  }
  .mw-combobox__list [role="option"] {
    display: block; width: 100%; text-align: left; padding: 8px 12px; border: 0; border-radius: 7px;
    background: transparent; color: var(--ink); font: inherit;
  }
  .mw-combobox__list [role="option"]:hover { background: var(--nav-hover); }

  .mw-otp { display: inline-flex; gap: 8px; }
  .mw-otp__cell {
    width: 36px; min-height: var(--control-h, 28px); text-align: center;
    border: 1px solid var(--control-input); border-radius: var(--radius-control, 8px);
    background: var(--paper); color: var(--ink); font: inherit; font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .mw-otp__cell:focus-visible { ${FIELD_FOCUS}; }
  .mw-slider-field {
    display: grid; gap: 4px; width: min(280px, 100%);
  }
  .mw-slider-field__meta {
    display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
    min-height: 16px; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); line-height: 16px;
  }
  .mw-slider-field__meta output {
    color: var(--muted); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums;
  }
  input.mw-slider {
    appearance: none; -webkit-appearance: none; display: block;
    width: min(280px, 100%); height: var(--control-h, 28px); margin: 0; padding: 0;
    border: 0; border-radius: 0; background: transparent; box-shadow: none;
    accent-color: var(--action); cursor: pointer;
  }
  .mw-slider-field input.mw-slider { width: 100%; }
  input.mw-slider::-webkit-slider-runnable-track {
    height: 4px; border: 0; border-radius: 99px;
    background: linear-gradient(
      to right,
      var(--action) 0,
      var(--action) var(--slider-progress, 40%),
      var(--control-fill) var(--slider-progress, 40%),
      var(--control-fill) 100%
    );
  }
  input.mw-slider::-webkit-slider-thumb {
    appearance: none; -webkit-appearance: none;
    width: 16px; height: 16px; margin-top: -8px; border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--ink) 14%, transparent);
    background: var(--paper); box-shadow: var(--surface-shadow); cursor: grab;
  }
  input.mw-slider::-moz-range-track {
    height: 4px; border: 0; border-radius: 99px; background: var(--control-fill);
  }
  input.mw-slider::-moz-range-progress {
    height: 4px; border: 0; border-radius: 99px; background: var(--action);
  }
  input.mw-slider::-moz-range-thumb {
    width: 16px; height: 16px; border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--ink) 14%, transparent);
    background: var(--paper); box-shadow: var(--surface-shadow); cursor: grab;
  }
  input.mw-slider::-moz-focus-outer { border: 0; }
  input.mw-slider:hover:not(:disabled)::-webkit-slider-thumb,
  input.mw-slider:hover:not(:disabled)::-moz-range-thumb {
    border-color: color-mix(in srgb, var(--ink) 28%, transparent);
  }
  input.mw-slider:active:not(:disabled)::-webkit-slider-thumb,
  input.mw-slider:active:not(:disabled)::-moz-range-thumb { cursor: grabbing; }
  input.mw-slider:focus { outline: 0; }
  input.mw-slider:focus-visible::-webkit-slider-thumb,
  input.mw-slider:focus-visible::-moz-range-thumb {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
  }
  input.mw-slider:disabled { opacity: .42; cursor: not-allowed; }
  html[data-resolved-theme="dark"] input.mw-slider {
    border: 0; background: transparent; color: inherit; box-shadow: none;
  }
  .mw-meter { width: 180px; height: 8px; border: 0; border-radius: 99px; background: var(--control-fill); }
  .mw-meter::-webkit-meter-bar { background: var(--control-fill); border-radius: 99px; }
  .mw-meter::-webkit-meter-optimum-value { background: var(--action); border-radius: 99px; }
  .mw-autocomplete { display: grid; gap: 4px; }
  .mw-autocomplete__list {
    border: 0; border-radius: 10px; padding: 4px;
    background: var(--paper); box-shadow: var(--shadow); max-height: 180px; overflow: auto;
  }
  .mw-autocomplete__list [role="option"] {
    display: block; width: 100%; text-align: left; padding: 8px 12px; border: 0;
    background: transparent; color: var(--ink); font: inherit;
  }
  .mw-autocomplete__list [role="option"]:hover { background: var(--nav-hover); }

  dialog.mw-drawer { padding: 0; border: 0; background: var(--paper); color: var(--ink); box-shadow: none; }
  dialog.mw-drawer::backdrop { background: var(--scrim); }
  dialog.mw-drawer--left { position: fixed; inset: 0 auto 0 0; margin: 0; width: min(320px, 100vw); height: 100dvh; max-height: 100dvh; border-radius: 0 16px 16px 0; box-shadow: var(--shadow); }
  dialog.mw-drawer--right { position: fixed; inset: 0 0 0 auto; margin: 0; width: min(320px, 100vw); height: 100dvh; max-height: 100dvh; border-radius: 16px 0 0 16px; box-shadow: var(--shadow); }
  dialog.mw-drawer--bottom { position: fixed; inset: auto 0 0; margin: 0; width: 100vw; height: min(70dvh, 480px); border-radius: 18px 18px 0 0; box-shadow: var(--shadow); }
  .mw-drawer__shell { height: 100%; }
  .mw-pagination { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .mw-pagination__page {
    min-height: 28px; min-width: 28px; padding: 0 8px; border: 1px solid transparent;
    border-radius: 8px; background: transparent; color: var(--ink-soft); font: inherit;
  }
  .mw-pagination__page:hover { background: var(--nav-hover); color: var(--ink); }
  .mw-pagination__page:disabled { opacity: .42; cursor: not-allowed; }
  .mw-pagination__page.is-current { background: var(--action); color: var(--action-ink); font-weight: var(--weight-control, 500); }
  .mw-breadcrumb ol { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; color: var(--muted); font-size: 12px; }
  .mw-breadcrumb li:not(:last-child)::after { content: "/"; margin-left: 8px; color: var(--faint); }
  .mw-breadcrumb a { color: var(--ink-soft); text-decoration: none; }
  .mw-breadcrumb a:hover { color: var(--ink); }
  .mw-breadcrumb [aria-current="page"] { color: var(--ink); }

  .mw-catalog-shell {
    display: grid; grid-template-columns: 48px 240px minmax(0, 1fr);
    height: 440px; width: 100%; overflow: hidden;
    background: var(--page); border: 0; box-shadow: var(--surface-shadow);
    border-radius: 14px;
  }
  .mw-catalog-shell > [data-primitive] { display: contents; }
  .mw-catalog .mw-card { width: min(280px, 100%); }
  .mw-catalog .mw-table-wrap { width: min(520px, 100%); }
  .mw-catalog-scroll {
    max-height: 140px; width: 240px; padding: 12px 12px;
    border: 1px solid var(--hairline, var(--line));
    border-radius: var(--radius-surface, 12px);
    background: var(--paper); color: var(--ink-soft); font-size: 13px; line-height: 1.6;
  }
  .mw-catalog-scroll p { margin: 0 0 12px; }
  .mw-catalog-scroll p:last-child { margin-bottom: 0; }

  .mw-catalog {
    display: grid; grid-template-columns: 168px minmax(0, 1fr); gap: 48px 48px; padding: 32px 48px 96px;
    scroll-behavior: smooth;
  }
  .mw-catalog > .mw-catalog__section { grid-column: 2; min-width: 0; max-width: 1040px; scroll-margin-top: 24px; }
  .mw-catalog__index {
    grid-column: 1; position: sticky; top: 0; align-self: start;
    display: grid; gap: 1px; padding-top: 4px;
  }
  .mw-catalog__index a {
    display: flex; align-items: center; min-height: 28px; padding: 0 12px; border-radius: var(--radius-item, 8px);
    color: var(--muted); font-size: 12px; text-decoration: none;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    transition: background-color 130ms var(--ease-quint), color 130ms var(--ease-quint);
  }
  .mw-catalog__index a:hover { color: var(--ink); background: var(--nav-hover); }
  .mw-catalog__index a[aria-current="true"] { color: var(--ink); background: var(--nav-active); }
  .mw-catalog__index a:focus-visible { ${CONTAINED_FOCUS}; }
  @media (prefers-reduced-motion: reduce) {
    .mw-catalog { scroll-behavior: auto; }
    .mw-catalog__index a { transition: none; }
  }
  html[data-craft-still] .mw-catalog { scroll-behavior: auto; }
  .mw-catalog__section > h2 {
    margin: 0 0 16px; font-size: 15px; font-weight: var(--weight-title, 600); letter-spacing: -.015em;
    color: var(--ink);
  }
  .mw-catalog__section > .mw-catalog__hint { margin: 0 0 16px; }
  .mw-catalog__row, .mw-catalog__sizes { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .mw-catalog__specimens {
    display: grid; gap: 24px;
  }
  .mw-catalog__specimen { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; min-width: 0; margin: 0; }
  .mw-catalog__toasts { display: grid; justify-items: start; gap: 8px; }
  .mw-catalog__toasts > .mw-toast { max-width: 100%; }
  .mw-catalog__specimen figcaption,
  .mw-catalog__specimen > span {
    margin: 0; color: var(--muted); font-size: 11px; font-weight: var(--weight-control, 500); letter-spacing: .01em;
  }
  .mw-catalog [data-primitive="menu"] .mw-menu,
  .mw-catalog [data-primitive="context-menu"] .mw-menu {
    position: static; display: grid;
  }
  .mw-catalog dialog.mw-command {
    position: static; display: grid; width: min(420px, 100%);
    max-height: none; margin: 0; opacity: 1; transform: none;
  }
  .mw-catalog .mw-popover { position: static; display: grid; inset: auto; }
  .mw-catalog__section[data-primitive="field"] .mw-catalog__row,
  .mw-catalog__section[data-primitive="form"] .mw-catalog__row {
    display: grid; gap: 16px; max-width: 520px;
  }
  .mw-catalog-form { height: auto; border: 0; border-radius: 16px; overflow: hidden; background: var(--paper); box-shadow: var(--shadow-raised); }
  .mw-catalog-form .mw-form__body { max-height: 220px; }
  .mw-catalog__hint { width: 100%; margin: 0; color: var(--muted); font-size: 13px; }
  /* Catalog compositions: the primitives put together the way product pages put them together. */
  .mw-compose { width: min(100%, 780px); }
  .mw-compose--split { display: grid; grid-template-columns: 250px minmax(0, 1fr); height: 300px; overflow: hidden; border-radius: 14px; background: var(--paper); box-shadow: var(--surface-shadow); }
  .mw-compose--split .mw-compose__list { min-height: 0; overflow: auto; padding: 12px 8px; background: var(--surface-soft); border-right: 1px solid var(--line); }
  .mw-compose--split .mw-compose__detail { min-width: 0; min-height: 0; }
  .mw-compose--split .mw-frame { height: 100%; background: transparent; }
  .mw-compose--split .mw-frame.is-rising { animation: craft-rise var(--dur-arrive) var(--ease-quint); }
  .mw-compose--toolbar { padding: 12px 16px; border-radius: 14px; background: var(--paper); box-shadow: var(--surface-shadow); }
  .mw-compose--toolbar .mw-toolbar { flex-wrap: wrap; }
  .mw-compose__search { flex: 1 1 200px; max-width: 280px; }
  .mw-compose__spacer { flex: 1; }
  .mw-compose__anchor { position: relative; }
  .mw-compose__anchor--inline { margin-top: 16px; }
  /* A menu opened inside a dialog floats above the dialog's edge instead of being clipped by it. */
  dialog.mw-dialog:has(.mw-compose__menu:not([hidden])) { overflow: visible; }
  dialog.mw-dialog:has(.mw-compose__menu:not([hidden])) :is(.mw-dialog__shell, .mw-form, .mw-form__body) { overflow: visible; }
  .mw-compose__menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 5; }
  .mw-compose__menu .mw-menu { min-width: 200px; animation: craft-drop 250ms var(--ease-quint); }
  .mw-compose--long { width: min(100%, 540px); }
  .mw-compose__scroll { height: 260px; overflow: auto; padding: 16px 24px; border-radius: 14px; background: var(--paper); box-shadow: var(--surface-shadow); color: var(--ink-soft); font-size: 13px; line-height: 1.75; }
  .mw-compose__scroll h3 { margin: 0 0 8px; color: var(--ink); font-size: 15px; }
  .mw-compose__scroll p { margin: 0 0 12px; }
  .mw-compose__code { overflow-x: auto; margin: 0 0 12px; padding: 12px 12px; border-radius: 8px; background: var(--rail); color: var(--ink); font-size: 12px; white-space: pre; }
  .mw-compose__nested { max-height: 110px; overflow: auto; overscroll-behavior: contain; margin: 0 0 12px; padding: 8px 12px; border-radius: 10px; background: var(--surface-soft); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-compose__nested p { margin: 4px 0; }
  .mw-compose--narrow { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .mw-compose__density { display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 12px; font-weight: var(--weight-control, 500); }
  .mw-compose__resizable { container-type: inline-size; resize: horizontal; overflow: auto; width: 560px; min-width: 260px; max-width: 100%; padding: 12px; border-radius: 14px; background: var(--paper); box-shadow: var(--surface-shadow); }
  .mw-compose__resizable .mw-toolbar { margin-bottom: 8px; flex-wrap: nowrap; }
  @container (max-width: 420px) {
    .mw-compose__resizable .mw-toolbar .mw-btn:not(.mw-btn--primary) { width: var(--control-h, 32px); padding: 0; }
    .mw-compose__resizable .mw-toolbar .mw-btn:not(.mw-btn--primary) > [data-slot="button-label"] { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
  }
  .mw-type-sample__display { color: var(--ink); font-size: 30px; font-weight: var(--weight-title, 600); letter-spacing: -.035em; line-height: 1.3; }
  .mw-type-sample__title { color: var(--ink); font-size: 20px; font-weight: var(--weight-title, 600); letter-spacing: -.02em; }
  .mw-type-sample__item { color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); }
  .mw-type-sample__body { color: var(--ink-soft); font-size: 13px; line-height: 1.8; }
  .mw-type-sample__caption { color: var(--muted); font-size: 12px; }
  .mw-type-sample__mono code { padding: 4px 8px; border-radius: 6px; background: var(--rail); font-size: 12px; }
  .mw-swatch-row { display: flex; flex-wrap: wrap; gap: 12px 16px; }
  .mw-swatch {
    display: grid; grid-template-columns: 36px minmax(0, 1fr); grid-template-rows: auto auto;
    column-gap: 8px; align-items: center; min-width: 108px;
  }
  .mw-swatch__chip {
    grid-row: 1 / span 2; width: 36px; height: 36px; border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--hairline, var(--line));
  }
  .mw-swatch__fill {
    display: none;
  }
  .mw-swatch:has(.mw-swatch__fill) {
    grid-template-columns: 36px 10px minmax(0, 1fr);
  }
  .mw-swatch:has(.mw-swatch__fill) .mw-swatch__fill {
    display: block; grid-column: 2; grid-row: 1 / span 2; width: 8px; height: 36px;
    border-radius: 4px;
  }
  .mw-swatch > .mw-swatch__fill ~ span,
  .mw-swatch > .mw-swatch__fill ~ small { grid-column: 3; }
  .mw-swatch span {
    grid-column: 2; color: var(--ink); font-size: 12px; font-weight: var(--weight-control, 500); line-height: 16px;
  }
  .mw-swatch small {
    grid-column: 2; color: var(--muted); font-size: 11px; font-weight: 400; line-height: 14px;
  }
  .mw-icon-lib { display: grid; gap: 32px; }
  .mw-icon-lib__group h3 {
    margin: 0 0 8px; color: var(--muted); font-size: 11px; font-weight: var(--weight-control, 500); letter-spacing: .01em;
  }
  .mw-icon-lib ul {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
    gap: 4px; margin: 0; padding: 0; list-style: none;
  }
  .mw-icon-lib li {
    display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 0 8px;
    border-radius: 8px; color: var(--ink-soft);
  }
  .mw-icon-lib li:hover { background: var(--nav-hover); color: var(--ink); }
  .mw-icon-lib svg { width: 16px; height: 16px; flex: none; color: var(--ink); }
  .mw-icon-lib span { font-size: 12px; font-weight: 400; }
  .mw-type-sample {
    display: grid; gap: 12px; width: min(560px, 100%);
    padding: 24px 24px; border-radius: 14px;
    background: var(--surface-soft); box-shadow: none;
  }
  .mw-type-sample p { margin: 0; }
  .mw-type-sample__latin {
    color: var(--ink); font-size: 20px; letter-spacing: -.02em; line-height: 1.3;
  }
  .mw-type-sample__zh {
    color: var(--ink-soft); font-size: 17px; letter-spacing: -.01em; line-height: 1.4;
  }
  .mw-type-sample__mix {
    color: var(--muted); font-size: 13px; line-height: 1.5;
  }
  html:has(> body.mw-catalog-page),
  body.mw-catalog-page.settings-page {
    height: 100dvh; max-height: 100dvh; overflow: hidden;
  }
  body.mw-catalog-page {
    margin: 0; background: var(--page); color: var(--ink);
    display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0;
  }
  body.mw-catalog-page .mw-catalog {
    min-height: 0; overflow: auto; overscroll-behavior: contain;
    margin: 0 12px 12px; border-radius: var(--r-sheet, 14px); background: var(--paper); box-shadow: var(--sheet-shadow, var(--surface-shadow));
  }
  .mw-catalog-top {
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
    padding: 16px 32px; border-bottom: 0; background: var(--page);
  }
  .mw-catalog-top h1 { margin: 0; font-size: 17px; font-weight: var(--weight-title, 600); }

  .mw-catalog-dir-stage {
    width: 240px; min-height: 280px; overflow: hidden;
    background: var(--surface-soft); border: 0; box-shadow: var(--surface-shadow);
    border-radius: var(--radius-surface, 14px);
  }
  .mw-catalog-dir-stage.is-yield { width: 213px; }
  .mw-catalog-dir {
    min-height: 280px; padding: 8px;
    border: 0; background: transparent;
  }
  @media (max-width: 760px), (pointer: coarse) {
    .mw-catalog { grid-template-columns: minmax(0, 1fr); padding: 24px 16px 80px; gap: 48px; }
    .mw-catalog > .mw-catalog__section { grid-column: 1; }
    .mw-catalog__index { display: none; }
    .mw-catalog-top { padding: 12px 16px; }
    .mw-catalog-shell { grid-template-columns: 1fr; height: auto; min-height: 0; }
    .mw-catalog .mw-sidebar--rail {
      flex-direction: row; width: auto; height: 48px; padding: 0 8px;
      border-right: 0; border-bottom: 1px solid var(--line);
    }
    .mw-catalog .mw-sidebar--rail .mw-sidebar__body { flex-direction: row; }
    .mw-catalog .mw-sidebar--directory {
      width: auto; height: 220px; border-right: 0; border-bottom: 1px solid var(--line);
    }
    .mw-catalog .mw-frame { min-height: 220px; }
    .mw-catalog-dir-stage, .mw-catalog-dir { width: min(100%, 240px); max-width: 100%; }
  }
`;

export const PRIMITIVE_STYLES =
  PRIMITIVE_PLUGIN_CORE_HEAD
  + PRIMITIVE_PLUGIN_CORE_MID
  + PRIMITIVE_PLUGIN_KBD
  + PRIMITIVE_PLUGIN_DIALOG
  + PRIMITIVE_PLUGIN_DIALOG_FORM
  + PRIMITIVE_PLUGIN_MENU
  + PRIMITIVE_PLUGIN_CONTROLS
  + PRIMITIVE_PLUGIN_FIELDS_EXTRA
  + PRIMITIVE_PLUGIN_SEVERITY
  + PRIMITIVE_PLUGIN_CALENDAR
  + PRIMITIVE_PLUGIN_PREVIEW
  + PRIMITIVE_PLUGIN_LAYOUT
  + PRIMITIVE_PLUGIN_DIR
  + PRIMITIVE_PLUGIN_MEDIA
  + PRIMITIVE_SHELL_EXTRAS;
