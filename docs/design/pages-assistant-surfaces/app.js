(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  const icon = name => '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  const icons = (root = document) => $$("[data-icon]", root).forEach(node => node.innerHTML = icon(node.dataset.icon));
  $("#icons").innerHTML = window.sliceIcons;
  const KEY = "molis-review.pages-assistant-surfaces.v1";
  let stored = null, storageFailed = false, resetting = false;
  try { stored = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { storageFailed = true; }
  const state = stored?.version === 1 ? stored : {
    version:1, doc:"launch", active:"launch", side:true, sideTab:"context", mode:"comments",
    selected:"t1", threads:structuredClone(window.sliceData.threads),
    notes:{launch:"草稿、阅读位置和执行进度应分别保留。展开只改变展示位置。", research:"下一轮访谈记录实际切换次数。"},
    assistantMessages:structuredClone(window.sliceData.assistant), assistantDraft:"", assistantPlace:"float",
    assistantOpen:false, assistantTab:false, theme:"light"
  };
  state.threads.forEach(thread => { if(thread.run?.status === "running") thread.run.status = "interrupted"; });
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { if (!storageFailed) toast("浏览器未能保存草稿，请保持当前页面打开。"); storageFailed = true; }
  };
  let toastTimer, selectedText = "", assistantTimer = null, assistantBusy = false, contextFallback = false;
  const timers = new Map(), scrolls = new Map();
  const toast = message => { clearTimeout(toastTimer); $("#toast").textContent=message; $("#toast").hidden=false; toastTimer=setTimeout(() => $("#toast").hidden=true, 3500); };
  const currentThreads = () => state.threads.filter(thread => thread.doc === state.doc);
  const threadById = id => state.threads.find(thread => thread.id === id);
  const persistScroll = () => {
    if(!$("#pages-view").hidden) scrolls.set(state.doc, $("#document-scroll").scrollTop);
  };
  function renderTabs() {
    $("#workspace-tabs").innerHTML = ["launch","research"].map(doc =>
      '<button class="workspace-tab" role="tab" aria-selected="' + (state.active === doc) + '" data-doc="' + doc + '">' + icon("file") + '<span>' + window.sliceData[doc].title + '</span><small>Pages</small></button>'
    ).join("") + (state.assistantTab ? '<button class="workspace-tab" role="tab" aria-selected="' + (state.active === "assistant") + '" data-action="assistant-tab">' + icon("sparkles") + '<span>梳理发布方案</span></button><button class="icon-button tab-close" data-action="assistant-tab-close" aria-label="关闭助理标签">' + icon("x") + '</button>' : "");
    $$(".directory-item").forEach(button => button.classList.toggle("active",button.dataset.doc === state.doc));
    $$('#workspace-tabs [role="tab"]').forEach(button => button.tabIndex=button.getAttribute("aria-selected")==="true"?0:-1);
    const selected=$('#workspace-tabs [aria-selected="true"]');
    if(selected)selected.scrollIntoView({block:"nearest",inline:"nearest"});
  }
  function renderDocument() {
    const doc = window.sliceData[state.doc];
    $("#prose").innerHTML=doc.html; icons($("#prose"));
    $("#breadcrumb").textContent=doc.subtitle;
    $("#word-count").textContent=doc.count;
    $("#comment-count").textContent=currentThreads().length;
    $("#document-scroll").scrollTop=scrolls.get(state.doc) || 0;
  }
  function paintShell() {
    document.documentElement.dataset.theme=state.theme;
    $("#desk").classList.toggle("side-closed", !state.side);
    $("#pages-view").hidden=state.active === "assistant";
    $("#assistant-stage").hidden=state.active !== "assistant";
    $("#context-tab").hidden=state.active === "assistant";
    $$("[data-side]").forEach(button => {
      button.setAttribute("aria-selected",String(button.dataset.side === state.sideTab));
      button.tabIndex=button.dataset.side === state.sideTab?0:-1;
    });
    $("#dock-hint").textContent=state.assistantPlace === "stage" ? "回到「梳理发布方案」" : "问问个人助理，或继续上次的工作…";
    renderTabs();
  }
  function switchDoc(doc) {
    persistScroll(); state.doc=doc; state.active=doc;
    selectedText="";$("#selection-comment").hidden=true;
    if(contextFallback){state.sideTab="context";contextFallback=false;}
    if(state.assistantPlace === "stage") $("#assistant").hidden=true;
    renderDocument(); paintShell(); renderSide(); save();
  }
  function messageMarkup(message, thread) {
    const assistant = message.author === "assistant";
    const parent = message.replyTo && thread.messages.find(item => item.id === message.replyTo);
    return '<div class="message ' + (assistant ? "assistant-reply" : "") + '"><div class="message-head"><span class="avatar">' + (assistant ? icon("sparkles") : "骏") + '</span><strong>' + (assistant ? "个人助理" : "一骏") + '</strong>' + (assistant ? '<small>模拟</small>' : "") + '<time>本次讨论</time></div>' + (parent ? '<div class="reply-target">回应：' + escape(parent.body.slice(0,38)) + '…</div>' : "") + '<p class="message-body">' + escape(message.body) + '</p><button class="reply-message" data-reply="' + message.id + '" data-thread-id="' + thread.id + '">回复这条</button></div>';
  }
  function runMarkup(thread) {
    const run=thread.run;
    if(!run) return "";
    if(run.status === "running") return '<div class="run-state" role="status"><span class="pulse"></span>个人助理正在回复…<button data-stop="' + thread.id + '">停止</button></div>';
    if(run.status === "completed") return "";
    const text={failed:"模拟连接失败，请求已保留。",stopped:"已停止，未追加助理回复。",interrupted:"上次模拟已中断，未自动重跑。"}[run.status];
    return '<div class="run-state error" role="status">' + text + '<button data-retry="' + thread.id + '">重试回复</button></div>';
  }
  function threadMarkup(thread) {
    const replying = thread.replyTo && thread.messages.find(message => message.id === thread.replyTo);
    return '<section class="thread ' + (state.selected === thread.id ? "selected" : "") + '" data-thread-row="' + thread.id + '"><button class="quote" data-locate="' + thread.id + '">' + escape(thread.quote) + '</button>' +
      thread.messages.map(message => messageMarkup(message,thread)).join("") + runMarkup(thread) +
      '<form class="reply-box" data-reply-form="' + thread.id + '">' +
      (replying ? '<div class="reply-target">回复 ' + escape(replying.body.slice(0,30)) + ' <button type="button" data-clear-reply="' + thread.id + '" aria-label="取消回复对象">×</button></div>' : "") +
      '<textarea rows="2" aria-label="回复评论 ' + thread.id + '" data-draft="' + thread.id + '" placeholder="留下想法，或邀请助理加入…">' + escape(thread.draft) + '</textarea>' +
      '<div class="composer-bottom"><button type="button" class="ask-toggle" aria-pressed="' + thread.ask + '" data-ask="' + thread.id + '">@个人助理</button><button class="primary reply-send" type="submit"' + (thread.ask && thread.run?.status === "running" ? " disabled" : "") + '>' + (thread.ask ? "发送并请助理回复" : "发送") + '</button></div>' +
      (thread.ask ? '<div class="context-receipt">读取「' + window.sliceData[thread.doc].title + '」正文与本线程 · 回复留在这里</div>' : "") + '</form></section>';
  }
  function renderSide() {
    const oldScroll=$(".thread-scroll")?.scrollTop || 0;
    const focus=document.activeElement?.dataset.draft;
    const caret=focus ? document.activeElement.selectionStart : null;
    if(state.sideTab === "context" && state.active === "assistant"){state.sideTab="discussion";contextFallback=true;}
    paintShell();
    if(state.sideTab === "context") {
      $("#side-content").innerHTML='<div class="context-head"><h2>' + window.sliceData[state.doc].title + '</h2><p>跟随当前 Page · 讨论始终留在原文旁</p></div><div class="context-modes"><button class="' + (state.mode === "comments" ? "active" : "") + '" data-mode="comments">评论 <span class="count">' + currentThreads().length + '</span></button><button class="' + (state.mode === "notes" ? "active" : "") + '" data-mode="notes">备注 <span class="count">1</span></button></div><div class="thread-scroll">' +
        (state.mode === "comments" ? currentThreads().map(threadMarkup).join("") + '<button class="add-thread" data-action="comment-page">' + icon("plus") + '评论整篇 Page</button>' :
          '<div class="note-card"><h3>段落备注</h3><button class="quote" data-action="note-locate">' + (state.doc === "launch" ? "无论从哪里继续，都应保留原来的材料、问题和进度。" : "下一次访谈") + '</button><textarea rows="5" id="note-input" aria-label="当前段落备注">' + escape(state.notes[state.doc]) + '</textarea><p class="note-foot">自动保存在此浏览器 · 备注不触发助理</p><button class="add-thread" data-action="discuss-note">' + icon("message") + '就这段发起讨论</button></div>') + '</div>';
    } else if(state.sideTab === "discussion") {
      $("#side-content").innerHTML='<div class="context-head"><h2>项目讨论</h2><p>产品工作室 · 常驻视图，不随文档切换</p></div><div class="empty-state"><span class="avatar">骏</span><h3>今天先把一件小事做完整</h3><p>正文里的讨论留在 Pages 评论中。这里用于项目层面的交流。</p><p class="muted">此切片仅展示常驻视图，不模拟群聊发送。</p></div>';
    } else {
      $("#side-content").innerHTML='<div class="context-head"><h2>Shelf</h2><p>随手留下，工作时再拿出来</p></div><div class="thread-scroll"><div class="shelf-item"><strong>第一次使用 · 参考材料</strong><p>访谈笔记与观察问题 · 示例</p></div><div class="shelf-item"><strong>让讨论留在原处</strong><p>交互设计摘录 · 示例</p></div><p class="note-foot">切片展示内容；不连接真实 Shelf。</p></div>';
    }
    if($(".thread-scroll")) $(".thread-scroll").scrollTop=oldScroll;
    if(focus && $('[data-draft="' + focus + '"]')) {
      const input=$('[data-draft="' + focus + '"]'); input.focus({preventScroll:true}); input.setSelectionRange(caret,caret);
    }
  }
  function openThread(id, focus = true) {
    const thread=threadById(id); if(!thread)return;
    if(state.doc !== thread.doc || state.active === "assistant") switchDoc(thread.doc);
    state.selected=id; state.side=true; state.sideTab="context"; state.mode="comments";
    renderSide(); save();
    const row=$('[data-thread-row="' + id + '"]');
    row.scrollIntoView({block:"nearest",behavior:"smooth"});
    if(focus) $('[data-draft="' + id + '"]').focus({preventScroll:true});
  }
  function addThread(quote, anchor = null) {
    const thread={id:"t-"+crypto.randomUUID(),doc:state.doc,anchor,quote:quote || "整篇 Page · " + window.sliceData[state.doc].title,messages:[],draft:"",ask:false,replyTo:null,run:null};
    state.threads.push(thread); openThread(thread.id); $("#comment-count").textContent=currentThreads().length;
    selectedText=""; $("#selection-comment").hidden=true;
  }
  function locate(id) {
    const thread=threadById(id); if(!thread)return;
    if(state.active !== thread.doc) switchDoc(thread.doc);
    const anchor=thread.anchor && document.getElementById(thread.anchor);
    if(anchor){anchor.scrollIntoView({behavior:"smooth",block:"center"});anchor.classList.remove("focus-anchor");void anchor.offsetWidth;anchor.classList.add("focus-anchor");}
    else if(thread.quote.startsWith("整篇 Page")) $("#document-scroll").scrollTo({top:0,behavior:"smooth"});
    else toast("这条评论保留了所选文字；精确锚点映射将在生产接线时实现。");
  }
  function simulatedReply(thread, question) {
    if(thread.doc === "research") return "可以把这条观察变成一个可记录的问题：\n\n从打开材料到完成任务，参与者一共重复交代了几次背景？每次切换后，需要补充哪些信息？\n\n建议同时记下材料、目标和约束是否被保留。这样能区分“工具切换”与“上下文丢失”造成的停顿。";
    if(thread.quote.includes("十分钟")) return "“十分钟”适合作为观察指标，暂时不宜作为对所有人的承诺。\n\n可以改成：让用户带着已有材料，完成一件小而明确、值得留下的工作。\n\n第一轮重点观察三个信号：有没有得到可用结果、过程是否需要反复解释、下次是否愿意回来继续。时间作为辅助记录。";
    return "这条讨论的重点是连续性。建议分别保留：\n\n• 文档中的阅读位置与未提交评论；\n• 对话中的材料、草稿和待回答问题；\n• 正在执行的任务与原来的回复位置。\n\n展示位置变化不应创建新会话。你提到的“" + question.slice(0,36) + "”，可以加入切换前后的检查。";
  }
  function startReply(thread, message, retry = false) {
    if(thread.run?.status === "running") return;
    const fail=$("#fail-next").checked; $("#fail-next").checked=false;
    const token=crypto.randomUUID();
    thread.run={status:"running",token,messageId:message.id,fail};
    save(); renderSide();
    timers.set(thread.id,setTimeout(() => {
      if(thread.run?.token !== token || thread.run.status !== "running")return;
      thread.run.status=fail ? "failed" : "completed";
      if(!fail) thread.messages.push({id:crypto.randomUUID(),author:"assistant",body:simulatedReply(thread,message.body),replyTo:message.id});
      timers.delete(thread.id);save();
      if(state.doc === thread.doc && state.mode === "comments" && state.sideTab === "context")renderSide();
      else toast("「" + window.sliceData[thread.doc].title + "」的评论" + (fail ? "回复失败，可回原处重试" : "收到助理回复"));
    },2600));
    if(retry)toast("重试原请求，不重复追加用户评论。");
  }
  function sendComment(thread) {
    const body=thread.draft.trim(); if(!body)return;
    if(thread.ask && thread.run?.status === "running"){toast("这条评论里的助理仍在回复。");return;}
    const message={id:crypto.randomUUID(),author:"user",body,replyTo:thread.replyTo};
    thread.messages.push(message);thread.draft="";thread.replyTo=null;
    const ask=thread.ask;thread.ask=false;save();
    if(ask)startReply(thread,message);else renderSide();
  }
  function renderAssistant() {
    const area=$("#assistant-messages"), old=area.scrollTop;
    area.innerHTML=state.assistantMessages.map(message => '<div class="chat-turn ' + message.author + '">' +
      (message.author === "assistant" ? '<div class="chat-label">' + icon("sparkles") + '个人助理 <small>模拟回复</small></div>' : "") + escape(message.body) + '</div>').join("") +
      (assistantBusy ? '<div class="run-state"><span class="pulse"></span>正在整理回复…</div>' : "");
    area.scrollTop=old;
    $("#assistant-input").value=state.assistantDraft;
  }
  function openAssistant() {
    state.assistantOpen=true;
    if(state.assistantPlace === "stage") {state.active="assistant";state.assistantTab=true;renderSide();}
    $("#assistant").hidden=false; paintShell(); save(); $("#assistant-input").focus();
  }
  function placeAssistant(stage) {
    const area=$("#assistant-messages"), position=area.scrollTop;
    persistScroll();
    state.assistantPlace=stage ? "stage" : "float";state.assistantTab=stage;state.assistantOpen=true;
    state.active=stage ? "assistant" : state.doc;
    if(!stage && contextFallback){state.sideTab="context";contextFallback=false;}
    (stage ? $("#assistant-stage") : $("#floating-home")).append($("#assistant"));
    $("#assistant").hidden=false;
    $("#assistant-place").setAttribute("aria-label",stage ? "收回底部" : "在主区展开");
    $("#assistant-place").title=stage ? "收回底部" : "在主区展开";
    $("#assistant-place").innerHTML=icon(stage ? "minimize" : "maximize");
    renderSide(); paintShell(); area.scrollTop=position;save();
  }
  function closeAssistantTab() {
    placeAssistant(false);state.assistantOpen=false;$("#assistant").hidden=true;save();
  }
  document.addEventListener("input",event => {
    const target=event.target;
    if(target.dataset.draft)threadById(target.dataset.draft).draft=target.value;
    if(target.id === "note-input")state.notes[state.doc]=target.value;
    if(target.id === "assistant-input")state.assistantDraft=target.value;
    save();
  });
  document.addEventListener("submit",event => {
    const id=event.target.dataset.replyForm;
    if(id){event.preventDefault();sendComment(threadById(id));}
  });
  $("#assistant-form").addEventListener("submit",event => {
    event.preventDefault();const body=state.assistantDraft.trim();if(!body || assistantBusy)return;
    state.assistantMessages.push({author:"user",body});state.assistantDraft="";assistantBusy=true;
    renderAssistant();save();$("#assistant-status").textContent="模拟回复中 · 切换展示位置不会中断";
    assistantTimer=setTimeout(() => {
      state.assistantMessages.push({author:"assistant",body:"可以从这篇文稿里的真实问题开始。先在评论里邀请助理，把回答留在原处；再切换文档，检查草稿和回复是否仍属于原线程。\n\n这条全局对话会继续保留「第一次使用」作为材料。展开、收回或切换标签，都不会替换这份上下文。"});
      assistantBusy=false;renderAssistant();save();$("#assistant-status").textContent="模拟回复 · 不修改正文";
    },2200);
  });
  document.addEventListener("click",event => {
    const button=event.target.closest("button");if(!button)return;
    if(button.dataset.doc){switchDoc(button.dataset.doc);return;}
    if(button.dataset.thread){openThread(button.dataset.thread);return;}
    if(button.dataset.side){state.sideTab=button.dataset.side;contextFallback=false;renderSide();save();return;}
    if(button.dataset.mode){state.mode=button.dataset.mode;renderSide();save();return;}
    if(button.dataset.ask){const thread=threadById(button.dataset.ask);thread.ask=!thread.ask;renderSide();save();return;}
    if(button.dataset.locate){locate(button.dataset.locate);return;}
    if(button.dataset.reply){const thread=threadById(button.dataset.threadId);thread.replyTo=button.dataset.reply;openThread(thread.id);return;}
    if(button.dataset.clearReply){threadById(button.dataset.clearReply).replyTo=null;renderSide();save();return;}
    if(button.dataset.stop){const thread=threadById(button.dataset.stop);clearTimeout(timers.get(thread.id));thread.run.status="stopped";renderSide();save();return;}
    if(button.dataset.retry){const thread=threadById(button.dataset.retry);const message=thread.messages.find(item=>item.id===thread.run.messageId);if(message)startReply(thread,message,true);return;}
    switch(button.dataset.action){
      case "theme":state.theme=state.theme==="light"?"dark":"light";paintShell();save();break;
      case "lab":$("#lab").hidden=!$("#lab").hidden;break;
      case "reset-demo":
        try{resetting=true;localStorage.removeItem(KEY);location.reload();}
        catch{resetting=false;toast("浏览器未能清除示例存储，请检查存储权限。");}
        break;
      case "side-close":state.side=false;paintShell();save();break;
      case "side-toggle":state.side=!state.side;paintShell();save();break;
      case "shelf":state.side=true;state.sideTab="shelf";contextFallback=false;renderSide();save();break;
      case "comment-page":addThread();break;
      case "comment-selection":addThread(selectedText);break;
      case "note":state.side=true;state.sideTab="context";state.mode="notes";renderSide();save();break;
      case "note-locate":{const anchor=$("#anchor-continuity");if(anchor)anchor.scrollIntoView({block:"center"});break;}
      case "discuss-note":addThread(state.doc==="launch"?"无论从哪里继续，都应保留原来的材料、问题和进度。":"下一次访谈",state.doc==="launch"?"anchor-continuity":null);break;
      case "assistant-open":case "assistant-tab":openAssistant();break;
      case "assistant-place":placeAssistant(state.assistantPlace!=="stage");break;
      case "assistant-tab-close":closeAssistantTab();break;
      case "assistant-close":if(state.assistantPlace==="stage")closeAssistantTab();else{state.assistantOpen=false;$("#assistant").hidden=true;save();}break;
    }
  });
  document.addEventListener("keydown",event => {
    if(event.isComposing || event.keyCode === 229)return;
    if(event.target.getAttribute("role")==="tab" && ["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){
      event.preventDefault();
      const group=event.target.closest('[role="tablist"]'),items=$$('[role="tab"]',group).filter(item=>!item.hidden);
      const index=items.indexOf(event.target),step=event.key==="ArrowRight"?1:-1;
      const next=event.key==="Home"?0:event.key==="End"?items.length-1:(index+step+items.length)%items.length;
      const doc=items[next].dataset.doc,side=items[next].dataset.side;
      items[next].click();
      const selector=doc?'#workspace-tabs [data-doc="'+doc+'"]':side?'[data-side="'+side+'"]':'#workspace-tabs [data-action="assistant-tab"]';
      $(selector)?.focus({preventScroll:true});return;
    }
    if((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==="j"){event.preventDefault();openAssistant();}
    if(event.key === "Escape"){
      if(!$("#lab").hidden){$("#lab").hidden=true;return;}
      if(!$("#selection-comment").hidden){$("#selection-comment").hidden=true;return;}
      if(state.assistantPlace==="float" && state.assistantOpen){state.assistantOpen=false;$("#assistant").hidden=true;save();$('[data-action="assistant-open"]').focus();}
    }
    if((event.metaKey || event.ctrlKey) && event.key==="Enter" && event.target.tagName==="TEXTAREA"){event.preventDefault();event.target.closest("form")?.requestSubmit();}
  });
  $("#prose").addEventListener("mouseup",() => {
    const selection=getSelection();
    if(!selection?.rangeCount || selection.isCollapsed || !$("#prose").contains(selection.anchorNode) || !$("#prose").contains(selection.focusNode))return;
    selectedText=selection.toString().trim();if(!selectedText)return;
    const rect=selection.getRangeAt(0).getBoundingClientRect(), button=$("#selection-comment");
    button.style.left=Math.max(8,Math.min(rect.left,innerWidth-180))+"px";
    button.style.top=Math.max(48,rect.top-43)+"px";button.hidden=false;
  });
  document.addEventListener("pointerdown",event => {if(!event.target.closest("#selection-comment") && !event.target.closest("#prose"))$("#selection-comment").hidden=true;});
  $("#divider").addEventListener("pointerdown",event => {
    if(innerWidth<=760)return;
    const grip=event.currentTarget;grip.setPointerCapture(event.pointerId);
    const move=ev=>document.documentElement.style.setProperty("--side-width",Math.max(310,Math.min(innerWidth*.48,innerWidth-ev.clientX-18))+"px");
    const end=()=>{grip.removeEventListener("pointermove",move);grip.removeEventListener("pointerup",end);};
    grip.addEventListener("pointermove",move);grip.addEventListener("pointerup",end);
  });
  $("#divider").addEventListener("keydown",event => {
    if(!["ArrowLeft","ArrowRight"].includes(event.key))return;
    event.preventDefault();const width=$("#side-sheet").getBoundingClientRect().width;
    document.documentElement.style.setProperty("--side-width",Math.max(310,Math.min(innerWidth*.48,width+(event.key==="ArrowLeft"?20:-20)))+"px");
  });
  icons();renderDocument();renderAssistant();renderSide();
  if(state.assistantPlace==="stage"){
    const active=state.active;placeAssistant(true);
    if(active!=="assistant")switchDoc(active);
  }
  else $("#assistant").hidden=!state.assistantOpen;
  if(storageFailed)toast("浏览器存储不可用；本次内容仅保留在打开的页面内。");
  window.addEventListener("pagehide",()=>{if(!resetting)save();clearTimeout(assistantTimer);});
})();
