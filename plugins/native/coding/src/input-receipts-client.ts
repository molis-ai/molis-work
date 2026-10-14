/**
 * The person's words to a round under way, and what became of each (specs/ai-input-receipts §3.3, §4.2): sending a
 * supplement, and the receipt line under it. The line says only what the run's own ledger says — sent, in the
 * model's context, read, not read by the end of the round, taken back — never that the model followed it.
 */
export const CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT = `({api})=>{
  const WORDS={applied:'已放进上下文，等 AI 回应',read:'AI 已读到',unread:'这一轮结束时 AI 没读到',withdrawn:'已撤回'};
  return {receipt(turn){
    if(!turn.steer)return null;
    const node=document.createElement('small');node.className='coding-turn-receipt';node.textContent=WORDS[turn.steer.state]||'已送达';
    node.title='读到不代表已遵循，也不撤销先前操作；补充要求不代替回答问题。';return node;
  },async steer(sessionId,runId,text){
    await api('/sessions/'+encodeURIComponent(sessionId)+'/control','POST',{kind:'steer',run_id:runId,text});
    return '补充要求已交给执行引擎，等待后续处理。';
  }};
}`;
