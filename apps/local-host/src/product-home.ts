import { resolveHomeDirectory, resolveMolisWorkHome } from "@molis-ai/molis-work-storage";

/**
 * An explicit Home, otherwise the product Home, as its real path. Every place a Home enters (`--home`, the Host, an installer or
 * maintenance service) asks here, so the path handed down is the one the snapshot and purge compare store paths with (S-11).
 */
export function resolveConfiguredHome(homeDirectory?: string): string {
  return homeDirectory === undefined ? resolveMolisWorkHome() : resolveHomeDirectory(homeDirectory);
}
