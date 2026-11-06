import { platformErrorKind } from '@molis-ai/molis-work-contracts/platform/actions';
import type { DocumentAccess } from './sync-document.js';
import { documentKey, type DocumentState } from './sync-document-state.js';

/** Owner scope is checked without exporting a snapshot or reading external files. */
export function authorizeDocumentKey<T>(access:DocumentAccess<T>,state:DocumentState<T>,key:string,value?:unknown):void {
  documentKey(key);access.owner.authorize();access.owner.authorizeKey(state.data,key,value);access.owner.authorize();
}
/** Bound lists can omit inaccessible records, but never conceal a revoked account or a broken owner. */
export function documentKeyVisible<T>(access:DocumentAccess<T>,state:DocumentState<T>,key:string,value?:unknown):boolean {
  documentKey(key);access.owner.authorize();
  try { access.owner.authorizeKey(state.data,key,value); }
  catch(error) {
    access.owner.authorize();
    const kind=error&&typeof error==='object'?(('kind' in error?error.kind:undefined)??('code' in error&&typeof error.code==='string'?platformErrorKind(error.code):undefined)):undefined;
    if(kind==='forbidden')return false;throw error;
  }
  access.owner.authorize();return true;
}
