/** Host-owned review actions. Plugins receive a rendering hook, never a decision capability. */
export const AGENT_REVIEW_CLIENT_FACTORY_SCRIPT = `(host) => {
  const mounts=new WeakMap(), busy=new Set();
  const read=async(path,body) => {
    const response=await fetch(host.route(path),body ? {method:'POST',headers:host.headers(),body:JSON.stringify(body)} : {});
    const data=await response.json(); if(!response.ok) throw new Error(data.error || '审查暂不可用');return data;
  };
  const show=async(container,refs) => {
    if(!container) return;
    let state=mounts.get(container);
    if(!state) {
      state={key:'',ticket:0,refs:[]}; mounts.set(container,state);
      container.addEventListener('click',async event=>{
        const button=event.target.closest('[data-agent-review-approve],[data-agent-review-reject]');
        if(!button || !container.contains(button)) return;
        const review_id=button.dataset.agentReviewApprove || button.dataset.agentReviewReject;
        if(busy.has(review_id)) return;
        busy.add(review_id); button.disabled=true;
        try { await read('/api/agent/reviews/decide',{review_id,decision:button.dataset.agentReviewApprove ? 'approve' : 'reject'}); }
        catch(error) {
          const row=button.closest('[data-agent-review-item]');
          let note=row.querySelector('[data-review-error]');
          if(!note){note=document.createElement('p');note.dataset.reviewError='';note.className='agent-review-error';note.setAttribute('role','alert');row.append(note);}
          note.textContent=error.message;
        } finally {busy.delete(review_id);button.disabled=false;void show(container,state.refs);}
      });
    }
    const key=JSON.stringify(refs); const ticket=++state.ticket;
    if(state.key!==key){container.replaceChildren();delete container.dataset.reviewHtml;state.key=key;}
    state.refs=refs;
    if(!refs.length) {container.hidden=true;return;}
    try {
      const query=new URLSearchParams();refs.forEach(ref=>query.append('run_id',ref.run_id));
      const data=await read('/api/agent/reviews?'+query);
      if(ticket!==state.ticket || key!==state.key) return;
      container.hidden=data.reviews.length===0;
      container.querySelector('[data-review-load-error]')?.remove();
      if(container.dataset.reviewHtml!==data.html) {
        const open=[...container.querySelectorAll('details[open]')].map(item=>item.closest('[data-agent-review-item]')?.dataset.agentReviewItem);
        container.innerHTML=data.html;container.dataset.reviewHtml=data.html;
        container.querySelectorAll('details').forEach(item=>{if(open.includes(item.closest('[data-agent-review-item]')?.dataset.agentReviewItem)) item.open=true;});
      }
      container.querySelectorAll('[data-agent-review-item]').forEach(row=>row.querySelectorAll('button').forEach(button=>{button.disabled=busy.has(row.dataset.agentReviewItem);}));
    } catch(error) {
      if(ticket!==state.ticket) return;
      container.hidden=false;
      let note=container.querySelector('[data-review-load-error]');
      if(!note){note=document.createElement('p');note.dataset.reviewLoadError='';note.setAttribute('role','alert');container.prepend(note);}
      note.textContent='审查暂未刷新：'+error.message;
    }
  };
  return show;
}`;
