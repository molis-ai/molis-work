import { initializeProjectDatabase, prepareLocalProjectStorage } from "@molis-ai/molis-work-app-local-host";

/**
 * A project library no catalog made, at `databasePath`: the directory, the library and its one root row. The CLI's `init` used to make
 * it; that command went with the CLI's Goals commands (specs/plugin-equal-standing PEQ-15), so a test that needs one makes it here.
 */
export async function createStandaloneProject(databasePath: string, projectId: string): Promise<void> {
  prepareLocalProjectStorage(databasePath, "create");
  await initializeProjectDatabase(databasePath, projectId);
}
