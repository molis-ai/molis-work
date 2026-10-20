import { readFileSync } from "node:fs";

/**
 * The design system's page programs written as TypeScript (`src/browser/`, tsconfig.browser.json), bundled by esbuild into
 * `dist/` when the package builds. This reads them; the stylesheets that go with them stay free of file reads, so loading a
 * style from source never needs a build.
 */
/** The overflow fade's sensor (`browser/overflow-fade.ts`, VUX-27). */
export const OVERFLOW_FADE_CLIENT_SCRIPT = readFileSync(new URL("./overflow-fade-client.js", import.meta.url), "utf8").trim();
/** `window.molisCopy`, the one copy feedback (`browser/copy-feedback.ts`, VUX-19). */
export const COPY_FEEDBACK_CLIENT_SCRIPT = readFileSync(new URL("./copy-feedback-client.js", import.meta.url), "utf8").trim();
