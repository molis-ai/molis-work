import { gitClient } from "./client.js";
import type { GitSentenceTable } from "../say.js";
import type { GitBrowser, GitHost } from "./types.js";

/**
 * The bundle's entry. It runs inside the factory `(host, sentences, git) => { … return git }` that the build wraps around it
 * (package.json's banner and footer): `src/client.ts` calls that with the page's host and the table of the Host's sentence
 * templates, and `git` is the factory's slot for what it hands back (Coding's bundle calls its `show`, `refresh` and
 * `afterDecision`), filled here.
 */
declare const host: GitHost;
declare const sentences: GitSentenceTable;
declare let git: GitBrowser | null;
git = gitClient(host, sentences);
