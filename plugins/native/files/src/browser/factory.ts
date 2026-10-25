import { filesClient } from "./client.js";
import type { FilesBrowser, FilesHost } from "./types.js";

/**
 * The bundle's entry. It runs inside the factory `(host, browser) => { … return browser }` that the build wraps around it
 * (package.json's banner and footer), so `host` is the factory's own. The caller passes only the host; `browser` is the
 * factory's slot for what it hands back (Coding's bundle calls its `show` and `refresh`), filled here.
 */
declare const host: FilesHost;
declare let browser: FilesBrowser | null;
browser = filesClient(host);
