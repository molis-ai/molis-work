import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALG = "aes-256-gcm" as const;
const CONTENT_REF = /^molis-work-session\/sha256\/([0-9a-f]{64})$/u;
const MAX_CONTENT_BYTES = 512 * 1024;

interface SealedSessionContent {
  v: 1;
  alg: typeof ALG;
  iv: string;
  tag: string;
  ct: string;
}

export interface SessionContentStore {
  write(content: string): { content_ref: string };
  read(contentRef: string): string;
  has(contentRef: string): boolean;
}

export function createSessionContentStore(rootDirectory: string): SessionContentStore {
  const root = path.resolve(rootDirectory);
  const keyPath = path.join(root, "content.key");
  const blobsRoot = path.join(root, "blobs");

  const readKey = (): Buffer | null => {
    try {
      const key = Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "base64");
      return key.length === 32 ? key : null;
    } catch {
      return null;
    }
  };

  const keyForWrite = (): Buffer => {
    const existing = readKey();
    if (existing) return existing;
    if (listBlobFiles(blobsRoot).length > 0) {
      throw new Error("session content key unavailable");
    }
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const candidate = randomBytes(32);
    try {
      fs.writeFileSync(keyPath, candidate.toString("base64"), { encoding: "utf8", flag: "wx", mode: 0o600 });
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const raced = readKey();
      if (!raced) throw new Error("session content key unavailable");
      return raced;
    }
  };

  const read = (contentRef: string): string => {
    const key = readKey();
    if (!key) throw new Error("session content key unavailable");
    const target = blobPath(blobsRoot, contentRef);
    let payload: SealedSessionContent;
    try {
      payload = JSON.parse(fs.readFileSync(target, "utf8")) as SealedSessionContent;
    } catch {
      throw new Error("session content unavailable");
    }
    const opened = openSealed(payload, contentRef, key);
    if (opened == null) throw new Error("session content failed integrity validation");
    return opened;
  };

  return {
    write(content) {
      if (typeof content !== "string") throw new Error("session content rejected");
      if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES) {
        throw new Error("session content exceeds local retention limit");
      }
      const digest = createHash("sha256").update(content).digest("hex");
      const contentRef = `molis-work-session/sha256/${digest}`;
      const destination = blobPath(blobsRoot, contentRef);
      if (fs.existsSync(destination)) {
        if (read(contentRef) !== content) throw new Error("session content hash collision");
        return { content_ref: contentRef };
      }
      const key = keyForWrite();
      const payload = JSON.stringify(seal(content, contentRef, key));
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      try {
        fs.writeFileSync(destination, payload, { encoding: "utf8", flag: "wx", mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (read(contentRef) !== content) throw new Error("session content hash collision");
      }
      return { content_ref: contentRef };
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
  };
}

function blobPath(blobsRoot: string, contentRef: string): string {
  const match = CONTENT_REF.exec(contentRef);
  if (!match) throw new Error("session content reference rejected");
  const digest = match[1]!;
  const root = path.resolve(blobsRoot);
  const target = path.resolve(root, digest.slice(0, 2), `${digest}.blob`);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("session content path rejected");
  return target;
}

function seal(content: string, contentRef: string, key: Buffer): SealedSessionContent {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  cipher.setAAD(Buffer.from(contentRef, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);
  return {
    v: 1,
    alg: ALG,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ciphertext.toString("base64"),
  };
}

function openSealed(payload: SealedSessionContent, contentRef: string, key: Buffer): string | null {
  try {
    if (payload.v !== 1 || payload.alg !== ALG) return null;
    const decipher = createDecipheriv(ALG, key, Buffer.from(payload.iv, "base64"));
    decipher.setAAD(Buffer.from(contentRef, "utf8"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ct, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const expected = CONTENT_REF.exec(contentRef)?.[1];
    const actual = createHash("sha256").update(plaintext).digest("hex");
    return expected === actual ? plaintext : null;
  } catch {
    return null;
  }
}

function listBlobFiles(blobsRoot: string): string[] {
  if (!fs.existsSync(blobsRoot)) return [];
  return fs.readdirSync(blobsRoot, { recursive: true, encoding: "utf8" })
    .map(String)
    .filter((entry) => entry.endsWith(".blob"));
}
