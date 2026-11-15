import { mountWorkBrief } from "./client.js";
import type { WorkBriefHost } from "./types.js";

/** The workbench calls this bundle as `(host) => …`: the build wraps the entry in that function. */
declare const host: WorkBriefHost;

mountWorkBrief(host);
