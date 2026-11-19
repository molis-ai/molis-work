import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { atomicWriteFileSync } from "./atomic-write.js";
import { resolveHomeSecurityDirectory } from "./local-security-paths.js";
import { createFileSecretStore, type SecretStore } from "./file-secret-store.js";

const errors = defineErrorCodes("storage.evidence_content", { key_unavailable: "unavailable" });
/**
 * The content key is not there (or is not a key). Bodies sealed with it stay as they are and no replacement key is made while any
 * remains, so new bodies are refused until the original key is back (BL-1065).
 */
const keyMissing = () => errors.key_unavailable(
  "保存正文的钥匙找不到了。已有的动态和研究正文原样保留；找回原钥匙之前，新的正文不会保存。找回方法见 docs/system/HOME-DATA.md#original-key-recovery。",
);

const CONTENT_KEY_REF = "system:feed:evidence-content-key:v1";
const CONTENT_REF = /^molis-work-feed\/sha256\/([0-9a-f]{64})$/u;
const MAX_CONTENT_BYTES = 1024 * 1024;
const ALG = "aes-256-gcm" as const;

interface SealedEvidenceBlob {
  v: /* @version format.project.evidence-content */ 1;
  alg: typeof ALG;
  iv: string;
  tag: string;
  ct: string;
}

/** The reference `write` gives a body, known before it is written: content-addressed, so a caller can record that it holds a body before the body exists. */
export function evidenceContentRef(markdown: string): string {
  return `molis-work-feed/sha256/${createHash("sha256").update(markdown).digest("hex")}`;
}

/**
 * Whether a body can be saved now: `ready`, the key is there; `creatable`, no key and no body anywhere it would seal, so the first
 * save makes it; `missing`, no key while bodies sealed with it remain, so saving is paused until the original key is back.
 */
export type EvidenceContentKeyStatus = "ready" | "creatable" | "missing";

export interface EvidenceContentStore {
  write(markdown: string): { contentRef: string };
  read(contentRef: string): string;
  /** Asked before work that would save bodies, so it can stop and say why instead of fetching what it could not keep. */
  keyStatus(): EvidenceContentKeyStatus;
  has(contentRef: string): boolean;
  inspect(contentRefs: readonly string[]): {
    referenced: number;
    available: number;
    missing: number;
    keyAvailable: boolean;
  };
  /** Removes a body. Returns whether a file went; a body that is not there is not an error. */
  delete(contentRef: string): boolean;
  /**
   * Deletes the candidate bodies that nothing refers to. This store cannot see who holds a reference (Feed materials,
   * search records, in any project of the Home), so the caller counts and answers `isReferenced`; a referenced
   * candidate, and a reference that is not a body of this store, are left alone.
   */
  collect(input: {
    candidates: Iterable<string>;
    isReferenced(contentRef: string): boolean;
  }): { deleted: string[]; kept: string[] };
}

export function createEvidenceContentStore(options: {
  secretStore?: SecretStore;
  rootDirectory?: string;
} = {}): EvidenceContentStore {
  const secretStore = options.secretStore ?? createFileSecretStore();
  const root = options.rootDirectory ?? path.join(resolveHomeSecurityDirectory(), "evidence");

  const readKey = (): Buffer | null => {
    const raw = secretStore.get(CONTENT_KEY_REF);
    if (!raw) return null;
    const key = Buffer.from(raw, "base64");
    return key.length === 32 ? key : null;
  };

  const keyStatus = (): EvidenceContentKeyStatus => readKey()
    ? "ready"
    : keySharingRoots(root).some(hasBlobFile) ? "missing" : "creatable";

  const keyForWrite = (): Buffer => {
    const existing = readKey();
    if (existing) return existing;
    if (keySharingRoots(root).some(hasBlobFile)) throw keyMissing();
    const key = randomBytes(32);
    if (secretStore.createIfAbsent(CONTENT_KEY_REF, key.toString("base64"))) return key;
    const current = readKey();
    if (!current) throw keyMissing();
    return current;
  };

  const read = (contentRef: string): string => {
    const key = readKey();
    if (!key) throw keyMissing();
    const target = blobPath(root, contentRef);
    if (!fs.existsSync(target)) throw new Error("feed evidence content unavailable");
    const opened = openSealed(fs.readFileSync(target), contentRef, key);
    if (opened == null) throw new Error("feed evidence content failed integrity validation");
    return opened;
  };

  const remove = (contentRef: string): boolean => {
    let removed = false;
    const target = blobPath(root, contentRef);
    try {
      fs.unlinkSync(target);
      removed = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      fs.rmdirSync(path.dirname(target));
    } catch {
      // The shard directory still holds other bodies, or is already gone.
    }
    return removed;
  };

  return {
    write(markdown) {
      if (typeof markdown !== "string") throw new Error("feed evidence content rejected");
      if (Buffer.byteLength(markdown, "utf8") > MAX_CONTENT_BYTES) {
        throw new Error("feed evidence content exceeds local retention limit");
      }
      const contentRef = evidenceContentRef(markdown);
      const destination = blobPath(root, contentRef);
      if (fs.existsSync(destination)) {
        const existing = read(contentRef);
        if (existing !== markdown) throw new Error("feed evidence content hash collision");
        return { contentRef };
      }
      const key = keyForWrite();
      const payload = seal(markdown, contentRef, key);
      atomicWriteFileSync(destination, JSON.stringify(payload), { mode: 0o600 });
      return { contentRef };
    },
    read,
    keyStatus,
    has(contentRef) {
      try {
        read(contentRef);
        return true;
      } catch {
        return false;
      }
    },
    delete: remove,
    collect({ candidates, isReferenced }) {
      const deleted: string[] = [];
      const kept: string[] = [];
      for (const contentRef of new Set(candidates)) {
        if (!CONTENT_REF.test(contentRef)) continue;
        if (isReferenced(contentRef)) kept.push(contentRef);
        else if (remove(contentRef)) deleted.push(contentRef);
      }
      return { deleted, kept };
    },
    inspect(contentRefs) {
      const refs = [...new Set(contentRefs)];
      const available = refs.filter((contentRef) => {
        try {
          read(contentRef);
          return true;
        } catch {
          return false;
        }
      }).length;
      return {
        referenced: refs.length,
        available,
        missing: refs.length - available,
        keyAvailable: readKey() !== null,
      };
    },
  };
}

function relativeBlobPath(contentRef: string): string {
  const digest = parseContentRef(contentRef);
  return path.join("blobs", digest.slice(0, 2), `${digest}.blob`);
}

function blobPath(root: string, contentRef: string): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativeBlobPath(contentRef));
  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("feed evidence content path rejected");
  }
  return target;
}

function parseContentRef(contentRef: string): string {
  const match = CONTENT_REF.exec(contentRef);
  if (!match) throw new Error("feed evidence content reference rejected");
  return match[1]!;
}

function seal(markdown: string, contentRef: string, key: Buffer): SealedEvidenceBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  cipher.setAAD(Buffer.from(contentRef, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(markdown, "utf8")),
    cipher.final(),
  ]);
  return {
    v: /* @version format.project.evidence-content */ 1,
    alg: ALG,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ciphertext.toString("base64"),
  };
}

function openSealed(data: Buffer, contentRef: string, key: Buffer): string | null {
  try {
    const payload = JSON.parse(data.toString("utf8")) as SealedEvidenceBlob;
    if (payload.v !== /* @version format.project.evidence-content */ 1 || payload.alg !== ALG) return null;
    const decipher = createDecipheriv(ALG, key, Buffer.from(payload.iv, "base64"));
    decipher.setAAD(Buffer.from(contentRef, "utf8"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ct, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const expected = parseContentRef(contentRef);
    const actual = createHash("sha256").update(plaintext).digest("hex");
    return expected === actual ? plaintext : null;
  } catch {
    return null;
  }
}

/** The directory, inside an Alchemist project's own directory, that holds the bodies its research read. */
export const RESEARCH_EVIDENCE_DIRECTORY = "search-content";

/**
 * Every directory of the Home whose bodies are sealed with the one content key (BL-1065, user 2026-11-19): Feed's
 * `feed/evidence` and each Alchemist project's `alchemist/projects/<project>/search-content`. The Home is read off the
 * store's own root, so a store at either place sees all the others; a root elsewhere (a test directory, an archive being
 * checked) answers for itself alone. A new place that seals with this key is added here, not at its caller.
 */
function keySharingRoots(root: string): string[] {
  const resolved = path.resolve(root);
  const parent = path.dirname(resolved), grandparent = path.dirname(parent);
  const projects = path.dirname(parent);
  const home = path.basename(resolved) === "evidence" && path.basename(parent) === "feed"
    ? grandparent
    : path.basename(resolved) === RESEARCH_EVIDENCE_DIRECTORY && path.basename(projects) === "projects"
      && path.basename(path.dirname(projects)) === "alchemist"
      ? path.dirname(path.dirname(projects))
      : undefined;
  if (home === undefined) return [resolved];
  const researchProjects = path.join(home, "alchemist", "projects");
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(researchProjects, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const research = entries.filter((entry) => entry.isDirectory())
    .map((entry) => path.join(researchProjects, entry.name, RESEARCH_EVIDENCE_DIRECTORY));
  return [...new Set([resolved, path.join(home, "feed", "evidence"), ...research])];
}

/** Whether `root` still holds any sealed body; stops at the first one. */
function hasBlobFile(root: string): boolean {
  const pending = [path.join(root, "blobs")];
  while (pending.length) {
    const directory = pending.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".blob")) return true;
      if (entry.isDirectory()) pending.push(path.join(directory, entry.name));
    }
  }
  return false;
}
