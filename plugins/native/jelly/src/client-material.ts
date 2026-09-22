/** Streaming material extraction exposes real progress and aborts on dismissal. */
export const JELLY_MATERIAL_CLIENT_SCRIPT = String.raw`
  const extractMaterial=async(path,payload)=>{
    const controller=new AbortController();let finished=false;let result=null;
    openGeneric(path.endsWith('/ai')?'整理内容':'读取来源','<p class="jelly-muted" data-jelly-extract-stage>'+tx('正在读取来源…')+'</p><progress class="jelly-extract-progress" data-jelly-extract-progress max="1" value="0"></progress><p class="jelly-muted">'+tx('关闭此窗口会取消读取。原始灵感不会被清空。')+'</p>','',null,()=>{if(!finished)controller.abort();});
    const dialogVersion=genericVersion;
    let failure;
    try{
      const response=await fetch((document.body.dataset.routePrefix||'')+path+'?stream=1',{method:'POST',headers:typeof molisWorkControlHeaders==='function'?molisWorkControlHeaders():{'content-type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      if(!(response.headers.get('content-type')||'').includes('ndjson')){const json=await response.json();if(!response.ok){const error=new Error(json.error||L('来源读取失败'));error.code=json.code;error.details=json.details;throw error;}result=json;}
      else{
        const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
        const consume=(line)=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='result')result=event.result;
          if(event.type==='progress'){const stage=$('[data-jelly-extract-stage]');const progress=$('[data-jelly-extract-progress]');const labels={extracting:'正在提取内容',downloading:'正在下载转写模型',transcribing:'正在转写音频',loading:'正在加载模型',ocr:'正在识别文字',frames:'正在读取视频画面',frame_ocr:'正在读取视频画面',fetching:'正在读取网页',summarizing:'正在提炼内容',model_download:'正在下载转写模型'};if(stage)stage.textContent=L(labels[event.stage]||event.stage||'正在读取来源…');if(progress)progress.value=Math.max(0,Math.min(1,event.progress||0));}
          if(event.type==='error'){const error=new Error(event.error||L('来源读取失败'));error.code=event.code;error.details=event.details;error.status=event.status;throw error;}
        };
        for(;;){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)consume(line);}buffer+=decoder.decode();if(buffer.trim())consume(buffer);
      }
      if(!result)throw new Error(L('来源读取没有返回结果'));
    }catch(error){failure=error;}
    finally{finished=true;if(genericVersion===dialogVersion)$('[data-jelly-dialog]').close();await new Promise((resolve)=>setTimeout(resolve,0));}
    if(failure){
      if(failure.name==='AbortError'){showNote(L('读取已取消，原始内容保留'));return null;}
      if(failure.code==='jelly.material.model_required'){
        const size=failure.details?.approximate_bytes;const message=L('转写需要下载本机语音模型。')+(size?' '+Math.round(size/1024/1024)+' MB。':' ')+L('下载后只用于本机转写。现在下载并继续？');
        if(await confirm('下载语音模型',message,'下载并继续')){await new Promise((resolve)=>setTimeout(resolve,0));return extractMaterial(path,{...payload,allow_model_download:true});}return null;
      }
      throw failure;
    }
    return result;
  };
  const saveMaterial=async(material,sourceId,fileName)=>{
    if(!material)return;
    if(sourceId){const source=recordFor('inspiration',sourceId);await command({type:'inspiration.update',id:sourceId,patch:{...(fileName?{file_name:fileName}:{}),raw_text:material.text,material,title:source.title||material.title||fileName||L('新灵感')}});if(selected?.id===sourceId)openRecord('inspiration',sourceId);}
    else await command({type:'inspiration.create',title:material.title||fileName||L('新灵感'),input_kind:fileName?'file':'text',file_name:fileName||undefined,raw_text:material.text,material,category_id:filterCategory||'uncategorized'});
    showNote(material.coverage?.status==='partial'?L('已读取部分内容，请核对原始文件。'):L('来源内容已保存'));
  };
  const readSourceAgain=async()=>{
    await flushEditor();if(selected?.kind!=='inspiration')return;const source=recordFor('inspiration',selected.id);let material;
    if(source.file_name){const attachment=source.material?.attachment;if(!attachment){showNote(L('这份文件没有可重读的副本，请重新选择文件。'),true);if(!source.note_id)$('[data-jelly-material-file]').click();return;}material=await extractMaterial('/api/jelly/material/reread',{file_name:attachment.file_name,sha256:attachment.sha256});}
    else{if(!source.url)throw new Error(L('先填写来源链接'));material=await extractMaterial('/api/jelly/source',{url:source.url});}
    try{await saveMaterial(material,source.id);}catch(error){if(source.note_id&&error.status===409)throw new Error(L('新提取的正文与已关联笔记的原文不同。原始内容保留，请新建灵感接收这份新内容。'));throw error;}
  };
`;
