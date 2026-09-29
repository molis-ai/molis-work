import { fileURLToPath } from "node:url";

/** Same-origin font files served by local-host. Offline fallbacks only; the platform's own sans comes first. */
export const INTER_VARIABLE_ASSET_PATH = "/assets/inter-latin-variable.woff2";
export const NOTO_SANS_SC_ASSET_PATH = "/assets/noto-sans-sc-400.woff2";

/**
 * Soft Workbench type: the platform's system sans with its own Chinese face — SF and PingFang on
 * Apple, Segoe UI and Microsoft YaHei on Windows. Bundled Inter Variable covers Latin where no
 * system sans is found; the bundled Noto Sans SC (Regular only) is the last offline Chinese
 * fallback, after every system CJK face, so real weights win wherever they exist.
 */
export const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "Inter Variable", Inter, "Noto Sans SC", system-ui, sans-serif';

/** Code, terminal and diff keep a monospace face. */
export const MONO_FONT_STACK = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

export function interVariableFontFilePath(): string {
  return fileURLToPath(new URL("../fonts/inter-latin-variable.woff2", import.meta.url));
}

export function notoSansScFontFilePath(): string {
  return fileURLToPath(new URL("../fonts/noto-sans-sc-400.woff2", import.meta.url));
}

/**
 * Last in every product stylesheet: the face, the weight roles and the type texture.
 * Body copy 400, controls and item titles 500, headings 600. Nothing forces a weight with
 * `!important`; components state their role through `--weight-*` and the shared primitives.
 * Weight is never synthesised, so a face that only ships Regular stays clean instead of smeared.
 */
export const TYPEFACE_STYLES = `
  @font-face {
    font-family: "Inter Variable";
    font-style: normal;
    font-display: swap;
    font-weight: 100 900;
    src: url("${INTER_VARIABLE_ASSET_PATH}") format("woff2");
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }
  @font-face {
    font-family: "Noto Sans SC";
    font-style: normal;
    font-display: swap;
    font-weight: 400;
    src: url("${NOTO_SANS_SC_ASSET_PATH}") format("woff2");
    unicode-range: U+2E80-2EFF, U+3000-303F, U+31C0-31EF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FE10-FE1F, U+FE30-FE4F, U+FF00-FFEF;
  }
  :root {
    --font: ${FONT_STACK};
    --font-mono: ${MONO_FONT_STACK};
    --weight-body: 400; --weight-control: 500; --weight-title: 600;
    --tracking-body: -.011em; --tracking-title: -.02em; --tracking-display: -.03em;
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
