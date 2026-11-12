import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";

/** Select an explicit test engine or CI wrapper; ChromeHarness supplies headless mode and a fresh test profile. */
export function requiredHeadlessTestBrowser(): string {
  const requested = process.env.MOLIS_WORK_TEST_CHROME;
  if (!requested || !isAbsolute(requested)) throw new Error("MOLIS_WORK_TEST_CHROME must select an absolute dedicated test browser");
  if (locateTestChrome() !== requested) throw new Error("The configured test browser must exist; no system-browser fallback");
  const real = realpathSync(requested);
  if (real.includes("/Applications/") || !statSync(real).isFile()) throw new Error("A dedicated test browser is required; daily Chrome is forbidden");
  accessSync(requested, constants.X_OK);
  return requested;
}
