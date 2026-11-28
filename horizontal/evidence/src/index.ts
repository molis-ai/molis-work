import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { EVIDENCE_COLLECT_PERMISSION, type EvidenceHolder, type EvidenceHoldRecord } from "@molis-ai/molis-work-contracts/services/evidence";
import { openBaselineHomeSqlite, type EvidenceContentStore, type HomeStoreDeclaration, type SqliteBaseline } from "@molis-ai/molis-work-storage";

export { EVIDENCE_COLLECT_PERMISSION, type EvidenceHolder, type EvidenceHoldRecord };

/**
 * The platform's ledger of who holds which evidence body (specs/unified-partition-plugins §5, batch 106): the bodies stay in the Home's
 * content-addressed pool (`packages/storage` evidence-content, shared by every partition); this records each reference by
 * (content_ref, partition, installation, holder key), so a body nobody holds can be collected; collection carries `evidence:collect`
 * (S-98 as rewritten) and deletes only what no hold anywhere keeps. The partition and the installation are the Host's stamp from the trusted context; a plugin
 * names only its own holder key. Plugins reach it through `services.evidence` (Feed's source holds since batch 109).
 */
export const EVIDENCE_STORE = "evidence";
export const EVIDENCE_BASELINE: SqliteBaseline = { version: /* @version database.evidence_baseline */ 1, schema: `
CREATE TABLE evidence_holds (
  content_ref TEXT NOT NULL CHECK (length(content_ref) BETWEEN 1 AND 200),
  partition_id TEXT NOT NULL,
  owner_install TEXT NOT NULL,
  holder_key TEXT NOT NULL CHECK (length(holder_key) BETWEEN 1 AND 200),
  held_at TEXT NOT NULL,
  PRIMARY KEY (content_ref, partition_id, owner_install, holder_key)
);
CREATE INDEX evidence_holds_by_holder ON evidence_holds (partition_id, owner_install, holder_key);
CREATE INDEX evidence_holds_by_install ON evidence_holds (owner_install);
` };
export const EVIDENCE_HOME_STORE = { path: EVIDENCE_STORE, library: { baseline: EVIDENCE_BASELINE } } as const satisfies HomeStoreDeclaration;

type Database = ReturnType<typeof openBaselineHomeSqlite>;
const REF = /^molis-work-evidence\/sha256\/[0-9a-f]{64}$/u;

export function openEvidenceLedger(home: string, options: { now?: () => Date } = {}): EvidenceLedger {
  return new EvidenceLedger(openBaselineHomeSqlite(home, EVIDENCE_STORE, EVIDENCE_BASELINE), options.now ?? (() => new Date()));
}

export class EvidenceLedger {
  constructor(private readonly db: Database, private readonly now: () => Date) {}

  /** Records that `holder` holds each body; holding one twice is one hold. */
  hold(holder: EvidenceHolder, refs: readonly string[]): number {
    checkHolder(holder);
    const at = this.now().toISOString();
    return this.write(() => {
      let added = 0;
      for (const ref of unique(refs)) added += Number(this.db.prepare("INSERT OR IGNORE INTO evidence_holds VALUES (?, ?, ?, ?, ?)")
        .run(ref, holder.partition_id, holder.owner_install, holder.holder_key, at).changes);
      return added;
    });
  }

  /** Drops `holder`'s hold on each body; the bodies themselves stay until the platform collects them. */
  release(holder: EvidenceHolder, refs: readonly string[]): number {
    checkHolder(holder);
    return this.write(() => {
      let released = 0;
      for (const ref of unique(refs)) released += Number(this.db.prepare("DELETE FROM evidence_holds WHERE content_ref = ? AND partition_id = ? AND owner_install = ? AND holder_key = ?")
        .run(ref, holder.partition_id, holder.owner_install, holder.holder_key).changes);
      return released;
    });
  }

  /** Every hold of one holder, e.g. before it is deleted with its object. */
  releaseHolder(holder: EvidenceHolder): string[] {
    checkHolder(holder);
    return this.releaseWhere("partition_id = ? AND owner_install = ? AND holder_key = ?", [holder.partition_id, holder.owner_install, holder.holder_key]);
  }

  /** Every hold of an installation, in one partition or everywhere (it was uninstalled), or of a partition (it was deleted); returns the bodies they referred to. */
  releaseInstall(installId: string, partitionId?: string): string[] {
    return partitionId === undefined ? this.releaseWhere("owner_install = ?", [installId])
      : this.releaseWhere("owner_install = ? AND partition_id = ?", [installId, partitionId]);
  }
  releasePartition(partitionId: string): string[] { return this.releaseWhere("partition_id = ?", [partitionId]); }

  /** The holds of one body, for diagnostics and tests; a plugin is never given another's holds. */
  holdsOf(ref: string): EvidenceHoldRecord[] {
    return this.db.prepare("SELECT content_ref, partition_id, owner_install, holder_key, held_at FROM evidence_holds WHERE content_ref = ? ORDER BY partition_id, owner_install, holder_key")
      .all(ref).map(row => ({ content_ref: String(row.content_ref), partition_id: String(row.partition_id), owner_install: String(row.owner_install),
        holder_key: String(row.holder_key), held_at: String(row.held_at) }));
  }

  isHeld(ref: string): boolean {
    return this.db.prepare("SELECT 1 AS held FROM evidence_holds WHERE content_ref = ? LIMIT 1").get(ref) !== undefined;
  }

  /**
   * Deletes the candidate bodies nobody holds. Only a caller carrying `evidence:collect` reaches it (S-98; from batch 109 Feed triggers its
   * collection here). Whoever triggers it, what is deleted is the ledger's decision: a body any partition or installation still holds is kept.
   */
  collect(caller: { readonly permissions: readonly string[] }, content: Pick<EvidenceContentStore, "collect">, candidates: Iterable<string>): { deleted: string[]; kept: string[] } {
    if (!caller.permissions.includes(EVIDENCE_COLLECT_PERMISSION)) throw new ActionError("actions.forbidden", "只有平台能回收没人引用的证据正文");
    return content.collect({ candidates, isReferenced: ref => this.isHeld(ref) });
  }

  /**
   * Drops `holder`'s holds (on exactly `refs`, or every one it has when `refs` is `"all"`), then deletes each candidate body nobody holds
   * any more, in one write transaction: a hold of the same body elsewhere waits for the same lock, so it sees either the body kept or the
   * body gone (and writes it again), never one about to be deleted. Only a caller carrying `evidence:collect` reaches it (S-98).
   */
  releaseAndCollect(caller: { readonly permissions: readonly string[] }, content: Pick<EvidenceContentStore, "collect">, holder: EvidenceHolder,
    refs: readonly string[] | "all", candidates: readonly string[]): { released: number; deleted: string[]; kept: string[] } {
    if (!caller.permissions.includes(EVIDENCE_COLLECT_PERMISSION)) throw new ActionError("actions.forbidden", "只有平台能回收没人引用的证据正文");
    checkHolder(holder);
    const bodies = unique(candidates);
    const named = refs === "all" ? null : unique(refs);
    return this.write(() => {
      let released = 0;
      if (named === null) released = Number(this.db.prepare("DELETE FROM evidence_holds WHERE partition_id = ? AND owner_install = ? AND holder_key = ?")
        .run(holder.partition_id, holder.owner_install, holder.holder_key).changes);
      else for (const ref of named) released += Number(this.db.prepare("DELETE FROM evidence_holds WHERE content_ref = ? AND partition_id = ? AND owner_install = ? AND holder_key = ?")
        .run(ref, holder.partition_id, holder.owner_install, holder.holder_key).changes);
      const { deleted, kept } = content.collect({ candidates: bodies, isReferenced: ref => this.isHeld(ref) });
      return { released, deleted, kept };
    });
  }

  close(): void { this.db.close(); }

  private releaseWhere(where: string, parameters: readonly string[]): string[] {
    return this.write(() => {
      const refs = this.db.prepare(`SELECT DISTINCT content_ref FROM evidence_holds WHERE ${where}`).all(...parameters).map(row => String(row.content_ref));
      this.db.prepare(`DELETE FROM evidence_holds WHERE ${where}`).run(...parameters);
      return refs;
    });
  }

  private write<T>(run: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = run();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function checkHolder(holder: EvidenceHolder): void {
  if (!holder.partition_id || !holder.owner_install || typeof holder.holder_key !== "string" || holder.holder_key.length < 1 || holder.holder_key.length > 200) {
    throw new ActionError("actions.input_invalid", "证据引用的持有者不完整");
  }
}
function unique(refs: readonly string[]): string[] {
  const set = new Set(refs);
  for (const ref of set) if (!REF.test(ref)) throw new ActionError("actions.input_invalid", "证据正文的引用格式不对");
  return [...set];
}
