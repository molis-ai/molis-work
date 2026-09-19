import { fileURLToPath } from "node:url";

/** Same-origin font files served by local-host. */
export const INTER_VARIABLE_ASSET_PATH = "/assets/inter-latin-variable.woff2";
export const NOTO_SANS_SC_ASSET_PATH = "/assets/noto-sans-sc-400.woff2";

export const INTER_FONT_STACK =
  '"Inter Variable", Inter, "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';

export function interVariableFontFilePath(): string {
  return fileURLToPath(new URL("../fonts/inter-latin-variable.woff2", import.meta.url));
}

export function notoSansScFontFilePath(): string {
  return fileURLToPath(new URL("../fonts/noto-sans-sc-400.woff2", import.meta.url));
}

/** Last in every product stylesheet so Inter + Noto Sans SC + regular weight own the cascade. */
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
    --font: ${INTER_FONT_STACK};
  }
  html, body {
    font-family: var(--font);
    font-feature-settings: "cv01" 1, "ss03" 1, "calt" 1;
    font-optical-sizing: auto;
    font-weight: 400;
    letter-spacing: -.011em;
  }
  html body * {
    font-weight: 400 !important;
  }
`;
