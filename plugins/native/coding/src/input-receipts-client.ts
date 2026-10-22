/**
 * The person's words to a round under way, and what became of each (specs/ai-input-receipts §3.3, §4.1, §4.2): how a
 * supplement is sent and the bubble it shows while on its way. The receipt under it is the workbench's shared one
 * (`host.receipts`, the same as the Assistant's): it says what the run's own ledger says and, apart from that, what the AI
 * says, and it announces its own changes.
 *
 * Every supplement has a key from the moment it is sent. When the answer is lost (the connection dropped, or the reply
 * could not be read), the words and the mode stay in the composer and the bubble says to send again: the same words in
 * the same mode go under the same key, so the runtime returns the first one instead of taking it twice (§7). Changed
 * words are a new supplement. An answer the Host refused clears the bubble. When the run's record shows a supplement under
 * that key, the lost one did arrive: the bubble goes, so the same words are not shown twice with opposite claims, and the
 * page says once that it had arrived, as it does for a resend the runtime recognises (`landed`).
 *
 * From a receipt (`act`, stage 3b-2a) the person takes back a supplement the round has not put in the context, or sends a
 * correction naming it (`about`); both go through the round's control, and the receipt keeps the words until they arrive.
 *
 * A step a person added for a supplement says so (`from`, stage 3d-3): the plan card and the TaskBoard draw the same
 * 「来自补充「…」」 button, the shared receipt's own link to the receipt Coding's conversation drew; none when it drew none.
 *
 * Interrupting drops the reply the model was writing: the page dims the one it was showing being written and says so. The runtime's
 * record does not mark that reply (a Prologue need in the spec), so the mark is the page's own and a reload loses it.
 */
export const CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT = `({api,refresh,q,landed,receipts})=>{
  const SENT={'next-boundary':L('coding.sent.next-boundary'),interrupt:L('coding.sent.interrupt'),'after-run':L('coding.sent.after-run')};
  const small=text=>{const node=document.createElement('small');node.className='coding-turn-receipt';node.textContent=text;return node;};
  const AGAIN=L('coding.sent.again'),unsure=error=>error instanceof TypeError||error.name=='SyntaxError',control=id=>'/sessions/'+encodeURIComponent(id)+'/control';let item=null;
  const send=async sent=>{
    sent.lost=0;item=sent;refresh();const writing=sent.mode=='interrupt'&&q('.coding-turn.is-writing');
    try{
      const {receipt}=await api(control(sent.id),'POST',{kind:'steer',run_id:sent.run,text:sent.text,key:sent.key,mode:sent.mode});
      if(item==sent)item=null;
      if(writing&&receipt.delivered=='run'&&!receipt.replayed){writing.classList.add('is-dropped');writing.append(small(L('coding.sent.dropped')));}
      return receipt.replayed?AGAIN:receipt.delivered=='queued'&&sent.mode!='after-run'?L('coding.sent.just-ended'):SENT[sent.mode];
    }catch(error){if(unsure(error)){sent.lost=1;throw Error(L('coding.sent.unconfirmed'))}if(item==sent)item=null;throw error;}
    finally{refresh();}
  };
  return {
    from(node,first){const one=node?.origins?.[0];return one?receipts.link(q('[data-coding-turns]'),one.input_id,first,'来自补充「'):null;},
    steer(id,run,text,mode){
      return send({id,run,text,mode,key:item?.lost&&item.id==id&&item.text==text&&item.mode==mode?item.key:'send.'+crypto.randomUUID()});
    },
    act(id,run){
      const path=control(id),lost=error=>{throw unsure(error)?Error(L('coding.sent.unconfirmed-again')):error;};
      return {
        withdraw:input_id=>api(path,'POST',{kind:'withdraw',run_id:run,input_id}).then(({withdrawn})=>withdrawn.from=='queued'?L('coding.sent.withdrawn'):'',lost).finally(refresh),
        correct:(about,text,key)=>api(path,'POST',{kind:'steer',run_id:run,text,about,key:'send.'+key}).then(({receipt})=>receipt.replayed?AGAIN:receipt.delivered=='queued'?SENT['after-run']:L('coding.sent.corrected'),lost).finally(refresh),
      };
    },
    bubble(id,run){
      if(item?.id!=id)return null;
      if(item.lost&&run.turns.some(turn=>turn.steer?.key==item.key)){const sent=item;item=null;landed(sent,AGAIN);return null;}
      if(item.node?.dataset.lost!=item.lost){
        const node=item.node=document.createElement('article');node.className='coding-turn is-sending';node.dataset.kind='user';node.dataset.lost=item.lost;node.textContent=item.text;
        node.append(small(item.lost?L('coding.sent.lost'):L('coding.sent.sending')));
      }
      return item.node;
    },
  };
}`;
