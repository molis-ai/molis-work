import { openPluginProjectLibrary, type LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore, codingManifest } from "@molis-ai/molis-work-plugin-coding";

/** The `beforeEffect` of a caller that is always current: the seed a test writes is not an action's. */
export const noEffect = async (): Promise<void> => {};

/**
 * Coding's session store over a project's library, through the Host's own `services.project_database` client
 * (`openPluginProjectLibrary`, the one the Plugin Runtime lends a plugin): the tables are the ones the library made for Coding
 * when it opened, and every statement is checked against the platform's record of them. This is how a test seeds or reads what a
 * running Coding keeps; Coding itself is given its own client when it starts.
 *
 * The client reads through a second, read-only connection of the same file and writes through `store.db`; it needs no closing
 * beyond the library's own.
 */
export function codingSessions(store: Pick<LocalProjectDatabase, "db" | "path">): CodingSessionStore {
  return new CodingSessionStore(openPluginProjectLibrary({ db: store.db, path: store.path }, codingManifest, () => {}, "coding-test-seed").client);
}
