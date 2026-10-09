/**
 * The composer's model controls: which configured model the next round uses. The choices are the Host's own catalog
 * (`state.models`); a choice that is no longer offered falls back to what the person picked before when it still is.
 */
export const CODING_COMPOSER_MODEL_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const {q}=ports;
  const models=q('[data-coding-model]');
  const fill=(list)=>{
    const previous=models.value;
    const options=list.map((model)=>{const option=document.createElement('option');option.value=JSON.stringify([model.provider_id,model.model_id]);option.textContent=model.label;return option;});
    if(!options.length){const option=document.createElement('option');option.textContent='还没有模型';option.value='';options.push(option);}
    q('[data-coding-model-setup]').hidden=list.length>0;
    const key=JSON.stringify(list);
    if(models.dataset.options!==key){models.replaceChildren(...options);models.dataset.options=key;if(options.some(option=>option.value===previous))models.value=previous;}
  };
  return {fill};
}`;
