import { textStatsPage } from "./page.js";
import type { Host } from "./types.js";

/** The bundle's entry. It runs inside the factory `(host) => { … }` that the build wraps around it (package.json's banner and footer), so `host` is the factory's own. */
declare const host: Host;
textStatsPage(host);
