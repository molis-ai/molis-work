import { randomUUID } from 'node:crypto';
import type { ImDatabase } from './types.js';
import { ImError } from './errors.js';
import type { ImReads } from './reads.js';
/** Project access is the sole membership authority of a project's room; rooms members create stay unbound. */
export function ensureProjectRoom(db: ImDatabase, reads: ImReads, projectId: string, memberId: string) {
  return db.transaction(() => {
    const project = db.prepare(`SELECT p.id,p.title,p.owner_id FROM mw_projects p
      JOIN mw_access a ON a.project_id=p.id WHERE p.id=? AND a.member_id=?`).get(projectId, memberId) as {
      id: string;
      title: string;
      owner_id: string;
    } | undefined;
    if (!project)
      throw new ImError('im.project_forbidden', '请先连接此项目的成员身份', 403);
    let room = db.prepare('SELECT id FROM im_rooms WHERE project_id=?').get(projectId) as {
      id: string;
    } | undefined;
    if (!room) {
      room = { id: randomUUID() };
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO im_rooms(id,title,owner_id,invite_token,created_at,updated_at,project_id)
        VALUES (?,?,?,?,?,?,?)`).run(room.id, project.title, project.owner_id, randomUUID(), now, now, projectId);
    }
    else
      db.prepare('UPDATE im_rooms SET title=? WHERE id=?').run(project.title, room.id);
    return { room: reads.room(room.id) };
  }).immediate();
}
