// What the repository's scripts need to know about paths: whether this file is the one being run, and which files are under a directory.
import { existsSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CODE_FILE = /\.[cm]?[jt]sx?$/;
const NEVER_WALKED = new Set(["node_modules", ".git", "dist"]);
const NATIVE_OUTPUT = new Set(["target", ".build"]);

/**
 * Is the module at `moduleUrl` the script Node was asked to run? Compares real paths: a checkout under a path with a space or
 * Chinese, or a symlink to the script, must not look like "imported by someone" and exit 0 without having checked anything.
 */
export function isMainScript(moduleUrl) {
  const invoked = process.argv[1];
  return !!invoked && existsSync(invoked) && realpathSync(invoked) === realpathSync(fileURLToPath(moduleUrl));
}

/**
 * Files under `directories` (relative to `root`) that `accepts` takes, as paths relative to `root`. Dependencies and `dist` are never
 * walked, and Rust and Swift output only outside `src/`: a directory called `target` inside `src/` is source.
 */
export function walkFiles(root, directories, accepts) {
  const files = [];
  const walk = directory => {
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`;
      if (!entry.isDirectory()) { if (accepts(relative)) files.push(relative); }
      else if (!NEVER_WALKED.has(entry.name) && !(NATIVE_OUTPUT.has(entry.name) && !/(?:^|\/)src\//.test(relative))) walk(relative);
    }
  };
  for (const directory of directories) if (existsSync(path.join(root, directory))) walk(directory);
  return files;
}
