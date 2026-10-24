import { codingWorkbench, type CodingClient, type CodingWorkbenchHost } from "./workbench.js";

/**
 * The bundle's entry. It runs inside the factory `(host, coding) => { … }` that the build wraps around it (package.json's
 * banner and footer); src/workbench-client.ts passes Coding's page client, the workbench passes `host`.
 */
declare const host: CodingWorkbenchHost;
declare const coding: CodingClient;
codingWorkbench(host, coding);
