import { errorMessage } from "./dom.js";
export interface SavedHistory {
 readonly total: number; readonly state?: string; readonly offset: number;
 readonly runs: readonly { readonly run_id: string; readonly outcome: string; readonly messages: readonly {readonly role: string; readonly text: string}[] }[];
}
/** Imported history is a transcript; original approval controls never become live. */
export function showSavedHistory(turns: HTMLElement,history: SavedHistory | undefined,load: (before: number) => Promise<void>,force=false) {
 let section=turns.querySelector<HTMLElement>('[data-coding-saved-history]');if(!history?.total){section?.remove();return;}turns.querySelector('[data-coding-welcome]')?.remove();if(section&&history.state&&section.dataset.historyState===history.state&&!force)return;if(!section){section=document.createElement('section');section.dataset.codingSavedHistory='';turns.prepend(section);}section.dataset.historyState=history.state||'';section.replaceChildren();
 const title=document.createElement('p');title.textContent='已保存的会话历史（只读） · '+history.total;section.append(title);
 if(history.offset){const earlier=document.createElement('button');earlier.type='button';earlier.className='mw-btn mw-btn--ghost';earlier.textContent='查看更早的历史';earlier.onclick=async()=>{earlier.disabled=true;section?.querySelector('[role=status]')?.remove();try{await load(history.offset);}catch(error){const note=document.createElement('p');note.role='status';note.textContent=errorMessage(error)||'暂时无法读取，请重试';section?.append(note);}finally{earlier.disabled=false;}};section.append(earlier);}
 for(const run of history.runs){const item=document.createElement('details'),label=document.createElement('summary');label.textContent=run.run_id+' · '+run.outcome;item.append(label);item.open=true;
  for(const message of run.messages){const line=document.createElement('pre');line.style.whiteSpace='pre-wrap';line.style.overflowWrap='anywhere';line.textContent=message.role+' · '+message.text;item.append(line);}section.append(item);}
}
