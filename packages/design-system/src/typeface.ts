import { BASELINE_FONT, BASELINE_FONT_FACES, baselineFontRoute, baselineFontToken, baselinePackageFile } from "./baseline.js";

/** Same-origin font files served by local-host. Offline fallbacks only; the platform's own sans comes first. */
export const INTER_VARIABLE_ASSET_PATH = baselineFontRoute("font.inter-latin-variable");
export const NOTO_SANS_SC_ASSET_PATH = baselineFontRoute("font.noto-sans-sc-400");

/**
 * Soft Workbench type: the platform's system sans with its own Chinese face — SF and PingFang on
 * Apple, Segoe UI and Microsoft YaHei on Windows. Bundled Inter Variable covers Latin where no
 * system sans is found; the bundled Noto Sans SC (Regular only) is the last offline Chinese
 * fallback, after every system CJK face, so real weights win wherever they exist. Written in `resources/fonts/system-sans.json`.
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

/**
 * Last in every product stylesheet: the face, the weight roles and the type texture.
 * Body copy 400, controls and item titles 500, headings 600. Nothing forces a weight with
 * `!important`; components state their role through `--weight-*` and the shared primitives.
 * Weight is never synthesised, so a face that only ships Regular stays clean instead of smeared.
 */
export const TYPEFACE_STYLES = `
${BASELINE_FONT_FACES}
  :root {
    ${baselineFontToken(["font"])}
    ${baselineFontToken(["font-mono"])}
    ${baselineFontToken(["weight-body", "weight-control", "weight-title"])}
    ${baselineFontToken(["tracking-body", "tracking-title", "tracking-display"])}
  }
  html, body {
    font-family: var(--font);
    font-weight: var(--weight-body);
    letter-spacing: var(--tracking-body);
    font-synthesis-weight: none;
  }
  :where(h1, h2, h3, h4, h5, h6) { font-weight: var(--weight-title); letter-spacing: var(--tracking-title); }
  :where(h1) { letter-spacing: var(--tracking-display); }
  :where(strong, b, th, dt) { font-weight: var(--weight-control); }
  :where(input, textarea, select, option) { font-weight: var(--weight-body); }
  :where(code, kbd, samp, pre) { font-family: var(--font-mono); letter-spacing: 0; }
  :where(time) { font-variant-numeric: tabular-nums; }
`;
