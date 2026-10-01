/** Streaming model work (拆成任务) shows real progress and stops when the dialog is dismissed. */
export const JELLY_MATERIAL_CLIENT_SCRIPT = String.raw`
  const extractMaterial=async(path,payload)=>{
    const controller=new AbortController();let finished=false;let result=null;
    openGeneric('拆成任务','<p class="jelly-muted" data-jelly-extract-stage>'+tx('正在拆解…')+'</p><progress class="jelly-extract-progress" data-jelly-extract-progress max="1" value="0"></progress><p class="jelly-muted">'+tx('关闭此窗口会停止拆解，原文不会改动。')+'</p>','',null,()=>{if(!finished)controller.abort();});
    const dialogVersion=genericVersion;
    let failure;
    try{
      const response=await fetch((document.body.dataset.routePrefix||'')+path+'?stream=1',{method:'POST',headers:typeof molisWorkControlHeaders==='function'?molisWorkControlHeaders():{'content-type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      if(!(response.headers.get('content-type')||'').includes('ndjson')){const json=await response.json();if(!response.ok){const error=new Error(json.error||L('拆解失败'));error.code=json.code;error.details=json.details;throw error;}result=json;}
      else{
        const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
        const consume=(line)=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='result')result=event.result;
          if(event.type==='progress'){const stage=$('[data-jelly-extract-stage]');const progress=$('[data-jelly-extract-progress]');if(stage)stage.textContent=L('正在拆解…');if(progress)progress.value=Math.max(0,Math.min(1,event.progress||0));}
          if(event.type==='error'){const error=new Error(event.error||L('拆解失败'));error.code=event.code;error.details=event.details;error.status=event.status;throw error;}
        };
        for(;;){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)consume(line);}buffer+=decoder.decode();if(buffer.trim())consume(buffer);
      }
      if(!result)throw new Error(L('拆解没有返回结果'));
    }catch(error){failure=error;}
    finally{finished=true;if(genericVersion===dialogVersion)$('[data-jelly-dialog]').close();await new Promise((resolve)=>setTimeout(resolve,0));}
    if(failure){
      if(failure.name==='AbortError'){showNote(L('拆解已取消，原文不会改动'));return null;}
      throw failure;
    }
    return result;
  };
`;
