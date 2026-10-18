import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

export function cliExecutable(binary: string): string | null {
  for (const directory of (process.env.PATH || "").split(delimiter)) {
    if (!directory) continue;
    const path = join(directory, binary);
    try { accessSync(path, constants.X_OK); return path; } catch { /* Continue PATH lookup. */ }
  }
  return null;
}
