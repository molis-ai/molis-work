import type {ArtifactsSqliteDatabase} from './repository.js';
import { ARTIFACT_TABLES } from './repository.js';

/** Technical journal operations are injected; the owner chooses its business tables and stable key. */
export function installArtifactReplicationJournal(db:ArtifactsSqliteDatabase,mark:(keyExpression:string)=>string,seed:(projectId:string,artifactId:string)=>void):void {
  db.transaction(()=>{
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='artifacts_sync_identity_insert'").get())return;
    // project_id is the stable managed project identity, not a filesystem path.
    for(const row of db.prepare(`SELECT project_id,artifact_id FROM ${ARTIFACT_TABLES.identities} ORDER BY artifact_id`).all() as {project_id:string;artifact_id:string}[])seed(row.project_id,row.artifact_id);
    for(const [table,label] of [[ARTIFACT_TABLES.identities,'identity'],[ARTIFACT_TABLES.versions,'version']]){
      for(const operation of ['INSERT','UPDATE','DELETE']){
        const row=operation==='DELETE'?'OLD':'NEW';
        const board=table===ARTIFACT_TABLES.identities?`${row}.project_id`:`(SELECT project_id FROM ${ARTIFACT_TABLES.identities} WHERE artifact_id=${row}.artifact_id)`;
        db.exec(`CREATE TRIGGER artifacts_sync_${label}_${operation.toLowerCase()} AFTER ${operation} ON ${table} BEGIN ${mark(`json_array(${board},'artifact',${row}.artifact_id)`)} END;`);
      }
    }
  }).immediate();
}
