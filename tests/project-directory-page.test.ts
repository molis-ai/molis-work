import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectDirectories, ProjectDirectory } from "@molis-ai/molis-work-contracts/modules/projects";
import { directoryPage } from "@molis-ai/molis-work-app-local-host";

const DEFAULT_OUTPUT = "workspace-output-0123456789abcdef01234567";
const OTHER_OUTPUT = "workspace-output-fedcba9876543210fedcba98";

const directory = (workspaceId: string, roles: Array<"input" | "output"> = ["input"]): ProjectDirectory => ({
  workspace_id: workspaceId, canonical_path: `/projects/p/${workspaceId}`, realpath_verified: true, display_name: workspaceId, roles, state: "ok",
});
const read = (overrides: Partial<ProjectDirectories> = {}): ProjectDirectories => ({
  project_id: "p", directories: [directory("ws-input"), directory(DEFAULT_OUTPUT, ["output"])], source_links: [], instructions: { off: false, trusted: false }, revision: "r1", ...overrides,
});

// The settings page's route answers projects.directories.get@1 plus this drawing half; it is page-only, not an action contract.
test("the drawing half names the default output directory and whether it is made, from the directories already read", () => {
  const notMade = directoryPage(read(), { workspace_id: DEFAULT_OUTPUT, made: false });
  assert.deepEqual(notMade, { default_output_id: DEFAULT_OUTPUT, default_output_made: false, source_kinds: {} });
  assert.deepEqual(directoryPage(read(), { workspace_id: DEFAULT_OUTPUT, made: true }), { default_output_id: DEFAULT_OUTPUT, default_output_made: true, source_kinds: {} });
  // The output moved away from the default earlier: the default row is not among the read folders, and the page still names it as the
  // default output (it is offered to set back); whether it is made comes from the route, not from the folder being listed.
  const moved = directoryPage(read({ directories: [directory("ws-input")] }), { workspace_id: DEFAULT_OUTPUT, made: true });
  assert.deepEqual(moved, { default_output_id: DEFAULT_OUTPUT, default_output_made: true, source_kinds: {} });
});

// A source link is named by what its folder was (spec §3 「另一台设备上的引用」), so no path to another device's folder is shown.
test("a source link's folder is named as the project's earlier default output, another project's default output, or a folder", () => {
  const linked = read({ source_links: [
    { source_workspace_id: DEFAULT_OUTPUT, workspace_id: "ws-input" },
    { source_workspace_id: OTHER_OUTPUT, workspace_id: "ws-input" },
    { source_workspace_id: "ws-from-another-device", workspace_id: "ws-input" },
  ] });
  assert.deepEqual(directoryPage(linked, { workspace_id: DEFAULT_OUTPUT, made: true }).source_kinds, {
    [DEFAULT_OUTPUT]: "former_default_output",
    [OTHER_OUTPUT]: "other_default_output",
    "ws-from-another-device": "folder",
  });
  // What counts as the default output is the route's id, not any id shaped like a default output: another project's default output is
  // "other_default_output" here, and the project's own earlier default output is only the one the route names.
  assert.deepEqual(directoryPage(linked, { workspace_id: OTHER_OUTPUT, made: true }).source_kinds, {
    [DEFAULT_OUTPUT]: "other_default_output",
    [OTHER_OUTPUT]: "former_default_output",
    "ws-from-another-device": "folder",
  });
});

test("the drawing half adds nothing else and does not change the directories it was given", () => {
  const source = read({ source_links: [{ source_workspace_id: "ws-other", workspace_id: "ws-input" }] });
  const snapshot = JSON.stringify(source);
  const page = directoryPage(source, { workspace_id: DEFAULT_OUTPUT, made: true });
  assert.deepEqual(Object.keys(page).sort(), ["default_output_id", "default_output_made", "source_kinds"]);
  assert.equal(JSON.stringify(source), snapshot, "the read answer is drawn from, not edited");
});
