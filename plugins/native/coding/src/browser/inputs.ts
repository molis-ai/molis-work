import { el, errorMessage } from "./dom.js";
import type { Api, Lifetime, Translate } from "./types.js";
export interface InputValue { draft: string; question_drafts: Record<string, unknown> }
interface InputBase extends InputValue { revision: number }
interface InputState { base: InputBase | null; conflict: boolean; generation: number }
export interface InputSnapshot { draft?: string; question_drafts?: Readonly<Record<string, unknown>>; input_revision: number }
interface InputPorts {
 lifetime: Lifetime; root: HTMLElement; current: () => string; api: Api;
 path: (id: string) => string; storageKey: (id: string) => string;
 localDraft: (id: string) => string | undefined; localQuestions: (id: string) => Record<string, unknown> | undefined;
 replace: (id: string, value: InputValue) => void; note: HTMLElement;
 status: (text: string, bad?: boolean) => void; translate: Translate; editing: (id: string) => boolean;
}
export function codingInputs(ports: InputPorts) {
 const {lifetime,root,current,api,path,storageKey,localDraft,localQuestions,replace,note,status}=ports,states=new Map<string, InputState>();
 const local=(id: string)=>({draft:localDraft(id),question_drafts:localQuestions(id)});
 const L=ports.translate,notify=(text: string,bad?: boolean)=>status(text,bad);
 const copy=<T>(value: T): T=>structuredClone(value),shape=(value: Partial<InputValue>)=>JSON.stringify({draft:value.draft,question_drafts:value.question_drafts||{}});
 const saved=(value: InputSnapshot): InputBase=>({draft:value.draft||'',question_drafts:copy(value.question_drafts||{}),revision:value.input_revision});
 const valid=(value: unknown): value is InputBase=>!!value&&typeof value==="object"&&"revision" in value&&typeof value.revision==="number"&&"draft" in value&&"question_drafts" in value&&Number.isSafeInteger(value.revision)&&value.revision>=0&&typeof value.draft==='string'&&!!value.question_drafts&&typeof value.question_drafts==='object'&&!Array.isArray(value.question_drafts);
 const key=(id: string)=>storageKey(id)+':input-base';
 const persist=(id: string,base: InputBase)=>{try{sessionStorage.setItem(key(id),JSON.stringify(base));}catch{/* The mounted window still retains its original premise. */}};
 const baseFor=(id: string): InputState=>{
  const held=states.get(id);if(held)return held;
  let base: unknown;try{base=JSON.parse(sessionStorage.getItem(key(id))||'null');}catch{/* A corrupt premise is never replaced with a fresh revision for old text. */}
  const state={base:valid(base)?base:null,conflict:false,generation:0};states.set(id,state);return state;
 };
 const remember=(id: string,base: InputBase,adopt=false)=>{const state=baseFor(id);if(adopt&&JSON.stringify(state.base)!==JSON.stringify(base))state.generation++;state.base=copy(base);state.conflict=false;persist(id,base);};
 const node=<T extends keyof HTMLElementTagNameMap>(tag: T,text?: string,cls?: string)=>el(tag,text??'',cls);
 const notice=(id: string)=>{
  if(id!==current())return false;
  if(!baseFor(id).conflict){note.replaceChildren();note.hidden=true;return false;}
  note.hidden=false;
  if(note.querySelector('[data-coding-input-compare]'))return true;
  note.replaceChildren(node('span',L('coding.input.conflict')));
  const button=node('button',L('coding.input.compare-saved'),'mw-btn mw-btn--link');button.type='button';button.dataset.codingInputCompare='';note.append(button);return true;
 };
 const ack=(id: string,revision: number,value: InputValue)=>{
  if(!Number.isSafeInteger(revision)||revision<0)throw new Error(L('coding.input.invalid-receipt'));
  const state=baseFor(id);if(!state.base||revision>=state.base.revision)remember(id,{...copy(value),revision});notice(id);
 };
 const write=async(id: string,body: Record<string, unknown>,expected?: number,premise?: number)=>{
  const state=baseFor(id),base=state.base;
  if(expected===undefined&&(!base||state.conflict||premise!==undefined&&premise!==state.generation)){state.conflict=true;notice(id);throw new Error(L('coding.input.compare-first'));}
  const value: InputValue={draft:typeof body.draft==='string'?body.draft:base?.draft??'',question_drafts:copy((body.question_drafts??base?.question_drafts??{}) as Record<string, unknown>)};
  try{const result=await api<{input_revision: number}>(path(id),'PATCH',{...body,expected_input_revision:expected??base!.revision});lifetime.assertCurrent();ack(id,result.input_revision,value);return result;}
  catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='coding.inputs_changed'){state.conflict=true;notice(id);}throw new Error(errorMessage(error),{cause:error});}
 };
 const compare=async()=>{
  const id=current(),view=saved(await api<InputSnapshot>(path(id)));lifetime.assertCurrent();if(id!==current())return;
  if(!valid(view))throw new Error(L('coding.input.unreadable'));
  const original=local(id),mine=copy({draft:original.draft??'',question_drafts:original.question_drafts??{}}),opener=document.activeElement,dialog=node('dialog',undefined,'mw-dialog mw-dialog--form'),shell=node('div',undefined,'mw-form mw-dialog__shell');
  dialog.dataset.codingInputDialog='';const header=node('header',undefined,'mw-form__header'),body=node('div',undefined,'mw-form__body'),footer=node('footer',undefined,'mw-form__footer'),error=node('p',undefined,'mw-field__error');error.setAttribute('role','alert');error.hidden=true;
  header.append(node('h2',L('coding.input.compare')));
  const field=(title: string,text: string)=>{const label=node('label',undefined,'mw-field'),input=node('textarea',undefined,'mw-textarea');input.readOnly=true;input.rows=6;input.value=text;label.append(node('span',title,'mw-field__label'),input);return label;};
  for(const [title,value] of [[L('coding.input.current'),mine],[L('coding.input.saved'),view]] as const){const section=node('section');section.append(field(title,value.draft));if(Object.keys(value.question_drafts||{}).length){const details=node('details',undefined,'mw-disclosure');details.append(node('summary',L('coding.input.answers')),field(L('coding.input.answers'),JSON.stringify(value.question_drafts,null,2)));section.append(details);}body.append(section);}
  body.append(error);const buttons: HTMLButtonElement[]=[];let pending=false;
  const close=()=>dialog.close();
  const action=(label: string,run: () => Promise<void>,primary=false)=>{const button=node('button',label,'mw-btn '+(primary?'mw-btn--primary':'mw-btn--secondary'));button.type='button';buttons.push(button);lifetime.listen(button,'click',async()=>{
   buttons.forEach(value=>value.disabled=true);error.hidden=true;pending=true;
   try{if(id!==current()||shape(local(id))!==shape(mine))throw new Error(L('coding.input.changed'));await run();lifetime.assertCurrent();close();}
   catch(failure){if(lifetime.alive){error.textContent=errorMessage(failure);error.hidden=false;}}
   finally{pending=false;buttons.forEach(value=>value.disabled=false);}
  });footer.append(button);return button;};
  const cancel=node('button',L('coding.common.cancel'),'mw-btn mw-btn--secondary');cancel.type='button';buttons.push(cancel);lifetime.listen(cancel,'click',close);footer.append(cancel);
  action(L('coding.input.adopt'),async()=>{remember(id,view,true);replace(id,copy(view));notice(id);notify(L('coding.input.adopted'));});
  action(L('coding.input.save'),async()=>{await write(id,mine,view.revision);if(id===current())notify(L('coding.input.saved-notice'));},true);
  shell.append(header,body,footer);dialog.append(shell);root.append(dialog);
  lifetime.listen(dialog,'cancel',event=>{if(pending)event.preventDefault();});
  lifetime.listen(dialog,'close',()=>{dialog.remove();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus();});lifetime.own(()=>dialog.remove());dialog.showModal();cancel.focus();
 };
 lifetime.listen(root,'click',event=>{if(event.target instanceof Element&&event.target.closest('[data-coding-input-compare]'))void compare().catch(error=>{if(lifetime.alive)notify(errorMessage(error),true);});});
 return {
  write,notice,premise:(id: string)=>baseFor(id).generation,
  observe(id: string,value: InputSnapshot){const incoming=saved(value);if(!valid(incoming))throw new Error(L('coding.input.unreadable'));const state=baseFor(id),mine=local(id),base=state.base;
   if(base&&incoming.revision<base.revision)return;
   const pristine=base?shape(mine)===shape(base):mine.draft===undefined&&mine.question_drafts===undefined;
   if(pristine&&!ports.editing(id)||shape(mine)===shape(incoming)){remember(id,incoming,true);replace(id,copy(incoming));}
   else if(!base||incoming.revision!==base.revision||shape(incoming)!==shape(base))state.conflict=true;
   notice(id);
  },
  accepted(id: string,revision: number | undefined,task: string){const base=baseFor(id).base;if(base&&revision===base.revision+1&&base.draft===task)remember(id,{...base,draft:'',revision});},
 };
}
export type InputEditor = ReturnType<typeof codingInputs>;
