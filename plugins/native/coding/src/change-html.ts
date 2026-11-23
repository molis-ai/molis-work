import type { CodingChangeSet } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { t, escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import {
  compareChange,
  compareCodingChangeSet,
  renderDiff,
  unifiedPatch,
  type DiffSide,
  type DiffViewLabels,
  type DiffViewPrimitives,
} from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { codingChangedLines, codingChangeSetReference, codingNetChange } from "./changeset.js";
import { CODING_PLUGIN_ID } from "./manifest.js";

/**
 * Coding's change reader and a child's integration preview, drawn by Coding with the SDK's comparison (PG-062): one write of a
 * round, or a file's net change across the round, and each file a child would bring back, folded like the reader. The Host used
 * to draw both after the route answered.
 */

/** The reader shows a round's change set, the group Diff gives the same input (`data-group`). */
const GROUP = "change-set";

type ChangeBody = { change?: CodingChangeSet; reference?: { version: number }; html?: string };
type IntegrationBody = { files?: Array<{ path: string[]; before_text?: string | null; after_text?: string | null; diff_html?: string }> };

/** Which of Coding's keys (change-messages.ts) each label of the comparison is. The reader names the file above it, so no header. */
const LABELS: DiffViewLabels = {
  mismatch: "coding.change.reader.mismatch",
  partial: "coding.change.reader.partial",
  coarse: "coding.change.reader.coarse",
  created: "coding.change.reader.created",
  removed: "coding.change.reader.removed",
  identical: "coding.change.reader.identical",
  comment_before: "coding.change.reader.comment-before",
  comment_after: "coding.change.reader.comment-after",
  insert: "coding.change.reader.insert",
  delete: "coding.change.reader.delete",
  same: "coding.change.reader.same",
  reveal: "coding.change.reader.reveal",
};

const primitives = (): DiffViewPrimitives => ({ escape: escapeHtml, text: t.text, icon: name => icon(name as Parameters<typeof icon>[0]) });

/**
 * The reader's answer, filled in on the route's body as it is: which write (`change_index`), the net change when asked (`net`,
 * offered only when it is exactly what happened), unified or side by side (`layout`), and the patch 复制补丁 copies (VUX-33),
 * written from the same rows.
 */
function drawChange(body: ChangeBody & { change: CodingChangeSet }, query: Readonly<Record<string, string>>): void {
  const change = body.change, changeIndex = Number(query.change_index ?? 0);
  const index = Number.isSafeInteger(changeIndex) && changeIndex >= 0 ? changeIndex : -1, chosen = change.files[index];
  // A file written several times reads best as one net change, but only when that is exactly what happened.
  const requested = query.net, net = chosen && (requested === "1" || requested === "auto") ? codingNetChange(change, chosen.path) : null;
  const netFiles = net?.available ? (() => {
    const last = change.files[net.indices.at(-1)!]!;
    // The net kind comes from the two ends of the round: gone if the last change removed it, new if it was absent before, otherwise modified.
    const kind = last.kind === "deleted" ? "deleted" as const : net.before_text === null ? "added" as const : "modified" as const;
    return [{ ...last, kind, review: { ...last.review, before_text: net.before_text } }];
  })() : null;
  const reference = body.reference ?? codingChangeSetReference(change.origin.session_id, change.run_id);
  const view = compareCodingChangeSet(netFiles ? { ...change, files: netFiles } : change,
    { source_plugin_id: CODING_PLUGIN_ID, content_version: reference.version }, netFiles ? 0 : index, {
      empty: t.text("coding.change.reader.no-text-review"),
      missing: t.text("coding.change.reader.no-such-change"),
      recovery: t.text("coding.change.reader.run-again"),
    });
  const groups = [...new Set(change.files.map(file => file.path))].map(path => ({ path, ...codingNetChange(change, path) })).filter(group => group.indices.length > 1);
  Object.assign(body, { view_mode: netFiles ? "net" : "write",
    // An available net change also says its lines: what the round left in that file, not the sum of its writes.
    net_groups: groups.map(group => ({ path: group.path, indices: group.indices, available: group.available,
      ...(group.available ? codingChangedLines(group.before_text, group.after_text) : { reason: group.reason }) })) });
  // The reader picks unified or side by side; anything else reads as unified.
  body.html = renderDiff({ view: { ...view, mode: query.layout === "split" ? "split" : "unified" }, line_feedback: Boolean(body.reference), fold_context: 3, sides: false,
    labels: LABELS, primitives: primitives() });
  Object.assign(body, { patch: chosen && view.phase === "ready" ? unifiedPatch(view.rows, { path: chosen.path, created: (netFiles?.[0] ?? chosen).kind === "added", removed: (netFiles?.[0] ?? chosen).kind === "deleted" }) : "" });
}

/** A child's results read as diffs against the main workspace, folded like the change reader, not as two full copies. */
function drawIntegration(body: IntegrationBody & { files: NonNullable<IntegrationBody["files"]> }): void {
  for (const file of body.files) {
    if (file.before_text === undefined || file.after_text === undefined) continue;
    const side: DiffSide = { workspace_id: "integration", workspace_name: "integration", path: file.path.join("/"), source_plugin_id: CODING_PLUGIN_ID, content_version: 1 };
    const view = compareChange(GROUP, { before: side, after: { ...side } }, { before: file.before_text ?? "", after: file.after_text ?? "",
      created: file.before_text === null, removed: file.after_text === null });
    file.diff_html = renderDiff({ view, fold_context: 3, sides: false, labels: LABELS, primitives: primitives() });
  }
}

/** The change reader's and the integration preview's markup on a route's answer: `route_id` says which route answered. */
export function codingChangeHtml(body: unknown, request: { route_id: string; query: Readonly<Record<string, string>> }): void {
  const page = body as (ChangeBody & IntegrationBody) | undefined;
  if (page?.change) drawChange(page as ChangeBody & { change: CodingChangeSet }, request.query);
  if ((request.route_id === "coding.read-integration" || request.route_id === "coding.read-worktree-integration") && Array.isArray(page?.files)) drawIntegration(page as IntegrationBody & { files: NonNullable<IntegrationBody["files"]> });
}
