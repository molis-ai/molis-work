import type {ReplicaDatabase,ReplicaInputValue,ReplicaOutputValue} from '@molis-ai/molis-work-storage';
import type {SqliteDatabase} from '../db/open-database.js';
/** Borrow an explicitly typed better-sqlite3 connection; no ownership or query surface is widened. */
export function studioReplicaDatabase(db:SqliteDatabase):ReplicaDatabase{
 return {exec:sql=>db.exec(sql),prepare:sql=>db.prepare<ReplicaInputValue[],Record<string,ReplicaOutputValue>>(sql)};
}
