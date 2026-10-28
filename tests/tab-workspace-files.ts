import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The tab workspace script is one template joined from a main file and its parts; a test that reads its source reads all of them. */
export const TAB_WORKSPACE_FILES = ["tab-workspace.ts", "tab-workspace-panes.ts", "tab-workspace-strip.ts", "tab-workspace-places.ts", "tab-workspace-plugins.ts", "tab-workspace-menus.ts", "tab-workspace-drag.ts"]
  .map((name) => `scripts/client/${name}`);

export const workbenchSource = (path: string) => readFileSync(fileURLToPath(new URL(`../apps/workbench/src/${path}`, import.meta.url)), "utf8");

export const tabWorkspaceSource = () => TAB_WORKSPACE_FILES.map(workbenchSource).join("\n");
