import { readFileSync } from "node:fs";

/**
 * The after-write checkers below the workspaces (specs/prologue-adoption §6.0p.12): the browser program, a page global
 * `molisWorkWriteCheckers = (host) => { … }` that the workspaces script calls with `{ section, prefix, load }` when it is there.
 * Its code is the type-checked TypeScript in src/browser/write-checkers.ts, bundled by esbuild into dist/write-checkers-client.js
 * when the package builds (its banner and footer make the constant). Only the two places that draw the workspaces section load it,
 * the Workbench program and the project settings page; the global settings page has no such section and does not get it.
 * The path goes through the package root, so this file reads the same bundle from dist/scripts/ and from src/scripts/ (tests load
 * the source with tsx); either way the package must be built. The footer is a bare `}` (as Forms' is), so the health gate reads the
 * bundle as its typed entry, and the bundle's own closing line break, kept rather than trimmed, ends the global before the next program.
 */
export const WRITE_CHECKERS_CLIENT_SCRIPT = readFileSync(new URL("../../dist/write-checkers-client.js", import.meta.url), "utf8");
