import type { PluginBoardSpecimen, PluginBoardSpecimenPorts } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { compareRunChangeSet } from "./comparison.js";
import { renderDiff } from "./ui.js";

/**
 * Diff's rows on the component board (specs/visual-ui-experience VUX-39): a round's change set of three files — one with a
 * path long enough to run past a narrow column, one new, one deleted — through the projection and the page's renderer, so the
 * file rows with their counts and the first file's rows are what the page shows. Sample content, never a real change.
 */
const LONG = "packages/authentication/src/session/cookies/previous-format/read-session-with-old-and-new-cookie-names.ts";
const DIFF = [
  `--- a/${LONG}`, `+++ b/${LONG}`, "@@ -10,3 +10,5 @@ export function readSession(header: string) {",
  "-  const raw = readCookie(header, \"sid\");", "+  const raw = readCookie(header, \"sid\") ?? readCookie(header, \"session\");", "   if (!raw) return null;",
  "+  // The old format has no expiry: give it the new window.", "+  const expiresAt = Number(expires ?? 0) || now + 7 * 86_400_000;", "   const [id, user] = raw.split(\".\");",
].join("\n");

export function diffBoardSpecimens(p: PluginBoardSpecimenPorts): readonly PluginBoardSpecimen[] {
  const view = compareRunChangeSet({ source_plugin_id: "io.molis.work.coding", content_version: 3, content: { scope: "run-frozen", run_id: "board-run", applied: true,
    origin: { session_id: "board-session", runtime_session_id: "board-runtime", workspace_id: "board-workspace", workspace_name: "molis-auth" },
    files: [
      { path: LONG, kind: "modified", added_lines: 3, removed_lines: 1, diff: DIFF },
      { path: "docs/auth.md", kind: "added", added_lines: 128, removed_lines: 0, diff: "" },
      { path: "auth/cookie-v1.ts", kind: "deleted", added_lines: 0, removed_lines: 1042, diff: "" },
    ] } });
  return [{ id: "diff-files", place: "page", title: p.text("diff.board.files"), html: renderDiff({ view, primitives: p }) }];
}
