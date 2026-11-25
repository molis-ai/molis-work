import { renderInteractionComposerTarget, renderInteractionNextSteps, renderInteractionOperation, renderInteractionOptions, renderInteractionQuestion,
  type InteractionField, type InteractionOperationView } from './interaction.js';
import { INTERACTION_CLIENT_SCRIPT } from './interaction-client.js';
import { resolveCatalogSay, type CatalogSay } from './primitives/catalog-parts.js';
import { INTERACTION_STYLES } from './styles/interaction.js';

const calendar = { months: [{ year: 2026, month: 9 }, { year: 2026, month: 10 }], today: '2026-10-12' };
const card = (label: string, body: string, wide = false) => `<figure class="mw-catalog__specimen${wide ? ' mw-ix-specimen--wide' : ''}"><figcaption>${label}</figcaption><div class="mw-ix-specimen">${body}</div></figure>`;

/** The component board's specimens of every interaction part and state, with fixed sample content. */
export function renderInteractionExample(say: CatalogSay = resolveCatalogSay()): string {
  const fields = (errors: Partial<Record<string, string>> = {}, refreshed?: string): InteractionField[] => [
    { id: 'format', label: say('workbench.catalog-board.ex.ix-f-format'), hint: say('workbench.catalog-board.ex.ix-f-format-hint'), control: { kind: 'choice', options: [
      { value: 'together', label: say('workbench.catalog-board.ex.ix-opt-together'), description: say('workbench.catalog-board.ex.ix-opt-together-desc'), recommended: true, selected: true },
      { value: 'async', label: say('workbench.catalog-board.ex.ix-opt-async'), description: say('workbench.catalog-board.ex.ix-opt-async-desc') }] } },
    { id: 'topics', label: say('workbench.catalog-board.ex.ix-f-topics'), hint: say('workbench.catalog-board.ex.ix-f-topics-hint'), control: { kind: 'choice', multiple: true, options: [
      { value: 'first', label: say('workbench.catalog-board.ex.ix-opt-first'), selected: true },
      { value: 'recovery', label: say('workbench.catalog-board.ex.ix-opt-recovery'), selected: true },
      { value: 'detail', label: say('workbench.catalog-board.ex.ix-opt-detail') }] } },
    { id: 'notes', label: say('workbench.catalog-board.ex.ix-f-notes'), hint: say('workbench.catalog-board.ex.ix-f-notes-hint'), error: errors.notes,
      control: { kind: 'text', multiline: true, value: say('workbench.catalog-board.ex.ix-f-notes-val'), placeholder: say('workbench.catalog-board.ex.ix-f-notes-ph') },
      notice: { text: say('workbench.catalog-board.ex.ix-f-notes-notice'), actions: [{ id: 'adopt', label: say('workbench.catalog-board.ex.ix-act-adopt') }, { id: 'keep', label: say('workbench.catalog-board.ex.ix-act-keep'), variant: 'ghost' }] } },
    { id: 'minutes', label: say('workbench.catalog-board.ex.ix-f-minutes'), hint: say('workbench.catalog-board.ex.ix-f-minutes-hint'), error: errors.minutes, refreshed,
      control: { kind: 'number', value: errors.minutes ? 'two' : '30', unit: say('workbench.catalog-board.ex.pat-unit-min'), step: 5, stepLabels: [say('workbench.catalog-board.ex.ix-step-dec'), say('workbench.catalog-board.ex.ix-step-inc')] } },
    { id: 'date', label: say('workbench.catalog-board.ex.ix-f-date'), hint: say('workbench.catalog-board.ex.ix-f-date-hint'), control: { kind: 'date', value: '2026-10-15', weekday: say('workbench.catalog-board.ex.ix-wd-thu'), calendar } },
    { id: 'when', label: say('workbench.catalog-board.ex.ix-f-when'), hint: say('workbench.catalog-board.ex.ix-f-when-hint'), control: { kind: 'datetime', date: '2026-10-16', time: '10:00', weekday: say('workbench.catalog-board.ex.ix-wd-fri'), zone: say('workbench.catalog-board.ex.ix-tz-la'), calendar } },
    { id: 'materials', label: say('workbench.catalog-board.ex.ix-f-materials'), hint: say('workbench.catalog-board.ex.ix-f-materials-hint'), error: errors.materials, control: { kind: 'reference', source: 'material', multiple: true, max: 2, placeholder: say('workbench.catalog-board.ex.ix-f-materials-ph'),
      picked: errors.materials ? [] : [{ value: 'goal', label: say('workbench.catalog-board.ex.ix-target-label') }] } },
  ];
  const footer = (note: string, error = false) => ({
    note, error, keys: say('workbench.catalog-board.ex.ix-footer-keys'),
    actions: [{ id: 'cancel', label: say('workbench.catalog-board.ex.ix-act-skip'), variant: 'ghost' as const }, { id: 'submit', label: say('workbench.catalog-board.ex.ix-act-submit'), variant: 'primary' as const, type: 'submit' as const }],
  });
  const answeredRows: Array<[string, string]> = [
    [say('workbench.catalog-board.ex.ix-f-format'), say('workbench.catalog-board.ex.ix-opt-together')],
    [say('workbench.catalog-board.ex.ix-f-topics'), say('workbench.catalog-board.ex.ix-ans-topics')],
    [say('workbench.catalog-board.ex.ix-f-notes'), say('workbench.catalog-board.ex.ix-ans-notes')],
    [say('workbench.catalog-board.ex.ix-f-minutes'), say('workbench.catalog-board.ex.ix-ans-duration')],
    [say('workbench.catalog-board.ex.ix-f-when'), say('workbench.catalog-board.ex.ix-ans-when')],
    [say('workbench.catalog-board.ex.ix-f-materials'), say('workbench.catalog-board.ex.ix-target-label')],
  ];
  const operation = (id: string, patch: Partial<InteractionOperationView>): InteractionOperationView => ({
    id, kicker: say('workbench.catalog-board.ex.ix-op-kicker'), title: say('workbench.catalog-board.ex.ix-op-title'), badge: { label: say('workbench.catalog-board.ex.ix-badge-preview'), tone: 'waiting' },
    target: { prefix: say('workbench.catalog-board.ex.ix-prefix-acts-on'), label: say('workbench.catalog-board.ex.ix-target-label'), version: say('workbench.catalog-board.ex.ix-ver-1') }, impact: say('workbench.catalog-board.ex.ix-op-impact'), ...patch,
  });
  const preview = { title: say('workbench.catalog-board.ex.ix-preview-title'), rows: answeredRows, note: say('workbench.catalog-board.ex.ix-preview-note') };
  const errMinutes = say('workbench.catalog-board.ex.ix-err-minutes');
  const errMaterials = say('workbench.catalog-board.ex.ix-err-materials');
  const question = renderInteractionQuestion({ id: 'ix-q-open', kicker: say('workbench.catalog-board.ex.ix-q-kicker-open'), title: say('workbench.catalog-board.ex.ix-q-title'), badge: { label: say('workbench.catalog-board.ex.ix-badge-waiting'), tone: 'waiting' },
    collapse: { id: 'collapse', label: say('workbench.catalog-board.ex.ix-act-collapse') }, intro: say('workbench.catalog-board.ex.ix-q-intro'),
    about: say('workbench.catalog-board.ex.ix-q-about'), target: { prefix: say('workbench.catalog-board.ex.ix-prefix-for'), label: say('workbench.catalog-board.ex.ix-target-label'), version: say('workbench.catalog-board.ex.ix-ver-1') },
    evidence: { label: say('workbench.catalog-board.ex.ix-evidence-label'), rows: [['request_id', 'req-7f3a'], ['about', 'input-12'], ['pending', say('workbench.catalog-board.ex.ix-evidence-pending')]] },
    fields: fields({ minutes: errMinutes, materials: errMaterials }, say('workbench.catalog-board.ex.ix-refreshed')), footer: footer(say('workbench.catalog-board.ex.ix-note-errors', { count: 2 }), true) });
  const answered = renderInteractionQuestion({ id: 'ix-q-done', kicker: say('workbench.catalog-board.ex.ix-q-kicker-done'), title: say('workbench.catalog-board.ex.ix-q-title'), badge: { label: say('workbench.catalog-board.ex.ix-badge-submitted'), tone: 'done' }, fields: [],
    answered: { rows: answeredRows, actions: [{ id: 'revise', label: say('workbench.catalog-board.ex.ix-act-revise'), variant: 'ghost' }] }, footer: footer('') });
  const expired = renderInteractionQuestion({ id: 'ix-q-expired', kicker: say('workbench.catalog-board.ex.ix-q-kicker-open'), title: say('workbench.catalog-board.ex.ix-q-title'), badge: { label: say('workbench.catalog-board.ex.ix-badge-expired'), tone: 'quiet', state: 'stale' },
    target: { prefix: say('workbench.catalog-board.ex.ix-prefix-for'), label: say('workbench.catalog-board.ex.ix-target-label'), version: say('workbench.catalog-board.ex.ix-ver-2'), changed: true },
    banner: { text: say('workbench.catalog-board.ex.ix-expired-banner'), tone: 'waiting', actions: [{ id: 'reopen', label: say('workbench.catalog-board.ex.ix-act-reopen') }] },
    fields: fields().slice(2, 4), footer: { note: say('workbench.catalog-board.ex.ix-note-draft-local'), actions: [{ id: 'submit', label: say('workbench.catalog-board.ex.ix-act-submit'), variant: 'primary', type: 'submit', disabled: true }] } });
  const srcOpCard = say('workbench.catalog-board.ex.ix-src-op-card');
  const srcFollowup = say('workbench.catalog-board.ex.ix-src-followup-q');
  const stepEntries: Array<[string, string, boolean?]> = [
    [say('workbench.catalog-board.ex.ix-step-cap-collapsed'), renderInteractionNextSteps([{ id: 'question', label: say('workbench.catalog-board.ex.ix-step-resume'), source: say('workbench.catalog-board.ex.ix-src-question') }]), true],
    [say('workbench.catalog-board.ex.ix-step-cap-submitted'), renderInteractionNextSteps([{ id: 'card', label: say('workbench.catalog-board.ex.ix-act-preview'), source: srcOpCard }])],
    [say('workbench.catalog-board.ex.ix-step-cap-running'), renderInteractionNextSteps([{ id: 'card', label: say('workbench.catalog-board.ex.ix-step-running'), source: srcOpCard, busy: true }])],
    [say('workbench.catalog-board.ex.ix-step-cap-done'), renderInteractionNextSteps([{ id: 'result', label: say('workbench.catalog-board.ex.ix-step-open-result'), source: srcOpCard }, { id: 'continue', label: say('workbench.catalog-board.ex.ix-act-continue'), source: srcOpCard, primary: false }])],
    [say('workbench.catalog-board.ex.ix-step-cap-stale'), renderInteractionNextSteps([{ id: 'card', label: say('workbench.catalog-board.ex.ix-act-preview'), source: srcOpCard, disabled: true }])],
    [say('workbench.catalog-board.ex.ix-step-cap-assistant'), renderInteractionNextSteps([
      { id: 'card:run', label: say('workbench.catalog-board.ex.ix-step-todo'), source: say('workbench.catalog-board.ex.ix-src-todo-card'), primary: false, waiting: true, waitingLabel: say('workbench.catalog-board.ex.ix-waiting-prefix') },
      { id: 'question:choose:team', label: say('workbench.catalog-board.ex.ix-step-team'), source: srcFollowup, primary: false },
      { id: 'question:choose:boss', label: say('workbench.catalog-board.ex.ix-step-manager'), source: srcFollowup, primary: false },
      { id: 'open', label: say('workbench.catalog-board.ex.ix-step-open-owner'), source: say('workbench.catalog-board.ex.ix-src-this-turn'), primary: false },
      { id: 'retry', label: say('workbench.catalog-board.ex.ix-step-retry-same'), source: say('workbench.catalog-board.ex.ix-src-prev-turn'), primary: false },
    ], say('workbench.catalog-board.ex.ix-steps-label'), { max: 3, more: count => say('workbench.catalog-board.ex.ix-steps-more', { count }) })],
  ];
  const composerTarget = renderInteractionComposerTarget(say('workbench.catalog-board.ex.ix-composer-target'));
  const composerContinue = say('workbench.catalog-board.ex.ix-composer-continue');
  const steps = stepEntries.map(([label, body, hasTarget]) => card(label, `<div class="mw-ix-composer-specimen">${body}<div class="mw-ix-composer-specimen__pill">${hasTarget ? composerTarget : ''}<span>${composerContinue}</span></div></div>`)).join('');
  const initialScriptCopy = {
    errMinutes,
    errMaterials,
    materials: [
      { value: 'goal', label: say('workbench.catalog-board.ex.ix-target-label'), meta: say('workbench.catalog-board.ex.ix-mat-meta-goal') },
      { value: 'notes', label: say('workbench.catalog-board.ex.ix-mat-notes'), meta: say('workbench.catalog-board.ex.ix-mat-meta-doc') },
      { value: 'plan', label: say('workbench.catalog-board.ex.ix-mat-plan'), meta: say('workbench.catalog-board.ex.ix-mat-meta-doc') },
    ],
    noteOk: say('workbench.catalog-board.ex.ix-note-ok'),
    noteErr1: say('workbench.catalog-board.ex.ix-note-errors', { count: 1 }),
    noteErr2: say('workbench.catalog-board.ex.ix-note-errors', { count: 2 }),
  };
  const script = `(()=>{const card=document.querySelector('[data-ix-question="ix-q-open"]');if(!card)return;
    const readLive=()=>({errMinutes:globalThis.t.text("workbench.catalog-board.ex.ix-err-minutes"),errMaterials:globalThis.t.text("workbench.catalog-board.ex.ix-err-materials"),
      materials:[{value:"goal",label:globalThis.t.text("workbench.catalog-board.ex.ix-target-label"),meta:globalThis.t.text("workbench.catalog-board.ex.ix-mat-meta-goal")},
        {value:"notes",label:globalThis.t.text("workbench.catalog-board.ex.ix-mat-notes"),meta:globalThis.t.text("workbench.catalog-board.ex.ix-mat-meta-doc")},
        {value:"plan",label:globalThis.t.text("workbench.catalog-board.ex.ix-mat-plan"),meta:globalThis.t.text("workbench.catalog-board.ex.ix-mat-meta-doc")}],
      noteOk:globalThis.t.text("workbench.catalog-board.ex.ix-note-ok"),
      noteErr1:globalThis.t.text("workbench.catalog-board.ex.ix-note-errors",{count:1}),
      noteErr2:globalThis.t.text("workbench.catalog-board.ex.ix-note-errors",{count:2})});
    let copy=${JSON.stringify(initialScriptCopy).replaceAll('<', '\\u003c')};
    let errors={minutes:copy.errMinutes,materials:copy.errMaterials};
    document.addEventListener("molis-work:language-changed",()=>{if(!globalThis.t?.text)return;copy=readLive();
      if(errors.minutes)errors.minutes=copy.errMinutes;if(errors.materials)errors.materials=copy.errMaterials;});
    const client=(${INTERACTION_CLIENT_SCRIPT})(card,{
      references:(source,query)=>Promise.resolve({items:copy.materials.filter(item=>item.label.includes(query)||item.meta.includes(query))}),
      onChange:({field})=>{if(errors[field]){delete errors[field];client.showErrors(errors)}},
      onAction:id=>{const notice=card.querySelector('[data-ix-notice]');if(id==='adopt'){client.write({minutes:'45'});delete errors.minutes;client.showErrors(errors)}if(id==='adopt'||id==='keep'){if(notice)notice.hidden=true}},
      onSubmit:()=>{const v=client.read();const m=Number(v.minutes);errors={};
        if(!Number.isInteger(m)||m<15||m>120)errors.minutes=copy.errMinutes;
        if(!v.materials.length||v.materials.length>2)errors.materials=copy.errMaterials;
        client.showErrors(errors,{focus:true});
        const count=Object.keys(errors).length;
        const note=card.querySelector('[data-ix-note]');if(note){note.textContent=count===0?copy.noteOk:count===1?copy.noteErr1:copy.noteErr2;note.dataset.tone=count?'error':''}}
    });})()`;
  return `<style>${INTERACTION_STYLES}
    .mw-ix-specimen { width: min(620px, 100%); }
    .mw-ix-specimen--wide { grid-column: 1 / -1; }
    .mw-ix-composer-specimen { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; width: min(560px, 100%); }
    .mw-ix-composer-specimen .mw-ix-steps { flex-wrap: wrap; max-width: 100%; }
    .mw-ix-composer-specimen__pill { flex: 1 1 200px; min-width: 0; display: flex; align-items: center; gap: 6px; height: 50px; padding: 0 14px; border-radius: var(--r-composer, 15px); background: var(--paper); box-shadow: var(--lift-2); color: var(--muted); }
  </style>
  <div class="mw-catalog__specimens">
    ${card(say('workbench.catalog-board.ex.ix-cap-q-open'), question, true)}
    ${card(say('workbench.catalog-board.ex.ix-cap-q-done'), answered)}
    ${card(say('workbench.catalog-board.ex.ix-cap-q-expired'), expired)}
    ${card(say('workbench.catalog-board.ex.ix-cap-opt-rich'), renderInteractionOptions([{ value: 'a', label: say('workbench.catalog-board.ex.ix-opt-together'), description: say('workbench.catalog-board.ex.ix-opt-together-desc'), recommended: true, selected: true }, { value: 'b', label: say('workbench.catalog-board.ex.ix-opt-async'), description: say('workbench.catalog-board.ex.ix-opt-async-desc') }], { id: 'ix-options-demo' }))}
    ${card(say('workbench.catalog-board.ex.ix-cap-opt-multi'), renderInteractionOptions([{ value: 'a', label: say('workbench.catalog-board.ex.ix-opt-first'), selected: true }, { value: 'b', label: say('workbench.catalog-board.ex.ix-opt-recovery') }, { value: 'c', label: say('workbench.catalog-board.ex.ix-opt-detail'), disabled: true }], { id: 'ix-choices-demo', multiple: true }))}
    ${card(say('workbench.catalog-board.ex.ix-cap-op-ready'), renderInteractionOperation(operation('ix-op-ready', { actions: [{ id: 'revise', label: say('workbench.catalog-board.ex.ix-act-revise'), variant: 'ghost' }, { id: 'preview', label: say('workbench.catalog-board.ex.ix-act-preview') }] })))}
    ${card(say('workbench.catalog-board.ex.ix-cap-op-preview'), renderInteractionOperation(operation('ix-op-preview', { badge: { label: say('workbench.catalog-board.ex.ix-badge-exec'), tone: 'waiting' }, preview: { ...preview, actions: [{ id: 'revise', label: say('workbench.catalog-board.ex.ix-act-back-edit'), variant: 'ghost' }, { id: 'execute', label: say('workbench.catalog-board.ex.ix-act-execute'), variant: 'primary' }] } })))}
    ${card(say('workbench.catalog-board.ex.ix-cap-op-unknown'), renderInteractionOperation(operation('ix-op-unknown', { badge: { label: say('workbench.catalog-board.ex.ix-badge-unknown'), tone: 'waiting', state: 'verify' }, preview, status: { text: say('workbench.catalog-board.ex.ix-op-unknown-status'), tone: 'waiting' }, recovery: [{ id: 'reconcile', label: say('workbench.catalog-board.ex.ix-act-reconcile') }] })))}
    ${card(say('workbench.catalog-board.ex.ix-cap-op-done'), renderInteractionOperation(operation('ix-op-done', { badge: { label: say('workbench.catalog-board.ex.ix-badge-done'), tone: 'done' }, result: { title: say('workbench.catalog-board.ex.ix-op-done-title'), body: say('workbench.catalog-board.ex.ix-op-done-body'), actions: [{ id: 'open', label: say('workbench.catalog-board.ex.ix-act-open-summary') }, { id: 'continue', label: say('workbench.catalog-board.ex.ix-act-continue'), variant: 'ghost' }] } })))}
    ${card(say('workbench.catalog-board.ex.ix-cap-op-stale'), renderInteractionOperation(operation('ix-op-stale', { badge: { label: say('workbench.catalog-board.ex.ix-badge-stale'), tone: 'quiet', state: 'stale' }, target: { prefix: say('workbench.catalog-board.ex.ix-prefix-acts-on'), label: say('workbench.catalog-board.ex.ix-target-label'), version: say('workbench.catalog-board.ex.ix-ver-2'), changed: true }, status: { text: say('workbench.catalog-board.ex.ix-op-stale-status') } })))}
    ${steps}
  </div>
  <script>${script}</script>`;
}
