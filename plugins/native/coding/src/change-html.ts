import { ActionError, type ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import type { CodingChangeSet } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { fillMessage } from "@molis-ai/molis-work-plugin-sdk";
import {
  compareChange,
  compareHunks,
  diffViewText,
  emptyDiffView,
  renderDiff,
  unifiedErrors,
  unifiedPatch,
  type DiffFileEntry,
  type DiffSide,
  type DiffView,
  type DiffViewLabels,
  type DiffViewPrimitives,
} from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { CODING_CHANGE_MESSAGES } from "./change-messages.js";
import { codingNetChange } from "./changeset.js";
import { CODING_PLUGIN_ID } from "./manifest.js";
import { codingText } from "./words.js";

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

/** The keys whose sentences come written in Chinese with values in them. */
const TEMPLATES = ["coding.change.reader.no-change-in", "coding.change.reader.hunk-count", "coding.change.reader.hunk-header", "coding.change.reader.no-hunks"];

/** What the reader is drawn with: Coding's words in the page's language, a sentence with a value in it said again with that value. */
const texts = new Map<ActionLocale, DiffViewPrimitives["text"]>();
function primitives(locale: ActionLocale = "zh"): DiffViewPrimitives {
  let text = texts.get(locale);
  if (!text) texts.set(locale, text = diffViewText(CODING_CHANGE_MESSAGES, locale, TEMPLATES, codingText(locale)));
  return { escape: value => escapeHtml(String(value)), text, icon: name => icon(name as Parameters<typeof icon>[0]) };
}

/** One file of a round's change set as the reader shows it: both ends of a reviewed write, or the hunks the round produced. */
function changeView(change: CodingChangeSet, index: number, version: number): DiffView {
  const files: DiffFileEntry[] = change.files.map(file => ({ path: file.path, kind: file.kind, added_lines: file.added_lines, removed_lines: file.removed_lines }));
  if (files.length === 0) return emptyDiffView(GROUP, change.coverage === "text-reviews" ? "coding.change.reader.no-text-review" : "coding.change.reader.no-files",
    "ready", "coding.change.reader.run-again");
  const chosen = change.files[index];
  // The reader asks by index, so no path is known here: the sentence reads as the Host's did.
  if (chosen === undefined) return { ...emptyDiffView(GROUP, fillMessage(CODING_CHANGE_MESSAGES["coding.change.reader.no-change-in"].zh, { path: String(undefined) }), "unavailable", "coding.change.reader.run-again"), files };
  if (chosen.review) {
    const side: DiffSide = { workspace_id: change.origin?.workspace_id ?? change.run_id, workspace_name: change.origin?.workspace_name ?? change.run_id,
      path: chosen.path, source_plugin_id: CODING_PLUGIN_ID, content_version: version };
    return { ...compareChange(GROUP, { before: side, after: { ...side } }, { before: chosen.review.before_text ?? "", after: chosen.review.after_text,
      created: chosen.review.before_text === null }), files };
  }
  const side: DiffSide = { workspace_id: change.run_id, workspace_name: change.run_id, path: chosen.path, source_plugin_id: CODING_PLUGIN_ID, content_version: version };
  try {
    return { ...compareHunks(GROUP, { before: side, after: { ...side } }, chosen.diff, { created: chosen.kind === "added", removed: chosen.kind === "deleted" }), files };
  } catch (error) {
    const message = error instanceof ActionError && error.code.startsWith("diff.unified.")
      && Object.hasOwn(unifiedErrors, error.code.slice("diff.unified.".length)) ? error.message : "coding.change.reader.unreadable-diff";
    return { ...emptyDiffView(GROUP, message, "unavailable", "coding.change.reader.run-again"), files };
  }
}

/**
 * The reader's answer, filled in on the route's body as it is: which write (`change_index`), the net change when asked (`net`,
 * offered only when it is exactly what happened), unified or side by side (`layout`), and the patch 复制补丁 copies (VUX-33),
 * written from the same rows.
 */
function drawChange(body: ChangeBody & { change: CodingChangeSet }, query: Readonly<Record<string, string>>, locale: ActionLocale | undefined): void {
  const change = body.change, changeIndex = Number(query.change_index ?? 0);
  const index = Number.isSafeInteger(changeIndex) && changeIndex >= 0 ? changeIndex : -1, chosen = change.files[index];
  // A file written several times reads best as one net change, but only when that is exactly what happened.
  const requested = query.net, net = chosen && (requested === "1" || requested === "auto") ? codingNetChange(change, chosen.path) : null;
  const netFiles = net?.available ? (() => {
    const first = change.files[net.indices[0]!]!, last = change.files[net.indices.at(-1)!]!;
    return [{ ...last, kind: first.kind, review: { ...last.review!, before_text: net.before_text } }];
  })() : null;
  const view = changeView(netFiles ? { ...change, files: netFiles } : change, netFiles ? 0 : index, body.reference?.version ?? 1);
  const groups = [...new Set(change.files.map(file => file.path))].map(path => ({ path, ...codingNetChange(change, path) })).filter(group => group.indices.length > 1);
  Object.assign(body, { view_mode: netFiles ? "net" : "write",
    net_groups: groups.map(group => ({ path: group.path, indices: group.indices, available: group.available, ...(group.available ? {} : { reason: group.reason }) })) });
  // The reader picks unified or side by side; anything else reads as unified.
  body.html = renderDiff({ view: { ...view, mode: query.layout === "split" ? "split" : "unified" }, line_feedback: Boolean(body.reference), fold_context: 3, sides: false,
    labels: LABELS, primitives: primitives(locale) });
  Object.assign(body, { patch: chosen && view.phase === "ready" ? unifiedPatch(view.rows, { path: chosen.path, created: (netFiles?.[0] ?? chosen).kind === "added", removed: (netFiles?.[0] ?? chosen).kind === "deleted" }) : "" });
}

/** A child's results read as diffs against the main workspace, folded like the change reader, not as two full copies. */
function drawIntegration(body: IntegrationBody & { files: NonNullable<IntegrationBody["files"]> }, locale: ActionLocale | undefined): void {
  for (const file of body.files) {
    if (file.before_text === undefined || file.after_text === undefined) continue;
    const side: DiffSide = { workspace_id: "integration", workspace_name: "integration", path: file.path.join("/"), source_plugin_id: CODING_PLUGIN_ID, content_version: 1 };
    const view = compareChange(GROUP, { before: side, after: { ...side } }, { before: file.before_text ?? "", after: file.after_text ?? "", created: file.before_text === null });
    file.diff_html = renderDiff({ view, fold_context: 3, sides: false, labels: LABELS, primitives: primitives(locale) });
  }
}

/** The change reader's and the integration preview's markup on a route's answer: `route_id` says which route answered. */
export function codingChangeHtml(body: unknown, request: { route_id: string; query: Readonly<Record<string, string>> }, locale: ActionLocale | undefined): void {
  const page = body as (ChangeBody & IntegrationBody) | undefined;
  if (page?.change) drawChange(page as ChangeBody & { change: CodingChangeSet }, request.query, locale);
  if (request.route_id === "coding.read-integration" && Array.isArray(page?.files)) drawIntegration(page as IntegrationBody & { files: NonNullable<IntegrationBody["files"]> }, locale);
}
