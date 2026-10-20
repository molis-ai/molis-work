import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import type {ProjectsSqliteDatabase} from './repository.js';
const errors=defineErrorCodes('catalog',{sync_project_scope:'forbidden'});
/** Called only inside the receiver transaction after the trusted Host lifecycle permit. No local command/event echo. */
export function applySyncedProjectRecycle(db:ProjectsSqliteDatabase,key:string,recycled:boolean,authorize:()=>void):void {
 authorize();const project=db.prepare('SELECT data_class FROM projects WHERE project_id=?').get(key) as {data_class:string}|undefined;
 if(project&&project.data_class!=='user'||!project&&!recycled)throw errors.sync_project_scope('此项目状态不能由同步恢复');
 db.prepare(`INSERT INTO project_recycle(project_id,recycled,generation,observed_at) VALUES(?,?,1,?)
 ON CONFLICT(project_id) DO UPDATE SET recycled=excluded.recycled,generation=project_recycle.generation+1,observed_at=excluded.observed_at
 WHERE project_recycle.recycled<>excluded.recycled`).run(key,recycled?1:0,new Date().toISOString());
 authorize();
}
