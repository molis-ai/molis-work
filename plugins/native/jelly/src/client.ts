import { JELLY_CALENDAR_CLIENT_SCRIPT } from "./client-calendar.js";
import { JELLY_CONTENT_CLIENT_SCRIPT } from "./client-content.js";
import { JELLY_MODEL_CLIENT_SCRIPT } from "./client-model.js";
import { JELLY_MATERIAL_CLIENT_SCRIPT } from "./client-material.js";
import { JELLY_PLAN_CLIENT_SCRIPT } from "./client-plan.js";

/** A single browser owner keeps calendar, notes and linked task blocks coherent. */
export const JELLY_CLIENT_FACTORY_SCRIPT = String.raw`(host) => {
  const root = document.querySelector('[data-jelly="workbench"]');
  if (!root) return;
  if(root.dataset.jellyInitialized==='true')return;
  root.dataset.jellyInitialized='true';
  const L = host.translate || ((s) => s);
  const $ = (selector, scope = root) => scope.querySelector(selector);
  const $$ = (selector, scope = root) => [...scope.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const tx = (value) => esc(L(value));
  const glyph = (name) => '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  const btn = (label, attrs = '', name = '', primary = false) => {const extra=/\bclass="([^"]*)"/.exec(attrs);return '<button type="button" aria-label="'+tx(label)+'" class="mw-btn mw-btn--' + (primary ? 'primary' : 'ghost') + (extra?' '+extra[1]:'')+'" ' + attrs.replace(/\bclass="[^"]*"/g,'') + '>' + (name ? glyph(name) : '') + '<span>' + tx(label) + '</span></button>';};
  const uid = () => crypto.randomUUID();
  const civil = (date = new Date()) => date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
  const dayDate = (key) => new Date(key + 'T12:00:00');
  const addDays = (key, days) => { const date = dayDate(key); date.setDate(date.getDate()+days); return civil(date); };
  const dateLabel = (key, short = false) => dayDate(key).toLocaleDateString(document.documentElement.lang || undefined, short ? {month:'short',day:'numeric'} : {month:'long',day:'numeric',weekday:'short'});
  const clockLabel = (minutes) => minutes === null || minutes === undefined ? '' : String(Math.floor(minutes/60)).padStart(2,'0') + ':' + String(minutes%60).padStart(2,'0');
  const parseClock = (value) => value ? Number(value.slice(0,2))*60+Number(value.slice(3,5)) : null;
  const tones = ['blue','green','amber','red','purple','teal','gray'];
  const toneColors={blue:'#5E6AD2',green:'#2D7A5A',amber:'#8A5C18',red:'#B03D45',purple:'#8B5CF6',teal:'#3D6F78',gray:'#737882'};
  const categoryTone = (category) => tones.find((tone)=>toneColors[tone].toLowerCase()===String(category?.color).toLowerCase())||'blue';
  const category = (id) => state?.categories.find((entry) => entry.id === id);
  const categoryDot = (id) => {const color=category(id)?.color;return '<span class="jelly-color" '+(/^#[0-9a-f]{6}$/i.test(color||'')?'style="background:'+color+'"':'data-tone="'+categoryTone(category(id))+'"')+'></span>';};
  const list = $('[data-jelly="directory"]');
  const content = $('[data-jelly-content]');
  const workspace = $('[data-jelly-stage-workspace]');
  const documentEl = $('[data-jelly-document]');
  let state = null;
  let view = 'calendar';
  let mode = 'month';
  let anchor = civil();
  let query = '';
  let filterCategory = '';
  let archived = false;
  let hideCompleted = false;
  let occurrences = [];
  let calendarSeq = 0;
  let selected = null;
  let dirty = false;
  let saveTimer = 0;
  let savePending = Promise.resolve();
  let mutationQueue = Promise.resolve();
  let genericSubmit = null;
  let genericCleanup = null;
  let genericVersion = 0;
  let noticeTimer = 0;
  const keepListScroll = (paint) => { const top = list.scrollTop; paint(); list.scrollTop = top; };
  const showNote = (message, error = false) => {
    const note = $('[data-jelly-notice]');
    clearTimeout(noticeTimer); note.textContent = message || ''; note.hidden = !message; note.classList.toggle('is-error', error);
    if (message && !error) noticeTimer = setTimeout(() => { note.hidden = true; }, 4500);
  };
  const request = async (method, path, body) => {
    const route = (document.body.dataset.routePrefix || '') + path;
    const response = await fetch(route, { method, headers: typeof molisWorkControlHeaders === 'function' ? molisWorkControlHeaders() : {'content-type':'application/json'}, ...(method === 'GET' ? {} : {body: JSON.stringify(body || {})}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { const err = new Error(result.error || L('Jelly 请求失败')); err.status = response.status; err.code = result.code; err.details=result.details; throw err; }
    return result;
  };
  const run = (fn) => Promise.resolve().then(fn).catch((error) => showNote(error.message || L('操作失败，请重试'), true));
  const command = (value) => {
    const operation = mutationQueue.catch(() => {}).then(async () => {
      if (!state) throw new Error(L('Jelly 尚未加载完成'));
      try {
        const result = await request('POST', '/api/jelly/commands', {expected_revision:state.revision,command:value});
        state = result.state; await renderView(); return state;
      } catch (error) {
        if (error.status === 409) { const fresh = await request('GET','/api/jelly'); state = fresh.state; await renderView(); showNote(L('其他窗口已更新。你的编辑仍保留，请核对后重新保存。'), true); }
        throw error;
      }
    });
    mutationQueue = operation; return operation;
  };
  const loadList = async () => { const result = await request('GET','/api/jelly'); state = result.state; await renderView(); };
  const matches = (record, body = '') => (!filterCategory || record.category_id === filterCategory) && (!query || (record.title + ' ' + body).toLowerCase().includes(query.toLowerCase()));
  const empty = (title, message, label) => '<div class="jelly-empty">' + glyph(view === 'calendar' ? 'calendar' : view === 'notes' ? 'note' : 'idea') + '<h2>' + tx(title) + '</h2><p>' + tx(message) + '</p>' + (label ? btn(label,'data-jelly-new','plus') : '') + '</div>';
  const download = (filename, body, type) => { const url=URL.createObjectURL(new Blob([body],{type})); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); };
  const setStatus = (value) => { $('[data-jelly-save-status]').textContent=L(value); };
  const closeWorkspace = () => { selected=null; dirty=false; root.dataset.expanded='false'; workspace.hidden=true; documentEl.replaceChildren(); };
  const openGeneric = (title, html, ok, submit, cleanup) => {
    const dialog=$('[data-jelly-dialog]');
    genericVersion++;
    if (dialog.open) {const cleanup=genericCleanup;genericCleanup=null;cleanup?.();}
    genericSubmit=submit; genericCleanup=cleanup || null;
    $('[data-jelly-dialog-title]').textContent=L(title); $('[data-jelly-dialog-body]').innerHTML=html;
    $('[data-jelly-dialog-ok]').textContent=L(ok || '确定'); $('[data-jelly-dialog-ok]').hidden=!submit;
    $('[data-jelly-dialog-error]').hidden=true; if(!dialog.open)dialog.showModal();
  };
  const confirm = (title, message, ok = '确定') => new Promise((resolve) => {
    let answered=false;
    openGeneric(title,'<p class="jelly-muted">'+esc(message)+'</p>',ok,async()=>{answered=true;resolve(true);},()=>{if(!answered)resolve(false);});
  });
  $('[data-jelly-dialog]').addEventListener('close',()=>{ const cleanup=genericCleanup; genericCleanup=null; genericSubmit=null; cleanup?.(); });
  $('[data-jelly-dialog-form]').addEventListener('submit',async(event)=>{
    event.preventDefault(); const submit=genericSubmit; if(!submit)return;
    const ok=$('[data-jelly-dialog-ok]'); ok.disabled=true;
    try { const keep=await submit(); if(keep!==false)$('[data-jelly-dialog]').close(); }
    catch(error){ const errorEl=$('[data-jelly-dialog-error]');errorEl.hidden=false;errorEl.textContent=error.message; }
    finally{ok.disabled=false;}
  });
  const renderFilters = () => {
    $('[data-jelly-category-filters]').innerHTML=btn('全部','data-jelly-filter="" aria-pressed="'+!filterCategory+'"')+state.categories.map((entry)=>'<button type="button" class="mw-btn mw-btn--ghost" data-jelly-filter="'+esc(entry.id)+'" aria-pressed="'+(entry.id===filterCategory)+'">'+categoryDot(entry.id)+esc(entry.name)+'</button>').join('');
    const inCalendar=view==='calendar';
    $('[data-jelly-period]').hidden=!inCalendar&&view!=='progress';
    $('[data-jelly-calendar-modes]').hidden=!inCalendar;
    $('[data-jelly-hide-completed]').hidden=!inCalendar;
    $('[data-jelly-archived]').hidden=inCalendar||view==='progress';
    $('[data-jelly-archived]').setAttribute('aria-pressed',String(archived));
    $('[data-jelly-hide-completed]').setAttribute('aria-pressed',String(hideCompleted));
    const create=$('[data-jelly-new]');create.hidden=view==='progress';create.querySelector('span').textContent=L(view==='notes'?'新建笔记':view==='inspirations'?'收集灵感':'新建事项');
    create.setAttribute('aria-label',L(view==='notes'?'新建笔记':view==='inspirations'?'收集灵感':'新建事项'));
    $$('[data-jelly-view]').forEach((node)=>{if(node.dataset.jellyView===view)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');});
    $$('[data-jelly-mode]').forEach((node)=>node.setAttribute('aria-pressed',String(node.dataset.jellyMode===mode)));
  };
  const renderView = async () => { if(!state)return;renderFilters();if(view==='calendar')await renderCalendar();else if(view==='progress')await renderProgress();else renderRecords(); };
  const switchView = async (next) => { await flushEditor();closeWorkspace();view=next;archived=false;await renderView(); };
` + JELLY_CALENDAR_CLIENT_SCRIPT + JELLY_CONTENT_CLIENT_SCRIPT + JELLY_MODEL_CLIENT_SCRIPT + JELLY_MATERIAL_CLIENT_SCRIPT + JELLY_PLAN_CLIENT_SCRIPT + String.raw`
  root.addEventListener('click',(event)=>{
    const target=event.target.closest('button,[data-jelly-view]');if(!target)return;
    if(target.dataset.jellyCloseDialog){ $(target.dataset.jellyCloseDialog==='item'?'[data-jelly-item-dialog]':'[data-jelly-dialog]').close();return; }
    if(target.matches('[data-jelly-view]'))return void run(()=>switchView(target.dataset.jellyView));
    if(target.matches('[data-jelly-filter]')){filterCategory=target.dataset.jellyFilter;return void run(renderView);}
    if(target.matches('[data-jelly-new]'))return void run(async()=>{await flushEditor();if(view==='notes')await createNote();else if(view==='inspirations')await createInspiration();else openItem(null,anchor);});
    if(target.matches('[data-jelly-mode]')){mode=target.dataset.jellyMode;return void run(renderView);}
    if(target.matches('[data-jelly-step]')){const step=Number(target.dataset.jellyStep);if(mode==='week'&&view==='calendar'||view==='progress'&&reviewPeriod==='week')anchor=addDays(anchor,step*7);else{const date=dayDate(anchor);date.setDate(1);date.setMonth(date.getMonth()+step);anchor=civil(date);}return void run(renderView);}
    if(target.matches('[data-jelly-today]')){anchor=civil();return void run(renderView);}
    if(target.matches('[data-jelly-hide-completed]')){hideCompleted=!hideCompleted;return void run(renderView);}
    if(target.matches('[data-jelly-archived]')){archived=!archived;return void run(async()=>{await flushEditor();closeWorkspace();await renderView();});}
    if(target.matches('[data-jelly-more]')){const menu=$('[data-jelly-menu]');menu.hidden=!menu.hidden;target.setAttribute('aria-expanded',String(!menu.hidden));return;}
    if(target.matches('[data-jelly-editor-more]')){const menu=$('[data-jelly-editor-menu]');menu.hidden=!menu.hidden;target.setAttribute('aria-expanded',String(!menu.hidden));return;}
    if(target.matches('[data-jelly-undo],[data-jelly-redo]'))return void run(async()=>{await flushEditor();await command({type:target.hasAttribute('data-jelly-undo')?'undo':'redo'});if(selected)openRecord(selected.kind,selected.id);showNote(L('工作区已更新'));});
    if(target.matches('[data-jelly-categories]')){ $('[data-jelly-menu]').hidden=true;return void run(openCategories); }
    if(target.matches('[data-jelly-model]')){ $('[data-jelly-menu]').hidden=true;return void run(openModelSettings); }
    if(target.matches('[data-jelly-export]'))return void run(async()=>{await flushEditor();const result=await request('GET','/api/jelly/export');download('Jelly-'+civil()+'.json',JSON.stringify(result.workspace,null,2),'application/json');showNote(L('工作区已导出'));});
    if(target.matches('[data-jelly-import]')){$('[data-jelly-menu]').hidden=true;$('[data-jelly-import-file]').click();return;}
    if(target.matches('[data-jelly-back]'))return void run(async()=>{await flushEditor();closeWorkspace();await loadList();});
    if(target.matches('[data-jelly-record]'))return void run(async()=>{await flushEditor();openRecord(view==='notes'?'note':'inspiration',target.dataset.jellyRecord);});
    handleCalendarClick(target,event); handleContentClick(target,event); handlePlanClick(target,event);
  });
  $('[data-jelly-search]').addEventListener('input',(event)=>{query=event.target.value.trim();void run(renderView);});
  document.addEventListener('click',(event)=>{if(!event.target.closest('[data-jelly-more],[data-jelly-menu]')){$('[data-jelly-menu]').hidden=true;$('[data-jelly-more]').setAttribute('aria-expanded','false');}if(!event.target.closest('[data-jelly-editor-more],[data-jelly-editor-menu]'))$('[data-jelly-editor-menu]').hidden=true;});
  $('[data-jelly-import-file]').addEventListener('change',(event)=>void run(async()=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    await flushEditor();const source=JSON.parse(await file.text());const {preview}=await request('POST','/api/jelly/preview',{kind:'import',source});
    openGeneric('导入工作区','<p class="jelly-muted">'+tx('合并导入前先检查数量与影响。原工作区会保留备份；重复导入不会重复创建。')+'</p><pre class="jelly-muted">'+esc(JSON.stringify(preview.counts,null,2))+'</pre>'+(preview.warnings||[]).map((line)=>'<p class="jelly-muted">'+esc(line)+'</p>').join(''),'确认导入',async()=>{await command({type:'workspace.import',source,confirmation_token:preview.confirmation_token});closeWorkspace();await loadList();showNote(L('导入完成'));});
  }));
  window.addEventListener('beforeunload',(event)=>{if(dirty){event.preventDefault();event.returnValue='';}});
  root.addEventListener('keydown',(event)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void run(flushEditor);}});
  void loadList().catch((error)=>{content.innerHTML=empty('Jelly 暂时无法打开','请检查本地服务后重试。')+btn('重试','data-jelly-retry');showNote(error.message,true);});
  root.addEventListener('click',(event)=>{if(event.target.closest('[data-jelly-retry]'))void run(loadList);});
}`;
