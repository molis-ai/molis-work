import { bindWriteCheckers, type WriteCheckersHost } from "./write-checkers.js";

/**
 * The bundle's entry (dist/write-checkers-client.js, the package's build). It runs inside the factory `(host) => { … }` that
 * the build's banner and footer wrap around it, so `host` is the factory's own; src/scripts/project-settings.ts reads the bundle.
 */
declare const host: WriteCheckersHost;
bindWriteCheckers(host);
