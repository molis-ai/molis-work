import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { existsSync } from "node:fs";

/** What the plugin studio shows about itself; a wait that times out appends it to its error. */
const STUDIO_STATE = "'error=' + document.querySelector('[data-pb-error]')?.textContent + '; status=' + document.querySelector('[data-pb-status]')?.textContent";

/** Chrome for the studio and the generated-plugin browser tests: the shared driver plus the studio's own diagnostics. */
export const openStudioChrome = (directory: string) => ChromeHarness.start(directory, { describe: STUDIO_STATE, executable: dedicatedBuilderBrowser() });

/** Both the outer test page and the real G7 browser must use the explicitly configured test executable on this Mac. */
export function dedicatedBuilderBrowser(): string {
  const configured = process.env.MOLIS_WORK_TEST_CHROME;
  if (process.platform === "darwin") {
    if (!configured || !configured.startsWith("/") || configured.startsWith("/Applications/") || !existsSync(configured)) {
      throw new Error("MOLIS_WORK_TEST_CHROME must name the dedicated test browser; daily Chrome fallback is forbidden");
    }
    return configured;
  }
  const executable = locateTestChrome();
  if (!executable) throw new Error("A test Chrome/Chromium executable is required");
  return executable;
}

/** The Chrome the builder's own browser (G7 acceptance, visual inspection) launches in tests: the test machine's, CI's wrapper included. */
export const builderBrowserExecutable = locateTestChrome() ?? undefined;
