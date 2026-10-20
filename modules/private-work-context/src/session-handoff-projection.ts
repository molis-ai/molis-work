import type {MolisWorkSessionHandoffRecord} from './contract-aliases.js';
import type {SessionContentStore} from './content-store.js';
import type {HandoffAssociationRepository} from './handoff-associations.js';

export function projectSessionHandoff(row:Record<string,unknown>,store:SessionContentStore,associations:HandoffAssociationRepository):MolisWorkSessionHandoffRecord {
  let content:string|null=null;
  try{content=store.read(String(row.content_ref));}catch{content=null;}
  const destination=row.sync_passive===1?row.sync_destination_session_id:row.destination_session_id;
  return {
    package_id:String(row.package_id),source_session_id:String(row.source_session_id),...associations.read(String(row.package_id)),
    target_runtime_id:String(row.target_runtime_id),target_workspace_path:row.target_workspace_path==null?null:String(row.target_workspace_path),
    destination_session_id:destination==null?null:String(destination),state:String(row.state) as MolisWorkSessionHandoffRecord['state'],
    delivery_mode:row.delivery_mode==null?null:String(row.delivery_mode) as MolisWorkSessionHandoffRecord['delivery_mode'],
    content,content_available:content!==null,content_digest:String(row.content_digest),attempt_count:Number(row.attempt_count),
    error_code:row.error_code==null?null:String(row.error_code),error_message:row.error_message==null?null:String(row.error_message),
    retryable:row.sync_passive!==1&&Number(row.retryable)===1,created_by:String(row.created_by),
    created_at:String(row.created_at),updated_at:String(row.updated_at),sent_at:row.sent_at==null?null:String(row.sent_at),
  };
}
