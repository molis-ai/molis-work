import { FilePathError, parseFilePath } from "./paths.js";

/**
 * The last file the user was reading, kept in this Plugin's private storage.
 *
 * Restoring it is a convenience, so every failure here is silent and recoverable:
 * a record that does not parse is dropped rather than raised, because refusing
 * to open Files over a bad preference would punish the user for a stored value
 * they never typed.
 */

export const READING_POSITION_KEY = "reading-position";

const MAX_RECORD_LENGTH = 16_384;

export interface ReadingPosition {
  workspace_id: string;
  path: readonly string[];
}

export function parseReadingPosition(raw: string | null | undefined): ReadingPosition | undefined {
  if (raw === undefined || raw === null || raw.trim() === "") return undefined;
  if (raw.length > MAX_RECORD_LENGTH) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  const workspace_id = typeof record.workspace_id === "string" ? record.workspace_id.trim() : "";
  if (workspace_id === "" || !/^[A-Za-z0-9._-]+$/u.test(workspace_id)) return undefined;
  try {
    return { workspace_id, path: parseFilePath(record.path) };
  } catch (error) {
    if (error instanceof FilePathError) return undefined;
    throw error;
  }
}

export function serializeReadingPosition(position: ReadingPosition): string {
  return JSON.stringify({ workspace_id: position.workspace_id, path: [...position.path] });
}

/**
 * Whether a stored position still applies.
 *
 * A position from another workspace is not stale, it is simply someone else's:
 * restoring it would open a file the user never had open in this project.
 */
export function positionApplies(
  position: ReadingPosition | undefined,
  workspaceId: string | null,
): position is ReadingPosition {
  return position !== undefined && workspaceId !== null && position.workspace_id === workspaceId;
}
