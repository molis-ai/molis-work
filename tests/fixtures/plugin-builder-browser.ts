import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";

/** What the plugin studio shows about itself; a wait that times out appends it to its error. */
const STUDIO_STATE = "'error=' + document.querySelector('[data-pb-error]')?.textContent + '; status=' + document.querySelector('[data-pb-status]')?.textContent";

/** Chrome for the studio and the generated-plugin browser tests: the shared driver plus the studio's own diagnostics. */
export const openStudioChrome = (directory: string) => ChromeHarness.start(directory, { describe: STUDIO_STATE });

/** The Chrome the builder's own browser (G7 acceptance, visual inspection) launches in tests: the test machine's, CI's wrapper included. */
export const builderBrowserExecutable = locateTestChrome() ?? undefined;
