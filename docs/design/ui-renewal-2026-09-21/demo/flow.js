const STORAGE_KEY = 'molis-design-workflow-v1';
const ORIGINAL = [
  '第一次参与 Molis AI，不需要先有一个完整的计划。带着一个你关心的问题，看看大家正在做的事。',
  '先阅读社区指引，了解正在进行的项目与参与方式，再选择一个你愿意投入时间的小任务。',
  '在社区留下你的想法和结果。你可以从讨论开始，也可以贡献一次整理、一个原型，或一段真实的使用反馈。',
];
const SECTIONS = ['先认识这里', '迈出第一步', '参与以后'];
const OLD_REQUIREMENT = '先阅读社区指引，再选择参与';
const NEW_REQUIREMENT = '直接报名参加一次活动';
const BASE = { version: 1, paragraphs: ORIGINAL, basis: OLD_REQUIREMENT, createdAt: null };

function freshState() {
  return {
    decision: 'pending', decisionAt: null,
    draft: [...ORIGINAL], draftBasis: OLD_REQUIREMENT, savedAt: null,
    selection: { paragraph: 1, start: 0, end: 0 },
    results: [], reviews: {}, activeVersion: null,
    reviewSection: 1, reviewDrafts: {}, feedbackVersion: null,
  };
}

export function createFlow({ icon, esc, btn, badge, go, toast, openDialog, closeDialog, render }) {
  let state = freshState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.draft) && saved.draft.length === 3 && saved.draft.every(x => typeof x === 'string')) {
      state = { ...state, ...saved };
      state.results = (Array.isArray(saved.results) ? saved.results : []).filter(r => Number.isInteger(r.version) && r.version > 1 && Array.isArray(r.paragraphs) && r.paragraphs.length === 3 && r.paragraphs.every(p => typeof p === 'string'));
      state.reviews = saved.reviews && typeof saved.reviews === 'object' ? saved.reviews : {};
      state.reviewDrafts = saved.reviewDrafts && typeof saved.reviewDrafts === 'object' ? saved.reviewDrafts : {};
      state.reviewSection = Number.isInteger(saved.reviewSection) && saved.reviewSection >= 0 && saved.reviewSection < 3 ? saved.reviewSection : 1;
      // Keep an existing prototype draft on the paragraph selected when it was saved.
      for (const key of Object.keys(state.reviewDrafts)) {
        if (/^\d+$/.test(key)) {
          state.reviewDrafts[`${key}:${state.reviewSection}`] ??= state.reviewDrafts[key];
          delete state.reviewDrafts[key];
        }
      }
    }
  } catch { /* A fresh local example is still usable when storage is unavailable. */ }
  let error = '';
  let invalidParagraph = -1;
  let storageFailed = false;
  let writingLayoutObserver;
  const reviewDraftKey = (version, paragraph = state.reviewSection) => `${version}:${paragraph}`;
  const latest = () => state.results.at(-1) || null;
  const current = () => state.results.find(r => r.version === state.activeVersion) || latest();
  const reviewFor = version => state.reviews[version] || { readAt: null, feedback: [] };
  const draftDirty = () => JSON.stringify(state.draft) !== JSON.stringify((latest() || BASE).paragraphs);
  const stamp = value => value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '初始样稿';

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageFailed = false;
      return true;
    } catch {
      if (!storageFailed) toast('浏览器未允许保存。当前稿件还在本页，刷新前请复制正文。');
      storageFailed = true;
      return false;
    }
  }

  function getStatus() {
    const result = latest();
    const review = result ? reviewFor(result.version) : null;
    const needsRevision = Boolean(review?.feedback?.length);
    const needsReview = Boolean(result && !review?.readAt && !needsRevision);
    const dirty = draftDirty();
    const summary = needsRevision ? `成果 v${result.version} 收到具体反馈，继续修改原稿`
      : dirty ? '加入指引有未提交的修改，继续上次编辑'
      : needsReview ? `加入指引 v${result.version} 已交回，等你查看变化`
      : result ? `加入指引 v${result.version} 已阅，真实加入路径仍待体验`
      : state.decision === 'adopted' ? '加入方式已调整，继续修改指引'
      : state.decision === 'deferred' ? '这条反馈已留到下轮，当前约定保持不变'
      : '一条反馈会改变加入方式，需要先看清影响';
    return { adopted: state.decision === 'adopted', deferred: state.decision === 'deferred', hasResult: Boolean(result), version: result?.version || 1, summary, needsReview, needsRevision, draftDirty: dirty };
  }

  function nextAction() {
    const status = getStatus();
    if (status.needsRevision || status.draftDirty || (status.adopted && !status.hasResult)) return 'flow-open-writing';
    if (status.hasResult) return 'flow-open-review';
    return 'flow-open-change';
  }

  function compactNotice(context = 'home') {
    const status = getStatus();
    const quiet = !status.needsReview && !status.needsRevision && !status.draftDirty && (status.deferred || status.hasResult);
    return `<div class="flow-notice ${quiet ? 'flow-notice--quiet' : ''}">
      <span class="flow-notice-icon">${icon(quiet ? 'history' : status.needsRevision ? 'note' : status.needsReview ? 'review' : status.adopted ? 'note' : 'circle-alert')}</span>
      <div><span>${context === 'home' ? '社区加入指引' : '这轮接着做什么'}</span><p>${esc(status.summary)}</p></div>
      ${btn(quiet ? '查看记录' : status.needsRevision || status.draftDirty || status.adopted && !status.hasResult ? '继续编辑' : status.needsReview ? '查看本版' : '看清影响', nextAction(), quiet ? '' : 'secondary', 'arrow')}
    </div>`;
  }

  function resultSummary() {
    const result = latest();
    if (!result) return `<button class="flow-result-row" data-action="flow-open-writing">${icon('note', 'brown')}<span>社区加入指引<small>${draftDirty() ? '有修改的本地草稿，尚未提交成果' : '初始样稿 v1，可进入编辑'}</small></span>${icon('chevron-right')}</button>`;
    const status = getStatus();
    return `<button class="flow-result-row" data-action="flow-open-review">${icon('output', 'rose')}<span>社区加入指引 · v${result.version}<small>${status.needsRevision ? '有段落反馈，等待修改' : status.needsReview ? '新版本待查看' : '已记录已阅，未代替实际体验'}${status.draftDirty ? ' · 另有未提交草稿' : ''}</small></span>${badge(status.needsRevision ? '待修改' : status.needsReview ? '待查看' : '已阅', status.needsRevision || status.needsReview ? 'warn' : '')}${icon('chevron-right')}</button>`;
  }

  function heading(kicker, title, description, actions = '') {
    return `<header class="flow-header"><div class="flow-header-top"><button class="btn link" data-action="flow-back-goal">${icon('back')}返回目标</button><span class="flow-prototype">本地交互样例</span></div><div class="flow-heading-line"><div><div class="flow-kicker">${kicker}</div><h1>${title}</h1><p>${description}</p></div><div class="flow-heading-actions">${actions}</div></div></header>`;
  }

  function change() {
    const adopted = state.decision === 'adopted';
    const deferred = state.decision === 'deferred';
    return `<section class="flow-page">
      ${heading('先判断，再投入工作', '加入方式，需要调整吗？', '一条外部反馈提出了更直接的第一步。先看清它会改变什么。', adopted ? btn('继续修改指引', 'flow-open-writing', 'primary', 'arrow') : deferred ? btn('重新考虑', 'flow-reopen-change', 'secondary', 'refresh') : btn('采用并去编辑', 'flow-adopt-change', 'primary', 'arrow'))}
      <div class="flow-body">
        <div class="flow-source"><span class="flow-source-mark">${icon('message', 'brown')}</span><div><span class="flow-kicker">一位新成员的反馈 · 演示内容</span><blockquote>“我想先参加一次公开活动，再决定要不要深入参与。现在要先读很多指引，不知道下一步什么时候能真正加入。”</blockquote>${btn('查看来源与边界', 'flow-source', 'link', 'external')}</div></div>
        <div class="flow-compare-contract"><section><span class="flow-kicker">${adopted ? '调整前的约定' : '当前有效约定'}</span><h2>${OLD_REQUIREMENT}</h2><p>首页引导先读指引，再从社区项目中选择参与方式。</p>${badge('目标约定 / v2')}</section><span class="flow-contract-arrow">${icon('arrow')}</span><section><span class="flow-kicker">${adopted ? '本轮采用的调整' : '候选调整 · 尚不自动生效'}</span><h2>${NEW_REQUIREMENT}</h2><p>首页先提供活动报名入口；社区指引继续保留，供想深入了解的人阅读。</p>${badge(adopted ? '本地已采用' : '需要你的决定', adopted ? 'good' : 'warn')}</section></div>
        <div class="flow-section-title"><h2>只改变这两处</h2><span>演示关系由手工给定</span></div>
        <div class="flow-impact-row">${icon('image', 'rose')}<div>首页的主要行动入口<p>从“阅读社区指引”调整为“报名参加一次活动”；页面实现仍须另行完成。</p></div>${badge('下一轮实现')}</div>
        <div class="flow-impact-row">${icon('note', 'brown')}<div>社区加入指引<p>调整“迈出第一步”这一段，把阅读从前置步骤改为可选补充。</p></div>${btn('打开原稿', 'flow-open-writing', '', 'arrow')}</div>
        <div class="flow-kept">${icon('lock')}<div>五类导航与现有内容归属保持不变。<p>产品、解决方案、观点、社区、Molis Wikipedia。已有资料不删除，也不替换旧版成果。</p></div></div>
        ${adopted || deferred ? `<div class="flow-receipt">${icon(adopted ? 'check' : 'history')}<div>${adopted ? '已采用这次调整，下一步修改指引。' : '已留到下轮，本轮继续使用原来的加入方式。'}<p>${stamp(state.decisionAt)} · 这是此浏览器中的选择记录，未修改生产约定。</p></div></div>` : `<div class="flow-choice-footer"><p>采用只记录本轮方向。不会自动改稿、启动 AI 或宣布目标完成。</p><div>${btn('留到下轮', 'flow-defer-change', 'secondary')}${btn('采用并去编辑', 'flow-adopt-change', 'primary', 'arrow')}</div></div>`}
      </div>
    </section>`;
  }

  function prepareWritingLayout() {
    requestAnimationFrame(() => {
      const page = document.querySelector('.flow-writing');
      if (!page) return;
      writingLayoutObserver?.disconnect();
      const header = page.querySelector('.flow-header');
      const viewport = page.closest('.content');
      if (!header || !viewport) return;
      const measure = () => {
        page.style.setProperty('--flow-sticky-top', `${header.offsetHeight + 14}px`);
        page.style.setProperty('--flow-aside-height', `${Math.max(120, viewport.clientHeight - header.offsetHeight - 28)}px`);
      };
      measure();
      if (typeof ResizeObserver !== 'undefined') {
        writingLayoutObserver = new ResizeObserver(measure);
        writingLayoutObserver.observe(header);
        writingLayoutObserver.observe(viewport);
      }
    });
  }

  function writing() {
    prepareWritingLayout();
    const result = latest();
    const feedbackResult = state.results.find(r => r.version === state.feedbackVersion) || result;
    const feedback = feedbackResult ? reviewFor(feedbackResult.version).feedback || [] : [];
    return `<section class="flow-page flow-writing">
      ${heading('Pages / 演示编辑器', '社区加入指引', '在原稿上继续写。保存草稿与提交成果是两个不同动作。', btn('保存草稿', 'flow-save-draft', 'secondary', 'save') + btn(`保存为成果 v${(result?.version || 1) + 1}`, 'flow-submit-result', 'primary', 'output'))}
      <div class="flow-editor-context"><span>${icon('link')}当前写作依据</span><button data-action="flow-open-change">${esc(state.draftBasis)} ${icon('chevron-right')}</button><button data-action="flow-source">外部反馈 ${icon('external')}</button><span class="spacer"></span><span class="flow-save-status" role="status">${storageFailed ? '未能保存在浏览器' : state.savedAt ? `草稿已保存 · ${stamp(state.savedAt)}` : '原始样稿，尚未修改'}</span></div>
      <div class="flow-editor-layout"><div class="flow-writing-paper">
        <div class="flow-document-head"><span>参与 Molis AI</span><h2>从第一步开始。</h2><p>这份文稿还没有发布到网站。</p></div>
        ${state.draft.map((text, index) => `<section class="flow-paragraph-editor${invalidParagraph === index ? ' has-error' : ''}"><label for="flow-paragraph-${index}"><span>0${index + 1}</span>${SECTIONS[index]}${index === 1 && state.decision === 'adopted' ? '<small>本轮重点修改</small>' : ''}</label><textarea id="flow-paragraph-${index}" data-flow-edit="${index}" rows="${index === 1 ? 5 : 4}" maxlength="2400" ${invalidParagraph === index ? 'aria-invalid="true" aria-describedby="flow-error"' : ''}>${esc(text)}</textarea></section>`).join('')}
        ${error ? `<p class="flow-error" id="flow-error" role="alert">${esc(error)}</p>` : ''}
        <div class="flow-writing-foot"><span>${icon('lock')}只有你在编辑，没有调用 AI。</span>${result ? btn(`查看已提交 v${result.version}`, 'flow-open-review', '', 'review') : '<span>当前仍为个人草稿</span>'}</div>
      </div><aside class="flow-writing-aside"><div class="flow-aside-block"><h2>这次要改什么</h2><p>${state.decision === 'adopted' ? '把“先读指引”改为“可以先报名参加一次活动”。保留后续参与与了解社区的路径。' : state.decision === 'deferred' ? '反馈已留到下轮。当前草稿继续使用“先阅读社区指引，再选择参与”的约定。' : '反馈尚未采用。可以先读原稿，但不要把候选建议当成已经确认的方向。'}</p>${btn('查看范围与取舍', 'flow-open-change', 'link', 'arrow')}</div>
        <div class="flow-aside-block"><h2>保留下来的依据</h2><p>五类内容入口保持原样。改稿不会替换历史成果，也不会自动通过真实加入路径的验收。</p></div>
        ${feedback.length ? `<div class="flow-aside-block flow-feedback-list"><h2>对 v${feedbackResult.version} 的返工意见</h2>${feedback.map(item => `<div class="flow-feedback"><span>${SECTIONS[item.paragraph]}</span><p>${esc(item.text)}</p><button class="btn link" data-action="flow-edit-paragraph-${item.paragraph}">回到这一段 ${icon('arrow')}</button></div>`).join('')}<p class="small muted">草稿保持当前内容。这些意见仍保留在 v${feedbackResult.version}，不会覆盖其他版本的记录。</p></div>` : `<div class="flow-aside-block"><h2>什么时候交回</h2><p>当这一版已经可以让别人阅读时，保存为成果。未完成的部分可以保留，检查面会继续说明真实体验尚未验证。</p></div>`}
      </aside></div>
    </section>`;
  }

  function workreview() {
    const result = current();
    if (!result) return `<section class="flow-page">${heading('结果回到目标', '还没有交回新的版本', '草稿与成果保持分开。先编辑原稿，再保存一份可以检查的版本。', btn('去编辑原稿', 'flow-open-writing', 'primary', 'note'))}<div class="flow-body"><div class="empty">${icon('output')}<h2>这里会留下每一版成果</h2><p>原文 v1 已保留。提交后可以逐段比较，再给出具体意见。</p></div></div></section>`;
    const previous = state.results.filter(r => r.version < result.version).at(-1) || BASE;
    const review = reviewFor(result.version);
    const paragraphsChanged = result.paragraphs.reduce((n, text, index) => n + Number(text !== previous.paragraphs[index]), 0);
    const reviewDraft = state.reviewDrafts[reviewDraftKey(result.version)] || '';
    return `<section class="flow-page flow-review">
      ${heading('结果检查 / 演示成果', `社区加入指引 · v${result.version}`, `${stamp(result.createdAt)} 由你保存 · ${paragraphsChanged} 段有变化 · 当前检查只针对这个版本`, btn('继续编辑草稿', 'flow-open-writing', 'secondary', 'note') + btn(review.readAt ? '已记录已阅' : '记录已阅', 'flow-record-read', review.readAt ? '' : 'primary', 'check'))}
      <div class="flow-review-context"><span>${icon('link')}本版依据：${esc(result.basis)}</span><div class="flow-version-list" aria-label="选择成果版本"><button data-action="flow-previous-result"${state.results[0]?.version === result.version ? ' disabled' : ''} aria-label="查看上一份成果">${icon('chevron-left')}</button><span>v${result.version} / 共 ${state.results.length} 份</span><button data-action="flow-next-result"${latest()?.version === result.version ? ' disabled' : ''} aria-label="查看下一份成果">${icon('chevron-right')}</button>${latest()?.version !== result.version ? btn(`回到最新 v${latest().version}`, 'flow-latest-result', 'link') : ''}</div></div>
      ${draftDirty() ? '<div class="flow-draft-notice">另有未提交的草稿修改。本页仍展示已保存的精确版本；旧版已阅不会覆盖新稿。</div>' : ''}
      <div class="flow-review-labels"><span>上版 · v${previous.version}</span><span>本版 · v${result.version}</span></div>
      <div class="flow-comparison-paper">${result.paragraphs.map((text, index) => `<section class="flow-paragraph-pair${text !== previous.paragraphs[index] ? ' changed' : ''}${state.reviewSection === index ? ' selected' : ''}"><div class="flow-before"><span class="flow-paragraph-label">${SECTIONS[index]} <small>v${previous.version}</small></span><p>${esc(previous.paragraphs[index])}</p></div><div class="flow-after"><button class="flow-after-select" data-action="flow-select-paragraph-${index}" aria-pressed="${state.reviewSection === index}"><span class="flow-paragraph-label">${SECTIONS[index]} <small>v${result.version} · ${text !== previous.paragraphs[index] ? '已修改' : '未改变'}</small></span><p>${esc(text)}</p><span class="flow-comment-hint">${icon('message')}${state.reviewSection === index ? '正在为这一段写意见' : state.reviewDrafts[reviewDraftKey(result.version, index)] ? '继续这段未发送的意见' : '针对这一段提意见'}</span></button>${state.reviewSection === index ? `<section class="flow-review-comment"><div class="flow-section-title"><h2>对“${SECTIONS[index]}”的意见</h2><span>绑定 v${result.version} · 第 ${index + 1} 段</span></div><label class="flow-screen-label" for="flow-review-note">具体指出哪里需要修改</label><textarea class="field" id="flow-review-note" data-flow-feedback="${reviewDraftKey(result.version, index)}" rows="3" maxlength="1600" placeholder="例如：说清在哪里能看到下一次活动，避免报名入口仍然难找。">${esc(reviewDraft)}</textarea>${error ? `<p class="flow-error" role="alert">${esc(error)}</p>` : ''}<div class="flow-review-comment-actions"><span>意见保留在本版，草稿会回到这一段。<br>切换段落时，尚未发送的意见也会保留。</span>${btn('带着意见继续修改', 'flow-send-feedback', 'secondary', 'arrow')}</div></section>` : ''}</div></section>`).join('')}</div>
      <div class="flow-review-bottom"><section class="flow-review-history"><div class="flow-section-title"><h2>这一版留下的意见</h2><span>绑定 v${result.version}</span></div>${review.feedback?.length ? `<div class="flow-review-receipts">${review.feedback.map(item => `<p>${icon('message')}<span><b>${SECTIONS[item.paragraph]}</b>：${esc(item.text)}<small>${stamp(item.at)} · v${result.version}</small></span></p>`).join('')}</div>` : '<p class="small muted">尚未留下返工意见。选择上面的具体段落，可以把想修改的地方带回原稿。</p>'}</section><aside class="flow-review-responsibility"><h2>现在能确认到哪里</h2><div>${icon('user')}<p>内容由你编辑，版本由你保存。没有发生 AI 执行。</p></div><div>${icon('eye')}<p>${review.readAt ? `你在 ${stamp(review.readAt)} 记录了已阅，仅对应 v${result.version}。` : '记录已阅表示你看过本版，不表示认可所有内容。'}</p></div><div>${icon('circle-alert', 'amber')}<p>实际报名入口、手机上的加入路径仍未体验。目标不会因已阅而完成。</p></div></aside></div>
    </section>`;
  }

  function focusParagraph(index, preserveCaret = true) {
    requestAnimationFrame(() => {
      const field = document.querySelector(`[data-flow-edit="${index}"]`);
      if (!field) return;
      field.focus({ preventScroll: true });
      const selection = state.selection?.paragraph === index && preserveCaret ? state.selection : { start: 0, end: 0 };
      field.setSelectionRange(Math.min(selection.start || 0, field.value.length), Math.min(selection.end || 0, field.value.length));
      field.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  }

  function openWriting(index = state.selection?.paragraph ?? 1) {
    error = ''; invalidParagraph = -1;
    go('writing');
    focusParagraph(index);
  }

  function openReview(version = latest()?.version) {
    error = ''; state.activeVersion = version || null;
    go('workreview');
  }

  const actions = {
    'flow-back-goal': () => { error = ''; go('goal'); },
    'flow-open-change': () => { error = ''; go('change'); },
    'flow-open-writing': () => openWriting(),
    'flow-open-review': () => openReview(),
    'flow-previous-result': () => { const index = state.results.findIndex(r => r.version === current()?.version); if (index > 0) openReview(state.results[index - 1].version); },
    'flow-next-result': () => { const index = state.results.findIndex(r => r.version === current()?.version); if (index >= 0 && index < state.results.length - 1) openReview(state.results[index + 1].version); },
    'flow-latest-result': () => openReview(),
    'flow-source': () => openDialog('外部反馈 / 本地演示', `<p>“我想先参加一次公开活动，再决定要不要深入参与。现在要先读很多指引，不知道下一步什么时候能真正加入。”</p><div class="readout">这是为交互设计构造的反馈样例。<p>没有真实访谈、外部账号或消息同步。它尚不是已确认的用户需求。</p></div><p>本例的影响关系由手工给定：只比较首页 CTA 与加入指引，保留五类导航。不代表系统已经自动分析了整个项目。</p>`, btn('回到当前工作', 'flow-close-source', 'secondary')),
    'flow-close-source': () => closeDialog(),
    'flow-adopt-change': () => {
      state.decision = 'adopted'; state.decisionAt = new Date().toISOString(); state.draftBasis = NEW_REQUIREMENT;
      persist(); openWriting(1); toast('调整已记录。原稿保留，请直接修改这一段。');
    },
    'flow-defer-change': () => {
      state.decision = 'deferred'; state.decisionAt = new Date().toISOString(); state.draftBasis = OLD_REQUIREMENT;
      persist(); render(); toast('已留到下轮，草稿与历史成果均保留。');
    },
    'flow-reopen-change': () => { state.decision = 'pending'; persist(); render(); },
    'flow-save-draft': () => {
      state.savedAt = new Date().toISOString();
      const stored = persist(); render(); toast(stored ? '草稿已保存；还没有生成新成果。' : '草稿留在当前页，浏览器未能保存。');
    },
    'flow-submit-result': () => {
      invalidParagraph = state.draft.findIndex(text => !text.trim());
      if (invalidParagraph >= 0) { error = `“${SECTIONS[invalidParagraph]}”还是空的。先补充正文，再交回这一版。`; render(); focusParagraph(invalidParagraph); return; }
      if (!draftDirty()) { error = '正文还没有变化。可以继续编辑，已有版本不需要重复提交。'; render(); focusParagraph(1); return; }
      const result = { version: (latest()?.version || 1) + 1, paragraphs: state.draft.map(text => text.trim()), basis: state.draftBasis, decision: state.decision, decisionAt: state.decisionAt, createdAt: new Date().toISOString() };
      state.results.push(result); state.draft = [...result.paragraphs]; state.savedAt = result.createdAt; state.activeVersion = result.version; state.feedbackVersion = null;
      error = ''; persist(); openReview(result.version);
      toast(`成果 v${result.version} 已保存在本地样例，接下来查看变化。`);
    },
    'flow-record-read': () => {
      const result = current(); if (!result) return;
      const review = reviewFor(result.version);
      if (!review.readAt) state.reviews[result.version] = { ...review, readAt: new Date().toISOString() };
      persist(); render(); toast(`已记录看过 v${result.version}；目标仍未完成。`);
    },
    'flow-send-feedback': () => {
      const result = current(); if (!result) return;
      const key = reviewDraftKey(result.version);
      const text = (state.reviewDrafts[key] || '').trim();
      if (!text) { error = '先写下这段具体需要改什么，再带回原稿。'; render(); document.querySelector('[data-flow-feedback]')?.focus(); return; }
      const review = reviewFor(result.version);
      const paragraph = state.reviewSection;
      const feedback = { paragraph, text, at: new Date().toISOString() };
      state.reviews[result.version] = { ...review, readAt: review.readAt || feedback.at, feedback: [...(review.feedback || []), feedback] };
      state.reviewDrafts[key] = ''; state.feedbackVersion = result.version;
      if (state.selection?.paragraph !== paragraph) state.selection = { paragraph, start: 0, end: 0 };
      persist(); openWriting(paragraph); toast(`意见已留在 v${result.version}，原稿回到“${SECTIONS[paragraph]}”。`);
    },
  };
  for (let index = 0; index < 3; index++) {
    actions[`flow-select-paragraph-${index}`] = () => {
      state.reviewSection = index; error = ''; persist(); render();
      requestAnimationFrame(() => {
        const field = document.querySelector('[data-flow-feedback]');
        field?.focus({ preventScroll: true });
        field?.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
    };
    actions[`flow-edit-paragraph-${index}`] = () => { state.selection = { paragraph: index, start: 0, end: 0 }; focusParagraph(index, false); };
  }

  function onInput(event) {
    const target = event.target;
    if (target?.dataset?.flowEdit !== undefined) {
      const paragraph = Number(target.dataset.flowEdit);
      if (!Number.isInteger(paragraph) || paragraph < 0 || paragraph > 2) return;
      state.draft[paragraph] = target.value; state.savedAt = new Date().toISOString();
      state.selection = { paragraph, start: target.selectionStart || 0, end: target.selectionEnd || 0 };
      invalidParagraph = -1; error = ''; persist();
      const status = document.querySelector('.flow-save-status');
      if (status) status.textContent = storageFailed ? '未能保存在浏览器' : '草稿已自动保存 · 尚未提交';
      document.querySelectorAll('.flow-error').forEach(el => el.remove());
      target.removeAttribute('aria-invalid');
    }
    if (target?.dataset?.flowFeedback !== undefined) {
      state.reviewDrafts[target.dataset.flowFeedback] = target.value; error = ''; persist();
      document.querySelectorAll('.flow-error').forEach(el => el.remove());
    }
  }

  function reset() { writingLayoutObserver?.disconnect(); state = freshState(); error = ''; invalidParagraph = -1; persist(); }

  return { pages: { change, writing, workreview }, actions, onInput, reset, homeNotice: () => compactNotice('home'), goalNotice: () => compactNotice('goal'), resultSummary, getStatus };
}
