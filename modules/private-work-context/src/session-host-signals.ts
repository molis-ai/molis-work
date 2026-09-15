import type { WorkSessionQueryApi, WorkSessionRecord, RuntimeSessionHostSignals } from "@molis-ai/molis-work-contracts/modules/private-work-context";

export function findSessionForHostSignals(
  registry: WorkSessionQueryApi,
  signals: RuntimeSessionHostSignals,
  nativeRuntimeSessionId?: string | null,
): WorkSessionRecord | null {
  const nativeId = nativeRuntimeSessionId?.trim() || signals.native_runtime_session_id;
  if (signals.molis_work_session_id) {
    try {
      const session = registry.get(signals.molis_work_session_id);
      if (
        session.runtime_id === signals.runtime_id
        && (!nativeId || !session.native_runtime_session_id || session.native_runtime_session_id === nativeId)
      ) return session;
    } catch {
      // A stale new-path ID may still be recovered through native or surface identity.
    }
  }
  if (nativeId) {
    const native = registry.findByNativeRuntimeSession(signals.runtime_id, nativeId);
    if (native) return native;
  }
  if (signals.surface_id) {
    const surface = registry.findBySurface(signals.surface_id);
    if (
      surface?.runtime_id === signals.runtime_id
      && (!nativeId || !surface.native_runtime_session_id || surface.native_runtime_session_id === nativeId)
    ) return surface;
  }
  if (
    signals.runtime_context.stable_work_context_id
    && (!nativeId || signals.runtime_context.stable_work_context_id === nativeId)
  ) {
    return registry.findByNativeRuntimeSession(
      signals.runtime_id,
      signals.runtime_context.stable_work_context_id,
    );
  }
  return null;
}
