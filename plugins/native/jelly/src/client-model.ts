/** Configuration uses the Host's existing model providers and credential storage. */
export const JELLY_MODEL_CLIENT_SCRIPT = String.raw`
  const openModelSettings=async()=>{
    await flushEditor();const payload=await request('GET','/api/jelly/model-settings');const settings=payload.settings||payload;
    let providerId=settings.selection?.provider_id||settings.effective_selection?.provider_id||settings.providers?.find((provider)=>provider.enabled!==false)?.provider_id||settings.providers?.[0]?.id||'';
    let modelId=settings.selection?.model_id||settings.effective_selection?.model_id||'';let custom=false;let apiFormat='openai-chat-completions';
    const providers=(settings.providers||[]).filter((provider)=>provider.enabled!==false);
    const provider=()=>providers.find((entry)=>(entry.provider_id||entry.id)===providerId);
    const models=()=>provider()?.models?.filter((model)=>model.enabled!==false)||[];
    if(!modelId)modelId=models()[0]?.model_id||'';
    const form='<p class="jelly-muted">'+tx('提炼摘要或拆解时，原文会发送给所选模型。保存设置不会发送内容。')+'</p><div class="jelly-choice-row" data-jelly-model-providers></div><div class="jelly-choice-row" data-jelly-model-options style="margin-top:12px"></div><div data-jelly-model-custom hidden><label class="jelly-field" style="margin-top:16px">'+tx('服务地址')+'<input class="mw-input" type="url" data-jelly-model-base placeholder="https://api.example.com/v1"></label><fieldset class="jelly-field" style="margin-top:12px"><legend>'+tx('API 格式')+'</legend><div class="jelly-choice-row" data-jelly-model-api></div></fieldset><label class="jelly-field" style="margin-top:12px">'+tx('模型 ID')+'<input class="mw-input" data-jelly-model-id placeholder="model-id"></label><label class="jelly-field" style="margin-top:12px">'+tx('账号连接')+'<select class="mw-select" data-jelly-model-connection><option value="">'+tx('选择连接')+'</option>'+(settings.connections||[]).filter((connection)=>connection.state==='connected').map((connection)=>'<option value="'+esc(connection.connection_id)+'"'+(settings.custom_connection_id===connection.connection_id?' selected':'')+'>'+esc(connection.display_name)+'</option>').join('')+'</select></label><a href="/settings/connectors?connector=model-api" target="_blank" rel="noopener">'+tx('在 Connectors 管理 API Key')+'</a></div><p class="jelly-muted" data-jelly-model-status></p>';
    openGeneric('摘要与拆解模型',form,'保存模型设置',async()=>{
      let body;
      if(custom){const base=$('[data-jelly-model-base]').value.trim();const model=$('[data-jelly-model-id]').value.trim();if(!base||!model)throw new Error(L('填写服务地址和模型 ID'));body={base_url:base,api_format:apiFormat,model_id:model,connection_id:$('[data-jelly-model-connection]').value};}
      else{if(!providerId||!modelId)throw new Error(L('选择一个模型，或填写自定义模型'));body={provider_id:providerId,model_id:modelId};}
      await request('POST','/api/jelly/model-settings',body);showNote(L('模型设置已保存'));
    });
    const paint=()=>{
      $('[data-jelly-model-providers]').innerHTML=providers.map((entry)=>btn(entry.name||entry.id,'data-jelly-provider="'+esc(entry.provider_id||entry.id)+'" aria-pressed="'+(!custom&&(entry.provider_id||entry.id)===providerId)+'"')).join('')+btn('自定义模型','data-jelly-provider="__custom" aria-pressed="'+custom+'"');
      $('[data-jelly-model-options]').innerHTML=custom?'':models().map((model)=>btn(model.display_name||model.model_id,'data-jelly-model-choice="'+esc(model.model_id)+'" aria-pressed="'+(model.model_id===modelId)+'"')).join('');
      $('[data-jelly-model-custom]').hidden=!custom;
      $('[data-jelly-model-api]').innerHTML=btn('OpenAI Chat Completions','data-jelly-api-format="openai-chat-completions" aria-pressed="'+(apiFormat==='openai-chat-completions')+'"')+btn('Anthropic Messages','data-jelly-api-format="anthropic-messages" aria-pressed="'+(apiFormat==='anthropic-messages')+'"');
      $('[data-jelly-model-status]').textContent=L(settings.selection&&!settings.configured?'原来选择的模型已不可用，选择仍保留。请恢复连接或重新选择模型。':!providers.length&&!custom?'还没有可用模型。可以填写已有服务的地址和密钥。':settings.configured?'已有模型配置；可在这里切换 Jelly 使用的模型。':'配置后即可提炼摘要和拆解。按原文逐行拆分无需模型。');
    };
    const dialogBody=$('[data-jelly-dialog-body]');dialogBody.onclick=(event)=>{
      const target=event.target.closest('button');if(!target)return;
      if(target.hasAttribute('data-jelly-provider')){custom=target.dataset.jellyProvider==='__custom';if(!custom){providerId=target.dataset.jellyProvider;modelId=models()[0]?.model_id||'';}paint();}
      if(target.hasAttribute('data-jelly-model-choice')){modelId=target.dataset.jellyModelChoice;paint();}
      if(target.hasAttribute('data-jelly-api-format')){apiFormat=target.dataset.jellyApiFormat;paint();}
    };
    genericCleanup=()=>{dialogBody.onclick=null;};paint();
  };
`;
