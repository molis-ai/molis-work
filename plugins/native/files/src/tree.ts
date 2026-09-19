import { pathKey, samePath } from "./paths.js";

/**
 * The file tree, as a projection over listings the Host produced.
 *
 * Files never reads a directory itself: it is handed listings and decides what
 * the tree looks like. That split is what makes every interesting case — a
 * directory that failed to list, one that was truncated, one that vanished
 * while expanded — testable without a filesystem.
 */

export type FileEntryKind = "file" | "directory" | "other";

export interface DirectoryEntry {
  name: string;
  kind: FileEntryKind;
  /** Workspace-relative segments, including this entry's own name. */
  path: readonly string[];
}

export interface DirectoryListing {
  entries: readonly DirectoryEntry[];
  /** True when the Host stopped before the directory ended. */
  truncated: boolean;
  /** Set while the Host is still listing. */
  loading?: boolean;
  /** User-safe reason this listing failed. Absent when it succeeded. */
  error?: string;
}

export interface FileTreeInput {
  root: DirectoryListing;
  /** Listings for directories that have been opened, keyed by `pathKey`. */
  children: ReadonlyMap<string, DirectoryListing>;
  expanded: ReadonlySet<string>;
  /** The file currently in focus, if any. */
  selection?: readonly string[];
}

export interface FileTreeNode {
  name: string;
  kind: FileEntryKind;
  path: readonly string[];
  expanded: boolean;
  loading: boolean;
  truncated: boolean;
  selected: boolean;
  error?: string;
  /**
   * Undefined for a file, and for a directory whose listing has not arrived —
   * which is different from an empty array, meaning the directory is empty.
   */
  children?: readonly FileTreeNode[];
}

export function projectFileTree(input: FileTreeInput): FileTreeNode[] {
  return buildLevel(input.root, input);
}

function buildLevel(listing: DirectoryListing, input: FileTreeInput): FileTreeNode[] {
  return listing.entries.map((entry) => buildNode(entry, input));
}

function buildNode(entry: DirectoryEntry, input: FileTreeInput): FileTreeNode {
  const key = pathKey(entry.path);
  const selected = input.selection !== undefined && samePath(input.selection, entry.path);
  if (entry.kind !== "directory") {
    return {
      name: entry.name,
      kind: entry.kind,
      path: entry.path,
      expanded: false,
      loading: false,
      truncated: false,
      selected,
    };
  }
  const expanded = input.expanded.has(key);
  const listing = input.children.get(key);
  const node: FileTreeNode = {
    name: entry.name,
    kind: "directory",
    path: entry.path,
    expanded,
    loading: expanded && (listing === undefined || listing.loading === true),
    truncated: listing?.truncated ?? false,
    selected,
  };
  if (listing?.error !== undefined) return { ...node, error: listing.error };
  // A directory marked expanded whose listing never arrived renders as loading
  // with no children, not as empty: claiming "nothing here" about a directory
  // nobody has read would be a statement Files cannot make.
  if (!expanded || listing === undefined || listing.loading === true) return node;
  return { ...node, children: buildLevel(listing, input) };
}

/**
 * Expand or collapse one directory.
 *
 * Collapsing keeps the descendants' expansion. Re-opening a folder and finding
 * everything inside it shut again loses the user's place for no gain, and a
 * stale key is harmless: `projectFileTree` renders children only for a listing
 * that actually came back.
 */
export function toggleExpanded(
  expanded: ReadonlySet<string>,
  path: readonly string[],
): Set<string> {
  const next = new Set(expanded);
  const key = pathKey(path);
  if (!next.delete(key)) next.add(key);
  return next;
}

/**
 * Drop expansion for directories a refresh no longer lists.
 *
 * Without this, a folder that was deleted and later recreated would come back
 * already open, which claims continuity across two different directories.
 */
export function pruneExpanded(
  expanded: ReadonlySet<string>,
  present: ReadonlySet<string>,
): Set<string> {
  const next = new Set<string>();
  for (const key of expanded) if (present.has(key)) next.add(key);
  return next;
}

/** The entry at a path, walking only through listings that are present. */
export function entryAt(
  input: FileTreeInput,
  path: readonly string[],
): DirectoryEntry | undefined {
  if (path.length === 0) return undefined;
  let listing: DirectoryListing | undefined = input.root;
  for (let index = 0; index < path.length; index += 1) {
    if (listing === undefined) return undefined;
    const prefix = path.slice(0, index + 1);
    const key = pathKey(prefix);
    const entry = listing.entries.find((item) => pathKey(item.path) === key);
    if (entry === undefined) return undefined;
    if (index === path.length - 1) return entry;
    if (entry.kind !== "directory") return undefined;
    listing = input.children.get(key);
  }
  return undefined;
}
