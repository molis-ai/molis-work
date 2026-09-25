import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

/** Fail the actual auxiliary write without changing Home identity or the action grant store. */
export function rejectSessionReportIndex(home: string): () => void {
  const path = join(home, "sessions", "sessions.db");
  const db = new DatabaseSync(path);
  try {
    db.exec(`CREATE TRIGGER reject_report_index BEFORE INSERT ON session_events
      WHEN NEW.source = 'molis_work' AND NEW.source_id LIKE 'molis_work_v1_event_report:%'
      BEGIN SELECT RAISE(FAIL, 'injected Session report index failure'); END`);
  } finally { db.close(); }
  return () => {
    const restored = new DatabaseSync(path);
    try { restored.exec("DROP TRIGGER reject_report_index"); } finally { restored.close(); }
  };
}
