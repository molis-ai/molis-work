/** D0056/D0294: a failed rollback is diagnostic; it must never replace the failure that caused it. */
export function rollbackPreservingError(original: unknown, rollback: () => unknown): void {
  try { rollback(); }
  catch (rollbackError) {
    // Preserve the original identity and any existing cause. Frozen errors and primitive throws remain unchanged.
    if (original instanceof Error && Object.isExtensible(original)) {
      try { Object.defineProperty(original, "rollbackError", { value: rollbackError, configurable: true }); }
      catch { /* Diagnostic attachment must not replace the original error either. */ }
    }
  }
}
