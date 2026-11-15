/**
 * Material verification (5-number funnel, 5-cell progress track, held secret 3-way choice, rule-skipped summary),
 * incremental scope/model delta card ("这次只做这些"), stale-summary guard, classified failure hints, and IndexedDB
 * upload persistence across refreshes, joined into the onboarding browser program (33-2, ONB-35..46, C1..C11).
 */
export const CONTEXT_ONBOARDING_RECOVERY_PART = String.raw`
  let stopCounting = false, pausedScan = null, mrFilter = 'all', scopeVisible = {};
  function uploadDb() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise(resolve => {
      try {
        const req = indexedDB.open('molis-onboarding-uploads', 1);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('uploads')) req.result.createObjectStore('uploads', { keyPath: 'key' }); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  async function saveUploadFiles(kind, list) {
    const db = await uploadDb(); if (!db || !journey) return;
    await new Promise(resolve => {
      try {
        const tx = db.transaction('uploads', 'readwrite');
        tx.objectStore('uploads').put({ key: journey.id + ':' + kind, files: list });
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      } catch { resolve(); }
    });
  }
  async function dropUploadFiles(kind) {
    const db = await uploadDb(); if (!db || !journey) return;
    await new Promise(resolve => {
      try {
        const tx = db.transaction('uploads', 'readwrite');
        tx.objectStore('uploads').delete(journey.id + ':' + kind);
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      } catch { resolve(); }
    });
  }
  async function clearJourneyUploads(id) {
    const db = await uploadDb(); if (!db || !id) return;
    await new Promise(resolve => {
      try {
        const tx = db.transaction('uploads', 'readwrite'), store = tx.objectStore('uploads'), req = store.openCursor();
        req.onsuccess = () => { const cur = req.result; if (!cur) return; if (String(cur.key).startsWith(id + ':')) cur.delete(); cur.continue(); };
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      } catch { resolve(); }
    });
  }
  async function restoreUploadFiles() {
    const db = await uploadDb(); if (!db || !journey) return;
    await new Promise(resolve => {
      try {
        const tx = db.transaction('uploads', 'readonly'), req = tx.objectStore('uploads').openCursor();
        req.onsuccess = () => {
          const cur = req.result; if (!cur) return;
          const k = String(cur.key), prefix = journey.id + ':';
          if (k.startsWith(prefix) && Array.isArray(cur.value?.files) && cur.value.files.length) uploads.set(k.slice(prefix.length), cur.value.files);
          cur.continue();
        };
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      } catch { resolve(); }
    });
  }
  function skipRuleName(path) {
    const parts = String(path || '').split('/');
    const folders = ['node_modules','vendor','dist','build','target','out','coverage','__pycache__','venv','pods','carthage'];
    for (const part of parts.slice(0, -1)) {
      const low = part.toLowerCase();
      if (part.startsWith('.')) return part;
      if (folders.includes(low)) return low;
    }
    const last = parts[parts.length - 1] || '';
    return last.startsWith('.') ? last : '';
  }
  async function runUploadCount(el, resumeFrom) {
    const kind = resumeFrom ? resumeFrom.kind : el.dataset.upload;
    const list = resumeFrom ? resumeFrom.list : el.files, total = list.length;
    const chosen = resumeFrom ? resumeFrom.chosen : [];
    const reasons = resumeFrom ? resumeFrom.reasons : { ignored: 0, secret: 0, unreadable: 0 };
    const ruleSet = new Set(resumeFrom ? resumeFrom.rules : []);
    let bytes = resumeFrom ? resumeFrom.bytes : 0, index = resumeFrom ? resumeFrom.index : 0, drawn = 0;
    stopCounting = false; pausedScan = null;
    const allowSecret = kind === 'files';
    const take = file => {
      const path = file.webkitRelativePath || file.name;
      const skipped = contextFileSkip(path);
      if (skipped && !(allowSecret && skipped === 'secret')) {
        reasons[skipped] = (reasons[skipped] || 0) + 1;
        if (skipped === 'ignored') { const rule = skipRuleName(path); if (rule && ruleSet.size < 24) ruleSet.add(rule); }
        return;
      }
      chosen.push(file); bytes += file.size || 0;
    };
    if (total > 2500) {
      busy = true;
      while (index < total) {
        const end = Math.min(index + 2500, total);
        for (; index < end; index++) take(list[index]);
        counting = { done: index, total, kept: chosen.length, bytes };
        if (Date.now() - drawn >= 250 || index === total) { drawn = Date.now(); render(); await new Promise(resolve => setTimeout(resolve, 0)); }
        if (stopCounting && index < total) {
          pausedScan = { kind, list, index, chosen: [...chosen], bytes, reasons: { ...reasons }, rules: [...ruleSet] };
          break;
        }
      }
    } else for (; index < total; index++) take(list[index]);
    const stoppedEarly = index < total;
    if (!chosen.length && total > 0 && !stoppedEarly) throw new Error(globalThis.t.text("workbench.context-onboarding.no-supported-files-found"));
    const s = source(kind);
    if (s.kind !== 'directory' && !resumeFrom && uploads.has(s.kind)) {
      const had = uploads.get(s.kind);
      chosen.unshift(...had.filter(f => !chosen.some(c => c.name === f.name && c.size === f.size)));
    }
    invalidateSource(s); uploads.set(s.kind, chosen);
    const skippedCount = (reasons.ignored || 0) + (reasons.secret || 0) + (reasons.unreadable || 0);
    s.metadata = {
      files: chosen.map(f => ({ path: f.webkitRelativePath || f.name, size: f.size, modified_ms: f.lastModified, identity: 'upload' })),
      skipped: skippedCount,
      truncated: stoppedEarly,
      total_entries: index,
      ...(skippedCount ? { skipped_reasons: reasons } : {}),
      ...(ruleSet.size ? { ignored_rules: [...ruleSet] } : {}),
    };
    s.excluded = []; s.selected = chosen.length > 0 || total === 0; error = '';
    if (total > 2500) { counting = { done: index, total, kept: chosen.length, bytes, saving: true }; render(); await new Promise(resolve => setTimeout(resolve, 0)); }
    await saveUploadFiles(s.kind, chosen);
  }
  function acceptUpload(el) { return runUploadCount(el, null); }
  function invalidateSourceForEdit(s) {
    delete s.references; delete s.files; delete s.error; delete s.skipped; delete s.issues;
  }
  function issues(s){return s.issues?.length?'<details class="mw-collapsible cx-issues"><summary>'+globalThis.t("workbench.context-onboarding.items-not-read-count", { n: s.issues.length })+'</summary><div class="mw-collapsible__body">'+s.issues.map(i=>'<p>'+esc(i.path)+' · '+esc(i.reason)+'</p>').join('')+'</div></details>':'';}
  function receipts() {
    return '<ul class="mw-file-list is-receipts">' + picked().map(s => {
      const heldN = s.held_secrets?.length || 0;
      const state = docState(s), label = s.error ? "workbench.context-onboarding.not-read" : heldN && !s.references?.length ? "workbench.context-onboarding.secret-awaiting-choice" : s.references ? "workbench.context-onboarding.read" : journey.phase === 'reading' ? "workbench.context-onboarding.waiting" : sourceStatus(s);
      const detail = s.error || (s.references ? globalThis.t.text("workbench.context-onboarding.n-n-saved", {n:s.references.length}) + (s.skipped ? ' · ' + globalThis.t.text("workbench.context-onboarding.n-skipped", {n:s.skipped}) : '') + (heldN ? ' · ' + globalThis.t.text("workbench.context-onboarding.n-held-secret", {n:heldN}) : '') : s.reading ? globalThis.t.text("workbench.context-onboarding.k-n", {k:Math.min(s.reading.done + 1, s.reading.total), n:s.reading.total}) : '');
      return fileRow({name:globalThis.t.text(names[s.kind]), chip:'<span class="mw-file-kind" data-slot="file-kind">' + glyph(sourceIcons[s.kind]) + '</span>', size:detail, state:status(readText(label), state === 'done' ? 'done' : state === 'failed' ? 'blocked' : heldN ? 'attention' : 'idle', null, state === 'done' || state === 'failed' ? state : journey.phase === 'reading' ? 'waiting' : state === 'ready' ? 'ready' : 'idle')});
    }).join('') + '</ul>' + picked().map(issues).join('');
  }
  function mrTrack(step, stopAt, isErr, labelText, tone) {
    const cells = [1,2,3,4,5].map(i => '<i' + (stopAt === i ? ' class="is-stop"' : i <= step ? ' class="is-on"' : '') + '></i>').join('');
    return '<span class="mw-mr-cells" data-slot="materials-track"><span class="mw-mr-track' + (isErr ? ' is-err' : '') + '" aria-hidden="true">' + cells + '</span>' + status(labelText, tone || 'idle', null) + '</span>';
  }
  function verificationPanel() {
    const srcs = picked();
    const hasData = srcs.some(s => s.references?.length || s.issues?.length || s.held_secrets?.length || s.error || s.metadata?.skipped);
    if (!hasData) return '';
    let discovered = 0, selectedCount = 0;
    const heldRows = [], issueRows = [], refRows = [], ruleNames = new Set();
    let skippedIgnored = 0, skippedSecret = 0, skippedUnreadable = 0;
    for (const s of srcs) {
      const m = s.metadata;
      if (m) {
        discovered += m.total_entries || ((m.files?.length || 0) + (m.skipped || 0));
        selectedCount += included(s).length;
        skippedIgnored += m.skipped_reasons?.ignored || 0;
        skippedSecret += m.skipped_reasons?.secret || 0;
        skippedUnreadable += m.skipped_reasons?.unreadable || 0;
        for (const r of m.ignored_rules || []) ruleNames.add(r);
      } else {
        const c = (s.references?.length || 0) + (s.issues?.length || 0) + (s.held_secrets?.length || 0) || (ready(s) ? 1 : 0);
        discovered += c; selectedCount += c;
      }
      for (const h of s.held_secrets || []) heldRows.push({ s, h });
      for (const iss of s.issues || []) issueRows.push({ s, iss });
      if (s.error && !(s.issues?.length)) issueRows.push({ s, iss: { path: readText(names[s.kind]), reason: s.error, sourceError: true } });
      for (const r of s.references || []) refRows.push({ s, r });
    }
    const nonDupRefs = refRows.filter(x => !x.r.duplicate_of);
    const readCount = nonDupRefs.length;
    const usedCount = journey.summary ? nonDupRefs.filter(x => x.r.used_in_summary).length : 0;
    const projectCount = journey.phase === 'complete' ? nonDupRefs.filter(x => x.r.adopted).length : nonDupRefs.length;
    const funnel = '<ol class="mw-mr-funnel" data-slot="materials-funnel" aria-label="' + esc(readText("workbench.context-onboarding.mr-funnel-label")) + '">'
      + '<li><b>' + discovered + '</b><span>' + esc(readText("workbench.context-onboarding.mr-step-discovered")) + '</span></li>'
      + '<li><b>' + selectedCount + '</b><span>' + esc(readText("workbench.context-onboarding.mr-step-selected")) + '</span></li>'
      + '<li><b>' + readCount + '</b><span>' + esc(readText("workbench.context-onboarding.mr-step-read")) + '</span></li>'
      + '<li><b>' + (journey.summary ? usedCount : '—') + '</b><span>' + esc(readText("workbench.context-onboarding.mr-step-used")) + '</span></li>'
      + '<li><b>' + projectCount + '</b><span>' + esc(readText("workbench.context-onboarding.mr-step-adopted")) + '</span></li></ol>';
    const attentionCount = heldRows.length + issueRows.length;
    const unusedRows = refRows.filter(x => x.r.duplicate_of || (journey.summary && !x.r.used_in_summary));
    const filterBar = '<div class="ob-mr-bar">' + toggles(readText("workbench.context-onboarding.mr-filter-label"), [
      { label: globalThis.t.text("workbench.context-onboarding.mr-filter-all", { n: heldRows.length + issueRows.length + refRows.length }), current: mrFilter === 'all', attrs: { 'data-mr-filter': 'all' } },
      { label: globalThis.t.text("workbench.context-onboarding.mr-filter-attention", { n: attentionCount }), current: mrFilter === 'attention', attrs: { 'data-mr-filter': 'attention' } },
      { label: globalThis.t.text("workbench.context-onboarding.mr-filter-unused", { n: unusedRows.length }), current: mrFilter === 'unused', attrs: { 'data-mr-filter': 'unused' } },
    ]) + '</div>';
    const items = [];
    if (mrFilter === 'all' || mrFilter === 'attention') {
      for (const { s, h } of heldRows) {
        const namesList = h.preview_names?.length ? h.preview_names : h.variables;
        const vars = namesList?.length ? namesList.join(', ') : readText("workbench.context-onboarding.mr-secret-content");
        items.push(fileRow({ cls: 'is-issue', name: h.path, size: readText(names[s.kind]) + ' · ' + size(h.size_bytes || 0), state: mrTrack(2, 3, false, readText("workbench.context-onboarding.secret-awaiting-choice"), 'attention') })
          + '<li class="mw-mr-why" data-slot="material-issue-row"><span>' + esc(globalThis.t.text("workbench.context-onboarding.mr-secret-why", { vars })) + '</span><span class="mw-mr-why__acts">'
          + btn({ variant: 'secondary', size: 'sm', label: readText("workbench.context-onboarding.secret-strip"), attrs: { 'data-secret-key': h.key, 'data-secret-decision': 'strip' } })
          + btn({ variant: 'ghost', size: 'sm', label: readText("workbench.context-onboarding.secret-exclude"), attrs: { 'data-secret-key': h.key, 'data-secret-decision': 'exclude' } })
          + btn({ variant: 'ghost', size: 'sm', label: readText("workbench.context-onboarding.secret-raw"), attrs: { 'data-secret-key': h.key, 'data-secret-decision': 'raw' } })
          + '</span></li>');
      }
      for (const { s, iss } of issueRows) {
        const reauth = directory(s) && grants[s.kind]?.state === 'unavailable';
        const act = reauth
          ? btn({ variant: 'secondary', size: 'sm', label: readText("workbench.context-onboarding.choose-authorize"), attrs: { 'data-authorize': s.kind } })
          : btn({ variant: 'ghost', size: 'sm', label: readText("workbench.context-onboarding.adjust-sources"), attrs: { 'data-action': 'restart' } });
        items.push(fileRow({ cls: 'is-issue', name: iss.path, size: readText(names[s.kind]), state: mrTrack(2, 3, true, readText("workbench.context-onboarding.not-read"), 'blocked') })
          + '<li class="mw-mr-why is-err" data-slot="material-issue-row"><span>' + esc(iss.reason) + '</span><span class="mw-mr-why__acts">' + act + '</span></li>');
      }
    }
    const shownRefs = mrFilter === 'attention' ? [] : mrFilter === 'unused' ? unusedRows : refRows;
    for (const { s, r } of shownRefs.slice(0, 200)) {
      const dup = Boolean(r.duplicate_of);
      const step = dup ? 3 : journey.summary ? (r.used_in_summary ? 5 : 3) : 3;
      const stopAt = dup ? 4 : (!dup && journey.summary && !r.used_in_summary ? 4 : 0);
      const noteParts = [readText(names[s.kind]), size(r.original?.size_bytes || r.text?.bytes || 0)];
      if (r.recognized_by_content) noteParts.push(readText("workbench.context-onboarding.mr-by-content"));
      if (r.secret_mode === 'strip') noteParts.push(readText("workbench.context-onboarding.mr-secret-stripped"));
      if (dup) noteParts.push(globalThis.t.text("workbench.context-onboarding.mr-duplicate-of", { path: r.duplicate_of }));
      const stLabel = dup ? readText("workbench.context-onboarding.mr-duplicate")
        : r.secret_mode === 'strip' ? readText("workbench.context-onboarding.mr-secret-stripped")
        : r.recognized_by_content ? readText("workbench.context-onboarding.mr-by-content")
        : journey.summary && r.used_in_summary ? readText("workbench.context-onboarding.mr-used")
        : readText("workbench.context-onboarding.read");
      items.push(fileRow({ name: r.path || r.title, size: noteParts.join(' · '), state: mrTrack(step, stopAt, false, stLabel, dup ? 'quiet' : 'done') }));
    }
    if (shownRefs.length > 200) items.push('<li class="ob-more-row"><small class="ob-quiet">' + esc(globalThis.t.text("workbench.context-onboarding.n-more-files-included", { n: shownRefs.length - 200 })) + '</small></li>');
    const ruleSummary = (skippedIgnored + skippedSecret + skippedUnreadable) > 0
      ? collapsible(
          globalThis.t.text("workbench.context-onboarding.mr-skipped-summary", { n: skippedIgnored + skippedSecret + skippedUnreadable }),
          '<p class="cx-source-meta">' + [
            skippedIgnored ? globalThis.t.text("workbench.context-onboarding.mr-skipped-ignored", { n: skippedIgnored, rules: [...ruleNames].join(', ') || 'node_modules, .git, dist' }) : '',
            skippedSecret ? globalThis.t.text("workbench.context-onboarding.mr-skipped-secret", { n: skippedSecret }) : '',
            skippedUnreadable ? globalThis.t.text("workbench.context-onboarding.mr-skipped-binary", { n: skippedUnreadable }) : '',
          ].filter(Boolean).map(esc).join(' · ') + '</p>'
        )
      : '';
    const listBox = items.length ? '<div class="ob-mr-box"><ul class="mw-file-list ob-mr-list">' + items.join('') + '</ul></div>' : '';
    return '<div class="ob-mr" data-slot="materials-verification">' + funnel + filterBar + listBox + ruleSummary + '</div>';
  }
  function scopeDeltaCard() {
    const d = journey.scope_delta;
    const modelChanged = Boolean(journey.model && config.model && journey.model !== config.model);
    if (!d && !(modelChanged && (journey.last_read_paths?.length || journey.stale_summary))) return '';
    const rows = [];
    if (d?.added_count) rows.push(['add', 'plus', globalThis.t.text("workbench.context-onboarding.delta-added", { n: d.added_count }), (d.added || []).slice(0, 3).join(', ')]);
    if (d?.removed_count) rows.push(['rem', 'x', globalThis.t.text("workbench.context-onboarding.delta-removed", { n: d.removed_count }), (d.removed || []).slice(0, 3).join(', ')]);
    const reused = d ? d.reused : (journey.last_read_paths?.length || 0);
    if (reused > 0) rows.push(['keep', 'check', globalThis.t.text("workbench.context-onboarding.delta-reused", { n: reused }), readText("workbench.context-onboarding.delta-no-reread")]);
    if (modelChanged) rows.push(['redo', 'refresh', globalThis.t.text("workbench.context-onboarding.delta-model-changed", { model: config.model }), readText("workbench.context-onboarding.delta-summary-redone")]);
    else if (d && (d.added_count || d.removed_count)) rows.push(['redo', 'refresh', readText("workbench.context-onboarding.delta-summary-redone"), '']);
    if (!rows.length) return '';
    return '<div class="mw-mr-delta" data-slot="scope-delta-card"><div class="mw-mr-delta__head"><span>' + esc(readText("workbench.context-onboarding.delta-title")) + '</span></div>'
      + rows.map(([kind, ic, head, tail]) => '<div class="mw-mr-delta__row is-' + kind + '"><span class="mw-mr-delta__tile" aria-hidden="true">' + glyph(ic) + '</span><span class="mw-mr-delta__copy"><b>' + esc(head) + '</b>' + (tail ? '<small>' + esc(tail) + '</small>' : '') + '</span></div>').join('')
      + '</div>';
  }
  function staleSummaryCard() {
    const st = journey.stale_summary;
    if (!st || journey.summary) return '';
    const plain = String(st.body || '').replace(/\[S\d+\]/g, '').replace(/[#*]/g, '').trim();
    const excerpt = plain.length > 180 ? plain.slice(0, 179) + '…' : plain;
    return '<aside class="ob-stale" data-slot="stale-summary"><div class="ob-stale__head"><strong>' + esc(st.title) + '</strong>' + status(readText("workbench.context-onboarding.stale-summary-badge"), 'quiet', null) + '</div><p>' + esc(excerpt) + '</p><p>' + esc(readText("workbench.context-onboarding.stale-summary-note")) + '</p></aside>';
  }
  function lateNotice() {
    const l = journey.late_ignored;
    if (!l) return '';
    return '<div class="ob-notice" data-slot="late-ignored">' + glyph('clock') + '<span>' + esc(globalThis.t.text("workbench.context-onboarding.late-result-ignored", { model: l.model || readText("workbench.context-onboarding.previous-model") })) + '</span></div>';
  }
  function failureGuidance() {
    if (journey.phase !== 'failed' || journey.needs_model || !journey.failure_kind) return '';
    const k = journey.failure_kind;
    const msg = k === 'auth' ? readText("workbench.context-onboarding.fail-guide-auth")
      : k === 'rate_limit' ? readText("workbench.context-onboarding.fail-guide-rate-limit")
      : k === 'timeout' ? readText("workbench.context-onboarding.fail-guide-timeout")
      : k === 'connection' ? readText("workbench.context-onboarding.fail-guide-connection")
      : k === 'context_limit' ? readText("workbench.context-onboarding.fail-guide-context-limit")
      : k === 'invalid_output' ? readText("workbench.context-onboarding.fail-guide-invalid-output")
      : '';
    return msg ? note(msg, 'alert', 'is-warn') : '';
  }
`;
