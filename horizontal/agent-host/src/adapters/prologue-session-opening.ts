import { isDeepStrictEqual } from "node:util";
import type { SessionOpeningReader } from "@prologue/sdk";
import type { SessionIndex, SessionIndexStore } from "./prologue-session-index.js";

/** The Host's accepted main attempt attests only its caller text; it cannot create InputOriginal or infer SDK prompt provenance. */
export function sessionOpeningReader(store: SessionIndexStore, binding: Pick<SessionIndex, "ref" | "owner">): SessionOpeningReader {
  const held = structuredClone(binding);
  return async ({ sessionRef, runRef }) => {
    try {
      if (!isDeepStrictEqual(sessionRef, held.ref) || runRef.kind !== "run" || runRef.revision !== 1 || !runRef.id) return { status: "unavailable" };
      const current = store.capture(held.ref.id);
      store.assertAdmission(held.ref.id);
      const saved = await store.read(held.ref.id);
      current(); store.assertAdmission(held.ref.id);
      if (!saved || !isDeepStrictEqual(saved.ref, held.ref) || !isDeepStrictEqual(saved.owner, held.owner) || saved.parent_run !== undefined) return { status: "unavailable" };
      const matches = saved.attempts.filter(attempt => attempt.run_id === runRef.id);
      if (matches.length !== 1 || !acceptedOpening(matches[0]!)) return { status: "unavailable" };
      const attempt = matches[0]!;
      return attempt.frozen.history === "digest" ? { status: "original", user: [attempt.task] } : { status: "not-applicable" };
    } catch {
      // The SDK reports one safe history-unavailable error; storage faults and task text must not escape in it.
      return { status: "unavailable" };
    }
  };
}

/** The persisted start skeleton shared by the original session-only bridge and its explicit digest branch. */
function acceptedOpening(attempt: SessionIndex["attempts"][number]): boolean {
  const frozen = attempt.frozen;
  return attempt.refused === undefined && typeof attempt.task === "string"
    && typeof attempt.started_at === "string" && Number.isFinite(Date.parse(attempt.started_at))
    && !!frozen && typeof frozen === "object" && !Array.isArray(frozen)
    && typeof frozen.role_id === "string" && frozen.role_id.length > 0
    && Number.isSafeInteger(frozen.role_version) && frozen.role_version > 0
    && typeof frozen.model_id === "string" && frozen.model_id.length > 0
    && ["read-only", "text-edit", "workspace-write", "operate"].includes(frozen.execution)
    && [frozen.prompts, frozen.skills, frozen.mcp_tools, frozen.host_tools, frozen.text_materials].every(Array.isArray)
    && Object.hasOwn(frozen, "budget") && (frozen.budget === null || typeof frozen.budget === "object" && !Array.isArray(frozen.budget))
    && (frozen.history === undefined || frozen.history === "digest");
}
