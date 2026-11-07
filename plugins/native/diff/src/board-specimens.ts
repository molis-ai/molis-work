import type { PluginBoardSpecimen, PluginBoardSpecimenPorts } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { renderDiff } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { compareRunChangeSet } from "./comparison.js";
import { DIFF_LABELS } from "./ui.js";

/**
 * Diff's rows on the component board (specs/visual-ui-experience VUX-39): a round's change set of three files — one with a
 * path long enough to run past a narrow column, one new, one deleted — through the projection and the page's renderer, so the
 * file rows with their counts and the first file's rows are what the page shows. Sample content, never a real change.
 */
const LONG = "packages/authentication/src/session/cookies/previous-format/read-session-with-old-and-new-cookie-names.ts";
const BEFORE = ["  const raw = readCookie(header, \"sid\");", "  if (!raw) return null;", "  const [id, user] = raw.split(\".\");"].join("\n");
const AFTER = [
  "  const raw = readCookie(header, \"sid\") ?? readCookie(header, \"session\");", "  if (!raw) return null;",
  "  // The old format has no expiry: give it the new window.", "  const expiresAt = Number(expires ?? 0) || now + 7 * 86_400_000;", "  const [id, user] = raw.split(\".\");",
].join("\n");
const review = (review_id: string, before_text: string | null, after_text: string) => ({ review_id, before_text, after_text, decision: "approved" as const, execution: "applied" as const });

export function diffBoardSpecimens(p: PluginBoardSpecimenPorts): readonly PluginBoardSpecimen[] {
  const view = compareRunChangeSet({ source_plugin_id: "io.molis.work.coding", content_version: 3, content: { scope: "run-frozen", run_id: "board-run", applied: true, coverage: "text-reviews",
    origin: { session_id: "board-session", runtime_session_id: "board-runtime", workspace_id: "board-workspace", workspace_name: "molis-auth" },
    files: [
      { path: LONG, kind: "modified", added_lines: 3, removed_lines: 1, diff: "", review: review("board-1", BEFORE, AFTER) },
      { path: "docs/auth.md", kind: "added", added_lines: 128, removed_lines: 0, diff: "", review: review("board-2", null, "# Auth\n") },
      { path: "auth/cookie-v1.ts", kind: "deleted", added_lines: 0, removed_lines: 1042, diff: "", review: review("board-3", "export {};\n", "") },
    ] } });
  return [{ id: "diff-files", place: "page", title: p.text("diff.board.files"), html: renderDiff({ view, primitives: p, labels: DIFF_LABELS }) }];
}
