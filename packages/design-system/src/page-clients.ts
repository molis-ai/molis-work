import { readFileSync } from "node:fs";

/**
 * The design system's page programs written as TypeScript (`src/browser/`, tsconfig.browser.json), bundled by esbuild into
 * `dist/` when the package builds. This reads them from `dist/` whether it runs built or from source (a preview script
 * importing `src/index.ts`); the stylesheets that go with them stay free of file reads, so a style alone never needs a build.
 */
/** The overflow fade's sensor (`browser/overflow-fade.ts`, VUX-27). */
export const OVERFLOW_FADE_CLIENT_SCRIPT = readFileSync(new URL("../dist/overflow-fade-client.js", import.meta.url), "utf8").trim();
/** `window.molisCopy`, the one copy feedback (`browser/copy-feedback.ts`, VUX-19). */
export const COPY_FEEDBACK_CLIENT_SCRIPT = readFileSync(new URL("../dist/copy-feedback-client.js", import.meta.url), "utf8").trim();
/** `window.molisFollow`, one owner for a growing conversation's scroll (`browser/scroll-follow.ts`, VUX-26). */
export const SCROLL_FOLLOW_CLIENT_SCRIPT = readFileSync(new URL("../dist/scroll-follow-client.js", import.meta.url), "utf8").trim();
/** `window.molisShowMore`, one "show more" for a long list (`browser/show-more.ts`, VUX-08). */
export const SHOW_MORE_CLIENT_SCRIPT = readFileSync(new URL("../dist/show-more-client.js", import.meta.url), "utf8").trim();
/** `window.molisMediaZoom`, zoom about the point looked at and bounded panning for one image (`browser/media-zoom.ts`, VUX-32). */
export const MEDIA_ZOOM_CLIENT_SCRIPT = readFileSync(new URL("../dist/media-zoom-client.js", import.meta.url), "utf8").trim();
/** `window.molisStreamText`, a streamed reply kept block by block, its fresh text shown arriving once (`browser/stream-text.ts`, VUX-14/15). */
export const STREAM_TEXT_CLIENT_SCRIPT = readFileSync(new URL("../dist/stream-text-client.js", import.meta.url), "utf8").trim();
/** `window.molisFit`, intrinsic sizing's fallback for engines without `field-sizing` (`browser/field-fit.ts`, VUX-16). */
export const FIELD_FIT_CLIENT_SCRIPT = readFileSync(new URL("../dist/field-fit-client.js", import.meta.url), "utf8").trim();
