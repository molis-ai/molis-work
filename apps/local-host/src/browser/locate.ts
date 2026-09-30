import fs from "node:fs";
import path from "node:path";

/**
 * Which Chrome-family browser on this machine the side panel drives (specs/side-panel D03). Only browsers that speak
 * CDP qualify; none is bundled. `MOLIS_WORK_BROWSER_PATH` names one explicitly (tests, unusual installs).
 */
export interface LocatedBrowser { readonly path: string; readonly name: string }

const MAC: ReadonlyArray<readonly [string, string]> = [
  ["Google Chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  ["Chromium", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
  ["Microsoft Edge", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
  ["Brave", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"],
  ["Google Chrome Canary", "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"],
];
const LINUX = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"];
const WINDOWS: ReadonlyArray<readonly [string, string]> = [
  ["Google Chrome", "Google\\Chrome\\Application\\chrome.exe"],
  ["Microsoft Edge", "Microsoft\\Edge\\Application\\msedge.exe"],
  ["Brave", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"],
];

const executable = (candidate: string): boolean => {
  try { fs.accessSync(candidate, fs.constants.X_OK); return fs.statSync(candidate).isFile(); } catch { return false; }
};

export function locateBrowser(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): LocatedBrowser | null {
  const explicit = env.MOLIS_WORK_BROWSER_PATH?.trim();
  if (explicit) return executable(explicit) ? { path: explicit, name: path.basename(explicit) } : null;
  if (platform === "darwin") {
    const home = env.HOME ?? "";
    for (const [name, candidate] of MAC) {
      if (executable(candidate)) return { path: candidate, name };
      const personal = path.join(home, candidate);
      if (home && executable(personal)) return { path: personal, name };
    }
    return null;
  }
  if (platform === "win32") {
    const roots = [env["PROGRAMFILES"], env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter((root): root is string => !!root);
    for (const [name, relative] of WINDOWS) for (const root of roots) {
      const candidate = path.join(root, relative);
      if (executable(candidate)) return { path: candidate, name };
    }
    return null;
  }
  const dirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const command of LINUX) for (const dir of dirs) {
    const candidate = path.join(dir, command);
    if (executable(candidate)) return { path: candidate, name: command };
  }
  return null;
}
