import {applySyncedProjectRecycle} from './sync-recycle.js';
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';
import type { ProjectsSqliteDatabase } from './repository.js';

const errors=defineErrorCodes('catalog',{sync_project_invalid:'invalid',sync_project_scope:'forbidden',sync_project_lifecycle:'conflict'});
export interface PortableProject {
  format:1;
  spaceId:string;
  project:{id:string;title:string;created_at:string;updated_at:string};
  /** Desired content dependencies, not installation, activation or permission grants. */
  plugins:string[];
}
export interface ProjectReplicationOptions {spaceId:string;authorize():void;excludedProjectIds:readonly string[];authorizeLifecycle?(key:string,recycled:boolean):void}
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const date=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/u.test(v);

export function validateProjectSyncKey(key:string,options:ProjectReplicationOptions):void {
  options.authorize();if(!id(key)||options.excludedProjectIds.includes(key))throw errors.sync_project_scope('此项目不属于可同步的项目资料');
}

/** Validation is pure: it never creates a project, reads paths, installs plugins or grants access. */
export function validatePortableProject(key:string,value:unknown,options:ProjectReplicationOptions):PortableProject {
  options.authorize();
  if(!id(key)||options.excludedProjectIds.includes(key))throw errors.sync_project_scope('此项目不属于可同步的项目资料');
  if(value===null)throw errors.sync_project_lifecycle('项目删除必须经过项目删除服务，原件已保留');
  if(!record(value)||!exact(value,['format','spaceId','project','plugins'])||value.format!==1||value.spaceId!==options.spaceId
    ||!record(value.project)||!exact(value.project,['id','title','created_at','updated_at'])||value.project.id!==key
    ||typeof value.project.title!=='string'||!value.project.title.trim()||value.project.title.length>4096
    ||!date(value.project.created_at)||!date(value.project.updated_at)||!Array.isArray(value.plugins)||value.plugins.length>1000
    ||!value.plugins.every(id)||new Set(value.plugins).size!==value.plugins.length
    ||value.plugins.some((p,i,plugins)=>i>0&&plugins[i-1]>=p))throw errors.sync_project_invalid('项目资料格式无效，原件已保留');
  return {format:1,spaceId:options.spaceId,project:{id:key,title:value.project.title,created_at:value.project.created_at,updated_at:value.project.updated_at},plugins:[...value.plugins]};
}

/** Projects owns the portable projection; Storage supplies only its ordinary journal/transaction machinery. */
export function projectReplicationOwner(db:ProjectsSqliteDatabase,options:ProjectReplicationOptions){
  options.authorize();
  for(const sql of ['SELECT project_id,display_name,created_at,updated_at,data_class FROM projects LIMIT 0','SELECT project_id,plugin_id FROM project_portable_plugins LIMIT 0','SELECT project_id,plugin_id FROM project_plugins LIMIT 0'])db.prepare(sql).all();
  return {authorize:options.authorize,
    belongsToProject(key:string,projectId:string){options.authorize();return key===projectId;},
    canUpload(key:string){options.authorize();const p=db.prepare('SELECT data_class FROM projects WHERE project_id=?').get(key) as {data_class:string}|undefined;return !options.excludedProjectIds.includes(key)&&(!p||p.data_class==='user');},
    read(key:string):PortableProject|null {
      options.authorize();const p=db.prepare('SELECT project_id,display_name,created_at,updated_at,data_class FROM projects WHERE project_id=?').get(key) as {project_id:string;display_name:string;created_at:string;updated_at:string;data_class:string}|undefined;
      if(!p||db.prepare("SELECT 1 FROM project_recycle WHERE project_id=? AND recycled=1").get(key))return null;
      if(p.data_class!=='user'||options.excludedProjectIds.includes(key))throw errors.sync_project_scope('此项目不属于可同步的项目资料');
      const plugins=(db.prepare('SELECT plugin_id FROM project_portable_plugins WHERE project_id=? ORDER BY plugin_id').all(key) as {plugin_id:string}[]).map(r=>r.plugin_id);
      return validatePortableProject(key,{format:1,spaceId:options.spaceId,project:{id:p.project_id,title:p.display_name,created_at:p.created_at,updated_at:p.updated_at},plugins},options);
    },
    apply(key:string,value:unknown){
      if(value===null){
        if(!id(key)||options.excludedProjectIds.includes(key))throw errors.sync_project_scope('此项目不属于可同步的项目资料');
        if(!options.authorizeLifecycle)throw errors.sync_project_lifecycle('项目删除必须经过项目删除服务，原件已保留');
        options.authorizeLifecycle(key,true);applySyncedProjectRecycle(db,key,true,options.authorize);return;
      }
      const v=validatePortableProject(key,value,options);
      const p=db.prepare('SELECT data_class FROM projects WHERE project_id=?').get(key) as {data_class:string}|undefined;
      if(!p||p.data_class!=='user')throw errors.sync_project_scope('项目尚未由可信宿主准备，原件已保留');
      if(db.prepare('SELECT 1 FROM project_recycle WHERE project_id=? AND recycled=1').get(key)){
        if(!options.authorizeLifecycle)throw errors.sync_project_scope('项目恢复必须经过项目删除服务，原件已保留');
        options.authorizeLifecycle(key,false);applySyncedProjectRecycle(db,key,false,options.authorize);
      }
      options.authorize();
      db.prepare('UPDATE projects SET display_name=?,created_at=?,updated_at=? WHERE project_id=?').run(v.project.title,v.project.created_at,v.project.updated_at,key);
      db.prepare('DELETE FROM project_portable_plugins WHERE project_id=?').run(key);
      for(const plugin of v.plugins)db.prepare('INSERT INTO project_portable_plugins(project_id,plugin_id) VALUES(?,?)').run(key,plugin);
      // Do not change project_plugins, exclusions, local paths, bindings, authorizations or execution state.
    },
  };
}

/** Local availability is a separate observation. Unknown independent plugins remain visible without being installed. */
export function projectPluginRequirements(db:ProjectsSqliteDatabase,projectId:string,installed:(id:string)=>boolean){
  const active=new Set((db.prepare('SELECT plugin_id FROM project_plugins WHERE project_id=?').all(projectId) as {plugin_id:string}[]).map(p=>p.plugin_id));
  return (db.prepare('SELECT plugin_id FROM project_portable_plugins WHERE project_id=? ORDER BY plugin_id').all(projectId) as {plugin_id:string}[])
    .map(p=>({plugin_id:p.plugin_id,installed:installed(p.plugin_id),active:active.has(p.plugin_id)}));
}

/** Trusted SQL expressions only; no payload enters trigger SQL. All marks share the owner's business transaction. */
export function installProjectReplicationJournal(db:ProjectsSqliteDatabase,mark:(key:string,condition:string)=>string){
  db.exec(`CREATE TRIGGER projects_sync_events AFTER INSERT ON project_events BEGIN ${mark('NEW.project_id',`NEW.type IN ('project.created','project.renamed','project.plugin_added','project.plugin_removed','project.recycled','project.restored') AND EXISTS(SELECT 1 FROM projects WHERE project_id=NEW.project_id AND data_class='user')`)} END;`);
  db.exec(`CREATE TRIGGER projects_sync_delete AFTER DELETE ON projects BEGIN ${mark('OLD.project_id',"OLD.data_class='user'")} END;`);
}
