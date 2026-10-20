/** Window-only copies of human input; saved business facts still belong to CodingInputStore. */
export const CODING_INPUT_CACHE_FACTORY_SCRIPT=String.raw`({drafts,questionDrafts,storageKey,translate})=>{
 const L=translate||(text=>text);
 const localDraft=id=>{
  if(drafts.has(id))return drafts.get(id);
  try{return sessionStorage.getItem(storageKey(id))??undefined;}
  catch{/* The mounted window's input remains usable when storage is unavailable. */}
  return undefined;
 };
 const rememberDraft=(id,value)=>{
  drafts.set(id,value);
  try{sessionStorage.setItem(storageKey(id),value);}
  catch{/* The mounted window retains the unsaved text. */}
 };
 const localQuestions=id=>{
  if(questionDrafts.has(id))return questionDrafts.get(id);
  try{
   const raw=sessionStorage.getItem(storageKey(id)+':questions');if(raw===null)return undefined;
   const value=JSON.parse(raw);
   if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid question draft');
   return value;
  }catch{throw new Error(L('本窗口待答草稿暂不可读，原内容已保留'));}
 };
 const replaceCachedInput=(id,value)=>{
  const changed=JSON.stringify(localQuestions(id))!==JSON.stringify(value.question_drafts);
  rememberDraft(id,value.draft);questionDrafts.set(id,value.question_drafts);
  try{sessionStorage.setItem(storageKey(id)+':questions',JSON.stringify(value.question_drafts));}
  catch{/* The mounted window retains the unsaved answers. */}
  return changed;
 };
 return {localDraft,rememberDraft,localQuestions,replaceCachedInput};
}`;
