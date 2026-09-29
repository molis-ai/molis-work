export const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export const key = 'molis-soft-workbench-preview-v1';
export const defaults = { theme:'light', language:'zh', density:'comfortable', project:'Molis Work', runtime:'Codex', ai:'ask', notifications:'important', saved:[], notes:'', entries:[], composerDraft:'', conversation:[], onboardingStep:0, onboardingDone:false };
export function load() { try { return { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return { ...defaults }; } }
export function persist(state) { try { localStorage.setItem(key, JSON.stringify(state)); return true; } catch { return false; } }
export function applyPreferences(state) {
  const dark = state.theme === 'dark' || (state.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.density = state.density;
}
let toastTimer;
export function toast(message, action) {
  const el = document.querySelector('#toast'); clearTimeout(toastTimer);
  el.innerHTML = `${icon('check')}<span>${escape(message)}</span>${action ? '<button type="button">撤销</button>' : ''}`;
  el.hidden = false;
  if (action) el.querySelector('button').onclick = () => { action(); el.hidden = true; };
  toastTimer = setTimeout(() => { el.hidden = true; }, 3800);
}
export const button = (label, action, name, cls = 'quiet', attrs = '') => `<button class="btn ${cls}" type="button" data-action="${action}" ${attrs}>${name ? icon(name) : ''}<span>${label}</span></button>`;
export const iconButton = (label, action, name, attrs = '') => `<button class="icon-btn" type="button" data-action="${action}" aria-label="${label}" title="${label}" ${attrs}>${icon(name)}</button>`;
