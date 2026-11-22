import { BASELINE_FONT, BASELINE_FONT_FACES, baselineFontRoute, baselinePackageFile } from "./baseline.js";
import { renderFontScope, renderMonoScope, renderRootTypeTokens } from "./appearance-tokens.js";

/** Same-origin font files served by local-host. Bundled Inter Variable + Noto Sans SC 400/500/600 (F1). */
export const INTER_VARIABLE_ASSET_PATH = baselineFontRoute("font.inter-latin-variable");
export const NOTO_SANS_SC_ASSET_PATH = baselineFontRoute("font.noto-sans-sc-400");
export const NOTO_SANS_SC_500_ASSET_PATH = baselineFontRoute("font.noto-sans-sc-500-common");
export const NOTO_SANS_SC_600_ASSET_PATH = baselineFontRoute("font.noto-sans-sc-600-common");

/**
 * Default Sans + CJK stack (F1): bundled variable Latin + real 400/500/600 Chinese outlines,
 * falling back cleanly to platform CJK & sans faces for rare glyphs. Written in `resources/fonts/system-sans.json`.
 */
export const FONT_STACK = BASELINE_FONT.tokens.font!;

/** Code, terminal and diff keep a monospace face. */
export const MONO_FONT_STACK = BASELINE_FONT.tokens["font-mono"]!;

/** The font files on disk, from the registry's `path` as the routes are from its `route`. */
export function interVariableFontFilePath(): string {
  return baselinePackageFile("font.inter-latin-variable");
}

export function notoSansScFontFilePath(): string {
  return baselinePackageFile("font.noto-sans-sc-400");
}

export function notoSansSc500FontFilePath(): string {
  return baselinePackageFile("font.noto-sans-sc-500-common");
}

export function notoSansSc600FontFilePath(): string {
  return baselinePackageFile("font.noto-sans-sc-600-common");
}

/**
 * Last in every product stylesheet: the face, the weight roles and the type texture.
 * Body copy 400, controls and item titles 500, headings 600. Nothing forces a weight with
 * `!important`; components state their role through `--weight-*` and the shared primitives.
 * Weight is never synthesised, so real 400/500/600 outlines stay crisp instead of smeared.
 */
export const TYPEFACE_STYLES = `
${BASELINE_FONT_FACES}
  ${renderFontScope(BASELINE_FONT, true)}
  ${renderMonoScope(BASELINE_FONT, true)}
  html, body {
    font-family: var(--font);
    font-weight: var(--weight-body);
    line-height: var(--type-body-line-height, 1.58);
    letter-spacing: var(--tracking-body);
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";
    text-autospace: normal;
    font-synthesis-weight: none;
  }
  :where(html:lang(en), [lang="en"], [lang^="en-"]) { letter-spacing: -0.011em; }
  :where(h1, h2, h3, h4, h5, h6) { font-family: var(--type-title-font); font-weight: var(--weight-title); letter-spacing: var(--tracking-title); }
  :where(h1) { letter-spacing: var(--tracking-display); }
  :where(strong, b, th, dt) { font-weight: var(--weight-control); }
  .mw-btn { font-family: var(--type-control-font, var(--font)); }
  :where(input, textarea, select, option) { font-weight: var(--weight-body); }
  :where(code, kbd, samp, pre) { font-family: var(--font-mono); letter-spacing: 0; }
  :where(.mw-reading-text, .mw-look-proof__read) { font-family: var(--type-reading-font); font-size: var(--type-reading-size); line-height: var(--type-reading-line-height); font-weight: var(--type-reading-weight); letter-spacing: var(--type-reading-tracking); }
  :where(time, data, .mw-num) { font-variant-numeric: tabular-nums; }
`;

/** Root-only baseline font faces, tokens, and typographic defaults for opaque plugin frames (102-1). */
export const PLUGIN_TYPEFACE_STYLES = `
${BASELINE_FONT_FACES}
  ${renderRootTypeTokens(BASELINE_FONT)}
  html, body { font-family: var(--font); font-weight: var(--weight-body); line-height: var(--type-body-line-height); letter-spacing: var(--tracking-body); font-feature-settings: "cv02", "cv03", "cv04", "cv11"; text-autospace: normal; font-synthesis-weight: none; }
  :where(html:lang(en), [lang="en"], [lang^="en-"]) { letter-spacing: -.011em; }
  :where(h1, h2, h3, h4, h5, h6) { font-family: var(--type-title-font); font-weight: var(--weight-title); letter-spacing: var(--tracking-title); }
  :where(h1) { letter-spacing: var(--tracking-display); }
  :where(strong, b, th, dt) { font-weight: var(--weight-control); }
  .mw-btn { font-family: var(--type-control-font); }
  :where(input, textarea, select, option) { font-weight: var(--weight-body); }
  :where(code, kbd, samp, pre) { font-family: var(--font-mono); letter-spacing: 0; }
  :where(.mw-reading-text) { font-family: var(--type-reading-font); font-size: var(--type-reading-size); line-height: var(--type-reading-line-height); font-weight: var(--type-reading-weight); letter-spacing: var(--type-reading-tracking); }
  :where(time, data, .mw-num) { font-variant-numeric: tabular-nums; }
`;
