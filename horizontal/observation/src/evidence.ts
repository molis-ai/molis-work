import { gunzipSync, gzipSync } from "node:zlib";
import type { DatabaseSync } from "node:sqlite";
import { redactSecrets } from "@molis-ai/molis-work-plugin-sdk";
import { OBSERVATION_LIMITS, type ObservationEvidence } from "@molis-ai/molis-work-contracts/services/observation";
import type { ObservationKeys } from "./keys.js";
import type { PendingEvidence } from "./records.js";

/** What resolving one record's evidence did, for the coverage register (§8) and the read-coalescing key (§7). */
export interface ResolvedEvidence {
  readonly evidence: readonly ObservationEvidence[];
  /** Digests of the snapshots kept, to be referenced from `record_evidence`. */
  readonly kept: readonly string[];
  /** One digest per content piece, kept or not, in order: what makes two reads the same. */
  readonly digests: readonly string[];
  readonly truncated: number;
  readonly redacted: number;
  readonly by_rule: number;
  /** A key could not be had: the content is `missing: not_obtained`. */
  readonly unavailable: number;
}

/**
 * Turn a record's queued evidence into what is stored (contract-design §6), inside the write batch: redact credential shapes, take the
 * keyed digest, and keep the body once per digest, compressed and sealed. A body over `snapshot_bytes`, or one the rule keeps out (a page
 * read's result), keeps only its digest and length. Missing references a writer gave are counted under their reason.
 */
export function resolveEvidence(db: DatabaseSync, keys: ObservationKeys, pending: readonly PendingEvidence[], storedAt: string): ResolvedEvidence {
  const evidence: ObservationEvidence[] = [], kept: string[] = [], digests: string[] = [];
  let truncated = 0, redacted = 0, byRule = 0, unavailable = 0;
  const exists = db.prepare("SELECT 1 FROM evidence_blobs WHERE digest = ?");
  const insert = db.prepare("INSERT OR IGNORE INTO evidence_blobs (digest, bytes, media_type, body, stored_at) VALUES (?, ?, ?, ?, ?)");
  for (const item of pending) {
    if ("ref" in item) {
      evidence.push({ role: item.role, ref: item.ref });
      if (item.ref.kind === "missing") {
        if (item.ref.reason === "truncated") truncated++;
        else if (item.ref.reason === "redacted") redacted++;
        else if (item.ref.reason === "by_rule") byRule++;
      }
      continue;
    }
    const text = redactSecrets(item.content.text), wasRedacted = text !== item.content.text, bytes = Buffer.byteLength(text, "utf8");
    if (wasRedacted) redacted++;
    let digest: string;
    try { digest = keys.digest(text); }
    catch { unavailable++; evidence.push({ role: item.role, ref: { kind: "missing", reason: "not_obtained" } }); continue; }
    digests.push(digest);
    if (item.digest_only || bytes > OBSERVATION_LIMITS.snapshot_bytes) {
      if (item.digest_only) byRule++; else truncated++;
      evidence.push({ role: item.role, ref: { kind: "missing", reason: item.digest_only ? "by_rule" : "truncated", digest, bytes } });
      continue;
    }
    if (!exists.get(digest)) {
      let body: Uint8Array;
      try { body = keys.seal(gzipSync(Buffer.from(text, "utf8")), digest); }
      catch { unavailable++; evidence.push({ role: item.role, ref: { kind: "missing", reason: "not_obtained" } }); continue; }
      insert.run(digest, bytes, item.content.media_type, body, storedAt);
    }
    kept.push(digest);
    evidence.push({ role: item.role, ref: { kind: "snapshot", digest, bytes, media_type: item.content.media_type, ...(wasRedacted ? { redacted: true as const } : {}) } });
  }
  return { evidence, kept, digests, truncated, redacted, by_rule: byRule, unavailable };
}

/** A kept snapshot's text, opened with the Home's key; undefined when there is none under this digest. */
export function snapshotText(db: DatabaseSync, keys: ObservationKeys, digest: string): string | undefined {
  const row = db.prepare("SELECT body FROM evidence_blobs WHERE digest = ?").get(digest) as { body: Uint8Array } | undefined;
  return row ? gunzipSync(keys.open(row.body, digest)).toString("utf8") : undefined;
}

/** Drop the bodies no record refers to any more (contract-design §6, D1 question 1): a snapshot lives exactly as long as its references. */
export function collectUnreferenced(db: DatabaseSync): void {
  db.exec("DELETE FROM evidence_blobs WHERE NOT EXISTS (SELECT 1 FROM record_evidence WHERE record_evidence.digest = evidence_blobs.digest)");
}
