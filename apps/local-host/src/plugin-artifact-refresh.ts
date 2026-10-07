import type { PluginInputGraph } from "@molis-ai/molis-work-plugin-runtime";
import type { LocalSqliteJournal } from "@molis-ai/molis-work-storage";

/** Reconcile a projection from committed domain facts, including writes on another connection. */
export function observePluginArtifacts(projectId: string, journal: LocalSqliteJournal, wiring: PluginInputGraph): () => void {
  let cursor = -1;
  const refresh = () => {
    if (!journal.db.open) { clearInterval(timer); return; }
    // Never notify a consumer from a transaction whose outer owner can still roll back.
    if (journal.db.inTransaction) return;
    try {
      // Ports carry process items and selected 成果; a committed change to either can change an input.
      const current = Math.max(journal.eventCursor(projectId, "artifact"), journal.eventCursor(projectId, "process_item"));
      if (current === cursor) return;
      wiring.evaluateAll();
      cursor = current;
    } catch {
      cursor = -1;
      wiring.suspend("成果变更暂不可读取，已停止旧输入处理，恢复后重新读取");
    }
  };
  const timer = setInterval(refresh, 1000);
  timer.unref();
  return () => clearInterval(timer);
}
