/** The existing Assistant entry freezes its route and page lifetime before the shared program is fetched. */
export const ASSISTANT_SUBTASK_ENTRY_PART = String.raw`
  let subtaskLifetime = new AbortController(), subtaskTicket = 0, releaseSubtaskAccount;
  const subtaskEntryId = (...target) => 'assistant-child-' + encodeURIComponent(JSON.stringify([host.route('/api/assistant'), ...target]));
  const closeSubtask = () => { subtaskTicket++; subtaskLifetime.abort(); subtaskLifetime = new AbortController(); };
  const loadSubtasks = () => new Promise((resolve, reject) => {
    let script = document.querySelector('script[data-assistant-subtasks]');
    if (script?.dataset.loaded === 'true') { resolve(); return; }
    const added = !script;
    if (!script) { script = document.createElement('script'); script.dataset.assistantSubtasks = ''; script.src = '/assets/molis-work-assistant-subtasks.js'; }
    const loaded = () => { cleanup(); script.dataset.loaded = 'true'; resolve(); };
    const failed = () => { cleanup(); script.remove(); reject(new Error(readText('workbench.subtask-conversation.not-available'))); };
    const cleanup = () => { script.removeEventListener('load', loaded); script.removeEventListener('error', failed); };
    script.addEventListener('load', loaded); script.addEventListener('error', failed);
    if (added) document.head.append(script);
  });
  const openSubtask = async (work_id, parent_run_id, child_id) => {
    const account = globalThis.molisWorkAccountTransition;
    if (!account || account.preparing || !island.isConnected) return;
    releaseSubtaskAccount ??= account.page(side, async () => {}, () => subtaskLifetime.abort(), () => {});
    const ticket = ++subtaskTicket, base = host.route('/api/assistant'), signal = subtaskLifetime.signal;
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const detail = { base, signal, focus, work_id, ...(child_id ? { parent_run_id, child_id } : {}), interaction: host.interaction,
      reviews: { mount: mountWorkReview, retitle: retitleReviewText, permission: openSubtaskPermission } };
    try {
      await loadSubtasks();
      if (signal.aborted || ticket !== subtaskTicket || account.preparing || !island.isConnected || base !== host.route('/api/assistant')) return;
      document.dispatchEvent(new CustomEvent('molis:assistant-subtask-open', { detail }));
    } catch (error) { if (!signal.aborted && ticket === subtaskTicket) showError(error); }
  };
`;
