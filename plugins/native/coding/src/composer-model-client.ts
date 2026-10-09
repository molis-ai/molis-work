/**
 * The composer's model controls. Which configured model the next round uses (the Host's own catalog, `state.models`),
 * its reasoning effort where the person marked the model as taking one, and — while a round runs — switching that round
 * to the chosen model from its next model call. A note beside them says what the round on show is really using.
 */
export const CODING_COMPOSER_MODEL_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const {q,lifetime,switchModel,status}=ports;
  // The effort select is enhanced into a picker, so it is shown and hidden through its wrapper.
  const models=q('[data-coding-model]'),effort=q('[data-coding-effort]'),effortWrap=q('[data-coding-effort-wrap]'),swap=q('[data-coding-model-switch]'),note=q('[data-coding-model-note]');
  const EFFORT={low:'快速',medium:'平衡',high:'深入'};
  let list=[],live=null,busy=false,round=null;
  const chosen=()=>{try{const [provider_id,model_id]=JSON.parse(models.value||'[]');return list.find(model=>model.provider_id===provider_id && model.model_id===model_id)||null;}catch{return null;}};
  const paint=()=>{
    const model=chosen();
    // The effort is fixed for a running round (the note says which); the picker is for the next one.
    effortWrap.hidden=!model?.reasoning_effort || Boolean(live);
    effort.disabled=busy;
    // A running round can be sent to another model from its next call; the one it already uses or asked for is no switch.
    const using=live?.model_switch?.now||live?.frozen?.model_id;
    swap.hidden=!live || !model || model.model_id===using || live.model_switch?.requested===model.model_id;
    swap.disabled=busy;
    swap.title=model?'从下一次模型调用起改用 '+model.label+'；已有结果、工具与授权不变，上下文整理仍用本轮开始时的模型':'';
    // What the round on show really uses: its start model, a switch taken or asked for, its effort and thinking.
    const parts=round?[ '本轮：'+(round.model_switch?.now?round.model_switch.now+'（开始时 '+round.frozen.model_id+'）':round.frozen?.model_id||''),
      ...(round.frozen?.reasoning_effort?['思考力度 '+EFFORT[round.frozen.reasoning_effort]]:[]),
      ...(round.frozen?.thinking?['思考开启']:[]),
      ...(round.model_switch?.requested?['已请求改用 '+round.model_switch.requested+'，下一次模型调用起生效']:[])]:[];
    note.hidden=!parts.length;note.textContent=parts.join(' · ');
  };
  const fill=(next)=>{
    list=next;
    const previous=models.value;
    const options=next.map((model)=>{const option=document.createElement('option');option.value=JSON.stringify([model.provider_id,model.model_id]);option.textContent=model.label;return option;});
    if(!options.length){const option=document.createElement('option');option.textContent='还没有模型';option.value='';options.push(option);}
    q('[data-coding-model-setup]').hidden=next.length>0;
    const key=JSON.stringify(next);
    if(models.dataset.options!==key){models.replaceChildren(...options);models.dataset.options=key;if(options.some(option=>option.value===previous))models.value=previous;}
    paint();
  };
  lifetime.listen(models,'change',paint);
  lifetime.listen(swap,'click',async()=>{
    const model=chosen();if(!model || !live || busy)return;
    busy=true;paint();
    try{await switchModel(live,{provider_id:model.provider_id,model_id:model.model_id});status('已请求改用 '+model.label+'：从下一次模型调用起生效，已有结果与授权不变。');}
    catch(error){if(lifetime.alive)status('没有换模型：'+error.message,true);}
    finally{busy=false;paint();}
  });
  return {
    fill,
    /** The effort this round is started with, when the chosen model takes one and the person chose it. */
    effort:()=>chosen()?.reasoning_effort && effort.value ? {reasoning_effort:effort.value} : {},
    /** The session's saved start: the effort it was started with, where the model still takes one. */
    apply:(config)=>{effort.value=config?.reasoning_effort||'';paint();},
    /** Busy, and the round on show: the live one may be switched, and its settings are what the note says. */
    controls:({active,sending,run})=>{live=active?run:null;round=run||null;busy=Boolean(sending);models.disabled=busy;paint();},
  };
}`;

/** The effort picker sits with the model picker; the note under the composer says what the round on show uses. */
export const CODING_COMPOSER_MODEL_STYLES = `
.coding-effort { display:inline-flex; min-width:0; }
.coding-effort[hidden] { display:none; }
.coding-model-note { margin-left:8px; color:var(--muted); overflow-wrap:anywhere; }
`;
