import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiSideContext, UiPageMessage } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PagesCommentThread } from "@molis-ai/molis-work-contracts/modules/pages";
import type { CommentSideHost, CommentDraft, CommentElements, CommentOpening, CommentCommandResult, PendingCommentCommand } from "./comment-browser-types.js";
import { commentErrorMessage } from "./comment-browser-types.js";

/** Side document client. Drafts and pending sends are keyed by project, document and thread. */
export function mountComments(host: CommentSideHost): void {
  const root=document.querySelector<HTMLElement>('[data-pages-comments]');if(!root)return;
  const L=host.translate, q=<K extends keyof CommentElements>(name: K)=>root.querySelector('[data-comment-'+name+']') as CommentElements[K];
  const project=typeof host.projectId==='function'?host.projectId():host.projectId;
  const key='molis.pages.comments:'+project;
  let saved: Record<string, unknown>={};try{saved=JSON.parse(localStorage.getItem(key)||'{}');}catch{/* A broken local draft does not replace server comments. */}
  let context: UiSideContext|null=null, threads: readonly PagesCommentThread[]=[], handed='', opening: CommentOpening|null=null;
  let epoch=0,active='',mode='comments',busy=false,loadSeq=0,notesSeq=0,lastOpening: string|null=null,loaded: string|null=null;
  const activePages=(saved.__active ||= {}) as Record<string,string>;
  const savedDraft=(key: string)=>saved[key] as CommentDraft|undefined;
  const rememberActive=()=>{if(context){activePages[context.object_ref.id]=active;persist();}};
  const draftKey=()=>context?.object_ref.id+':'+active;
  const draft=(): CommentDraft=>savedDraft(draftKey()) ?? (saved[draftKey()]={body:'',ai:false,reply_to:null,request_id:crypto.randomUUID()});
  const persist=()=>{try{localStorage.setItem(key,JSON.stringify(saved));}catch{error(L('pages.comments.draft-unsaved'));}};
  const error=(text: string)=>{q('error').textContent=text||'';q('error').hidden=!text;q('reload').hidden=!text;};
  const request=async<T>(address: string,body?: object): Promise<T>=>{
    const url=address+(address.includes('?')?'&':'?')+'project_id='+encodeURIComponent(project);
    return molisWorkRequest<T>(url,{...(body===undefined?{}:{body}),fallback:L('pages.error.request')});
  };
  const pagePath=(id: string)=>host.pluginRoute('/pages/'+encodeURIComponent(id)+'/comments');
  const button=(label: string,fn: ()=>void)=>{const node=document.createElement('button');node.type='button';node.className='mw-btn mw-btn--ghost';node.textContent=label;node.addEventListener('click',fn);return node;};
  const needsSave=()=>!!context?.unsaved&&!(draft().ai&&draft().includeDraft&&draft().anchor?.kind!=='text');
  const paintDraft=()=>{
    const d=draft();q('draft').value=d.body;q('ai').setAttribute('aria-pressed',String(d.ai));
    q('reply').hidden=!d.reply_to;q('reply').textContent=d.reply_to?L('pages.comments.reply-selected')+' · '+L('pages.action.cancel'):'';
    q('form').hidden=mode!=='comments'||!context;
    q('scope').hidden=!d.ai;q('unsaved').hidden=!context?.unsaved||!d.ai||d.anchor?.kind==='text';q('include-draft').checked=!!d.includeDraft;
    q('send').disabled=busy||needsSave()||!d.body.trim();q('send').textContent=L(needsSave()?'pages.comments.waiting-save':d.ai?'pages.comments.send-ask':'pages.comments.send');
  };
  // The reply itself is the Assistant's: started from its panel by the person's press there (PG-057), followed, retried or stopped there.
  const paintRun=()=>{q('run').textContent=handed;};
  const paint=()=>{
    q('threads').replaceChildren();
    for(const thread of threads){const node=button((thread.anchor.kind==='text'?thread.anchor.excerpt:thread.messages.find(message=>message.author==='user')?.body)?.slice(0,36)||L('pages.comments.whole-doc'),()=>choose(thread.thread_id));node.setAttribute('aria-current',String(thread.thread_id===active));q('threads').append(node);}
    const thread=threads.find(t=>t.thread_id===active);
    q('quote').hidden=!thread&&!draft().anchor;q('quote').textContent=thread?(thread.detached?L('pages.comments.detached')+'\n':'')+thread.anchor.excerpt:draft().excerpt||context?.object_ref.title||'';
    q('locate').hidden=!thread?.anchor.mark_id||thread.detached;
    q('messages').replaceChildren();
    for(const message of thread?.messages||[]){
      const article=document.createElement('article'),head=document.createElement('div'),name=document.createElement('strong'),time=document.createElement('time'),body=document.createElement('p');
      name.textContent=L(message.author==='assistant'?'pages.comments.assistant':message.author==='annotation'?'pages.comments.annotation':'pages.comments.me');
      time.textContent=new Date(message.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});time.dateTime=message.created_at;
      body.textContent=message.body;head.append(name,time,button(L('pages.comments.reply'),()=>{draft().reply_to=message.message_id;persist();paintDraft();q('draft').focus();}));article.append(head,body);q('messages').append(article);
    }
    if(!thread){const hint=document.createElement('p');hint.textContent=L(loaded!==context?.object_ref.id?'pages.comments.loading':'pages.comments.hint');q('messages').append(hint);}
    paintDraft();paintRun();
  };
  const choose=(id: string)=>{active=id;rememberActive();handed='';paint();};
  const fresh=(markId: string|null,excerpt?: string)=>{handed='';active=crypto.randomUUID();rememberActive();draft().anchor=markId?{kind:'text',mark_id:markId}:{kind:'document'};draft().excerpt=excerpt||'';persist();paint();};
  const applyOpening=()=>{
    if(!opening||opening.open_id===lastOpening||opening.page_id!==loaded||opening.page_id!==context?.object_ref.id)return;
    const value=opening;lastOpening=value.open_id;opening=null;mode='comments';paintMode();
    const thread=value.mark_id&&threads.find(t=>t.anchor.mark_id===value.mark_id);
    if(thread)choose(thread.thread_id);else fresh(value.mark_id,value.excerpt);
    q('draft').focus();
  };
  const load=async()=>{
    if(!context)return;const id=context.object_ref.id,seq=++loadSeq;
    try{const data=await request<{threads: PagesCommentThread[]}>(pagePath(id));if(seq!==loadSeq||context?.object_ref.id!==id)return;
      threads=data.threads;loaded=id;if(!active)active=threads[0]?.thread_id||crypto.randomUUID();rememberActive();paint();applyOpening();
    }catch(e){if(seq===loadSeq)error(commentErrorMessage(e));}
  };
  q('draft').addEventListener('input',()=>{const d=draft();d.body=q('draft').value;q('send').disabled=busy||needsSave()||!d.body.trim();delete d.message_id;d.request_id=crypto.randomUUID();persist();});
  q('ai').addEventListener('click',()=>{draft().ai=!draft().ai;persist();paintDraft();});
  q('include-draft').addEventListener('change',()=>{draft().includeDraft=q('include-draft').checked;persist();paintDraft();});
  q('reload').addEventListener('click',()=>{error('');void load();if(mode==='notes')void notes();});
  q('new').addEventListener('click',()=>{fresh(null);q('draft').focus();});
  q('reply').addEventListener('click',()=>{draft().reply_to=null;persist();paintDraft();});
  q('form').addEventListener('submit',event=>{event.preventDefault();void send();});
  q('draft').addEventListener('keydown',event=>{if(!event.isComposing&&event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();void send();}});
  const send=async()=>{
    if(busy||!context||needsSave()||!draft().body.trim())return;
    const id=context.object_ref.id,title=context.object_ref.title,version=context.object_ref.version,threadId=active,d={...draft()},before=draftKey();busy=true;handed='';paintRun();paintDraft();error('');
    try{
      const snapshot=d.ai&&d.includeDraft&&context.unsaved?await command({kind:'draft'}):null;
      const offer=d.ai?{message_id:crypto.randomUUID(),purpose:'suggest',source:{surface:'pages'},
        object:{kind:'pages_document',id,title},text:d.body,thread:{thread_id:threadId,message_id:d.message_id||'',...(snapshot?{draft:{text:snapshot.text,revision:String(snapshot.version)}}:{})}}:null;
      // Match the frame bridge's serialized-detail cap, including escaping. Before saving, the missing server id is a lower bound.
      if(offer&&JSON.stringify(offer).length>100000)throw new Error(L(d.message_id?'pages.comments.saved-offer-too-long':'pages.comments.draft-too-long'));
      if(!d.message_id){const data=await request<{thread: PagesCommentThread}>(pagePath(id),{thread_id:threadId,request_id:d.request_id,body:d.body,expected_version:version,
        ...(d.reply_to?{reply_to:d.reply_to}:{}),anchor:d.anchor||{kind:'document'}});
        d.message_id=data.thread.messages.find(m=>m.request_id===d.request_id)!.message_id;if(savedDraft(before)?.request_id===d.request_id)savedDraft(before)!.message_id=d.message_id;persist();
      }
      // Handed to the Assistant, which offers 「让助理回复」; the page cannot start the reply itself (PG-057).
      if(offer){offer.thread.message_id=d.message_id;
        // The real id can cross the boundary. Keep both the saved id and pending draft so retry never saves the same comment twice.
        if(JSON.stringify(offer).length>100000)throw new Error(L('pages.comments.saved-offer-too-long'));
        window.dispatchEvent(new CustomEvent('molis:assistant-message',{detail:offer}));
        if(before===draftKey())handed=L('pages.comments.handed');}
      if(savedDraft(before)?.request_id===d.request_id)delete saved[before];persist();if(before===draftKey()){await load();paintDraft();}
    }catch(e){if(before===draftKey()){error(commentErrorMessage(e));if(d.message_id)await load();}}
    finally{busy=false;if(context)paintDraft();}
  };
  const commands=new Map<string,PendingCommentCommand>();
  // Asked under the current context; one the page refused as asked under an older context (nothing ran) is asked again.
  const ask=(request_id: string,waiting: PendingCommentCommand)=>{waiting.stale=false;waiting.epoch=epoch;host.messages.send({type:'molis:side-context-command',context_epoch:epoch,command:{...waiting.value,request_id}});};
  const command=(value: object)=>new Promise<CommentCommandResult>((resolve,reject)=>{
    const request_id=crypto.randomUUID(),timeout=window.setTimeout(()=>{commands.delete(request_id);reject(new Error(L('pages.comments.no-answer')));},10000);
    const waiting={resolve,reject,timeout,page:context!.object_ref.id,value,epoch};commands.set(request_id,waiting);ask(request_id,waiting);
  });
  q('locate').addEventListener('click',()=>{const thread=threads.find(t=>t.thread_id===active);if(thread)void command({kind:'focus-mark',mark_id:thread.anchor.mark_id}).catch(e=>error(commentErrorMessage(e)));});
  const notes=async()=>{
    const id=context?.object_ref.id,seq=++notesSeq;if(!id)return;
    try{const data=await command({kind:'notes'});if(seq!==notesSeq||context?.object_ref.id!==id)return;q('notes').replaceChildren();
      if(!data.notes.length){const hint=document.createElement('p');hint.textContent=L('pages.comments.no-notes');q('notes').append(hint);}
      for(const note of data.notes){const label=document.createElement('label'),title=document.createElement('span'),area=document.createElement('textarea');title.textContent=note.text||L('pages.comments.blank-block');area.className='mw-input';area.rows=2;const noteKey='note:'+id+':'+data.version+':'+note.index;area.value=(saved[noteKey] as string|undefined)??note.note;area.maxLength=20000;area.addEventListener('input',()=>{saved[noteKey]=area.value;persist();});
        label.append(title,area,button(L('pages.comments.save-note'),()=>{void command({kind:'save-note',index:note.index,version:data.version,note:area.value}).then(()=>{delete saved[noteKey];persist();return notes();}).catch(e=>error(commentErrorMessage(e)));}),button(L('pages.comments.discuss'),()=>{void command({kind:'discuss-note',index:note.index,version:data.version}).catch(e=>error(commentErrorMessage(e)));}));q('notes').append(label);}
    }catch(e){if(seq===notesSeq&&context?.object_ref.id===id)error(commentErrorMessage(e));}
  };
  const paintMode=()=>{for(const node of root.querySelectorAll<HTMLElement>('[data-comment-mode]'))node.setAttribute('aria-pressed',String(node.dataset.commentMode===mode));q('discussion').hidden=mode!=='comments';q('notes').hidden=mode!=='notes';q('form').hidden=mode!=='comments'||!context;};
  for(const node of root.querySelectorAll<HTMLElement>('[data-comment-mode]'))node.addEventListener('click',()=>{mode=node.dataset.commentMode!;paintMode();if(mode==='notes')void notes();});
  host.messages.listen(message=>{
    const data=message as UiPageMessage & { context_epoch: number; context: UiSideContext|null; target: CommentOpening; request_id: string; object_id: string; stale?: boolean; error?: string } & CommentCommandResult;
    if(data?.type==='molis:side-context'){
      if(data.context_epoch<epoch)return;const id=context?.object_ref.id;context=data.context;epoch=data.context_epoch;
      if(context?.plugin_id!=='io.molis.work.pages')context=null;
      q('title').textContent=context?.object_ref.title||L('pages.comments.pick-doc');q('notes').hidden=!context||mode!=='notes';q('discussion').hidden=!context||mode!=='comments';q('form').hidden=!context||mode!=='comments';
      if(id!==context?.object_ref.id){notesSeq++;active=context?activePages[context.object_ref.id]||'':'';loaded=null;threads=[];handed='';error('');q('notes').replaceChildren();if(context){paint();void load();if(mode==='notes')void notes();}}
      else if(context){paintDraft();applyOpening();for(const [request_id,waiting] of commands)if(waiting.stale&&waiting.page===context.object_ref.id)ask(request_id,waiting);}
    }else if(data?.type==='molis:side-shown'&&data.target){opening=data.target;applyOpening();}
    else if(data?.type==='molis:side-context-result'){
      const waiting=commands.get(data.request_id);if(!waiting||waiting.page!==data.object_id)return;
      if(data.stale){if(waiting.epoch<epoch)ask(data.request_id,waiting);else waiting.stale=true;return;}
      commands.delete(data.request_id);clearTimeout(waiting.timeout);data.error?waiting.reject(new Error(data.error)):waiting.resolve(data);
    }
  });
  host.messages.send({type:'molis:side-ready'});
}
