import { rm } from "node:fs/promises";
import { rmSync } from "node:fs";
import { basename, join } from "node:path";
import { inspectExistingStoragePath, deleteSecretEntriesWithPrefix, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { ProjectDeletedOwner } from "../project-deleted-hooks.js";

/**
 * What Plugin Studio keeps in the Home for a project: the builds, releases, design drafts and runner storage under
 * `plugin-builder/<project>`, and the sealed values of the secrets saved for its generated plugins (the index that
 * names them lives in the project's own database, which is gone by then, so they are found by their reference prefix).
 * Stopping the runners is the project runtime's closing; this removes what they ran from.
 */
export function pluginBuilderProjectOwner(home: string): ProjectDeletedOwner {
  return {
    id: "plugin-builder",
    label: "插件创作台的构建、发布包和已保存的密钥",
    async clear(projectId, _deletion, control) {
      // A project id names one directory; anything that could name another is not an id this Home ever made.
      if (!projectId || projectId === "." || projectId === ".." || basename(projectId) !== projectId) return;
      control?.assertCurrent();
      const directory = join(home, "plugin-builder", projectId);
      const target = control ? inspectExistingStoragePath(directory, "directory") : undefined;
      target?.assertCurrent();
      // A maintenance guard and its deletion stay in one turn; an async rm can follow a replaced ancestor.
      if (control) rmSync(directory, { recursive: true, force: true });
      else await rm(directory, { recursive: true, force: true });
      control?.assertCurrent();
      runWithMolisWorkHome(home, () => deleteSecretEntriesWithPrefix(`plugin-builder-secret:${projectId}:`, control));
    },
  };
}
