import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempDatabase {
  directory: string;
  path: string;
  cleanup(): void;
}

export function createTempDatabase(): TempDatabase {
  const directory = mkdtempSync(join(tmpdir(), "alchemist-db-test-"));
  return {
    directory,
    path: join(directory, "alchemist.sqlite"),
    cleanup() {
      rmSync(directory, { force: true, recursive: true });
    },
  };
}
