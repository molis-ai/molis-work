/** Browser editing premises belong to this window, not to the latest background poll. */
export const CODING_INPUTS_CLIENT_FACTORY_SCRIPT=String.raw`(ports)=>{
 const {lifetime,root,current,api,path,storageKey,localDraft,localQuestions,replace,note,status}=ports,states=new Map();
 const local=id=>({draft:localDraft(id),question_drafts:localQuestions(id)});
 const L=ports.translate||globalThis.L||(text=>text),notify=(text,bad)=>status(L(text),bad);
 const copy=value=>structuredClone(value),shape=value=>JSON.stringify({draft:value.draft,question_drafts:value.question_drafts||{}});
 const saved=value=>({draft:value.draft||'',question_drafts:copy(value.question_drafts||{}),revision:value.input_revision});
 const valid=value=>value&&Number.isSafeInteger(value.revision)&&value.revision>=0&&typeof value.draft==='string'&&value.question_drafts&&typeof value.question_drafts==='object'&&!Array.isArray(value.question_drafts);
 const key=id=>storageKey(id)+':input-base';
 const persist=(id,base)=>{try{sessionStorage.setItem(key(id),JSON.stringify(base));}catch{/* The mounted window still retains its original premise. */}};
 const baseFor=id=>{
  if(states.has(id))return states.get(id);
  let base;try{base=JSON.parse(sessionStorage.getItem(key(id))||'null');}catch{/* A corrupt premise is never replaced with a fresh revision for old text. */}
  const state={base:valid(base)?base:null,conflict:false,generation:0};states.set(id,state);return state;
 };
 const remember=(id,base,adopt=false)=>{const state=baseFor(id);if(adopt&&JSON.stringify(state.base)!==JSON.stringify(base))state.generation++;state.base=copy(base);state.conflict=false;persist(id,base);};
 const node=(tag,text,cls)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=L(text);if(cls)value.className=cls;return value;};
 const notice=id=>{
  if(id!==current())return false;
  if(!baseFor(id).conflict){note.replaceChildren();note.hidden=true;return false;}
  note.hidden=false;
  if(note.querySelector('[data-coding-input-compare]'))return true;
  note.replaceChildren(node('span','草稿已在别处更新，当前输入已保留。'));
  const button=node('button','对比已保存草稿','mw-btn mw-btn--link');button.type='button';button.dataset.codingInputCompare='';note.append(button);return true;
 };
 const ack=(id,revision,value)=>{
  if(!Number.isSafeInteger(revision)||revision<0)throw new Error(L('草稿保存回执无效，当前输入已保留'));
  const state=baseFor(id);if(!state.base||revision>=state.base.revision)remember(id,{...copy(value),revision});notice(id);
 };
 const write=async(id,body,expected,premise)=>{
  const state=baseFor(id),base=state.base;
  if(expected===undefined&&(!base||state.conflict||premise!==undefined&&premise!==state.generation)){state.conflict=true;notice(id);throw new Error(L('请先对比已保存草稿，当前输入已保留'));}
  const value={draft:body.draft,question_drafts:copy(body.question_drafts??base?.question_drafts??{})};
  try{const result=await api(path(id),'PATCH',{...body,expected_input_revision:expected??base.revision});lifetime.assertCurrent();ack(id,result.input_revision,value);return result;}
  catch(error){if(error.code==='coding.inputs_changed'){state.conflict=true;notice(id);}error.message=L(error.message);throw error;}
 };
 const compare=async()=>{
  const id=current(),view=saved(await api(path(id)));lifetime.assertCurrent();if(id!==current())return;
  if(!valid(view))throw new Error(L('已保存草稿暂不可读，当前输入已保留'));
  const original=local(id),mine=copy({draft:original.draft??'',question_drafts:original.question_drafts??{}}),opener=document.activeElement,dialog=node('dialog',undefined,'mw-dialog mw-dialog--form'),shell=node('div',undefined,'mw-form mw-dialog__shell');
  dialog.dataset.codingInputDialog='';const header=node('header',undefined,'mw-form__header'),body=node('div',undefined,'mw-form__body'),footer=node('footer',undefined,'mw-form__footer'),error=node('p',undefined,'mw-field__error');error.setAttribute('role','alert');error.hidden=true;
  header.append(node('h2','对比草稿'));
  const field=(title,text)=>{const label=node('label',undefined,'mw-field'),input=node('textarea',undefined,'mw-textarea');input.readOnly=true;input.rows=6;input.value=text;label.append(node('span',title,'mw-field__label'),input);return label;};
  for(const [title,value] of [['当前输入',mine],['已保存草稿',view]]){const section=node('section');section.append(field(title,value.draft));if(Object.keys(value.question_drafts||{}).length){const details=node('details',undefined,'mw-disclosure');details.append(node('summary','待答内容'),field('待答内容',JSON.stringify(value.question_drafts,null,2)));section.append(details);}body.append(section);}
  body.append(error);const buttons=[];let pending=false;
  const close=()=>dialog.close();
  const action=(label,run,primary=false)=>{const button=node('button',label,'mw-btn '+(primary?'mw-btn--primary':'mw-btn--secondary'));button.type='button';buttons.push(button);lifetime.listen(button,'click',async()=>{
   buttons.forEach(value=>value.disabled=true);error.hidden=true;pending=true;
   try{if(id!==current()||shape(local(id))!==shape(mine))throw new Error(L('输入已变化，请重新打开对比'));await run();lifetime.assertCurrent();close();}
   catch(failure){if(lifetime.alive){error.textContent=failure.message;error.hidden=false;}}
   finally{pending=false;buttons.forEach(value=>value.disabled=false);}
  });footer.append(button);return button;};
  const cancel=node('button','取消','mw-btn mw-btn--secondary');cancel.type='button';buttons.push(cancel);lifetime.listen(cancel,'click',close);footer.append(cancel);
  action('采用已保存草稿',async()=>{remember(id,view,true);replace(id,copy(view));notice(id);notify('已采用保存的草稿');});
  action('保存当前输入',async()=>{await write(id,mine,view.revision);if(id===current())notify('草稿已保存');},true);
  shell.append(header,body,footer);dialog.append(shell);root.append(dialog);
  lifetime.listen(dialog,'cancel',event=>{if(pending)event.preventDefault();});
  lifetime.listen(dialog,'close',()=>{dialog.remove();if(opener?.isConnected)opener.focus();});lifetime.own(()=>dialog.remove());dialog.showModal();cancel.focus();
 };
 lifetime.listen(root,'click',event=>{if(event.target.closest('[data-coding-input-compare]'))void compare().catch(error=>{if(lifetime.alive)notify(error.message,true);});});
 return {
  write,notice,premise:id=>baseFor(id).generation,
  observe(id,value){const incoming=saved(value);if(!valid(incoming))throw new Error(L('已保存草稿暂不可读，当前输入已保留'));const state=baseFor(id),mine=local(id),base=state.base;
   if(base&&incoming.revision<base.revision)return;
   const pristine=base?shape(mine)===shape(base):mine.draft===undefined&&mine.question_drafts===undefined;
   if(pristine&&!ports.editing(id)||shape(mine)===shape(incoming)){remember(id,incoming,true);replace(id,copy(incoming));}
   else if(!base||incoming.revision!==base.revision||shape(incoming)!==shape(base))state.conflict=true;
   notice(id);
  },
  accepted(id,revision,task){const base=baseFor(id).base;if(base&&revision===base.revision+1&&base.draft===task)remember(id,{...base,draft:'',revision});},
 };
}`;
