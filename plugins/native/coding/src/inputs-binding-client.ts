import { CODING_INPUTS_CLIENT_FACTORY_SCRIPT } from "./inputs-client.js";

/** Keep the window-owned draft and question buffers attached to one optimistic-editing client. */
export const CODING_INPUTS_BINDING_CLIENT = `(ports) => {
  const {lifetime,root,current,api,sessionPath,draftKey,status,translate,draft,questionDrafts,input,lastData,renderRuns,q}=ports;
  const localQuestions=id=>{
    if(questionDrafts.has(id))return questionDrafts.get(id);
    const raw=sessionStorage.getItem(draftKey(id)+':questions');if(raw===null)return undefined;
    const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('本窗口待答草稿暂不可读，原内容已保留');return value;
  };
  return (${CODING_INPUTS_CLIENT_FACTORY_SCRIPT})({lifetime,root,current,api,path:sessionPath,storageKey:draftKey,note:q('[data-coding-input-status]'),status,translate,localDraft:draft.local,localQuestions,
    editing:id=>id===current()&&draft.owns(id)&&(document.activeElement===input||!!document.activeElement?.closest('[data-coding-question]')||q('[data-coding-input-status]').contains(document.activeElement)||!!root.querySelector('[data-coding-input-dialog][open]')),
    replace:(id,value)=>{
      const changed=JSON.stringify(localQuestions(id))!==JSON.stringify(value.question_drafts);
      draft.adopt(id,value.draft);questionDrafts.set(id,value.question_drafts);
      try{sessionStorage.setItem(draftKey(id)+':questions',JSON.stringify(value.question_drafts));}catch{/* This window still retains its copy. */}
      if(id===current()&&draft.owns(id)){input.value=value.draft;if(changed){for(const form of root.querySelectorAll('[data-coding-question]')){form.ix?.destroy();form.remove();}const data=lastData();if(data)renderRuns(data.runs);}}
    },
  });
}`;
