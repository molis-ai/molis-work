export const CHARACTER_IMPORT_CLIENT_FACTORY = String.raw`(host) => {
  const {root,q,request,current,load,select,act,save,dirty,note}=host;
  const names={'codex':'Codex','claude-code':'Claude Code','cursor':'Cursor','opencode':'OpenCode','grok-build':'Grok Build'};
  const dialog=q('import-dialog'), preview=q('import-preview'), runDialog=q('run-dialog');
  let candidates=[],candidate=null,editing=null,pending=false,selection={rule_paths:[],skill_ids:[]},runContent=null,reference=null,execution=null,requestId=null,runTicket=0;
  const el=(tag,text,cls)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(cls)item.className=cls;return item;};
  const detail=(title,content)=>{const box=el('details'),summary=el('summary',title),pre=el('pre',content);box.append(summary,pre);return box;};
  const filePreview=(file,skill,owner)=>{
    const box=detail(file.path+' · '+(file.bytes ?? 0)+' 字节','展开读取文件');let loaded=false;
    box.addEventListener('toggle',async()=>{if(!box.open || loaded)return;loaded=true;const pre=box.querySelector('pre');pre.textContent='正在读取…';
      try{const result=await request('POST',owner.candidate_id?'/imports/file':owner.reference?'/publication/file':'/drafts/'+encodeURIComponent(owner.character_id)+'/file',{...owner,skill_id:skill.id,path:file.path});pre.textContent=result.encoding==='utf8'?result.content:'二进制附件已完整保存（'+result.bytes+' 字节），原生执行时保留原文件。';}catch(error){pre.textContent=error.message;loaded=false;}
    });return box;
  };
  const files=(target,snapshot,owner={character_id:current().character_id})=>{
    for(const rule of snapshot.rules)target.append(detail((rule.scope==='project'?'项目':'全局')+' · '+rule.path+(rule.condition?' · 条件规则':''),rule.content));
    for(const skill of snapshot.skills){const box=el('details');box.append(el('summary',skill.name+' · '+skill.files.length+' 个文件 · '+(skill.compatibility==='portable'?'可供内置引擎使用':'依赖原生环境')));for(const file of skill.files)box.append(filePreview(file,skill,owner));target.append(box);}
  };
  const diff=(before,after)=>{
    if(!before)return '';
    const rows=s=>new Map([...s.rules.map(r=>['规则 '+r.path,r.content]),...s.skills.map(s=>['技能 '+s.path,JSON.stringify(s.files)])]);
    const a=rows(before),b=rows(after);let added=0,changed=0,removed=0;
    for(const [k,v] of b){if(!a.has(k))added++;else if(a.get(k)!==v)changed++;}for(const k of a.keys())if(!b.has(k))removed++;
    return '来源差异：新增 '+added+'，变更 '+changed+'，移除 '+removed+'。保存的名称和补充指令会保留。';
  };
  const count=()=>{
    q('import-confirm').disabled=pending || !candidate || !(selection.rule_paths.length+selection.skill_ids.length);
    q('import-confirm').textContent=(editing?'更新快照':'导入 Character')+' · '+selection.rule_paths.length+' 条规则 / '+selection.skill_ids.length+' 个技能';
  };
  const renderPreview=()=>{
    preview.replaceChildren();if(!candidate){count();return;}
    const s=candidate.snapshot;
    preview.append(el('h3',candidate.label),el('p',(candidate.executable?'已发现 CLI；登录和执行状态将在启动时确认。':'可导入配置；未发现可用 CLI。')+' '+s.config_root,'characters-hint'));
    if(candidate.warnings.length){const warnings=el('details');warnings.append(el('summary',candidate.warnings.length+' 项读取说明'));for(const warning of candidate.warnings)warnings.append(el('p',warning));preview.append(warnings);}
    if(editing)preview.append(el('p',diff(editing.import_snapshot,s),'characters-hint'));
    const actions=el('div',undefined,'characters-actions');
    for(const [label,onlyPortable] of [['全选',false],['只选可供内置引擎使用的内容',true]]){
      const button=el('button',label,'mw-btn mw-btn--ghost');button.type='button';button.onclick=()=>{selection={rule_paths:s.rules.map(r=>r.path),skill_ids:s.skills.filter(s=>!onlyPortable || s.compatibility==='portable').map(s=>s.id)};renderPreview();};actions.append(button);
    }preview.append(actions);
    const row=(name,path,kind,key,description,body)=>{
      const row=el('section',undefined,'characters-import-item'),label=el('label'),check=el('input');check.type='checkbox';check.className='mw-check';check.checked=selection[kind].includes(key);
      check.onchange=()=>{selection[kind]=check.checked?[...selection[kind],key]:selection[kind].filter(x=>x!==key);count();};label.append(check,el('span',name));row.append(label,el('small',path),el('small',description),body);preview.append(row);
    };
    for(const r of s.rules)row((r.scope==='project'?'项目规则 · ':'全局规则 · ')+r.path.split('/').pop(),r.path,'rule_paths',r.path,r.condition || '始终适用',detail('预览原文',r.content));
    for(const skill of s.skills){const body=el('details');body.append(el('summary','预览 '+skill.files.length+' 个文件'));for(const file of skill.files)body.append(filePreview(file,skill,{candidate_id:candidate.candidate_id}));row(skill.name,skill.path,'skill_ids',skill.id,skill.description+' · '+(skill.compatibility==='portable'?'文本技能，可供内置引擎使用':skill.reason || '需要原生环境'),body);}
    count();
  };
  const choose=item=>{candidate=item;selection={rule_paths:item.snapshot.rules.filter(r=>!editing || editing.import_snapshot.rules.some(old=>old.path===r.path)).map(r=>r.path),skill_ids:item.snapshot.skills.filter(s=>!editing || editing.import_snapshot.skills.some(old=>old.id===s.id)).map(s=>s.id)};for(const button of q('sources').children)button.setAttribute('aria-pressed',String(button.dataset.id===item.candidate_id));renderPreview();};
  const scan=async()=>{
    if(pending)return;pending=true;candidate=null;preview.replaceChildren();q('sources').replaceChildren();q('import-notice').textContent='正在读取本机规则和 Skills…';q('scan').disabled=true;count();
    try{
      const runtime=q('import-runtime').value,config=q('import-config').value.trim(),project=q('import-project').value.trim();
      if(config && !runtime)throw new Error('指定配置目录时，请先选择 Agent。');
      const result=await request('POST','/imports/discover',{...(runtime?{runtime_id:runtime}:{}),...(config?{config_root:config}:{}),...(project?{project_root:project}:{})});candidates=result.candidates;
      for(const item of candidates){const button=el('button',item.label+' · '+item.snapshot.rules.length+' 规则 / '+item.snapshot.skills.length+' Skills','mw-btn mw-btn--secondary');button.type='button';button.dataset.id=item.candidate_id;button.onclick=()=>choose(item);q('sources').append(button);}
      if(candidates.length)choose(candidates[0]);
      q('import-notice').textContent=candidates.length?'规则和附件保留原文；导入不会执行技能脚本或复制登录信息。':'未发现可导入内容。可以指定 Agent 配置目录后重试。';
    }catch(error){q('import-notice').textContent=error.message;}
    finally{pending=false;q('scan').disabled=false;count();}
  };
  const open=update=>{
    if(dirty()){note('请先保存当前修改，再检查来源更新。');return;}
    editing=update?structuredClone(current()):null;
    q('import-runtime').value=editing?.import_snapshot?.runtime_id || '';q('import-config').value=editing?.import_snapshot?.config_root || '';q('import-project').value=editing?.import_snapshot?.project_root || '';
    dialog.showModal();void scan();
  };
  q('import-open').onclick=()=>open(false);q('rescan').onclick=()=>open(true);q('scan').onclick=()=>void scan();
  q('import-close').onclick=()=>{if(!pending)dialog.close();};dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
  q('import-confirm').onclick=async()=>{
    if(pending || !candidate)return;pending=true;count();
    try{const result=await request('POST','/imports',{candidate_id:candidate.candidate_id,selection,...(editing?{existing:{character_id:editing.character_id,expected_revision:editing.revision}}:{})});await load();select(result.draft.character_id);dialog.close();note(result.replayed?'已导入过这个来源，打开现有 Character；你的修改保持。':'Character 已保存，规则与 Skills 可在下方查看。');}
    catch(error){q('import-notice').textContent=error.message;}finally{pending=false;count();}
  };
  const showRun=async item=>{
    q('native-section').hidden=false;q('run-output').textContent=item.output || '尚无已保存输出。';
    window.dispatchEvent(new CustomEvent('molis-work:character-terminal',{detail:{panelId:item.panel_id,sessionId:item.session_id,attachOnly:true}}));
  };
  const loadRuns=async id=>{
    const ticket=++runTicket;
    try{const result=await request('GET','/drafts/'+encodeURIComponent(id)+'/runs');if(ticket!==runTicket || current()?.character_id!==id)return;
      const target=q('native-runs');target.replaceChildren();q('native-section').hidden=!result.runs.length;
      for(const item of result.runs){const button=el('button',new Date(item.created_at).toLocaleString()+' · v'+item.reference.version,'mw-btn mw-btn--ghost');button.type='button';button.onclick=()=>void showRun(item);target.append(button);}
      if(result.runs.length){q('run-output').textContent=result.runs[0].output || '尚无已保存输出。';}
    }catch(error){note(error.message);}
  };
  let shownCharacter='';
  const render=record=>{
    if(shownCharacter!==record?.character_id){shownCharacter=record?.character_id || '';window.dispatchEvent(new CustomEvent('molis-work:character-terminal-reset'));}
    q('source-detail').hidden=!record?.import_snapshot;
    if(record?.import_snapshot){const s=record.import_snapshot;q('source-summary').textContent=names[s.runtime_id]+' · '+s.rules.length+' 条规则 · '+s.skills.length+' 个 Skills · '+new Date(s.captured_at).toLocaleString();q('source-files').replaceChildren();files(q('source-files'),s);}
    if(record)void loadRuns(record.character_id);else{runTicket++;q('native-section').hidden=true;}
  };
  q('use').onclick=()=>void act(async()=>{
    if(current()?.state!=='active')throw new Error('请先启用这个角色。');
    const record=dirty()?await save():current();const published=await request('POST','/drafts/'+encodeURIComponent(record.character_id)+'/publish',{expected_revision:record.revision});
    reference=published.reference;runContent=published.publication.payload;requestId=null;
    execution=await request('POST','/execution',{reference});await load();
    q('run-version').textContent=runContent.title+' · 固定版本 v'+reference.version;
    const select=q('run-workspace');select.replaceChildren();for(const item of execution.workspaces){const option=el('option',item.canonical_path);option.value=item.workspace_id;select.append(option);}
    q('native-name').textContent=runContent.import_snapshot?'本地 '+names[runContent.import_snapshot.runtime_id]:'本地 Agent';
    q('native-notice').textContent=execution.notice+(execution.executable?'':' 未发现对应 CLI。');
    const incompatible=(runContent.import_snapshot?.skills || []).filter(s=>s.compatibility!=='portable');
    q('internal-status').textContent='请选择本轮需要的文本 Skills；未选择时只加载规则。'+(incompatible.length?incompatible.length+' 个技能需要原生环境，不能在此模式选择。':'');
    q('run-skills').replaceChildren();for(const skill of runContent.import_snapshot?.skills || []){const label=el('label'),check=el('input');label.className='characters-check';check.type='checkbox';check.className='mw-check';check.value=skill.id;check.disabled=skill.compatibility!=='portable';label.append(check,el('span',skill.name+(check.disabled?' · 需要原生环境':'')));q('run-skills').append(label);}
    q('run-internal').disabled=false;q('run-native').disabled=!execution.executable || !execution.workspaces.length;
    q('run-notice').textContent=execution.workspaces.length?'':'当前项目未绑定工作目录，请在项目设置中添加。';runDialog.showModal();
  });
  q('run-close').onclick=()=>runDialog.close();
  q('run-internal').onclick=()=>{
    if(!document.querySelector('[data-coding-workbench]')){q('run-notice').textContent='请先启用 Coding 插件。';return;}
    const skill_ids=[...q('run-skills').querySelectorAll('input:checked')].map(input=>input.value);
    window.dispatchEvent(new CustomEvent('molis-work:character-coding',{detail:{reference,title:runContent.title,task:q('run-task').value,workspace_id:q('run-workspace').value,skill_ids}}));runDialog.close();
  };
  q('run-native').onclick=async()=>{
    if(pending || !execution?.executable)return;
    if(!q('run-task').value.trim()){q('run-notice').textContent='请填写这次任务。';return;}
    pending=true;q('run-native').disabled=true;requestId=requestId || crypto.randomUUID();
    try{const result=await request('POST','/execution/native',{reference,workspace_id:q('run-workspace').value,task:q('run-task').value,request_id:requestId});
      q('native-section').hidden=false;window.dispatchEvent(new CustomEvent('molis-work:character-terminal',{detail:result.spawn}));runDialog.close();await loadRuns(current().character_id);note('已提供固定角色包读取指令。请在原生终端中查看实际加载、授权和执行结果。');requestId=null;
    }catch(error){q('run-notice').textContent=error.message;}finally{pending=false;q('run-native').disabled=!execution?.executable;}
  };
  return {render,renderPublication:(record,target)=>{if(record.payload.import_snapshot)files(target,record.payload.import_snapshot,{reference:{artifact_id:record.artifact_id,version:record.version}});}};
}`;
