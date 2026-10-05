import path from "node:path";
import { resolveMolisWorkHome } from "@molis-ai/molis-work-storage";

/** Resolve an explicit Home, otherwise the product Home. */
export function resolveConfiguredHome(homeDirectory?: string): string {
  return path.resolve(homeDirectory ?? resolveMolisWorkHome());
}
