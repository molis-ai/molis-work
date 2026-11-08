import { readVersionedFile, sqliteStoreLabel, type VersionedFile } from "@molis-ai/molis-work-storage";
import { hostLog } from "./host-log.js";

/**
 * For settings a screen can do without: its value, or `fallback` when there is no usable file. That is a value in memory and nothing more: each
 * of these owners refuses to replace a file it could not read (`assertVersionedFileWritable`), and a file that exists and was not used leaves a
 * line in the log, with no content in it.
 */
export function readVersionedFileOr<T>(file: VersionedFile<T>, path: string, fallback: () => T, home?: string): T {
  const seen = readVersionedFile(file, path, home);
  if (seen.status === "current") return seen.value;
  if (seen.status !== "absent") hostLog.warn("host", "versioned_file_not_used", undefined, { file: sqliteStoreLabel(path, home), status: seen.status });
  return fallback();
}
