import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { CONTEXT_ONBOARDING_HOME_STORE, contextJourneyId } from "./context-onboarding-store.js";

/**
 * What one round of onboarding keeps on disk until its project is adopted (no limits, user 2026-10-22): the files the person handed
 * in, the text read out of each, and the batch notes the summary is built from, each under its content digest. The journey's row
 * names them by digest only, so its checkpoints stay small however many and however large the materials are. The directory goes
 * when the journey completes.
 */
export interface StagedText { sha256: string; bytes: number; chars: number }

const DIGEST = /^[0-9a-f]{64}$/u;
export const isStagedDigest = (value: unknown): value is string => typeof value === "string" && DIGEST.test(value);

function journeyDirectory(home: string, id: string): string {
  return join(home, CONTEXT_ONBOARDING_HOME_STORE.path, "journeys", contextJourneyId(id));
}
function staged(home: string, id: string, kind: "files" | "texts" | "notes", sha256: string): string {
  if (!isStagedDigest(sha256)) throw new Error("暂存标识无效");
  return join(journeyDirectory(home, id), kind, sha256);
}

/** Streams one file into the journey's staging under its digest; the same bytes twice are one file. No size limit. */
export async function stageContextUpload(home: string, id: string, body: Readable | Buffer): Promise<{ sha256: string; size_bytes: number }> {
  const directory = join(journeyDirectory(home, id), "files");
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.incoming-${randomUUID()}`), hash = createHash("sha256");
  let size = 0;
  try {
    if (Buffer.isBuffer(body)) { hash.update(body); size = body.length; await writeFile(temporary, body, { flag: "wx" }); }
    else await pipeline(body, new Transform({ transform(chunk: Buffer, _encoding, done) { hash.update(chunk); size += chunk.length; done(null, chunk); } }), createWriteStream(temporary, { flags: "wx" }));
    const sha256 = hash.digest("hex");
    await rename(temporary, join(directory, sha256));
    return { sha256, size_bytes: size };
  } finally { await rm(temporary, { force: true }); }
}

/** Where a staged file is, for a reader that offers it on (the 成果库's import); throws when it is not there. */
export async function stagedFilePath(home: string, id: string, sha256: string): Promise<string> {
  const path = staged(home, id, "files", sha256);
  if (!(await stat(path).catch(() => null))?.isFile()) throw new Error("暂存的文件不见了，请重新选择这份文件");
  return path;
}
export async function readStagedFile(home: string, id: string, sha256: string): Promise<Buffer> {
  return readFile(await stagedFilePath(home, id, sha256));
}

export async function stageContextText(home: string, id: string, text: string): Promise<StagedText> {
  const bytes = Buffer.from(text, "utf8"), sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = staged(home, id, "texts", sha256);
  await mkdir(join(journeyDirectory(home, id), "texts"), { recursive: true });
  if (!(await stat(path).catch(() => null))) await writeFile(path, bytes);
  return { sha256, bytes: bytes.length, chars: text.length };
}
export async function readStagedText(home: string, id: string, text: StagedText): Promise<string> {
  return readFile(staged(home, id, "texts", text.sha256), "utf8");
}

/** A batch's note, by the digest of the batch it was made from; null until it is made. */
export async function readStagedNote(home: string, id: string, key: string): Promise<string | null> {
  return readFile(staged(home, id, "notes", key), "utf8").catch(() => null);
}
export async function stageNote(home: string, id: string, key: string, note: string): Promise<void> {
  await mkdir(join(journeyDirectory(home, id), "notes"), { recursive: true });
  await writeFile(staged(home, id, "notes", key), note);
}
export async function dropStagedNotes(home: string, id: string, keys: readonly string[]): Promise<void> {
  await Promise.all(keys.map(key => rm(staged(home, id, "notes", key), { force: true })));
}

/** The round is adopted: what it staged goes. */
export async function removeJourneyStaging(home: string, id: string): Promise<void> {
  await rm(journeyDirectory(home, id), { recursive: true, force: true });
}
