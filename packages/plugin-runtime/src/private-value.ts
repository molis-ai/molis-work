import type {PluginPrivateStorageDatabase} from './private-storage.js';

/** One original-table CAS, shared by normal plugin edits and trusted passive replication. */
export function compareAndSetPrivateValue(db:PluginPrivateStorageDatabase,installId:string,key:string,expected:string|null,value:string|null):boolean{
 if(value===null&&expected===null)return !db.prepare('SELECT 1 FROM plugin_private_values WHERE install_id=? AND item_key=?').get(installId,key);
 const result=value===null
  ?db.prepare('DELETE FROM plugin_private_values WHERE install_id=? AND item_key=? AND item_value=?').run(installId,key,expected)
  :expected===null
   ?db.prepare('INSERT INTO plugin_private_values(install_id,item_key,item_value) VALUES(?,?,?) ON CONFLICT(install_id,item_key) DO NOTHING').run(installId,key,value)
   :db.prepare('UPDATE plugin_private_values SET item_value=? WHERE install_id=? AND item_key=? AND item_value=?').run(value,installId,key,expected);
 return Number(result.changes)===1;
}
