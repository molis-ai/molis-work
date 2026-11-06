import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";

/** Accept the explicitly selected headless test engine, or the dedicated wrapper with its installed engine. */
export function requiredHeadlessTestBrowser(): string {
  const requested = process.env.MOLIS_WORK_TEST_CHROME;
  if (!requested || !isAbsolute(requested)) throw new Error("MOLIS_WORK_TEST_CHROME must select an absolute dedicated test browser");
  const wrapper = join(homedir(), ".local/bin/molis-test-browser"), real = realpathSync(requested);
  const engine = requested === wrapper ? realpathSync(join(homedir(), ".local/share/molis-test-browser/engine/chrome-headless-shell")) : real;
  if (real.startsWith("/Applications/") || engine.startsWith("/Applications/") || basename(engine) !== "chrome-headless-shell" || !statSync(engine).isFile())
    throw new Error("The dedicated headless test engine is required; daily Chrome is forbidden");
  accessSync(requested, constants.X_OK); accessSync(engine, constants.X_OK);
  return requested;
}
