import { platformErrorKind } from '@molis-ai/molis-work-contracts/platform/actions';

export interface ReplicaScopeOwner {
  authorize(): void;
  authorizeKey?(key:string,value?:unknown):void;
}
/** Technical history keeps the original business scope; an opaque journal id is never permission to read its body. */
export function authorizeReplicaValue(owner:ReplicaScopeOwner,key:string,value?:unknown):void {
  owner.authorize();owner.authorizeKey?.(key,value);owner.authorize();
}
/** Lists expose only currently reachable keys. Account/lifecycle failures and malformed data still propagate. */
export function replicaKeyVisible(owner:ReplicaScopeOwner,key:string,value?:unknown):boolean {
  owner.authorize();
  try { owner.authorizeKey?.(key,value); }
  catch(error) {
    owner.authorize();
    const kind=error&&typeof error==='object'?(('kind' in error?error.kind:undefined)??('code' in error&&typeof error.code==='string'?platformErrorKind(error.code):undefined)):undefined;
    if(kind==='forbidden')return false;
    throw error;
  }
  owner.authorize();return true;
}
