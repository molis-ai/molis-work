import type {ObjectRef} from '@molis-ai/molis-work-contracts/modules/context-ledger';

export const SESSION_REFERENCE_SCOPE={kind:'personal',id:'private-work-context'} as const;
/** Work owns semantics; Ledger owns validation and storage. Machine-local workspace relations are deliberately absent. */
export const sessionSyncReferenceDeclaration={scope:SESSION_REFERENCE_SCOPE,sourceModule:'private-work-context',relations:{
  'work.project':{targetModule:'projects',targetType:'project'},
  'work.goal':{targetModule:'goals'},
  'handoff.goal':{sourceType:'handoff',targetModule:'goals'},
  'handoff.project':{sourceType:'handoff',targetModule:'projects',targetType:'project'},
}} as const;
export function sessionReference(id:string,handoff=false):ObjectRef {
  return {module:'private-work-context',id,version:null,scope:SESSION_REFERENCE_SCOPE,...(handoff?{object_type:'handoff'}:{})};
}
