/**
 * Material verification (5-number funnel, 5-cell progress track, held secret 3-way choice, rule-skipped summary),
 * incremental scope/model delta card ("这次只做这些"), stale-summary guard, classified failure hints, and IndexedDB
 * upload persistence across refreshes, joined into the onboarding browser program (33-2, ONB-35..46, C1..C11).
 */
export const CONTEXT_ONBOARDING_RECOVERY_PART = String.raw`
  let stopCounting = false, pausedScan = null, pausedUploads = new Map(), mrFilter = 'all', scopeVisible = {}, scanningDirId = '', scanResumeBase = { kept: 0, bytes: 0 }, partialRestoredKinds = new Set();
  // ONB-35 file details: metadata the page already holds; no material body is read or returned here.
  function buildFileDetail(input) {
    const lines = [];
    let title = '', status = '';
    if (input.kind === 'file' || input.kind === 'issue') {
      const src = input.source;
      if (!src) return null;
      if (input.kind === 'file') {
        const file = src.metadata?.files?.[input.index ?? -1];
        if (!file) return null;
        title = file.path;
        lines.push(file.path);
        lines.push([input.size(file.size ?? 0), file.modified_ms ? new Date(file.modified_ms).toISOString().slice(0, 10) : '', src.path || input.sourceLabel].filter(Boolean).join(' · '));
        status = input.text((src.excluded || []).some(path => file.path === path || file.path.startsWith(path + '/')) ? 'workbench.context-onboarding.not-read' : 'workbench.context-onboarding.read');
      } else {
        const issue = (src.issues || []).find(item => item.path === input.issuePath);
        if (!issue) return null;
        title = issue.path;
        lines.push(issue.path);
        lines.push([src.path || input.sourceLabel, issue.reason].filter(Boolean).join(' · '));
        status = input.text('workbench.context-onboarding.not-read');
      }
    } else {
      const reference = (input.references || []).find(item => item.label === input.referenceLabel);
      if (!reference) return null;
      title = reference.title;
      lines.push(input.text('workbench.context-onboarding.path-version-version', { path: reference.path, version: reference.version }));
      lines.push([input.size(reference.original?.size_bytes || reference.text?.bytes || 0), reference.original?.sha256 ? reference.original.sha256.slice(0, 16) : reference.text?.sha256?.slice(0, 16), reference.original?.filename || reference.title].filter(Boolean).join(' · '));
      if (reference.duplicate_of) lines.push(input.text('workbench.context-onboarding.mr-duplicate-of', { path: reference.duplicate_of }));
      status = reference.duplicate_of ? input.text('workbench.context-onboarding.mr-duplicate') : reference.secret_mode === 'strip' ? input.text('workbench.context-onboarding.mr-secret-stripped') : reference.recognized_by_content ? input.text('workbench.context-onboarding.mr-by-content') : reference.adopted ? input.text('workbench.context-onboarding.mr-step-adopted') : reference.used_in_summary ? input.text('workbench.context-onboarding.mr-used') : input.text('workbench.context-onboarding.read');
    }
    if (status) lines.push(status);
    return { title, lines };
  }
  function showFileDetail(button) {
    const content = buildFileDetail({
      kind: button.dataset.detailKind,
      source: source(button.dataset.detailSource || ''),
      index: Number(button.dataset.detailIndex),
      issuePath: button.dataset.detailIssue,
      referenceLabel: button.dataset.detailRef,
      references: journey.summary?.references,
      sourceLabel: globalThis.t.text(names[button.dataset.detailSource || '']),
      size,
      text: (key, values) => globalThis.t.text(key, values),
    });
    if (!content) return;
    opener = button;
    dialog.innerHTML = '<h2 id="cx-dialog-title">' + esc(globalThis.t.text('workbench.context-onboarding.details')) + '</h2><p class="cx-source-meta">' + esc(content.title) + '</p><div class="cx-source-body">' + content.lines.map(esc).join('<br>') + '</div><div class="cx-actions">' + btn({ variant: 'secondary', size: 'md', label: globalThis.t.text('common.control.close'), attrs: { 'data-close': true } }) + '</div>';
    dialog.showModal();
  }
  if (native && globalThis.__TAURI__?.event?.listen) {
    globalThis.__TAURI__.event.listen('molis:directory-scan-progress', ev => {
      const p = ev?.payload;
      if (!p || !scanningDirId || p.id !== scanningDirId) return;
      counting = { done: p.visited || 0, total: p.visited || 0, kept: (scanResumeBase.kept || 0) + (p.kept || 0), bytes: (scanResumeBase.bytes || 0) + (p.bytes || 0), nativeDir: true };
      render();
    }).catch(() => {});
  }
  function pausedNativeDir() {
    return native && journey ? picked().find(s => directory(s) && s.metadata?.cancelled && !s.references?.length) || null : null;
  }
  function mergeDirMetadata(prev, next) {
    const seen = new Set(), files = [];
    for (const f of [...(prev?.files || []), ...(next?.files || [])]) if (f?.path && !seen.has(f.path)) { seen.add(f.path); files.push(f); }
    files.sort((a, b) => ((b.modified_ms || 0) - (a.modified_ms || 0)) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const pr = prev?.skipped_reasons || {}, nr = next?.skipped_reasons || {}, skipped = (prev?.skipped || 0) + (next?.skipped || 0);
    const reasons = { ignored: (pr.ignored || 0) + (nr.ignored || 0), secret: (pr.secret || 0) + (nr.secret || 0), unreadable: (pr.unreadable || 0) + (nr.unreadable || 0), time: (pr.time || 0) + (nr.time || 0) };
    const rules = [...new Set([...(prev?.ignored_rules || []), ...(next?.ignored_rules || [])])].slice(0, 24);
    return { files, skipped, truncated: Boolean(next?.truncated), cancelled: Boolean(next?.cancelled), total_entries: Math.max(prev?.total_entries || 0, next?.total_entries || 0), ...(skipped > 0 ? { skipped_reasons: reasons } : {}), ...(rules.length ? { ignored_rules: rules } : {}) };
  }
  async function metadata(s, resumeOffset = 0) {
    if (s.references?.length) return;
    const prev = resumeOffset > 0 ? s.metadata : null;
    const prevFiles = prev?.files || [];
    scanResumeBase = prev ? { kept: prevFiles.length, bytes: prevFiles.reduce((n, f) => n + (f.size || 0), 0) } : { kept: 0, bytes: 0 };
    scanningDirId = s.kind;
    try {
      const next = await invoke('context_directory_preview', { id: s.kind, days: s.days ?? 30, ...(resumeOffset > 0 ? { resume_offset: resumeOffset } : {}) });
      s.metadata = prev ? mergeDirMetadata(prev, next) : next;
      delete s.error;
    } catch (e) {
      if (!prev) delete s.metadata;
      s.error = String(e?.message || e);
      await refreshGrants();
    } finally {
      scanningDirId = '';
      scanResumeBase = { kept: 0, bytes: 0 };
      counting = null;
    }
  }
  async function withUploads(mode, run) {
    if (typeof indexedDB === 'undefined') return;
    const db = await new Promise(res => {
      try {
        const req = indexedDB.open('molis-onboarding-uploads', 1);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('uploads')) req.result.createObjectStore('uploads', { keyPath: 'key' }); };
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      } catch { res(null); }
    });
    if (!db) return;
    await new Promise(res => {
      try { const tx = db.transaction('uploads', mode); run(tx.objectStore('uploads')); tx.oncomplete = tx.onerror = tx.onabort = () => res(); }
      catch { res(); }
    });
  }
  async function saveUploadFiles(kind, list, chosen, partial, state) {
    if (partial) partialRestoredKinds.add(kind); else partialRestoredKinds.delete(kind);
    if (!partial) pausedUploads.delete(kind);
    if (journey) await withUploads('readwrite', st => st.put({
      key: journey.id + ':' + kind, files: chosen, partial: Boolean(partial),
      ...(partial ? { all: list, index: state.index, total: state.total, bytes: state.bytes, reasons: state.reasons, rules: state.rules, baseEntries: state.baseEntries, dupEntries: state.dupEntries } : {}),
    }));
  }
  async function dropUploadFiles(kind) {
    partialRestoredKinds.delete(kind); pausedUploads.delete(kind);
    if (journey) await withUploads('readwrite', st => st.delete(journey.id + ':' + kind));
  }
  async function clearJourneyUploads(id) {
    partialRestoredKinds.clear(); pausedUploads.clear();
    if (id) await withUploads('readwrite', st => { const r = st.openCursor(); r.onsuccess = () => { const c = r.result; if (!c) return; if (String(c.key).startsWith(id + ':')) c.delete(); c.continue(); }; });
  }
  async function restoreUploadFiles() {
    partialRestoredKinds.clear(); pausedUploads.clear();
    if (journey) await withUploads('readonly', st => { const p = journey.id + ':', r = st.openCursor(); r.onsuccess = () => { const c = r.result; if (!c) return; const k = String(c.key); if (k.startsWith(p)) { const sk = k.slice(p.length); if (Array.isArray(c.value?.files) && c.value.files.length) uploads.set(sk, c.value.files); if (c.value?.partial) {
      partialRestoredKinds.add(sk);
      if (Array.isArray(c.value.all)) pausedUploads.set(sk, { kind: sk, list: c.value.all, index: c.value.index || 0, chosen: c.value.files || [], bytes: c.value.bytes || 0, reasons: c.value.reasons || { ignored: 0, secret: 0, unreadable: 0 }, rules: c.value.rules || [], baseEntries: c.value.baseEntries || 0, dupEntries: c.value.dupEntries || 0 });
    } } c.continue(); }; });
  }
  async function runUploadCount(el, resumeFrom) {
    const kind = resumeFrom ? resumeFrom.kind : el.dataset.upload;
    const s = source(kind);
    const list = resumeFrom ? resumeFrom.list : [...el.files], total = list.length;
    const prevMeta = !resumeFrom && s.kind !== 'directory' && uploads.has(s.kind) ? s.metadata : null;
    const prevFiles = prevMeta ? (uploads.get(s.kind) || []) : [];
    const prevKeys = new Set(prevFiles.map(f => (f.webkitRelativePath || f.name) + '\0' + (f.size || 0)));
    const chosen = resumeFrom ? resumeFrom.chosen : [...prevFiles];
    const reasons = resumeFrom ? resumeFrom.reasons : { ignored: prevMeta?.skipped_reasons?.ignored || 0, secret: prevMeta?.skipped_reasons?.secret || 0, unreadable: prevMeta?.skipped_reasons?.unreadable || 0 };
    const ruleSet = new Set(resumeFrom ? resumeFrom.rules : (prevMeta?.ignored_rules || []));
    const baseEntries = resumeFrom ? (resumeFrom.baseEntries || 0) : (prevMeta ? (prevMeta.total_entries || (prevFiles.length + (prevMeta.skipped || 0))) : 0);
    let dupEntries = resumeFrom ? (resumeFrom.dupEntries || 0) : 0;
    let bytes = resumeFrom ? resumeFrom.bytes : prevFiles.reduce((n, f) => n + (f.size || 0), 0), index = resumeFrom ? resumeFrom.index : 0, drawn = 0;
    stopCounting = false; pausedScan = null;
    const allowSecret = kind === 'files';
    const applyUploadMeta = partial => {
      const skippedCount = (reasons.ignored || 0) + (reasons.secret || 0) + (reasons.unreadable || 0);
      invalidateSource(s); uploads.set(s.kind, [...chosen]);
      s.metadata = {
        files: chosen.map(f => ({ path: f.webkitRelativePath || f.name, size: f.size, modified_ms: f.lastModified, identity: 'upload' })),
        skipped: skippedCount,
        truncated: Boolean(partial),
        ...(partial ? { cancelled: true } : {}),
        total_entries: baseEntries + index - dupEntries,
        ...(skippedCount ? { skipped_reasons: { ...reasons } } : {}),
        ...(ruleSet.size ? { ignored_rules: [...ruleSet] } : {}),
      };
      s.excluded = []; s.selected = chosen.length > 0 || total === 0;
    };
    const take = file => {
      const path = file.webkitRelativePath || file.name;
      if (!resumeFrom && prevKeys.has(path + '\0' + (file.size || 0))) { dupEntries++; return; }
      const skipped = contextFileSkip(path);
      if (skipped && !(allowSecret && skipped === 'secret')) {
        reasons[skipped] = (reasons[skipped] || 0) + 1;
        if (skipped === 'ignored') { const rule = contextSkipRuleName(path); if (rule && ruleSet.size < 24) ruleSet.add(rule); }
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
        if (index < total && index % 5000 === 0) {
          applyUploadMeta(true);
          await saveUploadFiles(s.kind, list, [...chosen], true, { index, total, bytes, reasons: { ...reasons }, rules: [...ruleSet], baseEntries, dupEntries });
          save().catch(() => {});
        }
        if (Date.now() - drawn >= 250 || index === total) { drawn = Date.now(); render(); await new Promise(resolve => setTimeout(resolve, 0)); }
        if (stopCounting && index < total) {
          pausedScan = { kind, list, index, chosen: [...chosen], bytes, reasons: { ...reasons }, rules: [...ruleSet], baseEntries, dupEntries };
          break;
        }
      }
    } else for (; index < total; index++) take(list[index]);
    const stoppedEarly = index < total;
    if (!chosen.length && total > 0 && !stoppedEarly) throw new Error(readText("workbench.context-onboarding.no-supported-files-found"));
    applyUploadMeta(stoppedEarly); error = '';
    if (total > 2500) { counting = { done: index, total, kept: chosen.length, bytes, saving: true }; render(); await new Promise(resolve => setTimeout(resolve, 0)); }
    await saveUploadFiles(s.kind, list, chosen, stoppedEarly, { index, total, bytes, reasons: { ...reasons }, rules: [...ruleSet], baseEntries, dupEntries });
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
      const detail = s.error || (s.references ? readText("workbench.context-onboarding.n-n-saved", {n:s.references.length}) + (s.skipped ? ' · ' + readText("workbench.context-onboarding.n-skipped", {n:s.skipped}) : '') + (heldN ? ' · ' + readText("workbench.context-onboarding.n-held-secret", {n:heldN}) : '') : s.reading ? readText("workbench.context-onboarding.k-n", {k:Math.min(s.reading.done + 1, s.reading.total), n:s.reading.total}) : '');
      return fileRow({name:readText(names[s.kind]), chip:'<span class="mw-file-kind" data-slot="file-kind">' + glyph(sourceIcons[s.kind]) + '</span>', size:detail, state:status(readText(label), state === 'done' ? 'done' : state === 'failed' ? 'blocked' : heldN ? 'attention' : 'idle', null, state === 'done' || state === 'failed' ? state : journey.phase === 'reading' ? 'waiting' : state === 'ready' ? 'ready' : 'idle')});
    }).join('') + '</ul>' + picked().map(issues).join('');
  }
  function mrTrack(step, stopAt, isErr, label, tone) {
    const ariaLabel = stopAt ? readText("workbench.context-onboarding.mr-track-stopped-aria", { step, stop: stopAt, state: label }) : readText("workbench.context-onboarding.mr-track-aria", { step, state: label });
    return recParts.renderMaterialsTrack({ step, ...(stopAt ? { stopAt } : {}), ...(isErr ? { error: true } : {}), label, tone: tone || 'idle', ariaLabel });
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
    const projectCount = journey.phase === 'complete' ? nonDupRefs.filter(x => x.r.adopted).length : '—';
    const funnel = recParts.renderMaterialsFunnel([
      { label: readText("workbench.context-onboarding.mr-step-discovered"), value: discovered },
      { label: readText("workbench.context-onboarding.mr-step-selected"), value: selectedCount },
      { label: readText("workbench.context-onboarding.mr-step-read"), value: readCount },
      { label: readText("workbench.context-onboarding.mr-step-used"), value: journey.summary ? usedCount : '—' },
      { label: readText("workbench.context-onboarding.mr-step-adopted"), value: projectCount },
    ], readText("workbench.context-onboarding.mr-funnel-label"));
    const attentionCount = heldRows.length + issueRows.length;
    const unusedRows = refRows.filter(x => x.r.duplicate_of || (journey.summary && !x.r.used_in_summary));
    const filterBar = '<div class="ob-mr-bar">' + toggles(readText("workbench.context-onboarding.mr-filter-label"), [
      { label: readText("workbench.context-onboarding.mr-filter-all", { n: heldRows.length + issueRows.length + refRows.length }), current: mrFilter === 'all', attrs: { 'data-mr-filter': 'all' } },
      { label: readText("workbench.context-onboarding.mr-filter-attention", { n: attentionCount }), current: mrFilter === 'attention', attrs: { 'data-mr-filter': 'attention' } },
      { label: readText("workbench.context-onboarding.mr-filter-unused", { n: unusedRows.length }), current: mrFilter === 'unused', attrs: { 'data-mr-filter': 'unused' } },
    ]) + '</div>';
    const items = [];
    if (mrFilter === 'all' || mrFilter === 'attention') {
      for (const { s, h } of heldRows) {
        const namesList = h.preview_names;
        const vars = namesList?.length ? namesList.join(', ') : readText("workbench.context-onboarding.mr-secret-content");
        items.push(fileRow({ cls: 'is-issue', name: h.path, size: readText(names[s.kind]) + ' · ' + size(h.size_bytes || 0), state: mrTrack(2, 3, false, readText("workbench.context-onboarding.secret-awaiting-choice"), 'attention') })
          + recParts.renderMaterialIssueRow({
            reason: readText("workbench.context-onboarding.mr-secret-why", { vars }),
            actions: [
              { variant: 'secondary', size: 'sm', label: readText("workbench.context-onboarding.secret-strip"), attrs: { 'data-secret-key': h.key, 'data-secret-decision': 'strip' } },
              { variant: 'ghost', size: 'sm', label: readText("workbench.context-onboarding.secret-exclude"), attrs: { 'data-secret-key': h.key, 'data-secret-decision': 'exclude' } },
              { variant: 'ghost', size: 'sm', label: readText("workbench.context-onboarding.secret-raw"), attrs: { 'data-secret-key': h.key, 'data-secret-decision': 'raw' } },
            ],
          }));
      }
      for (const { s, iss } of issueRows) {
        const reauth = directory(s) && grants[s.kind]?.state === 'unavailable';
        const act = reauth
          ? { variant: 'secondary', size: 'sm', label: readText("workbench.context-onboarding.choose-authorize"), attrs: { 'data-authorize': s.kind } }
          : { variant: 'ghost', size: 'sm', label: readText("workbench.context-onboarding.adjust-sources"), attrs: { 'data-action': 'restart' } };
        items.push(fileRow({ cls: 'is-issue', name: iss.path, size: readText(names[s.kind]), state: mrTrack(2, 3, true, readText("workbench.context-onboarding.not-read"), 'blocked'), detail: { label: readText("workbench.context-onboarding.details"), attrs: { 'data-detail-kind': 'issue', 'data-detail-source': s.kind, 'data-detail-issue': iss.path } } })
          + recParts.renderMaterialIssueRow({ reason: iss.reason, error: true, actions: [act] }));
      }
    }
    const shownRefs = mrFilter === 'attention' ? [] : mrFilter === 'unused' ? unusedRows : refRows;
    for (const { s, r } of shownRefs.slice(0, 200)) {
      const dup = Boolean(r.duplicate_of);
      const step = dup ? 3 : journey.phase === 'complete' && r.adopted ? 5 : journey.summary && r.used_in_summary ? 4 : 3;
      const stopAt = dup ? 4 : (!dup && journey.summary && !r.used_in_summary ? 4 : 0);
      const noteParts = [readText(names[s.kind]), size(r.original?.size_bytes || r.text?.bytes || 0)];
      if (r.recognized_by_content) noteParts.push(readText("workbench.context-onboarding.mr-by-content"));
      if (r.secret_mode === 'strip') noteParts.push(readText("workbench.context-onboarding.mr-secret-stripped"));
      if (dup) noteParts.push(readText("workbench.context-onboarding.mr-duplicate-of", { path: r.duplicate_of }));
      const stLabel = dup ? readText("workbench.context-onboarding.mr-duplicate")
        : r.secret_mode === 'strip' ? readText("workbench.context-onboarding.mr-secret-stripped")
        : r.recognized_by_content ? readText("workbench.context-onboarding.mr-by-content")
        : journey.summary && r.used_in_summary ? readText("workbench.context-onboarding.mr-used")
        : readText("workbench.context-onboarding.read");
      items.push(fileRow({ name: r.path || r.title, size: noteParts.join(' · '), state: mrTrack(step, stopAt, false, stLabel, dup ? 'quiet' : 'done'), detail: { label: readText("workbench.context-onboarding.details"), attrs: { 'data-detail-kind': 'ref', 'data-detail-ref': r.label } } }));
    }
    if (shownRefs.length > 200) items.push('<li class="ob-more-row"><small class="ob-quiet">' + esc(readText("workbench.context-onboarding.n-more-files-included", { n: shownRefs.length - 200 })) + '</small></li>');
    const ruleSummary = (skippedIgnored + skippedSecret + skippedUnreadable) > 0
      ? collapsible(
          readText("workbench.context-onboarding.mr-skipped-summary", { n: skippedIgnored + skippedSecret + skippedUnreadable }),
          '<p class="cx-source-meta">' + [
            skippedIgnored ? readText("workbench.context-onboarding.mr-skipped-ignored", { n: skippedIgnored, rules: [...ruleNames].join(', ') || 'node_modules, .git, dist' }) : '',
            skippedSecret ? readText("workbench.context-onboarding.mr-skipped-secret", { n: skippedSecret }) : '',
            skippedUnreadable ? readText("workbench.context-onboarding.mr-skipped-binary", { n: skippedUnreadable }) : '',
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
    if (d?.added_count) rows.push({ kind: 'add', glyph: 'plus', title: readText("workbench.context-onboarding.delta-added", { n: d.added_count }), detail: (d.added || []).slice(0, 3).join(', ') });
    if (d?.removed_count) rows.push({ kind: 'rem', glyph: 'x', title: readText("workbench.context-onboarding.delta-removed", { n: d.removed_count }), detail: (d.removed || []).slice(0, 3).join(', ') });
    const reused = d ? d.reused : (journey.last_read_paths?.length || 0);
    if (reused > 0) rows.push({ kind: 'keep', glyph: 'check', title: readText("workbench.context-onboarding.delta-reused", { n: reused }), detail: readText("workbench.context-onboarding.delta-no-reread") });
    if (modelChanged) rows.push({ kind: 'redo', glyph: 'refresh', title: readText("workbench.context-onboarding.delta-model-changed", { model: config.model }), detail: readText("workbench.context-onboarding.delta-summary-redone") });
    else if (d && (d.added_count || d.removed_count)) rows.push({ kind: 'redo', glyph: 'refresh', title: readText("workbench.context-onboarding.delta-summary-redone") });
    if (!rows.length) return '';
    return recParts.renderScopeDeltaCard({ title: readText("workbench.context-onboarding.delta-title"), items: rows });
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
    return '<div class="ob-notice" data-slot="late-ignored">' + glyph('clock') + '<span>' + esc(readText("workbench.context-onboarding.late-result-ignored", { model: l.model || readText("workbench.context-onboarding.previous-model") })) + '</span></div>';
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
    return msg ? note(msg, 'circle-alert', 'warning') : '';
  }
`.replace(/^[ \t]+/gm, "");
