import { bindWriteCheckers, type WriteCheckersHost } from "./write-checkers.js";

/**
 * The bundle's entry (dist/write-checkers-client.js, the package's build). It runs inside the page global
 * `molisWorkWriteCheckers = (host) => { … }` that the build's banner and footer wrap around it, so `host` is that function's own;
 * src/scripts/write-checkers-client.ts reads the bundle.
 */
declare const host: WriteCheckersHost;
bindWriteCheckers(host);
