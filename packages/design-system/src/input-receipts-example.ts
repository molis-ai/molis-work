import { INPUT_RECEIPTS_CLIENT_SCRIPT } from './input-receipts-client.js';
import { INPUT_RECEIPTS_STYLES } from './styles/input-receipts.js';

/** Sample turns, one per state the receipt can show; the ids are fixed so the specimens are the same on every load. */
const TURNS = [
  { turn_id: 't1', kind: 'user', text: '登录要兼容旧的 session cookie', steer: { id: 'steer-1', state: 'received' } },
  { turn_id: 't2', kind: 'user', text: '错误提示用中文', steer: { id: 'steer-2', state: 'applied' } },
  { turn_id: 't3', kind: 'user', text: '顺便把注册接口也覆盖一下', steer: { id: 'steer-3', state: 'read', model_claim: {
    treatment: 'later-step', kind: 'request', targets: [{ kind: 'board-node', board: 'plan', id: 'n4' }], impacts: ['scope', 'acceptance'],
    note: '注册接口的失败路径放到第 4 步一起测', tool_call_id: 'call-9', revisions: 2 } }, open: true },
  { turn_id: 't4', kind: 'user', text: '超时改成多少合适？', steer: { id: 'steer-4', state: 'read', model_claim: {
    treatment: 'needs-clarification', kind: 'question', targets: [{ kind: 'pending', id: 'pend-2' }], impacts: [], revisions: 1 },
    questions: [{ pending_id: 'pend-2', state: 'open' }] } },
  { turn_id: 't5', kind: 'user', text: '日志里不要写令牌', steer: { id: 'steer-5', state: 'read' } },
  { turn_id: 't6', kind: 'user', text: '改完补一条回归测试', steer: { id: 'steer-6', state: 'unread' } },
  { turn_id: 't7', kind: 'user', text: '先别动公开接口', steer: { id: 'steer-7', state: 'withdrawn' } },
  { turn_id: 't8', kind: 'notice', text: '这一轮被中断，宿主按你的要求接着做。', steer: { id: 'steer-8', state: 'read' } },
];

const STATIC_STYLES = `
.mw-rc-specimens{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:24px;align-items:start}
.mw-rc-coding,.mw-rc-assistant{display:grid;gap:14px;padding:16px;border-radius:var(--r-row);background:var(--paper);box-shadow:var(--lift-1)}
.mw-rc-coding article{padding:10px 12px;border-radius:var(--r-row);background:var(--wash);color:var(--ink);font-size:14px}
.mw-rc-coding article[data-kind=notice]{padding-left:12px;border-left:2px solid var(--line);background:none;color:var(--muted)}
.mw-rc-assistant{max-width:380px}
.mw-rc-assistant>div{display:flex;flex-direction:column;gap:12px}
.mw-rc-assistant p.msg{align-self:flex-end;max-width:85%;margin:0;padding:8px 12px;border-radius:14px;background:var(--wash);color:var(--ink);font-size:14px}
.mw-rc-assistant p.msg[data-kind=notice]{align-self:stretch;background:none;color:var(--muted);font-size:12px}
.mw-rc-assistant .mw-receipt{align-self:flex-end;max-width:88%;margin-top:-8px}
.mw-rc-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:16px;font-size:12px;color:var(--muted)}
`;

/**
 * The component board's specimen of the supplement receipt: every state in Coding's bubble and under the Assistant's, from
 * the same program and the same turns. 「推进一步」 moves the second supplement on, so the board shows a change in place and
 * what the page's status region says about it. 撤回 and 更正… work on the board: a correction is added as a new supplement
 * naming the one it corrects, so both ends of the link show.
 */
export function renderInputReceiptsExample(): string {
  return `<style>${INPUT_RECEIPTS_STYLES}${STATIC_STYLES}</style>
  <div class="mw-rc-specimens">
    <figure class="mw-catalog__specimen"><figcaption>Coding · 回执在气泡里</figcaption><div class="mw-rc-coding" data-rc-coding></div></figure>
    <figure class="mw-catalog__specimen"><figcaption>助理 · 回执在气泡下</figcaption><div class="mw-rc-assistant"><div role="log" aria-live="polite" aria-relevant="additions" data-rc-assistant></div></div></figure>
  </div>
  <div class="mw-rc-controls"><button type="button" class="mw-btn mw-btn--secondary" data-rc-step>推进一步</button><span>状态区最近说的：<output data-rc-said>（还没有）</output></span></div>
  <script>(()=>{const coding=document.querySelector('[data-rc-coding]'),assistant=document.querySelector('[data-rc-assistant]');if(!coding||!assistant)return;
    const L=globalThis.L||(text=>text),one=(${INPUT_RECEIPTS_CLIENT_SCRIPT})(L),two=(${INPUT_RECEIPTS_CLIENT_SCRIPT})(L);
    const turns=${JSON.stringify(TURNS)};
    const act={withdraw:async id=>{turns.find(turn=>turn.steer.id===id).steer.state='withdrawn';setTimeout(paint);},
      correct:async(about,text)=>{const n=turns.length+1;turns.push({turn_id:'t'+n,kind:'user',text,steer:{id:'steer-'+n,state:'received',about}});setTimeout(paint);}};
    const paint=()=>{coding.replaceChildren();assistant.replaceChildren();for(const turn of turns){
      const node=document.createElement('article');node.dataset.kind=turn.kind;node.textContent=turn.text;const a=one.line(turn,{awaiting_input:turn.turn_id==='t1'?[{}]:[]},act);if(a)node.append(a);coding.append(node);
      const bubble=document.createElement('p');bubble.className='msg';bubble.dataset.kind=turn.kind;bubble.textContent=turn.text;assistant.append(bubble);const b=two.line(turn,{awaiting_input:turn.turn_id==='t1'?[{}]:[]},act);if(b)assistant.append(b);
      if(turn.open){a?.setAttribute('open','');b?.setAttribute('open','');delete turn.open;}}};
    paint();
    const steps=[{state:'read'},{state:'read',model_claim:{treatment:'apply-now',kind:'constraint',targets:[],impacts:['constraint'],revisions:1}}];
    document.querySelector('[data-rc-step]')?.addEventListener('click',()=>{const next=steps.shift();if(!next)return;Object.assign(turns[1].steer,next);paint();
      queueMicrotask(()=>queueMicrotask(()=>{const said=[...document.querySelectorAll('body > p.mw-sr-only[role=status]')].map(node=>node.textContent).filter(Boolean).pop();const out=document.querySelector('[data-rc-said]');if(out&&said)out.textContent=said;}));});
  })();</script>`;
}
