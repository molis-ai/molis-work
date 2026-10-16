import type {ProjectsSqliteDatabase} from './repository.js';
/** A persisted user removal is distinct from a plugin never offered on this device. */
export function wasProjectPluginRemoved(db:ProjectsSqliteDatabase,projectId:string,pluginId:string):boolean {
 return !!db.prepare("SELECT 1 FROM project_events WHERE project_id=? AND type='project.plugin_removed' AND json_extract(payload_json,'$.plugin_id')=? LIMIT 1").get(projectId,pluginId);
}
