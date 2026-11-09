import { mountGit } from "./mount.js";
import type { GitBrowser, GitFactoryHost } from "./types.js";

/**
 * The bundle's entry. It runs inside the factory `(host, git) => { … return git }` that the build wraps around it
 * (package.json's banner and footer): `src/client.ts` calls that with the page's host, and `git` is the factory's slot for what it hands back (Coding's bundle calls its `show`, `refresh` and
 * `afterDecision`), filled here.
 */
declare const host: GitFactoryHost;
declare let git: GitBrowser | null;
git = mountGit(host);
