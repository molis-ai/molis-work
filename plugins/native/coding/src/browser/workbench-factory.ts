import { codingWorkbench, type CodingClient, type CodingIcons, type CodingWorkbenchHost } from "./workbench.js";

/**
 * The bundle's entry. It runs inside the factory `(host, coding, icons) => { … }` that the build wraps around it (package.json's
 * banner and footer); src/workbench-client.ts passes Coding's page client and the icons, the workbench passes `host`.
 */
declare const host: CodingWorkbenchHost;
declare const coding: CodingClient;
declare const icons: CodingIcons;
codingWorkbench(host, coding, icons);
