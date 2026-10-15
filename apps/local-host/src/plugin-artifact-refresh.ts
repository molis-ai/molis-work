import { afterTransaction, onVersionStoreWrite } from "@molis-ai/molis-work-module-artifacts";
import type { PluginInputGraph } from "@molis-ai/molis-work-plugin-runtime";
import type { LocalSqliteJournal } from "@molis-ai/molis-work-storage";

/** Writes from another process are not announced here; they are picked up this often (W4-09). */
const OTHER_PROCESS_FALLBACK_MS = 30_000;

/**
 * Reconcile a projection from committed domain facts, including writes on another connection. A 成果 or 过程项 written in
 * this process, on any connection to the project's database, is announced once its transaction has ended (W4-09); a slow
 * fallback reads the journal for writes made by another process.
 */
export function observePluginArtifacts(projectId: string, journal: LocalSqliteJournal, wiring: PluginInputGraph): () => void {
  let cursor = -1, stopped = false, queued = false;
  const refresh = () => {
    queued = false;
    if (stopped) return;
    if (!journal.db.open) { stop(); return; }
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
  // Never notify a consumer from a transaction whose outer owner can still roll back: wait until this connection has none.
  const schedule = () => { if (!queued && !stopped) { queued = true; afterTransaction(journal.db, refresh); } };
  const unlisten = onVersionStoreWrite(journal.db, schedule);
  const timer = setInterval(schedule, OTHER_PROCESS_FALLBACK_MS);
  timer.unref();
  const stop = () => { stopped = true; unlisten(); clearInterval(timer); };
  schedule();
  return stop;
}
