import { existsSync } from "node:fs";

/** The fixed places a test machine keeps Chrome or Chromium; `MOLIS_WORK_TEST_CHROME` is tried first (CI sets it). */
const FIXED_LOCATIONS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
] as const;

/** The Chrome executable browser tests launch, or `null` when the machine has none (the caller skips with its own text). */
export function locateTestChrome(
  env: Readonly<Record<string, string | undefined>> = process.env,
  exists: (path: string) => boolean = existsSync,
): string | null {
  return [env.MOLIS_WORK_TEST_CHROME, ...FIXED_LOCATIONS].find((path): path is string => Boolean(path && exists(path))) ?? null;
}
