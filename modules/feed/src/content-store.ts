import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { atomicWriteFileSync } from "@molis-ai/molis-work-storage";
import { resolveFeedSecurityDirectory } from "@molis-ai/molis-work-storage";
import { createFileSecretStore, type SecretStore } from "@molis-ai/molis-work-storage";

const CONTENT_KEY_REF = "system:feed:evidence-content-key:v1";
const RECOVERY_CONTENT_KEY_REF = "system:feed:evidence-content-key:v2";
const CONTENT_REF = /^molis-work-feed\/sha256\/([0-9a-f]{64})$/u;
const MAX_CONTENT_BYTES = 1024 * 1024;
const ALG = "aes-256-gcm" as const;

interface SealedEvidenceBlob {
  v: 1;
  alg: typeof ALG;
  iv: string;
  tag: string;
  ct: string;
}

export interface FeedEvidenceContentStore {
  write(markdown: string): { contentRef: string };
  read(contentRef: string): string;
  has(contentRef: string): boolean;
  inspect(contentRefs: readonly string[]): {
    referenced: number;
    available: number;
    missing: number;
    keyAvailable: boolean;
  };
}

export function createFeedEvidenceContentStore(options: {
  secretStore?: SecretStore;
  rootDirectory?: string;
} = {}): FeedEvidenceContentStore {
  const secretStore = options.secretStore ?? createFileSecretStore();
  const root = options.rootDirectory ?? path.join(resolveFeedSecurityDirectory(), "evidence");
  const recoveryRoot = `${root}-recovered-v2`;

  const readKey = (keyRef: string): Buffer | null => {
    const raw = secretStore.get(keyRef);
    if (!raw) return null;
    const key = Buffer.from(raw, "base64");
    return key.length === 32 ? key : null;
  };

  const keyForWrite = (keyRef: string, targetRoot: string): Buffer => {
    const existing = readKey(keyRef);
    if (existing) return existing;
    if (listBlobFiles(targetRoot).length > 0) {
      throw new Error("feed evidence content key unavailable");
    }
    const key = randomBytes(32);
    secretStore.put(keyRef, key.toString("base64"));
    return key;
  };

  const read = (contentRef: string): string => {
    const recovered = blobPath(recoveryRoot, contentRef);
    const targetRoot = fs.existsSync(recovered) ? recoveryRoot : root;
    const keyRef = targetRoot === recoveryRoot ? RECOVERY_CONTENT_KEY_REF : CONTENT_KEY_REF;
    const key = readKey(keyRef);
    if (!key) throw new Error("feed evidence content key unavailable");
    const target = blobPath(targetRoot, contentRef);
    if (!fs.existsSync(target)) throw new Error("feed evidence content unavailable");
    const opened = openSealed(fs.readFileSync(target), contentRef, key);
    if (opened == null) throw new Error("feed evidence content failed integrity validation");
    return opened;
  };

  return {
    write(markdown) {
      if (typeof markdown !== "string") throw new Error("feed evidence content rejected");
      if (Buffer.byteLength(markdown, "utf8") > MAX_CONTENT_BYTES) {
        throw new Error("feed evidence content exceeds local retention limit");
      }
      const digest = createHash("sha256").update(markdown).digest("hex");
      const contentRef = `molis-work-feed/sha256/${digest}`;
      const destination = blobPath(root, contentRef);
      if (fs.existsSync(destination)) {
        let existing: string | null = null;
        try {
          existing = read(contentRef);
        } catch {
          // Migrated project databases can retain valid content refs while the
          // local v1 encryption key no longer matches the old blob directory.
          // Never overwrite those blobs. Re-seal the same hash in a v2 overlay
          // so future reads recover without deleting historical ciphertext.
          const recovered = blobPath(recoveryRoot, contentRef);
          if (fs.existsSync(recovered)) {
            if (read(contentRef) !== markdown) throw new Error("feed evidence content hash collision");
            return { contentRef };
          }
          const recoveryKey = keyForWrite(RECOVERY_CONTENT_KEY_REF, recoveryRoot);
          atomicWriteFileSync(recovered, JSON.stringify(seal(markdown, contentRef, recoveryKey)), { mode: 0o600 });
          return { contentRef };
        }
        if (existing !== markdown) throw new Error("feed evidence content hash collision");
        return { contentRef };
      }
      const useRecovery = readKey(CONTENT_KEY_REF) === null && listBlobFiles(root).length > 0;
      const targetRoot = useRecovery ? recoveryRoot : root;
      const keyRef = useRecovery ? RECOVERY_CONTENT_KEY_REF : CONTENT_KEY_REF;
      const key = keyForWrite(keyRef, targetRoot);
      const payload = seal(markdown, contentRef, key);
      atomicWriteFileSync(blobPath(targetRoot, contentRef), JSON.stringify(payload), { mode: 0o600 });
      return { contentRef };
    },
    read,
    has(contentRef) {
      try {
        read(contentRef);
        return true;
      } catch {
        return false;
      }
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
        keyAvailable: readKey(CONTENT_KEY_REF) !== null || readKey(RECOVERY_CONTENT_KEY_REF) !== null,
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
    v: 1,
    alg: ALG,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ciphertext.toString("base64"),
  };
}

function openSealed(data: Buffer, contentRef: string, key: Buffer): string | null {
  try {
    const payload = JSON.parse(data.toString("utf8")) as SealedEvidenceBlob;
    if (payload.v !== 1 || payload.alg !== ALG) return null;
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

function listBlobFiles(root: string): string[] {
  const blobs = path.join(root, "blobs");
  if (!fs.existsSync(blobs)) return [];
  return fs.readdirSync(blobs, { recursive: true, encoding: "utf8" })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith(".blob"));
}
