import type {PrivateValueReplicationOwner} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {checkPrivateValueOwner} from './private-replication.js';

/** Trusted selectors only; SQLite journals normal CAS writes, including writes from other connections. */
export function installPrivateValueReplicationJournal(db:{exec(sql:string):unknown;prepare(sql:string):{get(...parameters:string[]):unknown}},owner:PrivateValueReplicationOwner,markRows:(selectKeys:string)=>string):void{
 checkPrivateValueOwner(owner);const n=owner.namespacePrefix.length;
 const initialized=db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(owner.id+'_private_sync_insert');
 const selected=(row:string)=>`${row}.item_key='${owner.key}' AND substr(${row}.install_id,1,${n})='${owner.namespacePrefix}'`;
 const ids=(row:string)=>owner.journal.map(j=>`SELECT json_extract(value,'$.${j.id}') AS item_id FROM json_each(${row}.item_value,'$.${j.array}')`).join(' UNION ');
 const key=(row:string)=>`json_array(substr(${row}.install_id,${n+1}),'${owner.assetKind}',entries.item_id)`;
 const group=(row:string)=>owner.journal.map(j=>`(SELECT json_group_array(json(value)) FROM json_each(${row}.item_value,'$.${j.array}') WHERE json_extract(value,'$.${j.id}')=entries.item_id)`).join(' || ');
 const install=(suffix:string,event:string,condition:string,query:string)=>{
  const name=owner.id+'_private_sync_'+suffix;
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name))db.exec(`CREATE TRIGGER ${name} AFTER ${event} ON plugin_private_values WHEN ${condition} BEGIN ${markRows(query)} END`);
 };
 install('insert','INSERT',selected('NEW'),`SELECT ${key('NEW')} AS key FROM (${ids('NEW')}) AS entries`);
 install('delete','DELETE',selected('OLD'),`SELECT ${key('OLD')} AS key FROM (${ids('OLD')}) AS entries`);
 const same='NEW.install_id=OLD.install_id AND NEW.item_key=OLD.item_key';
 install('update','UPDATE OF item_value',`${selected('NEW')} AND ${same}`,`SELECT ${key('NEW')} AS key FROM (${ids('OLD')} UNION ${ids('NEW')}) AS entries WHERE (${group('OLD')}) IS NOT (${group('NEW')})`);
 install('move_old','UPDATE OF install_id,item_key',`${selected('OLD')} AND NOT (${same})`,`SELECT ${key('OLD')} AS key FROM (${ids('OLD')}) AS entries`);
 install('move_new','UPDATE OF install_id,item_key',`${selected('NEW')} AND NOT (${same})`,`SELECT ${key('NEW')} AS key FROM (${ids('NEW')}) AS entries`);
 if(!initialized){const select=owner.journal.map(j=>`SELECT json_array(substr(p.install_id,${n+1}),'${owner.assetKind}',json_extract(v.value,'$.${j.id}')) AS key FROM plugin_private_values p,json_each(p.item_value,'$.${j.array}') v WHERE ${selected('p')}`).join(' UNION ');db.exec(markRows(select));}
}
