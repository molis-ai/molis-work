/** Browser view helpers; server/user strings are escaped before becoming markup. */
export const IM_VIEWS_FACTORY = String.raw`(root) => {
  const q = selector => root.querySelector(selector);
  const escape = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const icon = name => '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  const avatar = member => {
    const name = member?.display_name || '?';
    const tone = [...(member?.id || name)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 5;
    return '<span class="im-avatar" data-tone="' + tone + '" title="' + escape(name) + '">' + escape([...name].slice(-2).join('')) + '</span>';
  };
  const time = value => new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  const day = value => {
    const date = new Date(value);
    return date.toDateString() === new Date().toDateString() ? '今天' : new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric'}).format(date);
  };
  // Skip unchanged chrome so SSE does not destroy the current keyboard target.
  const markup = (node, html) => {
    if(node._imHtml===html&&node.childNodes.length)return;
    const active=node.contains(document.activeElement)?document.activeElement:null;
    const action=active?.dataset.action,id=active?.dataset.id;
    node.innerHTML=html;node._imHtml=html;
    if(action){const replacement=[...node.querySelectorAll('[data-action]')].find(item=>item.dataset.action===action&&item.dataset.id===id);replacement?.focus({preventScroll:true});}
  };
  const roomList = (rooms, selected) => {
    markup(q('[data-room-list]'),rooms.length ? rooms.map(room => '<button class="im-room-item' + (room.id === selected ? ' is-active' : '') + '" type="button" data-action="select-room" data-id="' + escape(room.id) + '" aria-current="' + (room.id === selected ? 'true' : 'false') + '">' + icon('review') + '<span><strong>' + escape(room.title) + '</strong><small>' + escape(room.latest_message || room.member_count+' 位成员 · 还没有消息') + '</small></span></button>').join('') : '<p class="im-muted im-sidebar-empty">创建群聊，或通过邀请加入。</p>');
  };
  const groupHeader = (state, selectedThread, seen, member) => {
    q('[data-room-title]').textContent = state.room.title;
    q('[data-member-count]').textContent = state.members.length + ' 位成员';
    markup(q('[data-member-avatars]'),state.members.slice(0,4).map(avatar).join(''));
    q('[data-action="invite"]').hidden = state.room.owner_id !== member.id;
    markup(q('[data-destination="group"]'),'发到 <strong>' + escape(state.room.title) + '</strong>');
    q('#im-group-input').placeholder='发送消息…';
    markup(q('[data-thread-strip]'),'<span class="im-thread-strip-label">'+icon('git-branch')+'话题</span>' + (state.threads.length ? state.threads.map(thread => '<button type="button" class="im-thread-chip' + (thread.id === selectedThread ? ' is-active' : '') + ((seen[thread.id] ?? 0) < thread.reply_count && thread.id !== selectedThread ? ' is-unread' : '') + '" data-action="select-thread" data-id="' + escape(thread.id) + '" aria-pressed="' + (thread.id === selectedThread) + '"><span>' + escape(thread.title) + '</span><b>' + thread.reply_count + '</b></button>').join('') : '<span class="im-thread-strip-empty">从消息展开话题，在旁边继续聊</span>'));
  };
  const captureScroll = kind => {
    const node=q('[data-stream="'+kind+'"]'),top=node.getBoundingClientRect().top;
    const message=[...node.querySelectorAll('[data-message]')].find(item=>item.getBoundingClientRect().bottom>top);
    return {id:message?.dataset.message,offset:message?message.getBoundingClientRect().top-top:0,bottom:node.scrollHeight-node.scrollTop-node.clientHeight<70};
  };
  const restoreScroll = (kind,anchor) => {
    const node=q('[data-stream="'+kind+'"]');
    if(anchor.bottom){node.scrollTop=node.scrollHeight;return;}
    const message=anchor.id&&node.querySelector('[data-message="'+CSS.escape(anchor.id)+'"]');
    if(message)node.scrollTop+=message.getBoundingClientRect().top-node.getBoundingClientRect().top-anchor.offset;
  };
  const stream = (kind, messages, page, threads, selectedThread, mode = 'preserve', draftSource = '') => {
    const node = q('[data-stream="' + kind + '"]');
    const anchor=captureScroll(kind),oldHeight=node.scrollHeight,oldTop=node.scrollTop;
    const atBottom=oldHeight-oldTop-node.clientHeight<70;
    const oldLast=node.querySelector('.im-message:last-child')?.dataset.message;
    const existing=new Map([...node.children].map(item=>[item.dataset.message||item.dataset.row,item]));
    let lastDay='',previous=null;
    let html=page?.has_more?'<button type="button" class="im-history" data-row="history" data-action="history" data-kind="'+kind+'">加载更早的消息</button>':'';
    for(const message of messages){
      const label=day(message.created_at),sameDay=label===lastDay;
      if(!sameDay){html+='<div class="im-date" data-row="day-'+escape(label)+'">'+label+'</div>';lastDay=label;}
      const related=kind==='group'?threads.filter(thread=>thread.source_message_id===message.id):[];
      const source=related.some(thread=>thread.id===selectedThread)||message.id===draftSource;
      const consecutive=sameDay&&previous?.author.id===message.author.id&&new Date(message.created_at)-new Date(previous.created_at)<300000&&!source;
      html+='<article class="im-message'+(source?' is-source':'')+(consecutive?' is-consecutive':'')+'" data-message="'+escape(message.id)+'">'+avatar(message.author)+'<div class="im-message-copy"><div class="im-message-meta"><strong>'+escape(message.author.display_name)+'</strong><time datetime="'+escape(message.created_at)+'">'+time(message.created_at)+'</time></div><p class="im-message-body">'+escape(message.body)+'</p>';
      if(message.shared_reply){const share=message.shared_reply;html+='<button type="button" class="im-shared-reply" data-action="select-thread" data-id="'+escape(share.thread_id)+'"><small>'+icon('git-branch')+escape(share.thread_title)+' · '+escape(share.author.display_name)+'</small>'+escape(share.body)+'</button>';}
      if(related.length){
        html+='<div class="im-message-actions">';
        for(const thread of related)html+='<button class="im-inline-thread'+(thread.id===selectedThread?' is-active':'')+'" type="button" data-action="select-thread" data-id="'+escape(thread.id)+'">'+icon('git-branch')+'<span>'+escape(thread.title)+'</span><small>'+thread.reply_count+' 条回复'+(thread.id===selectedThread?' · 已展开':'')+'</small>'+icon('chevron-right')+'</button>';
        html+='</div>';
      }
      html+=kind==='group'?'<button class="im-message-action" type="button" data-action="create-thread" data-id="'+escape(message.id)+'">'+icon('git-branch')+'展开话题</button>':'<button class="im-message-action" type="button" data-action="share" data-id="'+escape(message.id)+'">'+icon('share')+'分享到群聊</button>';
      html+='</div></article>';previous=message;
    }
    if(!messages.length)html+='<div class="im-empty" data-row="empty">'+icon(kind==='group'?'message':'git-branch')+(kind==='group'?'还没有消息':'继续这个话题')+'<p>'+(kind==='group'?'发条消息，开始这里的讨论。':'回复会留在这里，所有群成员都能参与。')+'</p></div>';
    const template=document.createElement('template');template.innerHTML=html;
    const keep=new Set();let cursor=node.firstElementChild;
    for(const fresh of [...template.content.children]){
      const id=fresh.dataset.message||fresh.dataset.row,old=existing.get(id);
      let current=fresh;
      if(old && old._imMarkup===fresh.outerHTML)current=old;
      else{
        fresh._imMarkup=fresh.outerHTML;
        if(old){const focused=old.contains(document.activeElement)?document.activeElement?.dataset.action:null;old.replaceWith(fresh);if(cursor===old)cursor=fresh;if(focused)fresh.querySelector('[data-action="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});}
        else if(fresh.dataset.message&&oldLast&&mode!=='older')fresh.classList.add('is-new');
      }
      if(current!==cursor)node.insertBefore(current,cursor);
      keep.add(current);cursor=current.nextElementSibling;
    }
    for(const child of [...node.children])if(!keep.has(child))child.remove();
    if(mode==='latest'||(mode!=='older'&&atBottom)){node.scrollTop=node.scrollHeight;q('[data-action="latest-'+kind+'"]').hidden=true;}
    else if(mode==='older'){node.scrollTop=oldTop+node.scrollHeight-oldHeight;if(anchor.id)restoreScroll(kind,{...anchor,bottom:false});}
    else{node.scrollTop=oldTop;restoreScroll(kind,anchor);if(oldLast&&messages.at(-1)?.id!==oldLast)q('[data-action="latest-'+kind+'"]').hidden=false;}
  };
  const context = (state, roomTitle) => {
    q('[data-thread-title]').textContent=state.thread.title;
    q('[data-thread-scope]').textContent=roomTitle+' · 所有成员可参与';
    markup(q('[data-destination="thread"]'),'回复 <strong>'+escape(state.thread.title)+'</strong>');
    const source=state.context.find(message=>message.id===state.thread.source_message_id),prior=state.context.filter(message=>message.id!==state.thread.source_message_id);
    const contextNode=q('[data-thread-context]');
    const sameThread=contextNode.dataset.thread===state.thread.id;
    const open=sameThread&&contextNode.querySelector('details')?.open;
    const item=message=>'<div class="im-context-message'+(message.id===state.thread.source_message_id?' is-root':'')+'"><small>'+escape(message.author.display_name)+' · '+time(message.created_at)+'</small>'+escape(message.body)+'</div>';
    const html='<div class="im-context-label">'+icon('git-branch')+'来自群聊<button type="button" data-action="source-message" data-id="'+escape(state.thread.source_message_id)+'">定位原消息 '+icon('chevron-right')+'</button></div>'+(source?item(source):'')+(prior.length?'<details'+(open?' open':'')+'><summary>'+icon('chevron-down')+'查看 '+prior.length+' 条相关上文</summary>'+prior.map(item).join('')+'</details>':'');
    markup(contextNode,html);contextNode.dataset.thread=state.thread.id;
  };
  return { q, escape, icon, avatar, time, roomList, groupHeader, stream, context, captureScroll, restoreScroll };
}`;
