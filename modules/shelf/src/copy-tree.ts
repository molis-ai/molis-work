import type { PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { shelfErrors } from "./errors.js";

/** A stored relative path (`/`-separated) stays under one top-level folder of the shelf and has no empty, `.` or `..` segment. */
export function safeInside(top: "files" | "jobs", relative: string): string {
  const parts = relative.split("/");
  if (parts[0] !== top || parts.length < 2 || parts.some((part) => !part || part === "." || part === "..")) {
    throw shelfErrors.path_invalid("删除路径不在架子内");
  }
  return relative;
}

/** `base/relative` for a relative path kept in the catalog, refusing any segment that could leave `base`. */
export function within(base: string, relative: string): string {
  if (relative.split("/").some((part) => !part || part === "." || part === "..")) throw shelfErrors.path_invalid("路径不在架子内");
  return `${base}/${relative}`;
}

/**
 * `input/` is the frozen source copy the job reads: its files are read-only. Its folders stay writable, so cleanup works even after a
 * cancelled or revoked call, which may write nothing more; what the job reads is checked against its hash before every commit.
 */
export function freezeReadOnly(writer: PluginOwnerFilesWriter, target: string): void {
  const stat = writer.stat(target);
  if (!stat) return;
  if (stat.kind === "directory") {
    for (const entry of writer.list(target)) freezeReadOnly(writer, `${target}/${entry.name}`);
  } else writer.setAccess(target, "readonly");
}

export function thawTree(writer: PluginOwnerFilesWriter, target: string): void {
  const stat = writer.stat(target);
  if (!stat) return;
  writer.setAccess(target, "readwrite");
  if (stat.kind !== "directory") return;
  for (const entry of writer.list(target)) thawTree(writer, `${target}/${entry.name}`);
}

export function copyTree(writer: PluginOwnerFilesWriter, source: string, target: string): void {
  const stat = writer.stat(source);
  if (!stat) throw shelfErrors.missing_output("这份副本的文件已不在架子上，请重新放入");
  if (stat.kind === "file") {
    writer.copyFile(source, target);
    return;
  }
  writer.mkdir(target);
  for (const entry of writer.list(source)) copyTree(writer, `${source}/${entry.name}`, `${target}/${entry.name}`);
}

/** The event log grows by whole-file replacement: read what is there now, add one line, swap the file in. */
export function appendEvent(writer: PluginOwnerFilesWriter, jobRoot: string, message: string): void {
  const file = `${jobRoot}/events.jsonl`;
  const before = writer.read(file);
  const line = Buffer.from(`${JSON.stringify({ message })}\n`);
  writer.replaceFileAtomic(file, before ? Buffer.concat([Buffer.from(before), line]) : line);
}
