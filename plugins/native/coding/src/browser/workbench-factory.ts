import { codingWorkbench, type CodingWorkbenchHost } from "./workbench.js";

/**
 * The bundle's entry. It runs inside the factory `(host) => { … }` that the build wraps around it (package.json "build": its banner
 * and footer); src/workbench-client.ts reads the bundle, the workbench passes `host`.
 */
declare const host: CodingWorkbenchHost;
codingWorkbench(host);
