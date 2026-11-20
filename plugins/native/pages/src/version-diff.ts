import { pagesSchema } from "./schema.js";
import { nodesToMarkdown } from "./to-markdown.js";

interface ParagraphBlock {
  readonly index: number;
  readonly kind: string;
  readonly text: string;
}

export type PagesParagraphDiffKind = "equal" | "modified" | "added" | "removed";

export interface PagesParagraphDiffEntry {
  readonly kind: PagesParagraphDiffKind;
  readonly before_index: number | null;
  readonly after_index: number | null;
  readonly block_kind: string;
  readonly before_text: string | null;
  readonly after_text: string | null;
}

export interface PagesVersionDiffResult {
  readonly page_id: string;
  readonly before_version: number;
  readonly after_version: number;
  readonly title_changed: boolean;
  readonly before_title: string;
  readonly after_title: string;
  readonly identical: boolean;
  readonly summary: Readonly<Record<PagesParagraphDiffKind, number>>;
  readonly paragraphs: readonly PagesParagraphDiffEntry[];
}

export interface PagesFixedVersion {
  readonly title: string;
  readonly body: unknown;
}

const MAX_LCS_PAIRS = 200_000;

export function extractPagesParagraphs(body: unknown): ParagraphBlock[] {
  // An unreadable fixed version must not appear to be an empty document in a comparison.
  const doc = pagesSchema.nodeFromJSON(body);
  if (doc.type !== pagesSchema.topNodeType) throw new RangeError("正文须是文档对象");
  const blocks: ParagraphBlock[] = [];
  doc.forEach((node, _offset, index) => {
    const text = nodesToMarkdown([node]).trim();
    if (text) blocks.push({ index: index + 1, kind: node.type.name, text });
  });
  return blocks;
}

function sameBlock(before: ParagraphBlock, after: ParagraphBlock): boolean {
  return before.kind === after.kind && before.text === after.text;
}

/** Longest common subsequence of unchanged blocks. Ties skip a block from the earlier document first. */
function* equalAnchors(before: ParagraphBlock[], after: ParagraphBlock[]): Iterable<[number, number]> {
  if (!before.length || !after.length) return;
  const stride = after.length + 1;
  const lengths = new Uint32Array((before.length + 1) * stride);
  for (let left = before.length - 1; left >= 0; left--) {
    for (let right = after.length - 1; right >= 0; right--) {
      const cell = left * stride + right;
      lengths[cell] = sameBlock(before[left], after[right])
        ? 1 + lengths[cell + stride + 1]
        : Math.max(lengths[cell + stride], lengths[cell + 1]);
    }
  }
  let left = 0, right = 0;
  while (left < before.length && right < after.length) {
    const cell = left * stride + right;
    if (sameBlock(before[left], after[right])) {
      yield [left, right];
      left++; right++;
    } else if (lengths[cell + stride] >= lengths[cell + 1]) left++;
    else right++;
  }
}

export function comparePagesFixedVersions(input: {
  page_id: string;
  before_version: number;
  after_version: number;
  before: PagesFixedVersion;
  after: PagesFixedVersion;
}): PagesVersionDiffResult {
  const before = extractPagesParagraphs(input.before.body);
  const after = extractPagesParagraphs(input.after.body);
  const paragraphs: PagesParagraphDiffEntry[] = [];
  const summary = { equal: 0, modified: 0, added: 0, removed: 0 };
  const append = (left?: ParagraphBlock, right?: ParagraphBlock) => {
    const kind = !left ? "added" : !right ? "removed" : sameBlock(left, right) ? "equal" : "modified";
    summary[kind]++;
    paragraphs.push({ kind, block_kind: right?.kind ?? left!.kind, before_index: left?.index ?? null,
      after_index: right?.index ?? null, before_text: left?.text ?? null, after_text: right?.text ?? null });
  };
  let left = 0, right = 0;
  // Pair blocks within each gap between unchanged anchors, then emit any surplus as additions or removals.
  const appendGap = (endLeft: number, endRight: number) => {
    while (left < endLeft || right < endRight) append(left < endLeft ? before[left++] : undefined, right < endRight ? after[right++] : undefined);
  };
  if (before.length * after.length <= MAX_LCS_PAIRS) {
    for (const [anchorLeft, anchorRight] of equalAnchors(before, after)) {
      appendGap(anchorLeft, anchorRight);
      append(before[left++], after[right++]);
    }
  }
  appendGap(before.length, after.length);
  const title_changed = input.before.title !== input.after.title;
  return {
    page_id: input.page_id, before_version: input.before_version, after_version: input.after_version,
    before_title: input.before.title, after_title: input.after.title, title_changed,
    identical: !title_changed && !summary.modified && !summary.added && !summary.removed, summary, paragraphs,
  };
}
