import type { PluginInputGraph } from "@molis-ai/molis-work-plugin-runtime";
import type { LocalSqliteJournal } from "@molis-ai/molis-work-storage";

/** Reconcile a projection from committed domain facts, including writes on another connection. */
export function observePluginArtifacts(boardId: string, journal: LocalSqliteJournal, wiring: PluginInputGraph): () => void {
  let cursor = -1;
  const refresh = () => {
    if (!journal.db.open) { clearInterval(timer); return; }
    // Never notify a consumer from a transaction whose outer owner can still roll back.
    if (journal.db.inTransaction) return;
    try {
      const current = journal.eventCursor(boardId, "artifact");
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
