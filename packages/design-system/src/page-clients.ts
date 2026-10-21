import { readFileSync } from "node:fs";

/**
 * The design system's page programs written as TypeScript (`src/browser/`, tsconfig.browser.json), bundled by esbuild into
 * `dist/` when the package builds. This reads them from `dist/` whether it runs built or from source (a preview script
 * importing `src/index.ts`); the stylesheets that go with them stay free of file reads, so a style alone never needs a build.
 */
/** `window.molisFollow`, one owner for a growing conversation's scroll (`browser/scroll-follow.ts`, VUX-26). */
export const SCROLL_FOLLOW_CLIENT_SCRIPT = readFileSync(new URL("../dist/scroll-follow-client.js", import.meta.url), "utf8").trim();
/** The overflow fade's sensor (`browser/overflow-fade.ts`, VUX-27). */
export const OVERFLOW_FADE_CLIENT_SCRIPT = readFileSync(new URL("../dist/overflow-fade-client.js", import.meta.url), "utf8").trim();
/** `window.molisCopy`, the one copy feedback (`browser/copy-feedback.ts`, VUX-19). */
export const COPY_FEEDBACK_CLIENT_SCRIPT = readFileSync(new URL("../dist/copy-feedback-client.js", import.meta.url), "utf8").trim();
