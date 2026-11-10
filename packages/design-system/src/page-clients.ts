import { readFileSync } from "node:fs";

/**
 * The design system's page programs written as TypeScript (`src/browser/`, tsconfig.browser.json), bundled by esbuild into
 * `dist/` when the package builds. This reads them from `dist/` whether it runs built or from source (a preview script
 * importing `src/index.ts`). The stylesheets that go with them read only the baseline files in `resources/` (`baseline.ts`), which
 * need no build, so a style alone never needs one either.
 */
/** `window.molisFollow`, one owner for a growing conversation's scroll (`browser/scroll-follow.ts`, VUX-26). */
export const SCROLL_FOLLOW_CLIENT_SCRIPT = readFileSync(new URL("../dist/scroll-follow-client.js", import.meta.url), "utf8").trim();
/** `window.molisShowMore`, the one show-more for long lists (`browser/show-more.ts`, VUX-08). */
export const SHOW_MORE_CLIENT_SCRIPT = readFileSync(new URL("../dist/show-more-client.js", import.meta.url), "utf8").trim();
/** `window.molisMediaZoom`, the one media preview zoom (`browser/media-zoom.ts`, VUX-32). */
export const MEDIA_ZOOM_CLIENT_SCRIPT = readFileSync(new URL("../dist/media-zoom-client.js", import.meta.url), "utf8").trim();
/** `window.molisStreamText`, streamed replies keep unchanged nodes (`browser/stream-text.ts`, VUX-14/15). */
export const STREAM_TEXT_CLIENT_SCRIPT = readFileSync(new URL("../dist/stream-text-client.js", import.meta.url), "utf8").trim();
/** `window.molisFit`, intrinsic sizing for fields that grow with what is written (`browser/field-fit.ts`, VUX-16). */
export const FIELD_FIT_CLIENT_SCRIPT = readFileSync(new URL("../dist/field-fit-client.js", import.meta.url), "utf8").trim();
/** `window.molisRovingFocus`, one roving tab stop for groups (`browser/roving-focus.ts`, VUX-28). */
export const ROVING_FOCUS_CLIENT_SCRIPT = readFileSync(new URL("../dist/roving-focus-client.js", import.meta.url), "utf8").trim();
/** `window.molisFloatingDetails`, close a floating details layer (`browser/floating-details.ts`, VUX-29). */
export const FLOATING_DETAILS_CLIENT_SCRIPT = readFileSync(new URL("../dist/floating-details-client.js", import.meta.url), "utf8").trim();
/** `window.molisTip`, the one tooltip (`browser/tip.ts`, VUX-05). */
export const TIP_CLIENT_SCRIPT = readFileSync(new URL("../dist/tip-client.js", import.meta.url), "utf8").trim();
/** `window.molisDropZone`, one drop-zone child/drag-leave owner (`browser/drop-zone.ts`, VUX-18). */
export const DROP_ZONE_CLIENT_SCRIPT = readFileSync(new URL("../dist/drop-zone-client.js", import.meta.url), "utf8").trim();
/** `window.molisReflow`, one measured reflow for chips and rows (`browser/reflow.ts`, VUX-16/18). */
export const REFLOW_CLIENT_SCRIPT = readFileSync(new URL("../dist/reflow-client.js", import.meta.url), "utf8").trim();
/** The overflow fade's sensor (`browser/overflow-fade.ts`, VUX-27). */
export const OVERFLOW_FADE_CLIENT_SCRIPT = readFileSync(new URL("../dist/overflow-fade-client.js", import.meta.url), "utf8").trim();
/** `window.molisCopy`, the one copy feedback (`browser/copy-feedback.ts`, VUX-19). */
export const COPY_FEEDBACK_CLIENT_SCRIPT = readFileSync(new URL("../dist/copy-feedback-client.js", import.meta.url), "utf8").trim();
/** The component board's demo behaviour (`browser/catalog.ts`): overlay specimens, motion and craft demos, composition menus. */
export const CATALOG_CLIENT_SCRIPT = readFileSync(new URL("../dist/catalog-client.js", import.meta.url), "utf8").trim();
/** `window.molisWorkLookFade`, shared with the component board's appearance specimen. */
export const LOOK_FADE_CLIENT_SCRIPT = readFileSync(new URL("../dist/look-fade-client.js", import.meta.url), "utf8").trim();
/** The unified input's program (`browser/composer.ts`, specs/unified-input-voice §3.1, K2): one shared file, `/assets/molis-work-composer.js`. */
export const COMPOSER_CLIENT_SCRIPT = readFileSync(new URL("../dist/composer-client.js", import.meta.url), "utf8").trim();
/** `window.molisComposer` in a page's own script (`browser/composer-loader.ts`): fetches the program on the first mount. */
export const COMPOSER_LOADER_CLIENT_SCRIPT = readFileSync(new URL("../dist/composer-loader-client.js", import.meta.url), "utf8").trim();
/** The Workbench document's draft sweep (`browser/composer-sweep.ts`, UIC-10). */
export const COMPOSER_SWEEP_CLIENT_SCRIPT = readFileSync(new URL("../dist/composer-sweep-client.js", import.meta.url), "utf8").trim();
