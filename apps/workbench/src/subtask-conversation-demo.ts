/** Board-only simulation. The public controller will replace this wiring after the specimen and contract reviews. */
export const SUBTASK_SPECIMEN_SCRIPT = `(() => {
  const section = document.getElementById('subtask-conversation');
  const data = section?.querySelector('[data-subtask-demo-config]');
  if (!data || !window.molisComposer) return;
  const { frames, labels, words } = JSON.parse(data.textContent);
  const demos = [];
  for (const root of section.querySelectorAll('.mw-subtask')) {
    const composerRoot = root.querySelector('[data-subtask-composer]');
    const messages = root.querySelector('[data-subtask-messages]');
    const thread = root.querySelector('[data-subtask-thread]');
    const feedback = root.querySelector('[data-subtask-feedback]');
    const original = root.cloneNode(true);
    let running = Boolean(root.querySelector('[data-subtask-action="stop"]'));
    let held = Boolean(root.querySelector('textarea:disabled'));
    let draft = '', busy = false;
    const adapter = { read: async () => draft, write: async text => { draft = text; } };
    const handle = window.molisComposer(composerRoot, {
      kind: 'ai', entry: 'subtask-board-' + demos.length, labels: { ...labels, input: words.input },
      sources: false, draft: { adapter }, receiver: () => ({ label: words.writer, icon: 'user' }),
      submit: async input => {
        const item = document.createElement('article'); item.className = 'mw-subtask__message'; item.dataset.role = 'user';
        const text = document.createElement('div'); text.className = 'mw-subtask__words'; text.textContent = input.text;
        item.append(text); messages.append(item); thread.scrollTop = thread.scrollHeight;
        return { state: 'sent' };
      }
    });
    const update = () => { handle.setRunning(running); handle.hold(held ? words["continue-note"] : null); };
    update();
    const state = name => {
      const box = document.createElement('div'); box.innerHTML = frames[name];
      for (const part of ['context', 'intro', 'details']) root.querySelector('[data-subtask-' + part + ']').innerHTML = box.querySelector('[data-subtask-' + part + ']').innerHTML;
      running = name === 'running'; held = name === 'stopped'; update();
    };
    root.addEventListener('click', async event => {
      const button = event.target.closest('button'); if (!button || busy) return;
      const action = button.dataset.subtaskAction;
      if (action) {
        busy = true; button.disabled = true; feedback.textContent = words.working;
        await new Promise(resolve => setTimeout(resolve, 150));
        state(action === 'stop' ? 'stopped' : 'running'); feedback.replaceChildren(); busy = false;
      }
      if (button.hasAttribute('data-subtask-retry')) { feedback.textContent = words.loading; await new Promise(resolve => setTimeout(resolve, 150)); feedback.replaceChildren(); }
      if (button.hasAttribute('data-subtask-back') || button.hasAttribute('data-subtask-close')) { root.hidden = true; }
      if (button.hasAttribute('data-subtask-open')) { root.querySelector('[data-subtask-head] strong').textContent = button.textContent; }
    });
    demos.push({ reset() {
      root.hidden = false; feedback.replaceChildren();
      for (const part of ['head', 'context', 'intro', 'messages', 'details', 'children']) root.querySelector('[data-subtask-' + part + ']').innerHTML = original.querySelector('[data-subtask-' + part + ']').innerHTML;
      running = Boolean(root.querySelector('[data-subtask-action="stop"]')); held = Boolean(original.querySelector('textarea:disabled')); update(); thread.scrollTop = 0;
    }, history() {
      for (let n = 0; n < 80; n++) { const item = document.createElement('p'); item.textContent = (n + 1) + '. ' + words['sample-reply']; messages.append(item); }
    }, fail() {
      feedback.textContent = words['read-failed'] + ' ';
      const button = document.createElement('button'); button.className = 'mw-btn mw-btn--link'; button.type = 'button'; button.dataset.subtaskRetry = ''; button.textContent = words.retry; feedback.append(button);
    }, destroy: () => handle.destroy() });
  }
  section.addEventListener('click', event => {
    const action = event.target.closest('[data-subtask-demo]')?.dataset.subtaskDemo;
    if (action === 'history') demos[0].history();
    if (action === 'read-error') demos[0].fail();
    if (action === 'reset') demos.forEach(demo => demo.reset());
  });
  window.addEventListener('pagehide', () => demos.forEach(demo => demo.destroy()), { once: true });
})();`;
