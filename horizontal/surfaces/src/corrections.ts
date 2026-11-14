import { ActionError, requireSynchronous, type ActionCallContext, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FormKind } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { SurfaceCorrectionInput, SurfaceCorrectionResult, SurfaceSlot } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { surfaceErrors } from "./errors.js";

/** The synchronous operations this store needs from an already open project connection. */
export interface SurfaceCorrectionsDatabase {
  prepare<Params extends unknown[], Row>(sql: string): {
    get(...params: Params): Row | undefined;
    all(...params: Params): Row[];
    run(...params: Params): unknown;
  };
  transaction<Result>(run: () => Result): { immediate(): Result };
}

interface CorrectionRow {
  subject_kind: string;
  subject_id: string;
  correction: SurfaceCorrectionInput["correction"];
  form: FormKind | null;
  position: number | null;
  revision: number;
}

export interface SurfaceCorrection {
  subject?: ActionSubject;
  correction: Exclude<SurfaceCorrectionInput["correction"], "reset">;
  form: FormKind | null;
  position: number | null;
}

export interface SurfaceCorrectionsSnapshot {
  revision: string;
  corrections: SurfaceCorrection[];
}

interface CorrectionControl {
  beforeEffect(): Promise<void>;
  current(): void;
}

const slotKey = (slot: SurfaceSlot) => JSON.stringify([slot.kind, slot.plugin_id, slot.slot_id]);
const rowSubject = (row: CorrectionRow) => JSON.stringify([row.subject_kind, row.subject_id]);

function effectiveCorrections(rows: readonly CorrectionRow[]): SurfaceCorrection[] {
  const resets = rows.filter(row => row.correction === "reset");
  const slotReset = resets.find(row => !row.subject_kind)?.revision ?? 0;
  const objects = new Map(resets.filter(row => row.subject_kind).map(row => [rowSubject(row), row.revision]));
  return rows.flatMap(row => {
    if (row.correction === "reset" || row.revision <= Math.max(slotReset, objects.get(rowSubject(row)) ?? 0)) return [];
    const subject = row.subject_kind ? { kind: row.subject_kind, id: row.subject_id } : undefined;
    return [{ ...(subject ? { subject } : {}), correction: row.correction, form: row.form, position: row.position }];
  });
}

/** The host binds the caller and project from the same action context. The store never opens a connection. */
export function createSurfaceCorrections(database: SurfaceCorrectionsDatabase, { actor_id: actorId, audience }: Pick<ActionCallContext, "actor_id" | "audience">) {
  return {
    read(slot: SurfaceSlot): SurfaceCorrectionsSnapshot {
      if (audience !== "user") return { revision: "0", corrections: [] };
      const rows = database.prepare<[string, string], CorrectionRow>(`
        SELECT subject_kind, subject_id, correction, form, position, revision
        FROM surface_corrections WHERE actor_id = ? AND slot_key = ? ORDER BY revision DESC
      `).all(actorId, slotKey(slot));
      return {
        revision: String(rows[0]?.revision ?? 0),
        corrections: effectiveCorrections(rows),
      };
    },
    async correct(input: SurfaceCorrectionInput, control: CorrectionControl, now: () => string): Promise<SurfaceCorrectionResult> {
      if (audience !== "user") throw new ActionError("actions.forbidden", "Only the person may change their surface corrections");
      const key = slotKey(input.slot);
      await control.beforeEffect();
      requireSynchronous(control.current());
      return database.transaction(() => {
        const found = database.prepare<[string, string], { revision: number | null }>(`
          SELECT MAX(revision) AS revision FROM surface_corrections WHERE actor_id = ? AND slot_key = ?
        `).get(actorId, key)?.revision ?? 0;
        if (String(found) !== input.expected_revision) {
          throw surfaceErrors.correction_conflict("The surface corrections have changed", { corrections_revision: String(found) });
        }
        const revision = found + 1;
        const recordedAt = now();
        requireSynchronous(control.current());
        database.prepare(`
          INSERT INTO surface_corrections (actor_id, slot_key, subject_kind, subject_id, correction, form, position, revision, recorded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (actor_id, slot_key, subject_kind, subject_id, correction) DO UPDATE SET
            form = excluded.form, position = excluded.position, revision = excluded.revision, recorded_at = excluded.recorded_at
        `).run(actorId, key, input.subject?.kind ?? "", input.subject?.id ?? "", input.correction,
          input.form ?? null, input.position ?? null, revision, recordedAt);
        return { corrections_revision: String(revision) };
      }).immediate();
    },
  };
}

export type SurfaceCorrections = ReturnType<typeof createSurfaceCorrections>;
