import { IM_VIEWS_FACTORY } from "./views.js";
import { THEME_BOOTSTRAP_SCRIPT } from "@molis-ai/molis-work-design-system";

/** Browser-owned transient UI state only. Shared facts always come from the Server. */
export const IM_CLIENT_SCRIPT = THEME_BOOTSTRAP_SCRIPT + String.raw`(() => {
  'use strict';
  const root = document.querySelector('[data-im-app]');
  if (!root) return;
  const v = (${IM_VIEWS_FACTORY})(root), { q, escape: e, icon } = v;
  const dialog = document.querySelector('[data-dialog]');
  const dialogBody = dialog.querySelector('[data-dialog-body]');
  let member = null, rooms = [], roomState = null, threadState = null, roomId = '', threadId = '';
  let groupMessages = [], threadMessages = [], groupPage = null, threadPage = null;
  let events = null, epoch = 0, refreshing = false, refreshAgain = false, refreshTimer = null, toastTimer = null;
  let threadDraft = null, closeTimer = null, threadTrigger = null;
  let draftMap = {}, seen = {}, busyTargets = new Set(), inviteToken = '', dialogVersion = 0, authLost = false;
  const storage = {
    read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  };
  const key = suffix => 'molis-im:' + member.id + ':' + suffix;
  const target = kind => kind === 'thread' ? threadId && roomId + '/' + threadId : roomId;
  const formFor = kind => q('[data-composer="' + kind + '"]');
  const inputFor = kind => formFor(kind).querySelector('textarea');
  const pathFor = (room, thread = '') => '/rooms/' + encodeURIComponent(room) + (thread ? '/threads/' + encodeURIComponent(thread) : '');
  const merge = (old, next) => [...new Map([...old,...next].map(message => [message.id,message])).values()].sort((a,b) => a.sequence-b.sequence);
  const toast = message => { const node=q('[data-toast]'); node.textContent=message;node.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.hidden=true,4000); };
  const syncError = message => { const node=q('[data-sync-alert]');node.querySelector('span').textContent=message;node.hidden=!message; };
  const connection = (message, failed = false) => { const node=q('[data-connection]');node.textContent=message;node.classList.toggle('is-offline',failed); };
  const status = (kind, message, error = false) => {const node=q('[data-compose-status="'+kind+'"]');node.textContent=message;node.classList.toggle('is-error',error);};
  async function api(path, body) {
    let response;
    try { response=await fetch('/im/api'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)}); }
    catch { const error=new Error('暂时无法确认结果，请重试连接。');error.uncertain=true;throw error; }
    let value;try {value=await response.json();}catch {throw new Error('服务返回了无法读取的响应，请重新连接。');}
    if(!response.ok){const error=new Error(value.error||'暂时无法完成，请重试。');error.code=value.code;error.status=response.status;if(response.status===401){authLost=true;syncComposer('group');syncComposer('thread');syncError('身份连接已失效，请重新连接。已输入的内容会保留。');}throw error;}
    return value;
  }
  async function latest(path, existing, version) {
    const page=await api(path+'/messages');
    let batch=page, messages=page.messages;
    const boundary=existing.at(-1)?.sequence;
    // Catch up through every missing page after a long disconnect, not only the newest page.
    while(boundary && batch.has_more && batch.messages[0]?.sequence>boundary && epoch===version){
      batch=await api(path+'/messages?before='+batch.next_before);
      messages=merge(batch.messages,messages);
    }
    return {...page,messages};
  }
  const saveDrafts = () => member && storage.write(key('drafts'),draftMap);
  function syncComposer(kind) {
    const form=formFor(kind), busy=busyTargets.has(target(kind));
    const loaded=!authLost && roomState?.room.id===roomId && (kind==='group'||threadState?.thread.id===threadId);
    form.querySelector('button[type=submit]').disabled=busy||!loaded||!inputFor(kind).value.trim()||!target(kind);
    inputFor(kind).disabled=busy||!loaded;
  }
  function resizeInput(kind) {
    const input=inputFor(kind);input.style.height='auto';input.style.height=Math.min(input.scrollHeight,matchMedia('(max-width:640px)').matches?85:130)+'px';
  }
  function restoreDraft(kind) {
    inputFor(kind).value=draftMap[target(kind)]?.body||'';
    status(kind,'');syncComposer(kind);resizeInput(kind);
  }
  function readDraft(kind) {
    const id=target(kind);if(!id)return;
    const body=inputFor(kind).value;
    const prior=draftMap[id];
    draftMap[id]={body,client_id:prior?.body===body?prior.client_id:crypto.randomUUID()};saveDrafts();syncComposer(kind);resizeInput(kind);
  }
  function render(kind, mode='preserve') {
    v.stream(kind,kind==='group'?groupMessages:threadMessages,kind==='group'?groupPage:threadPage,roomState?.threads||[],threadId,mode,threadDraft?.source_message_id||'');
  }
  function updateHeader() {
    if(!roomState)return;
    if(threadState){seen[threadId]=threadState.thread.reply_count;storage.write(key('seen'),seen);}
    v.groupHeader(roomState,threadId,seen,member);v.roomList(rooms,roomId);
  }
  function connectEvents() {
    events?.close();events=null;if(!roomId)return;
    const captured=roomId;
    events=new EventSource('/im/api'+pathFor(roomId)+'/events');
    const update=()=>{if(captured!==roomId)return;connection('已连接');scheduleRefresh();};
    events.addEventListener('ready',update);events.addEventListener('reset',update);events.addEventListener('change',update);
    events.onmessage=update;events.onopen=update;
    events.addEventListener('revoked',()=>{events?.close();authLost=true;connection('访问已失效',true);syncError('连接或群访问已失效，请重新连接。');roomState=null;syncComposer('group');syncComposer('thread');});
    events.onerror=()=>{if(captured===roomId){connection('重连中',true);scheduleRefresh();}};
  }
  function scheduleRefresh() {
    clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void refresh(),100);
  }
  async function refresh() {
    if(!roomId)return;
    if(refreshing){refreshAgain=true;return;}
    refreshing=true;const version=epoch, r=roomId,t=threadId;
    try{
      const results=await Promise.all([api('/rooms'),api(pathFor(r)),latest(pathFor(r),groupMessages,version),...(t?[api(pathFor(r,t)),latest(pathFor(r,t),threadMessages,version)]:[])]);
      if(version!==epoch)return;
      const groupWasEmpty=groupMessages.length===0,threadWasEmpty=threadMessages.length===0,threadWasUnloaded=!threadState;
      rooms=results[0].rooms;roomState=results[1];groupMessages=merge(groupMessages,results[2].messages);
      if(!groupPage||groupWasEmpty)groupPage=results[2];
      if(t){threadState=results[3];threadMessages=merge(threadMessages,results[4].messages);if(!threadPage||threadWasEmpty)threadPage=results[4];v.context(threadState,roomState.room.title);if(threadWasUnloaded){formFor('thread').hidden=false;restoreDraft('thread');}}
      updateHeader();render('group');if(t)render('thread');syncError('');
    }catch(error){if(version===epoch){connection('同步中断',true);syncError(error.status===403?'你已无法访问这个群聊。': '同步暂时中断，已输入的内容会保留。');}}
    finally{refreshing=false;if(refreshAgain){refreshAgain=false;scheduleRefresh();}}
  }
  async function selectRoom(id) {
    clearTimeout(closeTimer);threadDraft=null;
    const version=++epoch;events?.close();roomId=id;roomState=null;threadId='';threadState=null;groupMessages=[];threadMessages=[];groupPage=null;threadPage=null;
    formFor('group').hidden=true;formFor('thread').hidden=true;syncComposer('group');syncComposer('thread');
    q('[data-room-title]').textContent=rooms.find(room=>room.id===id)?.title||'群聊';q('[data-member-count]').textContent='正在载入…';q('[data-thread-strip]').replaceChildren();q('[data-member-avatars]').replaceChildren();q('[data-action="invite"]').hidden=true;
    q('[data-welcome]').hidden=true;q('[data-conversations]').hidden=false;q('[data-thread-pane]').hidden=true;q('[data-conversations]').classList.remove('has-thread');
    root.classList.remove('show-directory');q('[data-sidebar-scrim]')?.setAttribute('hidden','');
    q('[data-stream="group"]').innerHTML='<p class="im-empty" role="status">正在载入群聊…</p>';
    q('[data-conversations]').classList.add('im-loading');
    try{
      const [state,messages]=await Promise.all([api(pathFor(id)),api(pathFor(id)+'/messages')]);
      if(version!==epoch)return;roomState=state;groupMessages=messages.messages;groupPage=messages;
      updateHeader();render('group','latest');formFor('group').hidden=false;restoreDraft('group');storage.write(key('room'),id);connectEvents();syncError('');
      q('[data-conversations]').classList.remove('im-loading');
      const saved=storage.read(key('thread:'+id),'');if(state.threads.some(thread=>thread.id===saved))await selectThread(saved,false);
    }catch(error){if(version===epoch){q('[data-stream="group"]').innerHTML='<div class="im-empty">'+e(error.message)+'<p><button class="im-secondary" type="button" data-action="retry">重试</button></p></div>';syncError(error.message);}}
    finally{if(version===epoch)q('[data-conversations]').classList.remove('im-loading');}
  }
  function revealThread() {
    clearTimeout(closeTimer);
    const pane=q('[data-thread-pane]'),wasOpen=q('[data-conversations]').classList.contains('has-thread');
    pane.hidden=false;pane.classList.remove('is-entering','is-switching');
    void pane.offsetWidth;pane.classList.add(wasOpen?'is-switching':'is-entering');
    q('[data-conversations]').classList.add('has-thread');
  }
  async function selectThread(id, focus = true) {
    if(!roomState||roomState.room.id!==roomId)return;
    if(threadId===id&&threadState){if(focus)inputFor('thread').focus({preventScroll:true});return;}
    if(focus)threadTrigger=document.activeElement;
    const anchor=v.captureScroll('group');threadDraft=null;
    const version=++epoch;threadId=id;threadState=null;threadMessages=[];threadPage=null;
    revealThread();
    q('[data-thread-title]').textContent=roomState.threads.find(t=>t.id===id)?.title||'话题';
    q('[data-thread-scope]').textContent=roomState.room.title+' · 所有成员可参与';
    q('[data-thread-context]').replaceChildren();q('[data-stream="thread"]').innerHTML='<p class="im-empty" role="status">正在载入讨论…</p>';
    formFor('thread').hidden=true;updateHeader();render('group');v.restoreScroll('group',anchor);
    setTimeout(()=>{if(version===epoch)v.restoreScroll('group',anchor);},240);
    try{
      const [state,messages]=await Promise.all([api(pathFor(roomId,id)),api(pathFor(roomId,id)+'/messages')]);
      if(version!==epoch)return;threadState=state;threadMessages=messages.messages;threadPage=messages;
      v.context(state,roomState.room.title);formFor('thread').hidden=false;restoreDraft('thread');updateHeader();render('thread','latest');
      storage.write(key('thread:'+roomId),id);
      setTimeout(()=>{if(version===epoch)resizeInput('thread');},240);
      if(focus&&!matchMedia('(max-width:640px)').matches)inputFor('thread').focus({preventScroll:true});
    }catch(error){if(version===epoch)q('[data-stream="thread"]').innerHTML='<div class="im-empty">'+e(error.message)+'<p><button type="button" class="im-secondary" data-action="select-thread" data-id="'+e(id)+'">重试</button></p></div>';}
  }
  function closeThread() {
    const anchor=v.captureScroll('group'),previous=threadId;const version=++epoch;
    threadId='';threadState=null;threadDraft=null;storage.write(key('thread:'+roomId),'');
    q('[data-conversations]').classList.remove('has-thread');updateHeader();render('group');
    const finish=()=>{if(version!==epoch)return;q('[data-thread-pane]').hidden=true;v.restoreScroll('group',anchor);};
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)finish();else closeTimer=setTimeout(finish,230);
    const fallback=previous?q('[data-thread-strip] [data-id="'+CSS.escape(previous)+'"]'):inputFor('group');
    (threadTrigger?.isConnected?threadTrigger:fallback)?.focus({preventScroll:true});
  }
  async function locateSource(id) {
    const version=epoch;
    let message=q('[data-stream="group"] [data-message="'+CSS.escape(id)+'"]');
    try{
      while(!message&&groupPage?.has_more&&version===epoch){
        const page=await api(pathFor(roomId)+'/messages?before='+groupPage.next_before);
        if(version!==epoch)return;groupPage=page;groupMessages=merge(groupMessages,page.messages);render('group','older');
        message=q('[data-stream="group"] [data-message="'+CSS.escape(id)+'"]');
      }
      if(!message)return;
      message.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      message.classList.remove('im-source-flash');void message.offsetWidth;message.classList.add('im-source-flash');
      setTimeout(()=>message.classList.remove('im-source-flash'),1200);
    }catch(error){toast(error.message);}
  }
  async function send(kind) {
    const id=target(kind), r=roomId,t=kind==='thread'?threadId:'';
    if(!id||authLost||busyTargets.has(id)||roomState?.room.id!==r||(kind==='thread'&&threadState?.thread.id!==t))return;
    readDraft(kind);const draft={...draftMap[id]};if(!draft.body?.trim())return;
    const wasFocused=document.activeElement===inputFor(kind);
    busyTargets.add(id);syncComposer(kind);status(kind,'正在发送…');
    try{
      const result=await api(pathFor(r,t)+'/messages',draft);
      delete draftMap[id];saveDrafts();
      if(id===target(kind)){
        inputFor(kind).value='';resizeInput(kind);status(kind,'已发送');setTimeout(()=>{if(id===target(kind)&&q('[data-compose-status="'+kind+'"]').textContent==='已发送')status(kind,'');},1800);
        if(kind==='group')groupMessages=merge(groupMessages,[result.message]);else threadMessages=merge(threadMessages,[result.message]);
        render(kind,'latest');
      }
      scheduleRefresh();
    }catch(error){if(id===target(kind))status(kind,error.uncertain?'未能确认发送结果。原文已保留，再次发送不会重复。':error.message,true);}
    finally{busyTargets.delete(id);syncComposer(kind);if(wasFocused&&id===target(kind)&&!dialog.open&&document.activeElement===document.body)inputFor(kind).focus({preventScroll:true});}
  }
  async function history(kind) {
    const page=kind==='group'?groupPage:threadPage;if(!page?.has_more)return;
    const version=epoch, node=q('[data-stream="'+kind+'"]'),button=node.querySelector('[data-action="history"]');
    button.disabled=true;button.textContent='正在载入…';
    try{
      const result=await api(pathFor(roomId,kind==='thread'?threadId:'')+'/messages?before='+page.next_before);
      if(version!==epoch)return;
      if(kind==='group'){groupPage=result;groupMessages=merge(groupMessages,result.messages);}else{threadPage=result;threadMessages=merge(threadMessages,result.messages);}
      render(kind,'older');
    }catch(error){toast(error.message);button.textContent='重试加载更早的消息';}
    finally{if(button.isConnected){button.disabled=false;if(button.textContent==='正在载入…')button.textContent='加载更早的消息';}}
  }
  function openDialog(title, html, submit) {
    const version=++dialogVersion;dialog.dataset.room=roomId;
    dialog.querySelector('[data-dialog-title]').textContent=title;dialogBody.innerHTML=html;dialog.showModal();
    const current=()=>dialog.open&&dialogVersion===version;
    const form=dialogBody.querySelector('form');if(!form)return;
    let pending=null,busy=false;
    form.onsubmit=async event=>{
      event.preventDefault();if(busy)return;
      const values=Object.fromEntries(new FormData(form));
      const signature=JSON.stringify(values);if(!pending||pending.signature!==signature)pending={signature,client_id:crypto.randomUUID()};
      const err=form.querySelector('[data-form-error]');err.textContent='';busy=true;
      const controls=[...form.querySelectorAll('button,input,textarea')];controls.forEach(control=>control.disabled=true);
      try{await submit({...values,client_id:pending.client_id},current);}
      catch(error){err.textContent=error.message;}
      finally{busy=false;controls.forEach(control=>control.disabled=false);}
    };
  }
  const actions = label => '<p class="im-form-error" data-form-error role="alert"></p><div class="im-form-actions"><button class="im-secondary" type="button" data-action="close-dialog">取消</button><button class="im-primary" type="submit">'+label+'</button></div>';
  function newRoom() {
    if(!member){toast('先设置你的名字，再创建群聊。');return;}
    openDialog('创建群聊','<form><p>成员共享消息和所有 Thread，在同一个空间里讨论。</p><label class="im-field">群聊名称<input name="title" maxlength="80" required placeholder="例如：产品共创" autofocus></label>'+actions('创建群聊')+'</form>',async(body,current)=>{const result=await api('/rooms',body);rooms=(await api('/rooms')).rooms;v.roomList(rooms,roomId);if(!current())return;dialog.close();await selectRoom(result.room.id);});
  }
  function parseInvite(value) {
    const raw=String(value||'').trim();try{const url=new URL(raw);return new URLSearchParams(url.hash.slice(1)).get('invite')||url.searchParams.get('invite')||raw;}catch{return raw;}
  }
  function joinRoom() {
    if(!member){toast('先设置你的名字，再加入群聊。');return;}
    openDialog('加入群聊','<form><p>粘贴群成员发来的邀请链接。</p><label class="im-field">邀请链接<input name="token" value="'+e(inviteToken)+'" required autocomplete="off" autofocus></label>'+actions('加入群聊')+'</form>',async(body,current)=>{const result=await api('/join',{...body,token:parseInvite(body.token)});inviteToken='';window.history.replaceState(null,'',location.pathname+location.search.replace(/([?&])invite=[^&]*&?/,'$1').replace(/[?&]$/,''));rooms=(await api('/rooms')).rooms;v.roomList(rooms,roomId);if(!current())return;dialog.close();await selectRoom(result.room.id);});
  }
  function newThread(messageId) {
    const message=groupMessages.find(item=>item.id===messageId);if(!message)return;
    threadTrigger=document.activeElement;const r=roomId,version=++epoch,anchor=v.captureScroll('group');
    threadId='';threadState=null;threadDraft={source_message_id:messageId};
    revealThread();formFor('thread').hidden=true;
    v.context({thread:{id:'draft:'+messageId,title:'展开新话题',source_message_id:messageId},context:groupMessages.slice(Math.max(0,groupMessages.indexOf(message)-3),groupMessages.indexOf(message)+1)},roomState.room.title);
    const stream=q('[data-stream="thread"]');
    stream.innerHTML='<form class="im-thread-setup"><p>从这条消息接着聊。群里的每个人都能看到，也能随时加入。</p><label class="im-field">话题名称<input name="title" maxlength="80" required placeholder="这次想聊什么？" autocomplete="off"></label><p class="im-form-error" data-form-error role="alert"></p><div class="im-form-actions"><button class="im-secondary" type="button" data-action="close-thread">取消</button><button class="im-primary" type="submit">创建话题 '+icon('chevron-right')+'</button></div></form>';
    updateHeader();render('group');v.restoreScroll('group',anchor);setTimeout(()=>{if(version===epoch)v.restoreScroll('group',anchor);},240);
    const form=stream.querySelector('form');form.elements.title.focus({preventScroll:true});let pending=null,busy=false;
    form.onsubmit=async event=>{
      event.preventDefault();if(busy)return;
      const title=form.elements.title.value;if(!pending||pending.title!==title)pending={title,client_id:crypto.randomUUID()};
      busy=true;const controls=[...form.querySelectorAll('button,input')];controls.forEach(control=>control.disabled=true);form.querySelector('[data-form-error]').textContent='';
      try{
        const result=await api(pathFor(r)+'/threads',{...pending,source_message_id:messageId});
        const state=await api(pathFor(r));if(r!==roomId||version!==epoch)return;
        roomState=state;threadDraft=null;await selectThread(result.thread.id);
      }catch(error){if(version===epoch)form.querySelector('[data-form-error]').textContent=error.message;}
      finally{busy=false;controls.forEach(control=>control.disabled=false);}
    };
  }
  function share(messageId) {
    const reply=threadMessages.find(item=>item.id===messageId);if(!reply)return;
    const r=roomId,t=threadId;
    openDialog('把讨论带回群聊','<form><p>分享到 '+e(roomState.room.title)+'，保留原回复和 Thread 链接。</p><div class="im-context-message">'+e(reply.body)+'</div><label class="im-field">补充一句（可选）<textarea name="body" rows="2" maxlength="12000" placeholder="例如：这次讨论的结论"></textarea></label>'+actions('分享到群聊')+'</form>',async(body,current)=>{const result=await api(pathFor(r,t)+'/share',{...body,message_id:messageId});if(current())dialog.close();if(r===roomId){groupMessages=merge(groupMessages,[result.message]);render('group','latest');scheduleRefresh();}toast('已分享到群聊');});
  }
  async function showInvite() {
    const r=roomId;
    openDialog('邀请成员 · '+roomState.room.title,'<p role="status">正在获取邀请链接…</p>');const version=dialogVersion;
    try{
      const invite=await api(pathFor(r)+'/invite');
      if(!dialog.open||version!==dialogVersion||roomId!==r)return;
      dialogBody.innerHTML='<p>通过这个链接加入群聊后，可以查看群里的消息和全部 Thread。</p><label class="im-field">邀请链接<input class="im-invite-value" readonly value="'+e(invite.url)+'" data-invite-value></label><p class="im-form-error" data-invite-error role="alert"></p><div class="im-form-actions"><button class="im-secondary" type="button" data-action="rotate-invite">更换链接</button><button class="im-primary" type="button" data-action="copy-invite">'+icon('copy')+'复制链接</button></div>';
    }catch(error){if(dialog.open&&version===dialogVersion&&roomId===r)dialogBody.innerHTML='<p class="im-form-error">'+e(error.message)+'</p>';}
  }
  function members() {
    if(!roomState)return;
    openDialog('群成员 · '+roomState.members.length,roomState.members.map(person=>'<div class="im-member-row">'+v.avatar(person)+'<span>'+e(person.display_name)+'</span><small>'+(person.id===roomState.room.owner_id?'创建者':person.id===member.id?'你':'成员')+'</small></div>').join('')+'<p>所有成员共享群聊与全部 Thread。</p>');
  }
  async function startup() {
    connection('连接中');
    try{
      events?.close();const result=await api('/session');member=result.member;authLost=false;
      inviteToken=inviteToken||new URLSearchParams(location.hash.slice(1)).get('invite')||new URLSearchParams(location.search).get('invite')||'';
      if(!member){
        connection('待加入');q('[data-welcome]').hidden=false;q('[data-conversations]').hidden=true;
        q('[data-welcome-body]').innerHTML='<form data-name-form><label class="im-field">你的名字<input name="display_name" maxlength="40" required autocomplete="nickname" placeholder="你的名字"></label><p class="im-form-error" data-form-error role="alert"></p><div class="im-form-actions"><button class="im-primary" type="submit">继续</button></div></form>';
        q('[data-name-form]').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;const name=form.elements.display_name.value;const id=form.dataset.requestName===name&&form.dataset.requestId||crypto.randomUUID();form.dataset.requestId=id;form.dataset.requestName=name;try{await api('/session',{display_name:name,client_id:id});await startup();}catch(error){form.querySelector('[data-form-error]').textContent=error.message;button.disabled=false;}};
        v.roomList([],null);return;
      }
      draftMap=storage.read(key('drafts'),{});seen=storage.read(key('seen'),{});
      q('[data-own-name]').textContent=member.display_name;q('[data-own-avatar]').textContent=[...member.display_name].slice(-2).join('');
      rooms=(await api('/rooms')).rooms;v.roomList(rooms,roomId);connection('已连接');syncError('');
      if(rooms.length){const saved=storage.read(key('room'),'');await selectRoom(rooms.some(room=>room.id===saved)?saved:rooms[0].id);}
      else{
        q('[data-welcome-title]').textContent='从一个群聊开始';q('[data-welcome-copy]').textContent='邀请一起工作的人，把消息、话题和讨论结果留在同一个地方。';
        q('[data-welcome-body]').innerHTML='<div class="im-form-actions"><button class="im-primary" type="button" data-action="create-room">创建群聊</button><button class="im-secondary" type="button" data-action="join">通过邀请加入</button></div>';
      }
      if(inviteToken)joinRoom();
    }catch(error){connection('未连接',true);q('[data-welcome-body]').innerHTML='<p class="im-form-error">'+e(error.message)+'</p><div class="im-form-actions"><button type="button" class="im-primary" data-action="retry">重新连接</button></div>';syncError('群聊服务暂时不可用。');}
  }
  for(const kind of ['group','thread']){
    formFor(kind).addEventListener('submit',event=>{event.preventDefault();void send(kind);});
    inputFor(kind).addEventListener('input',()=>readDraft(kind));
    inputFor(kind).addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();void send(kind);}});
    q('[data-stream="'+kind+'"]').addEventListener('scroll',()=>{const n=q('[data-stream="'+kind+'"]');if(n.scrollHeight-n.scrollTop-n.clientHeight<70)q('[data-action="latest-'+kind+'"]').hidden=true;},{passive:true});
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-action]');if(!button)return;
    const action=button.dataset.action;
    try{
      if(action==='select-room')await selectRoom(button.dataset.id);
      else if(action==='select-thread')await selectThread(button.dataset.id);
      else if(action==='create-room')newRoom();
      else if(action==='join')joinRoom();
      else if(action==='create-thread')newThread(button.dataset.id);
      else if(action==='source-message')await locateSource(button.dataset.id);
      else if(action==='close-thread')closeThread();
      else if(action==='share')share(button.dataset.id);
      else if(action==='history')await history(button.dataset.kind);
      else if(action==='invite')await showInvite();
      else if(action==='members')members();
      else if(action==='close-dialog')dialog.close();
      else if(action==='rooms'){root.classList.toggle('show-directory');q('.im-sidebar-scrim').hidden=!root.classList.contains('show-directory');}
      else if(action==='retry'){if(member&&roomId&&!authLost){await selectRoom(roomId);}else await startup();}
      else if(action==='latest-group'||action==='latest-thread'){const kind=action.slice(7),n=q('[data-stream="'+kind+'"]');n.scrollTop=n.scrollHeight;button.hidden=true;}
      else if(action==='copy-invite'){
        const input=dialogBody.querySelector('[data-invite-value]');try{await navigator.clipboard.writeText(input.value);button.textContent='已复制';}catch{input.focus();input.select();toast('链接已选中，请复制。');}
      }else if(action==='rotate-invite'){
        const r=dialog.dataset.room,version=dialogVersion;button.disabled=true;try{const result=await api(pathFor(r)+'/invite/rotate',{client_id:crypto.randomUUID()});if(dialog.open&&version===dialogVersion&&roomId===r){dialogBody.querySelector('[data-invite-value]').value=result.url;toast('已更换邀请链接，旧链接不再可用');}}catch(error){if(dialog.open&&version===dialogVersion)dialogBody.querySelector('[data-invite-error]').textContent=error.message;}finally{button.disabled=false;}
      }
    }catch(error){toast(error.message);}
  });
  dialog.addEventListener('close',()=>{dialogVersion++;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!dialog.open&&(threadId||threadDraft)){event.preventDefault();closeThread();}});
  addEventListener('resize',()=>{resizeInput('group');resizeInput('thread');});
  addEventListener('online',()=>{connectEvents();scheduleRefresh();});
  addEventListener('offline',()=>connection('已离线',true));
  addEventListener('pagehide',()=>{events?.close();saveDrafts();clearTimeout(refreshTimer);});
  addEventListener('pageshow',event=>{if(event.persisted){connectEvents();scheduleRefresh();}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&roomId)scheduleRefresh();});
  void startup();
})();`;
