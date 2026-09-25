/** Continuous content editing: successful saves never replace the active DOM. */
export const JELLY_CONTENT_CLIENT_SCRIPT = String.raw`
  let editorRevision=0;
  let editorVersion=0;
  let composing=false;
  let focusedBlock='';
  let lastRange=null;
  let draftBlocks=[];
  let savingEditor=false;
  const draftKey=(id)=>'molis-jelly-draft:'+id;
  const readRecovery=(id)=>{try{return JSON.parse(localStorage.getItem(draftKey(id))||'null');}catch{return null;}};
  const writeRecovery=()=>{if(!selected)return;try{localStorage.setItem(draftKey(selected.id),JSON.stringify({id:selected.id,kind:selected.kind,revision:editorRevision,patch:readDraft(),saved_at:new Date().toISOString()}));}catch{}};
  const clearRecovery=(id)=>{try{localStorage.removeItem(draftKey(id));}catch{}};
  const blockText=(note)=>note.blocks.map((block)=>block.text).join('\n');
  const recordFor=(kind,id)=>state?.[kind==='note'?'notes':'inspirations'].find((entry)=>entry.id===id);
  const renderRecords=()=>{
    const records=state[view==='notes'?'notes':'inspirations'].filter((record)=>Boolean(record.archived_at)===archived&&matches(record,view==='notes'?blockText(record):record.raw_text)).sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))||b.updated_at.localeCompare(a.updated_at));
    keepListScroll(()=>{content.innerHTML=records.length?'<div class="jelly-rows">'+records.map((record)=>'<button type="button" class="jelly-row feed-stage-entry directory-list-row'+(selected?.id===record.id?' is-selected':'')+'" data-jelly-record="'+esc(record.id)+'" data-jelly-id="'+esc(record.id)+'"><div class="jelly-row-main"><strong>'+esc(record.title||L('无标题'))+'</strong><p>'+esc((view==='notes'?blockText(record):record.raw_text).replace(/\s+/g,' ').slice(0,180))+'</p></div><div class="jelly-row-meta">'+(record.pinned?glyph('pin'):'')+categoryDot(record.category_id)+'<time>'+esc(dateLabel(record.updated_at.slice(0,10),true))+'</time></div></button>').join('')+'</div>':empty(query?'没有匹配的内容':archived?'还没有归档内容':view==='notes'?'留一页给正在想的事':'先把灵感放在这里',archived?'归档的内容会在这里，可以随时恢复。':view==='notes'?'写下想法，添加任务块，再把它安排到日历。':'收集文字、链接或文件，保留原始内容，再整理成笔记。',archived?'':view==='notes'?'新建笔记':'收集灵感');});
  };
  const newBlock=(kind='paragraph',text='')=>({id:uid(),kind,text,indent:0,completed_at:null,completion_description:''});
  const inlineHtml=(block)=>{
    const spans=block.inline_spans;
    if(!spans?.length||spans.map((span)=>span.text).join('')!==block.text)return esc(block.text);
    return spans.map((span)=>{let html=esc(span.text);for(const mark of span.marks||[]){if(mark==='bold')html='<strong>'+html+'</strong>';if(mark==='italic')html='<em>'+html+'</em>';if(mark==='code')html='<code>'+html+'</code>';}if(span.link_url&&/^https?:\/\//i.test(span.link_url))html='<a href="'+esc(span.link_url)+'" target="_blank" rel="noopener noreferrer">'+html+'</a>';return html;}).join('');
  };
  const blockHtml=(block,index)=>{
    const taskLink=state.task_links.find((link)=>link.note_id===selected?.id&&link.block_id===block.id);
    let lead=block.kind==='task'?'<input type="checkbox" class="mw-check" data-jelly-task-check="'+esc(block.id)+'" aria-label="'+tx('完成任务块')+'" '+(block.completed_at?'checked':'')+'>':block.kind==='bullet'?'<span class="jelly-block-mark">•</span>':block.kind==='numbered'?'<span class="jelly-block-mark">'+(index+1)+'.</span>':'';
    const tools=btn('向上移动','data-jelly-block-up="'+esc(block.id)+'"','chevron-up')+btn('删除段落','data-jelly-block-delete="'+esc(block.id)+'"','x')+(block.kind==='task'?btn(taskLink?'已安排，查看事项':'安排到日历','data-jelly-schedule-block="'+esc(block.id)+'" '+(taskLink?'class="jelly-linked-task"':''),'calendar'):'');
    return '<div class="jelly-block'+(block.completed_at?' is-completed':'')+'" data-jelly-block="'+esc(block.id)+'" data-kind="'+esc(block.kind)+'" style="margin-left:'+Math.min(8,block.indent||0)*18+'px">'+lead+(block.kind==='divider'?'<hr class="jelly-block-divider">':'<div class="jelly-block-text" contenteditable="true" role="textbox" aria-multiline="true" data-jelly-block-text="'+esc(block.id)+'" data-placeholder="'+tx('继续写，或输入 / 选择段落格式')+'" spellcheck="true">'+inlineHtml(block)+'</div>')+'<div class="jelly-block-tools">'+tools+'</div></div>';
  };
  const formatBar=()=>'<div class="jelly-format-bar" role="toolbar" aria-label="'+tx('笔记格式')+'">'+[['paragraph','正文'],['heading1','H1'],['heading2','H2'],['heading3','H3'],['bullet','项目符号'],['numbered','编号'],['task','任务'],['quote','引用'],['code','代码'],['link','链接块'],['divider','分割线']].map(([kind,label])=>btn(label,'data-jelly-format="'+kind+'"')).join('')+btn('粗体','data-jelly-inline="bold"')+btn('斜体','data-jelly-inline="italic"')+btn('行内代码','data-jelly-inline="code"')+btn('链接','data-jelly-inline="link"')+'</div>';
  const noteCategoryChoices=(record)=>state.categories.map((entry)=>'<button type="button" class="mw-btn mw-btn--ghost" data-jelly-record-category="'+esc(entry.id)+'" aria-pressed="'+(record.category_id===entry.id)+'">'+categoryDot(entry.id)+esc(entry.name)+'</button>').join('');
  const openRecord=(kind,id)=>{
    const record=recordFor(kind,id);if(!record)return;
    selected={kind,id};dirty=false;editorVersion=0;editorRevision=record.revision||0;focusedBlock='';lastRange=null;
    root.dataset.expanded='true';workspace.hidden=false;
    $('[data-jelly-editor-heading]').textContent=L(kind==='note'?'笔记':'灵感');
    $('[data-jelly-archive] span').textContent=L(record.archived_at?'恢复':'归档');
    $('[data-jelly-archive]').setAttribute('aria-label',L(record.archived_at?'恢复':'归档'));
    $('[data-jelly-editor-more]').hidden=false;$('[data-jelly-decompose]').hidden=Boolean(record.archived_at);
    $('[data-jelly-delete-note]').hidden=kind!=='note'||!record.archived_at;
    $('[data-jelly-delete-inspiration]').hidden=kind!=='inspiration'||!record.archived_at;
    for(const selector of ['[data-jelly-pin]','[data-jelly-export-note]','[data-jelly-export-note-html]','[data-jelly-import-note]'])$(selector).hidden=kind!=='note';
    const title='<input class="jelly-document-title" data-jelly-record-title value="'+esc(record.title)+'" placeholder="'+tx('无标题')+'" aria-label="'+tx('标题')+'"><div class="jelly-document-meta">'+noteCategoryChoices(record)+'</div>';
    if(kind==='note'){
      draftBlocks=structuredClone(record.blocks.length?record.blocks:[newBlock()]);
      documentEl.innerHTML=title+formatBar()+'<div data-jelly-blocks>'+draftBlocks.map(blockHtml).join('')+'</div>'+btn('添加段落','data-jelly-add-block','plus')+'<div class="jelly-note-backlinks" data-jelly-backlinks></div>';
      renderBacklinks();
    }else{
      documentEl.innerHTML=title+'<label class="jelly-field">'+tx('来源链接')+'<input class="mw-input" data-jelly-source-url type="url" value="'+esc(record.url||'')+'" placeholder="https://"></label>'+(record.file_name?'<p class="jelly-muted">'+tx('原始文件')+' · '+esc(record.file_name)+'</p>':'')+'<label class="jelly-field" style="margin-top:16px">'+tx('原始内容')+'<textarea class="mw-textarea jelly-material-body" data-jelly-raw-text placeholder="'+tx('粘贴原文、链接摘录或突然想到的一句话。')+'">'+esc(record.raw_text)+'</textarea></label><div class="jelly-material-tools">'+btn('导入文件','data-jelly-material-upload','upload')+btn('重新读取来源','data-jelly-source-read','refresh')+btn('转为笔记','data-jelly-convert','note')+btn('提炼摘要','data-jelly-digest','sparkles')+'</div><section class="jelly-digest" data-jelly-digest-content></section>';
      renderDigest(record);
      if(record.note_id){$('[data-jelly-raw-text]').readOnly=true;$('[data-jelly-source-url]').readOnly=true;$('[data-jelly-material-upload]').disabled=true;$('.jelly-material-tools').insertAdjacentHTML('afterend','<p class="jelly-muted">'+tx('已转为笔记，原始内容保持不变。')+'</p>'+btn('打开关联笔记','data-jelly-inspiration-note="'+esc(record.note_id)+'"','note'));}
    }
    const recovery=readRecovery(id);if(recovery)documentEl.insertAdjacentHTML('afterbegin','<div class="jelly-draft-recovery"><p>'+tx('发现一份未保存草稿。当前显示的是已保存版本。')+'</p>'+btn('恢复草稿','data-jelly-recover-draft','undo')+btn('丢弃草稿','data-jelly-discard-draft','x')+'</div>');
    setStatus('已保存');renderRecords();
  };
  const readInline=(element)=>{
    const spans=[];
    const visit=(node,marks=[],url)=>{
      if(node.nodeType===Node.TEXT_NODE){if(node.textContent)spans.push({text:node.textContent,marks:[...marks],...(url?{link_url:url}:{})});return;}
      if(node.nodeType!==Node.ELEMENT_NODE)return;
      const tag=node.tagName.toLowerCase();
      if(tag==='br'){spans.push({text:'\n',marks:[...marks]});return;}
      const next=[...marks];if(tag==='strong'||tag==='b')next.push('bold');if(tag==='em'||tag==='i')next.push('italic');if(tag==='code')next.push('code');
      const href=tag==='a'&&/^https?:\/\//i.test(node.getAttribute('href')||'')?node.getAttribute('href'):url;
      [...node.childNodes].forEach((child)=>visit(child,[...new Set(next)],href));
      if((tag==='div'||tag==='p')&&node!==element&&node.nextSibling)spans.push({text:'\n',marks:[]});
    };
    visit(element);const merged=[];for(const span of spans){const prior=merged.at(-1);if(prior&&JSON.stringify(prior.marks)===JSON.stringify(span.marks)&&prior.link_url===span.link_url)prior.text+=span.text;else merged.push(span);}
    return {text:merged.map((span)=>span.text).join(''),inline_spans:merged};
  };
  const collectBlocks=()=>draftBlocks.map((block)=>{const textEl=$('[data-jelly-block-text="'+CSS.escape(block.id)+'"]');return textEl?{...block,...readInline(textEl)}:block;});
  const readDraft=()=>selected?.kind==='note'?{title:$('[data-jelly-record-title]').value,blocks:collectBlocks()}:{title:$('[data-jelly-record-title]').value,raw_text:$('[data-jelly-raw-text]').value,url:$('[data-jelly-source-url]').value||null};
  const queueSave=()=>{dirty=true;editorVersion++;setStatus('正在编辑');clearTimeout(saveTimer);if(!composing){writeRecovery();saveTimer=setTimeout(()=>void run(saveEditor),650);}};
  const saveEditor=()=>{
    clearTimeout(saveTimer);
    if(!dirty||!selected||composing)return savePending;
    if(savingEditor)return savePending.then(()=>dirty?saveEditor():undefined);
    const selection={...selected};const version=editorVersion;const patch=readDraft();const noteRevision=editorRevision;
    setStatus('正在保存');savingEditor=true;
    const saving=savePending.catch(()=>{}).then(async()=>{
      await command(selection.kind==='note'?{type:'note.update',id:selection.id,expected_note_revision:noteRevision,patch}:{type:'inspiration.update',id:selection.id,patch});
      if(selected?.id===selection.id){editorRevision=recordFor(selection.kind,selection.id)?.revision||0;if(version===editorVersion){dirty=false;clearRecovery(selection.id);setStatus('已保存');}else setStatus('正在编辑');}
    }).catch((error)=>{
      setStatus('保存失败，编辑已保留');
      if(error.status===409&&selected?.id===selection.id){const latest=recordFor(selection.kind,selection.id);openGeneric('编辑版本冲突','<p class="jelly-muted">'+tx('其他窗口已经修改了这篇内容。可以保留当前编辑并覆盖最新版本，或载入最新版本。')+'</p>'+btn('载入最新版本','data-jelly-reload-editor'),'保留我的编辑',async()=>{editorRevision=latest?.revision||0;await saveEditor();});}
      throw error;
    }).finally(()=>{savingEditor=false;});
    savePending=saving;return saving;
  };
  const flushEditor=async()=>{
    clearTimeout(saveTimer);await savePending.catch(()=>{});
    if(composing)throw new Error(L('请先完成正在输入的文字'));
    if(dirty)await saveEditor();
  };
  const createNote=async()=>{const before=new Set(state.notes.map((entry)=>entry.id));await command({type:'note.create',title:'',category_id:filterCategory||'uncategorized',blocks:[newBlock()]});archived=false;const record=state.notes.find((entry)=>!before.has(entry.id));if(record){view='notes';await renderView();openRecord('note',record.id);$('[data-jelly-record-title]').focus();}};
  const createInspiration=async()=>{const before=new Set(state.inspirations.map((entry)=>entry.id));await command({type:'inspiration.create',title:'',input_kind:'text',raw_text:'',category_id:filterCategory||'uncategorized'});archived=false;const record=state.inspirations.find((entry)=>!before.has(entry.id));if(record){view='inspirations';await renderView();openRecord('inspiration',record.id);$('[data-jelly-raw-text]').focus();}};
  const focusBlock=(id,end=true)=>{const element=$('[data-jelly-block-text="'+CSS.escape(id)+'"]');if(!element)return;element.focus();const range=document.createRange();range.selectNodeContents(element);range.collapse(!end);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);focusedBlock=id;};
  const remountBlocks=(focusId)=>{draftBlocks=collectBlocks();$('[data-jelly-blocks]').innerHTML=draftBlocks.map(blockHtml).join('');if(focusId)focusBlock(focusId);};
  const insertBlock=(afterId,kind='paragraph',text='')=>{draftBlocks=collectBlocks();const block=newBlock(kind,text);const index=draftBlocks.findIndex((entry)=>entry.id===afterId);draftBlocks.splice(index<0?draftBlocks.length:index+1,0,block);$('[data-jelly-blocks]').innerHTML=draftBlocks.map(blockHtml).join('');focusBlock(block.id,false);queueSave();};
  const selectedBlock=()=>draftBlocks.find((entry)=>entry.id===focusedBlock)||draftBlocks.at(-1);
  documentEl.addEventListener('input',(event)=>{if(event.target.closest('[data-jelly-record-title],[data-jelly-block-text],[data-jelly-raw-text],[data-jelly-source-url]'))queueSave();});
  documentEl.addEventListener('compositionstart',()=>{composing=true;clearTimeout(saveTimer);});
  documentEl.addEventListener('compositionend',()=>{composing=false;if(dirty)queueSave();});
  documentEl.addEventListener('focusin',(event)=>{const block=event.target.closest('[data-jelly-block-text]');if(block)focusedBlock=block.dataset.jellyBlockText;});
  document.addEventListener('selectionchange',()=>{const selection=window.getSelection();if(selection?.rangeCount&&documentEl.contains(selection.anchorNode)){lastRange=selection.getRangeAt(0).cloneRange();const element=selection.anchorNode.nodeType===Node.ELEMENT_NODE?selection.anchorNode:selection.anchorNode.parentElement;const block=element?.closest('[data-jelly-block-text]');if(block)focusedBlock=block.dataset.jellyBlockText;}});
  documentEl.addEventListener('mousedown',(event)=>{if(event.target.closest('[data-jelly-format],[data-jelly-inline]'))event.preventDefault();});
  documentEl.addEventListener('keydown',(event)=>{
    const textEl=event.target.closest('[data-jelly-block-text]');if(!textEl||composing||event.isComposing)return;
    const id=textEl.dataset.jellyBlockText;const block=draftBlocks.find((entry)=>entry.id===id);
    if((event.metaKey||event.ctrlKey)&&['b','i'].includes(event.key.toLowerCase())){event.preventDefault();applyInline(event.key.toLowerCase()==='b'?'bold':'italic');return;}
    if(event.key==='Tab'){event.preventDefault();draftBlocks=collectBlocks();const current=draftBlocks.find((entry)=>entry.id===id);current.indent=Math.max(0,Math.min(8,current.indent+(event.shiftKey?-1:1)));textEl.closest('[data-jelly-block]').style.marginLeft=current.indent*18+'px';queueSave();return;}
    if(event.key==='Enter'&&!event.shiftKey&&block?.kind!=='code'){
      event.preventDefault();const selection=window.getSelection();const range=selection?.rangeCount?selection.getRangeAt(0):null;
      let tail='';if(range&&textEl.contains(range.startContainer)){range.deleteContents();const trailing=range.cloneRange();trailing.selectNodeContents(textEl);trailing.setStart(range.startContainer,range.startOffset);tail=trailing.toString();trailing.deleteContents();}
      const kind=['bullet','numbered','task'].includes(block.kind)?block.kind:'paragraph';insertBlock(id,kind,tail);return;
    }
    if(event.key==='Backspace'){
      const selection=window.getSelection();if(!selection?.isCollapsed)return;const range=selection.getRangeAt(0).cloneRange();range.selectNodeContents(textEl);range.setEnd(selection.anchorNode,selection.anchorOffset);
      if(range.toString().length===0){const index=draftBlocks.findIndex((entry)=>entry.id===id);if(index>0){event.preventDefault();if(state.task_links.some((entry)=>entry.note_id===selected.id&&entry.block_id===id)){showNote(L('先解除日历任务联动，再删除或合并这个任务块。'),true);return;}draftBlocks=collectBlocks();const prior=draftBlocks[index-1];const current=draftBlocks[index];prior.text+=current.text;prior.inline_spans=undefined;draftBlocks.splice(index,1);$('[data-jelly-blocks]').innerHTML=draftBlocks.map(blockHtml).join('');focusBlock(prior.id);queueSave();}}
    }
    if(event.key==='/'&&textEl.textContent.trim()===''){event.preventDefault();openBlockFormat(id);}
  });
  documentEl.addEventListener('paste',(event)=>{
    const textEl=event.target.closest('[data-jelly-block-text]');if(!textEl)return;event.preventDefault();const text=event.clipboardData.getData('text/plain');const selection=window.getSelection();if(!selection?.rangeCount)return;const range=selection.getRangeAt(0);range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);queueSave();
  });
  documentEl.addEventListener('change',(event)=>{const checkbox=event.target.closest('[data-jelly-task-check]');if(!checkbox)return;const completed=checkbox.checked;void run(async()=>{await flushEditor();try{await command({type:'task.complete',note_id:selected.id,block_id:checkbox.dataset.jellyTaskCheck,completed});editorRevision=recordFor('note',selected.id).revision;syncTaskIndicators();}catch(error){checkbox.checked=!completed;throw error;}});});
  const changeBlockKind=(kind)=>{draftBlocks=collectBlocks();const block=selectedBlock();if(!block)return;if(block.kind==='task'&&kind!=='task'&&state.task_links.some((entry)=>entry.note_id===selected.id&&entry.block_id===block.id)){showNote(L('先解除日历任务联动，再转换这个任务块。'),true);return;}block.kind=kind;$('[data-jelly-blocks]').innerHTML=draftBlocks.map(blockHtml).join('');if(kind==='divider')insertBlock(block.id);else focusBlock(block.id);queueSave();};
  const openBlockFormat=(id)=>{focusedBlock=id;openGeneric('段落格式','<div class="jelly-choice-row">'+[['paragraph','正文'],['heading1','一级标题'],['heading2','二级标题'],['heading3','三级标题'],['bullet','项目符号'],['numbered','编号'],['task','任务'],['quote','引用'],['code','代码'],['link','链接块'],['divider','分割线']].map(([kind,label])=>btn(label,'data-jelly-choose-format="'+kind+'"')).join('')+'</div>','',null);};
  const rangesForSelection=(range)=>$$('[data-jelly-block-text]').filter((node)=>range.intersectsNode(node)).map((node)=>{const part=document.createRange();part.selectNodeContents(node);if(node.contains(range.startContainer))part.setStart(range.startContainer,range.startOffset);if(node.contains(range.endContainer))part.setEnd(range.endContainer,range.endOffset);return {node,range:part};}).filter((entry)=>!entry.range.collapsed);
  const applyInline=(kind,href)=>{
    if(!lastRange||lastRange.collapsed){showNote(L('先选中一段文字，再设置格式'));return;}
    if(!documentEl.contains(lastRange.commonAncestorContainer))return;
    const ranges=rangesForSelection(lastRange);if(ranges.length>1){
      if(kind==='link'&&!/^https?:\/\//i.test(href||''))throw new Error(L('链接需要以 http:// 或 https:// 开头'));
      for(const entry of [...ranges].reverse()){const wrap=document.createElement(kind==='bold'?'strong':kind==='italic'?'em':kind==='code'?'code':'a');if(kind==='link'){wrap.href=href;wrap.target='_blank';wrap.rel='noopener noreferrer';}wrap.appendChild(entry.range.extractContents());entry.range.insertNode(wrap);}
      const selection=window.getSelection();selection.removeAllRanges();lastRange=null;queueSave();return;
    }
    const range=lastRange.cloneRange();const element=document.createElement(kind==='bold'?'strong':kind==='italic'?'em':kind==='code'?'code':'a');
    if(kind==='link'){if(!/^https?:\/\//i.test(href||''))throw new Error(L('链接需要以 http:// 或 https:// 开头'));element.href=href;element.target='_blank';element.rel='noopener noreferrer';}
    element.appendChild(range.extractContents());range.insertNode(element);range.selectNodeContents(element);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);lastRange=range.cloneRange();queueSave();
  };
  const syncTaskIndicators=()=>{
    if(selected?.kind!=='note')return;const note=recordFor('note',selected.id);if(!note)return;editorRevision=note.revision;
    for(const block of draftBlocks){const stored=note.blocks.find((entry)=>entry.id===block.id);if(!stored)continue;block.completed_at=stored.completed_at;block.completion_description=stored.completion_description;if(!dirty&&stored.text!==block.text){block.text=stored.text;block.inline_spans=stored.inline_spans;const text=$('[data-jelly-block-text="'+CSS.escape(block.id)+'"]');if(text)text.innerHTML=inlineHtml(stored);}const checkbox=$('[data-jelly-task-check="'+CSS.escape(block.id)+'"]');if(checkbox)checkbox.checked=Boolean(stored.completed_at);const row=$('[data-jelly-block="'+CSS.escape(block.id)+'"]');if(row)row.classList.toggle('is-completed',Boolean(stored.completed_at));}
    renderBacklinks();
  };
  const renderBacklinks=()=>{const el=$('[data-jelly-backlinks]');if(!el||!selected)return;const relations=state.relations.filter((entry)=>entry.note_id===selected.id);const links=state.task_links.filter((entry)=>entry.note_id===selected.id);el.innerHTML=(relations.length||links.length)?'<p class="jelly-muted">'+tx('关联事项')+'</p>'+relations.map((relation)=>{const item=state.items.find((item)=>item.id===relation.owner_id)||state.series.find((item)=>item.id===relation.owner_id);return item?btn(item.title,'data-jelly-open-linked-item="'+esc(item.id)+'"','calendar'):'';}).join('')+links.map((link)=>{const item=state.items.find((item)=>item.id===link.item_id);return item?btn(item.title+' · '+dateLabel(item.start_date,true),'data-jelly-open-linked-item="'+esc(item.id)+'"','check')+btn('解除任务联动','data-jelly-unlink-task="'+esc(link.block_id)+'"','link'):'';}).join(''):'';};
  const locatorLabel=(locator)=>{
    if(!locator)return L('原文');if(locator.kind==='page')return L('页')+' '+locator.number;if(locator.kind==='image')return L('图片')+' '+locator.index;
    if(locator.kind==='timestamp'){const label=(seconds)=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');return label(locator.start_seconds)+' — '+label(locator.end_seconds);}
    return L('段落')+' '+locator.index;
  };
  const renderDigest=(record)=>{
    const el=$('[data-jelly-digest-content]');if(!el)return;const digest=record.digest;const snapshot=digest?.snapshot||record.material;const coverage=snapshot?.coverage;
    const sourceInfo=coverage?'<div class="jelly-material-coverage"><span class="mw-status">'+tx(coverage.status==='sufficient'?'已覆盖来源':coverage.status==='partial'?'部分覆盖':'覆盖不足')+'</span><span class="jelly-muted">'+coverage.processed+(coverage.expected!==undefined?' / '+coverage.expected:'')+' '+tx('个来源片段')+'</span>'+(coverage.issues||[]).map((issue)=>'<p class="jelly-muted">'+esc(issue)+'</p>').join('')+'</div>':'';
    if(!digest){el.innerHTML=sourceInfo;return;}
    const evidence=(ids)=>ids?.length?'<span class="jelly-evidence-links">'+ids.map((id)=>{const block=snapshot?.blocks.find((block)=>block.id===id);return block?btn(locatorLabel(block.locator),'data-jelly-evidence="'+esc(id)+'"','link'):'';}).join('')+'</span>':'';
    const claim=(value)=>'<p>'+esc(value.text)+evidence(value.evidence_block_ids)+'</p>';
    const structured=digest.structured;
    const body=structured?'<div class="jelly-digest-thesis">'+claim(structured.thesis)+'</div><h3>'+tx('要点')+'</h3>'+structured.takeaways.map(claim).join('')+structured.chapters.map((chapter)=>'<details class="jelly-source-details"><summary>'+esc(chapter.title)+evidence([chapter.anchor_block_id])+'</summary>'+chapter.points.map(claim).join('')+'</details>').join('')+(structured.quotes.length?'<h3>'+tx('原文摘录')+'</h3>'+structured.quotes.map((quote)=>'<blockquote>'+esc(quote.text)+evidence([quote.evidence_block_id])+'</blockquote>').join(''):'')+(structured.dropped.length?'<details class="jelly-source-details"><summary>'+tx('未采用的内容')+'</summary>'+structured.dropped.map(claim).join('')+'</details>':''):'<p>'+esc(digest.summary)+'</p>';
    el.innerHTML=sourceInfo+'<h2>'+tx('摘要')+'</h2>'+body+btn('写入笔记','data-jelly-digest-write','note')+(digest.source_text!==record.raw_text?'<p class="jelly-muted">'+tx('原文已修改，这份摘要来自之前的版本。')+'</p>':'')+(snapshot?'<details class="jelly-source-details"><summary>'+tx('查看来源片段')+'</summary>'+snapshot.blocks.map((block)=>'<article><span class="jelly-muted">'+esc(locatorLabel(block.locator))+'</span><p>'+esc(block.text)+'</p></article>').join('')+'</details>':'');
  };
  const archiveRecord=async()=>{if(!selected)return;await flushEditor();const record=recordFor(selected.kind,selected.id);await command({type:selected.kind+(record.archived_at?'.restore':'.archive'),id:selected.id});closeWorkspace();await loadList();};
  const deleteNote=async()=>{if(selected?.kind!=='note')return;await flushEditor();const id=selected.id;const {preview}=await request('POST','/api/jelly/preview',{kind:'delete-note',id});openGeneric('永久删除笔记','<p class="jelly-muted">'+tx('将删除这篇笔记并清理关联。日历中的事项会保留。')+'</p><pre class="jelly-muted">'+esc(JSON.stringify(preview.counts,null,2))+'</pre>','永久删除',async()=>{await command({type:'note.delete',id,confirmation_token:preview.confirmation_token});closeWorkspace();await loadList();});};
  const decompose=async()=>{
    if(!selected)return;let captured=null;
    if(selected.kind==='note'&&lastRange&&!lastRange.collapsed&&documentEl.contains(lastRange.commonAncestorContainer)){const ranges=rangesForSelection(lastRange);const blockIds=ranges.map((entry)=>entry.node.dataset.jellyBlockText);const selectedText=ranges.map((entry)=>entry.range.toString()).join('\n');if(blockIds.length&&selectedText.trim())captured={block_ids:blockIds,text:selectedText};}
    await flushEditor();const source={...selected};
    openGeneric('拆成任务','<p class="jelly-muted">'+tx('先生成可编辑的任务计划，确认后才会写入日历。')+'</p>'+(captured?'<label class="jelly-check"><input type="checkbox" class="mw-check" data-jelly-plan-use-selection checked>'+tx('只拆解当前选中文字')+'</label><pre class="jelly-import-preview">'+esc(captured.text)+'</pre>':'')+'<label class="jelly-field">'+tx('补充要求')+'<textarea class="mw-textarea" rows="3" data-jelly-plan-instructions placeholder="'+tx('例如：按优先级拆分，每项控制在半小时内。')+'"></textarea></label><label class="jelly-check" style="margin-top:12px"><input type="checkbox" class="mw-check" data-jelly-plan-manual>'+tx('按原文逐行拆分，不调用模型')+'</label>','生成预览',async()=>{
      const now=new Date();const result=await extractMaterial('/api/jelly/ai',{kind:'decompose',source_type:source.kind,source_id:source.id,instructions:$('[data-jelly-plan-instructions]').value,manual:$('[data-jelly-plan-manual]').checked,...(captured&&$('[data-jelly-plan-use-selection]')?.checked?{selection:captured}:{}),today:civil(),start_time:now.getHours()*60+now.getMinutes()});
      if(!result)return true;const plan=result.plan;setTimeout(()=>openPlan(plan,source),0);return true;
    });
  };
  const handleContentClick=(target,event)=>{
    if(target.hasAttribute('data-jelly-evidence')){const record=recordFor('inspiration',selected.id);const snapshot=record.digest?.snapshot||record.material;const block=snapshot?.blocks.find((block)=>block.id===target.dataset.jellyEvidence);if(block)openGeneric(locatorLabel(block.locator),'<pre class="jelly-import-preview">'+esc(block.text)+'</pre>','',null);return;}
    if(target.hasAttribute('data-jelly-discard-draft')){clearRecovery(selected.id);$('.jelly-draft-recovery')?.remove();return;}
    if(target.hasAttribute('data-jelly-recover-draft')){const recovery=readRecovery(selected.id);if(!recovery)return;$('[data-jelly-record-title]').value=recovery.patch.title||'';if(selected.kind==='note'){draftBlocks=recovery.patch.blocks||[newBlock()];$('[data-jelly-blocks]').innerHTML=draftBlocks.map(blockHtml).join('');editorRevision=recovery.revision;}else{$('[data-jelly-raw-text]').value=recovery.patch.raw_text||'';$('[data-jelly-source-url]').value=recovery.patch.url||'';}$('.jelly-draft-recovery')?.remove();queueSave();return;}
    if(target.hasAttribute('data-jelly-inspiration-note'))return void run(async()=>{await flushEditor();view='notes';archived=false;await renderView();openRecord('note',target.dataset.jellyInspirationNote);});
    if(target.hasAttribute('data-jelly-delete-inspiration'))return void run(async()=>{await flushEditor();const id=selected.id;const {preview}=await request('POST','/api/jelly/preview',{kind:'delete-inspiration',id});openGeneric('永久删除灵感','<p class="jelly-muted">'+tx('删除原始灵感及摘要；已经写入的笔记会保留。')+'</p><pre class="jelly-import-preview">'+esc(JSON.stringify(preview.counts,null,2))+'</pre>','永久删除',async()=>{await command({type:'inspiration.delete',id,confirmation_token:preview.confirmation_token});clearRecovery(id);closeWorkspace();await loadList();});});
    if(target.hasAttribute('data-jelly-plan-duration')){$('[data-jelly-plan-minutes="'+CSS.escape(target.dataset.planAction)+'"]').value=target.dataset.jellyPlanDuration;return;}
    if(target.hasAttribute('data-jelly-reload-editor')){const current={...selected};dirty=false;savePending=Promise.resolve();$('[data-jelly-dialog]').close();openRecord(current.kind,current.id);return;}
    if(target.hasAttribute('data-jelly-archive'))return void run(archiveRecord);
    if(target.hasAttribute('data-jelly-pin'))return void run(async()=>{if(selected?.kind!=='note')return;await flushEditor();const note=recordFor('note',selected.id);await command({type:'note.pin',id:note.id,pinned:!note.pinned});editorRevision=recordFor('note',selected.id).revision;$('[data-jelly-editor-menu]').hidden=true;});
    if(target.hasAttribute('data-jelly-export-note'))return void run(async()=>{await flushEditor();const result=await request('GET','/api/jelly/notes/'+encodeURIComponent(selected.id)+'/export?format=markdown');download(result.filename,result.content,result.mime);});
    if(target.hasAttribute('data-jelly-export-note-html'))return void run(async()=>{await flushEditor();const result=await request('GET','/api/jelly/notes/'+encodeURIComponent(selected.id)+'/export?format=html');download(result.filename,result.content,result.mime);});
    if(target.hasAttribute('data-jelly-import-note')){$('[data-jelly-note-file]').click();return;}
    if(target.hasAttribute('data-jelly-delete-note'))return void run(deleteNote);
    if(target.hasAttribute('data-jelly-record-category'))return void run(async()=>{await flushEditor();await command({type:selected.kind+'.update',id:selected.id,patch:{category_id:target.dataset.jellyRecordCategory}});editorRevision=recordFor(selected.kind,selected.id).revision||0;$('.jelly-document-meta').innerHTML=noteCategoryChoices(recordFor(selected.kind,selected.id));});
    if(target.hasAttribute('data-jelly-format')){changeBlockKind(target.dataset.jellyFormat);return;}
    if(target.hasAttribute('data-jelly-choose-format')){$('[data-jelly-dialog]').close();changeBlockKind(target.dataset.jellyChooseFormat);return;}
    if(target.hasAttribute('data-jelly-inline')){if(target.dataset.jellyInline==='link'){openGeneric('添加链接','<input class="mw-input" type="url" data-jelly-link-url placeholder="https://" aria-label="'+tx('链接')+'">','应用',async()=>applyInline('link',$('[data-jelly-link-url]').value));}else applyInline(target.dataset.jellyInline);return;}
    if(target.hasAttribute('data-jelly-add-block')){insertBlock(draftBlocks.at(-1)?.id);return;}
    if(target.hasAttribute('data-jelly-block-delete')){if(state.task_links.some((entry)=>entry.note_id===selected.id&&entry.block_id===target.dataset.jellyBlockDelete)){showNote(L('先解除日历任务联动，再删除或合并这个任务块。'),true);return;}draftBlocks=collectBlocks();const index=draftBlocks.findIndex((entry)=>entry.id===target.dataset.jellyBlockDelete);if(index<0)return;draftBlocks.splice(index,1);if(!draftBlocks.length)draftBlocks=[newBlock()];$('[data-jelly-blocks]').innerHTML=draftBlocks.map(blockHtml).join('');focusBlock(draftBlocks[Math.max(0,index-1)].id);queueSave();return;}
    if(target.hasAttribute('data-jelly-block-up')){draftBlocks=collectBlocks();const index=draftBlocks.findIndex((entry)=>entry.id===target.dataset.jellyBlockUp);if(index>0){[draftBlocks[index-1],draftBlocks[index]]=[draftBlocks[index],draftBlocks[index-1]];$('[data-jelly-blocks]').innerHTML=draftBlocks.map(blockHtml).join('');focusBlock(draftBlocks[index-1].id);queueSave();}return;}
    if(target.hasAttribute('data-jelly-schedule-block'))return void run(async()=>{await flushEditor();const id=target.dataset.jellyScheduleBlock;const note=recordFor('note',selected.id);const block=note.blocks.find((entry)=>entry.id===id);const link=state.task_links.find((entry)=>entry.note_id===selected.id&&entry.block_id===id);const item=link?state.items.find((entry)=>entry.id===link.item_id):null;if(item)openItem({...item,series_id:null,original_date:null});else openItem(null,civil(),{note_id:note.id,block_id:id,title:block.text});});
    if(target.hasAttribute('data-jelly-open-linked-item')){const item=state.items.find((entry)=>entry.id===target.dataset.jellyOpenLinkedItem);if(item)openItem({...item,series_id:null,original_date:null});else{const series=state.series.find((entry)=>entry.id===target.dataset.jellyOpenLinkedItem);if(series)openItem({...series,series_id:series.id,original_date:series.start_date});}return;}
    if(target.hasAttribute('data-jelly-unlink-task'))return void run(async()=>{await flushEditor();await command({type:'task.unlink',note_id:selected.id,block_id:target.dataset.jellyUnlinkTask});renderBacklinks();});
    if(target.hasAttribute('data-jelly-convert'))return void run(async()=>{await flushEditor();const id=selected.id;await command({type:'inspiration.convert',id});const source=state.inspirations.find((entry)=>entry.id===id);if(source.note_id){view='notes';await renderView();openRecord('note',source.note_id);}});
    if(target.hasAttribute('data-jelly-digest'))return void run(async()=>{await flushEditor();target.disabled=true;try{const result=await extractMaterial('/api/jelly/ai',{kind:'digest',source_type:'inspiration',source_id:selected.id});if(!result)return;if(result.state)state=result.state;else await loadList();renderDigest(recordFor('inspiration',selected.id));showNote(L('摘要已保存，原始内容保留'));}finally{target.disabled=false;}});
    if(target.hasAttribute('data-jelly-digest-write'))return void run(async()=>{await flushEditor();await command({type:'inspiration.digest_write',id:selected.id});renderDigest(recordFor('inspiration',selected.id));showNote(L('摘要已写入笔记'));});
    if(target.hasAttribute('data-jelly-decompose'))return void run(decompose);
    if(target.hasAttribute('data-jelly-source-read'))return void run(readSourceAgain);
    if(target.hasAttribute('data-jelly-material-upload')){$('[data-jelly-material-file]').click();return;}
  };
  $('[data-jelly-note-file]').addEventListener('change',(event)=>void run(async()=>{
    const file=event.target.files?.[0];event.target.value='';if(!file||selected?.kind!=='note')return;await flushEditor();const id=selected.id;const source=await file.text();const format=/\.html?$/i.test(file.name)?'html':'markdown';
    openGeneric('导入笔记内容','<p class="jelly-muted">'+esc(file.name)+' · '+source.length+' '+tx('个字符')+'</p><label class="jelly-check"><input class="mw-check" type="checkbox" data-jelly-import-replace>'+tx('替换当前内容（默认追加到末尾）')+'</label><pre class="jelly-import-preview">'+esc(source.slice(0,8000))+'</pre>','确认导入',async()=>{await command({type:'note.import',id,source,format,mode:$('[data-jelly-import-replace]').checked?'replace':'append',expected_note_revision:editorRevision});openRecord('note',id);showNote(L('笔记内容已导入'));});
  }));
  $('[data-jelly-material-file]').addEventListener('change',(event)=>void run(async()=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>25*1024*1024)throw new Error(L('文件不能超过 25 MB'));await flushEditor();const sourceId=selected?.kind==='inspiration'?selected.id:null;
    const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let start=0;start<bytes.length;start+=32768)binary+=String.fromCharCode(...bytes.subarray(start,start+32768));
    const material=await extractMaterial('/api/jelly/material',{file_name:file.name,data_base64:btoa(binary)});await saveMaterial(material,sourceId,file.name);
  }));
`;
