import { readFileSync } from "node:fs";

/**
 * The `settings-return` owner's program (specs/draft-and-return/spec.md §2.2): the type-checked TypeScript in
 * src/browser/settings-return.ts, bundled by esbuild into dist/settings-return-client.js when the package builds. The bundle defines
 * the page global `molisWorkSettingsReturn(host)`; it runs ahead of the client bootstrap (browser-assets.ts), which calls it before
 * any frame mounts, so a frame host's claim is answered from the start.
 */
export const SETTINGS_RETURN_CLIENT_SCRIPT = readFileSync(new URL("../../../dist/settings-return-client.js", import.meta.url), "utf8");
