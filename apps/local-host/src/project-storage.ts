import fs from "node:fs";
import path from "node:path";

export interface LocalProjectStoragePreparation {
  databasePath: string;
  status: "prepared" | "missing";
}

/**
 * The database path a management entry (the CLI, the management MCP) was told to use, or undefined when it was told none:
 * absent, not text, or blank. There is no default. A path guessed from the working directory leaves a stray library
 * wherever the command happens to run.
 */
export function namedDatabasePath(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Prepare a local storage location without opening a runtime or creating a database. */
export function prepareLocalProjectStorage(
  location: string,
  mode: "create" | "existing",
): LocalProjectStoragePreparation {
  const databasePath = path.resolve(location);
  if (mode === "create") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    return { databasePath, status: "prepared" };
  }
  return { databasePath, status: fs.existsSync(databasePath) ? "prepared" : "missing" };
}
