import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { requireSynchronous } from '@molis-ai/molis-work-contracts/platform/actions';

/** Cross-process file mutex. SQLite releases a crashed holder; no stale-lock guessing or reaping. */
export function withFileLock<T>(filename: string, operation: () => T): T {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  let db: DatabaseSync | undefined, begun = false;
  try {
    db = new DatabaseSync(filename);
    db.exec('PRAGMA busy_timeout = 5000;'); db.exec('BEGIN IMMEDIATE;'); begun = true;
    const result = operation(); requireSynchronous(result, '文件条件提交必须同步完成');
    db.exec('COMMIT;'); begun = false; return result;
  } catch (error) {
    if (begun && db) try { db.exec('ROLLBACK;'); } catch { /* SQLite may already have rolled back. */ }
    throw error;
  } finally {
    if (db) try { db.close(); } catch { /* The operation's original outcome is preserved. */ }
  }
}
