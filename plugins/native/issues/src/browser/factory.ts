import { mountIssues } from "./client.js";
import type { IssuesHost } from "./types.js";

/** The workbench calls this bundle as `(host) => …`: the build wraps the entry in that function. */
declare const host: IssuesHost;

mountIssues(host);
