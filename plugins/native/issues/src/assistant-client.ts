/** Consumes Work Assistant's public attachment, work and suggestion-card contracts. */
export const ISSUE_ASSISTANT_CLIENT_SCRIPT = String.raw`
  let assistant = null, manual = false, pollTimer;
  const assistantApi = (path, body, signal) => request('/api/assistant'+path, body, signal);
  const assistantNote = (message, error=false) => { $('assistant-note').textContent=message; $('assistant-note').classList.toggle('is-error',error); };
  const failed = (held,message=L('整理失败，输入已保留。请检查模型设置或连接后重试。')) => { if(assistant!==held) return; held.failed=true; assistantNote(message,true); mode(); };
  const mode = () => {
    const confirming = Boolean(assistant?.card), fieldsVisible = Boolean(selected || manual || confirming), readonly = viewing();
    $('view').hidden=!readonly; $('inputs').hidden=readonly; $('inputs').disabled=readonly; $('assistant-tools').hidden=readonly;
    $('edit').hidden=!readonly; $('delete').hidden=!readonly; $('cancel-edit').hidden=!selected || readonly;
    $('actions').hidden=readonly && !host.onNew && !host.capture; $('again').hidden=!readonly || !host.onNew && !host.capture;
    $('workspace').querySelector('header').hidden=Boolean(host.capture && !selected);
    $('back').hidden=Boolean(host.capture);
    $('assistant-help').hidden=Boolean(readonly || manual || selected || assistant);
    $('heading').textContent=L(!selected ? '记录问题' : readonly ? '问题详情' : '编辑问题');
    for (const field of ['title','type']) { const input=form.elements[field]; input.closest('label').hidden=!fieldsVisible; input.required=fieldsVisible; input.disabled=Boolean(assistant && !confirming); }
    $('organize').hidden = readonly || Boolean(manual || assistant);
    $('organize').textContent=L(selected ? '让助理重新整理' : '交给助理整理');
    $('organize').classList.toggle('mw-btn--primary',!selected); $('organize').classList.toggle('mw-btn--secondary',Boolean(selected));
    $('retry').hidden=!assistant?.failed; $('manual').hidden=readonly || manual || Boolean((selected || assistant) && !assistant?.failed && !assistant?.question);
    $('manual').textContent=L(selected?'继续手动编辑':'手动填写标题和类型');
    $('revise').hidden=readonly || !assistant && !manual;
    $('revise').textContent=L(assistant?.question ? '补充描述' : assistant?.uncertain ? '核对保存结果' : assistant && !confirming && !assistant.failed ? '停止整理' : manual ? '返回助理整理' : '修改描述和图片');
    $('revise').className='mw-btn mw-btn--'+(assistant?.question?'primary':'ghost');
    $('save').hidden = readonly || !fieldsVisible || Boolean(assistant && !confirming);
    $('save').textContent = L(confirming ? '确认并保存' : selected ? '保存修改' : '保存问题');
    description.readOnly=Boolean(assistant); $('organize').disabled = busy || imageBusy;
    $('model-settings').hidden=readonly || manual;
    $('pick').disabled=busy || imageBusy || Boolean(assistant) || images.length>=6;
    for(const button of root.querySelectorAll('[data-issue-remove]')) button.disabled=Boolean(assistant);
    for(const row of list.querySelectorAll('[data-issue-id]')) row.setAttribute('aria-current',String(row.dataset.issueId===selected?.id));
    fitDescription();
  };
  const uncertain = held => { if(assistant===held) { held.card=null; held.uncertain=true; assistantNote(''); mode(); } };
  const incomplete = L('未获得有效整理结果，请重新整理或手动填写。');
  const release = async () => {
    const held=assistant; if(!held) return;
    const result=held.receipt ??= await request('cancel-capture',{draft_id:held.id});
    scope.clearTimeout(pollTimer);
    if(held.work && held.card) void assistantApi('/works/'+held.work+'/cards/'+held.card.card_id+'/dismiss',{}).catch(()=>{ /* Revoked drafts cannot execute even if the card is unavailable. */ });
    if(held.work) void assistantApi('/works/'+held.work+'/control',{kind:'stop'}).catch(()=>{ /* The draft is already revoked; an ended work needs no stop. */ });
    if(result.saved_id) { uncertain(held); fill(await readSaved(result.saved_id)); await refreshAfter('已保存'); }
    else { assistant=null; assistantNote(''); mode(); }
    return result.saved_id;
  };
  const poll = async () => {
    const held=assistant; if(!held?.work || held.card || held.failed || held.question || held.uncertain || !scope.visible) return;
    try {
      const view=await assistantApi('/works/'+held.work,undefined,viewSignal);
      if(assistant!==held) return;
      const card=view.cards.find(card=>card.capability_id==='issues.capture' && card.status==='ready' && card.fields.some(field=>field.key==='draft_id' && field.value===held.id));
      if(card) {
        const title=card.fields.find(field=>field.key==='title'), type=card.fields.find(field=>field.key==='type');
        if(!title?.editable || !type?.editable || !title.value.trim() || !kind[type.raw || type.value]) return failed(held,incomplete);
        held.card=card; form.elements.title.value=title.value; form.elements.type.value=type.raw || type.value;
        edited(); assistantNote(L('请核对标题和类型，确认后保存。')); mode(); form.elements.type.closest('label').scrollIntoView({block:'nearest'}); form.elements.title.focus({preventScroll:true}); return;
      }
      const question=view.rounds.at(-1)?.awaiting_input?.find(item=>item.answerable!==false);
      if(question) { held.question=question; assistantNote(L('还需要一点具体信息：')+(question.questions?.[0]?.prompt || question.prompt)); mode(); return; }
      if(view.problem || view.work.state==='failed') return failed(held);
      if(!['running','idle'].includes(view.work.state)) return failed(held,incomplete);
      if(Date.now()-held.started>120000) return failed(held,L('整理超时，输入已保留。请重试或手动填写。'));
      pollTimer=scope.timeout(()=>run(poll),1000);
    } catch { if(!viewSignal?.aborted) failed(held); }
  };
  const organize = async () => {
    if(viewing() || busy || imageBusy || assistant) return;
    if(!description.value.trim() && !images.length) { note(L('请描述问题或添加图片'),true); return; }
    note(''); busy=true; assistant={id:crypto.randomUUID(),started:Date.now(),...(selected ? {target:{id:selected.id,expected_version:selected.version}} : {})}; mode(); assistantNote(L('助理正在整理问题…'));
    const held=assistant;
    try {
      await request('prepare',{draft_id:held.id,description:description.value,images,...(held.target ? {target:held.target} : {})});
      const materials=[{material_id:'issue-method',kind:'method',title:'Issue',explicit:true,method:{method_id:'io.molis.work.issues/issues-capture'}},
        {material_id:'issue-description',kind:'text',title:L('问题描述'),explicit:true,text:description.value}];
      for(const image of images) { const result=await assistantApi('/attachments',{name:image.name,data:image.data_url.split(',')[1]}); materials.push(result.material); }
      const result=await assistantApi('/send',{request_id:held.id,scope:{kind:'personal'},written_by:'page',
        text:'请按 Issue 方法整理录入草稿 '+held.id+'，以本次描述生成标题与类型，图片仅辅助理解。给我可编辑的确认建议卡，先不要保存。\n本次问题描述：\n'+(description.value.length<=19000 ? description.value : '见附带的“问题描述”全文材料。'),materials,
        context:{source:{surface:'issues',title:'Issue'},captured_at:new Date().toISOString()}});
      held.work=result.work.work_id; await poll();
    } catch { failed(held); }
    finally { busy=false; mode(); }
  };
  const readSaved = async id => {
    dirty=false;
    try { return await request('read?id='+encodeURIComponent(id)); }
    catch { throw new Error(L('已保存，详情读取失败。请刷新列表查看。')); }
  };
  const saveCard = async () => {
    const held=assistant, card=held.card;
    let committed=false;
    try {
      const result=await assistantApi('/works/'+held.work+'/cards/'+card.card_id+'/run',{revision:card.revision,values:{title:form.elements.title.value,type:form.elements.type.value}});
      if(result.status!=='done') { if(held.target) { await release(); compare(await request('read?id='+encodeURIComponent(held.target.id))); } throw new Error(result.outcome || unknownResult); }
      committed=true;
      return await readSaved(held.target?.id || held.id);
    } catch(error) {
      if(!committed && !held.target) { try { return await request('read?id='+encodeURIComponent(held.id)); } catch { /* A new draft ID is the only safe create receipt. Existing records do not prove an update succeeded. */ } }
      uncertain(held);
      throw error;
    }
  };
`;
