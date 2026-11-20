/**
 * The onboarding step that brings in sessions from the person's AI tools (batch 35 item 1, SRB-09), joined into the onboarding browser program.
 * A round for an existing project reads those filed to it, as the project's AI, once the person allows that project's AI to read them; a new
 * project has none and no permit yet, so they are read in the step after it is made.
 */
export const CONTEXT_ONBOARDING_SESSIONS_PART = String.raw`
  const contextPath = '/api/onboarding/context';
  const params=new URLSearchParams(location.search), project=params.get('project');
  const projectQuery=project?'?project='+encodeURIComponent(project):'';
  const readConfig=()=>api(contextPath+projectQuery);
  const existing = () => Boolean(journey?.existing);
  const sessionsLater = () => !existing() && Boolean(source('sessions')?.selected);
  let sessionsState = null;
  /** The sources this round reads: sessions only for an existing project. */
  const picked = () => journey.sources.filter(s => s.selected && (s.kind !== 'sessions' || existing()));
  // The permit is the person's alone (sessions-rebuild contract design §7.4): this page is theirs, so it may turn it on, and says what that means.
  function sessionsWhy() {
    if (!sessionsState) return readText("workbench.context-onboarding.sessions-checking");
    if (sessionsState.error) return failureText(sessionsState.error);
    if (!sessionsState.allowed) return readText("workbench.context-onboarding.sessions-permit-off");
    return sessionsState.readable ? globalThis.t.text("workbench.context-onboarding.sessions-readable", {n:sessionsState.readable}) : readText("workbench.context-onboarding.sessions-none");
  }
  const permitButton = () => btn({variant:'secondary', size:'sm', icon:'shield', label:readText("workbench.context-onboarding.sessions-permit-allow"), attrs:{'data-action':'sessions-permit'}});
  function sessionsConfig() {
    const s = source('sessions');
    if (!existing()) return '<div class="ob-cfg-block"><div class="ob-picks" role="group">' + choice({label:readText("workbench.context-onboarding.sessions-choose-later"), selected:Boolean(s?.selected), attrs:{'data-sessions-pick':'1'}}) + '</div></div>' + note(readText("workbench.context-onboarding.sessions-new-note"), 'info');
    const off = sessionsState && !sessionsState.error && !sessionsState.allowed;
    const more = sessionsState?.allowed ? [sessionsState.reported ? globalThis.t.text("workbench.context-onboarding.sessions-reported", {n:sessionsState.reported}) : '', sessionsState.blocked ? globalThis.t.text("workbench.context-onboarding.sessions-blocked", {n:sessionsState.blocked}) : ''].filter(Boolean) : [];
    return note(sessionsWhy(), off ? 'alert' : sessionsState?.allowed && sessionsState.readable ? 'check' : 'info', off ? 'is-warn' : '')
      + (off ? '<div class="ob-cfg-actions">' + permitButton() + '</div>' + note(readText("workbench.context-onboarding.sessions-permit-note"), 'shield') : '')
      + more.map(text => note(text, 'info')).join('')
      + (ready(s) ? '<div class="ob-cfg-block"><div class="ob-picks" role="group">' + choice({label:readText("workbench.context-onboarding.sessions-use"), note:globalThis.t.text("workbench.context-onboarding.sessions-n", {n:sessionsState.readable}), selected:Boolean(s?.selected), attrs:{'data-sessions-pick':'1'}}) + '</div></div>' : '');
  }
  /** The project's AI read permit and what it reaches, read fresh: only the person's page reads the scope (the Sessions scope action). */
  async function refreshSessions() {
    if (!existing()) { sessionsState = null; return; }
    try {
      const scope = await api('/projects/' + encodeURIComponent(journey.project_id) + '/api/sessions/scope?counts=1');
      const row = (scope.project_ai_reads || []).find(r => r.current) || null, counts = row?.counts || null;
      sessionsState = {allowed:Boolean(row?.allowed), revision:row?.revision ?? 0, readable:counts?.ai_readable || 0, reported:counts?.reported || 0, blocked:(counts?.blocked || []).reduce((n, b) => n + b.count, 0)};
    } catch (err) { sessionsState = {error:keepFailure(err), allowed:false, revision:0, readable:0, reported:0, blocked:0}; }
  }
  async function allowSessions() {
    busy=true;error='';render();
    try {
      await api('/projects/' + encodeURIComponent(journey.project_id) + '/api/sessions/project-ai-read', {allowed:true, expected_revision:sessionsState?.revision ?? 0});
      await refreshSessions();
      await useSessions();
    } catch (err) { error=keepFailure(err); } finally { busy=false; render(); }
  }
  async function useSessions() { const s=source('sessions'); if (s && ready(s) && !s.selected) { s.selected=true; await save(); } }
  /** The project exists now: the sessions the person chose are read in the next step, in it, once they allow its AI to read them. */
  const sessionsNext = () => !journey.existing && journey.sources.some(s => s.kind === 'sessions' && s.selected);
  async function sessionsAct(b) {
    if (b.dataset.sessionsPick) { const s=source('sessions'); if (s && (s.selected || !existing() || ready(s))) { s.selected=!s.selected; await save(); } render(); return true; }
    if (b.dataset.action === 'sessions-permit') { await allowSessions(); return true; }
    return false;
  }
`;
