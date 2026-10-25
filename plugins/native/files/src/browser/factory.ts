import { mountFiles, type Icons } from "./mount.js";
import type { FilesBrowser, FilesFactoryHost } from "./types.js";

/**
 * The bundle's entry. It runs inside the factory `(host, icons, browser) => { … return browser }` that the build wraps around
 * it (package.json's banner and footer): `src/client.ts` calls that with the page's host and the icons, and `browser` is the
 * factory's slot for what it hands back (Coding's bundle calls its `show` and `refresh`), filled here.
 */
declare const host: FilesFactoryHost;
declare const icons: Icons;
declare let browser: FilesBrowser | null;
browser = mountFiles(host, icons);
