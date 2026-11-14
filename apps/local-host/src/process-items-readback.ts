import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeProjectRoot } from '@molis-ai/molis-work-module-projects';
import { createProcessItemReplication, type PortableProcessItem } from '@molis-ai/molis-work-module-artifacts';
import { LocalProjectDatabase } from './project-database.js';

/**
 * The current process-item owner writes one complete graph into a scratch project library and reads it back. Used wherever a graph
 * that did not come from this Home's own library is accepted for later use (the sync cutover's conversion, a recovery file's capture):
 * what comes back is what the current owner would hold. Nothing is written outside the scratch directory, which is always removed.
 */
export function readBackProcessItem(spaceId: string, check: () => void, projectId: string, item: unknown): PortableProcessItem | null {
  const directory = mkdtempSync(join(tmpdir(), 'molis-process-readback-'));
  try {
    const store = new LocalProjectDatabase(join(directory, 'project.db'));
    try {
      const owner = createProcessItemReplication(store.db, { spaceId, projectId, authorize: check }, { appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) });
      const identity = (item as { identity?: { artifact_id?: unknown; created_at?: unknown } } | null)?.identity;
      if (typeof identity?.artifact_id !== 'string' || typeof identity.created_at !== 'string') return null;
      writeProjectRoot(store.db, projectId, identity.created_at);
      owner.apply(item); check();
      return owner.read(identity.artifact_id);
    } finally { store.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
