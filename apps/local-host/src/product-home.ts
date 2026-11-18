import { resolveHomeDirectory, resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { homedir } from "node:os";
import { join } from "node:path";
import { packagedDesktopHome } from "./active-release-profile.js";

/**
 * An explicit Home, otherwise the product Home, as its real path. Every place a Home enters (`--home`, the Host, an installer or
 * maintenance service) asks here, so the path handed down is the one the snapshot and purge compare store paths with (S-11).
 */
export function resolveConfiguredHome(homeDirectory?: string): string {
  if (homeDirectory !== undefined) return resolveHomeDirectory(homeDirectory);
  const packaged = packagedDesktopHome();
  return packaged ? resolveHomeDirectory(join(homedir(), packaged)) : resolveMolisWorkHome();
}
