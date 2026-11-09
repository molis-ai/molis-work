import { readFileSync } from "node:fs";

/**
 * A project's 「输入与输出」 in its settings: the browser program (src/browser/project-directories.ts), bundled by esbuild into
 * dist/project-directories-client.js when the package builds. It sets the page global `molisWorkBindProjectDirectories`, so it goes
 * before the project settings program that calls it, in the two places that draw the section: the project settings page and the
 * workbench, whose settings load that page's section. As with the write checkers, the path goes through the package root, so the
 * package must be built.
 */
export const PROJECT_DIRECTORIES_CLIENT_SCRIPT = readFileSync(new URL("../../dist/project-directories-client.js", import.meta.url), "utf8");
