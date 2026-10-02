/**
 * Arrival motion: the wordmark types itself, the caption cycles its words, content arrives. The rhythm is Molis Club's
 * Edition C (wordmark: 250ms in, a letter every 170ms, the caret blinks three times; caption: the words type at 90ms a
 * letter, hold 2.3s, erase at 45ms, and the two columns slide to their new places over 420ms). The product's own rules
 * still hold: only opacity and transform move, nothing blocks input, and reduced motion or automation shows the end state.
 *
 * Defines `window.molisArrival`; the markup is `renderWordmark` and `renderCaption` (`primitives/arrival.ts`).
 */
export const ARRIVAL_MOTION_CLIENT_SCRIPT = String.raw`
(() => {
  if (window.molisArrival) return;
  const EASE = 'cubic-bezier(.22, 1, .36, 1)';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const state = { paused: false };
  // Reduced motion, a browser under automation and the explicit still flag all show the end state.
  const still = () => reduced.matches || navigator.webdriver === true || document.documentElement.hasAttribute('data-still');

  /** Run one animation on an element; nothing in still mode. */
  const arrive = (el, keyframes, options) => (!el || still() ? null : el.animate(keyframes, { easing: EASE, fill: 'backwards', ...options }));
  /** Elements arrive one after another (a list's first appearance, at most 12 rows). */
  const cascade = (els, { from = { opacity: 0, transform: 'translateY(7px)' }, step = 28, delay = 0, duration = 420, max = 12 } = {}) => {
    [...els].slice(0, max).forEach((el, index) => arrive(el, [from, { opacity: 1, transform: 'none' }], { delay: delay + index * step, duration }));
  };

  /* ───────── Wordmark ───────── */
  const typing = new WeakMap();
  /**
   * pace 'ritual': a letter every 170ms, the caret rests at the end (the new person's opening);
   * pace 'quick': 90ms, two blinks, the caret leaves (a returning person, in the title bar, never in the way).
   * Returns { skip() } — jump to the typed end.
   */
  const typeWordmark = (el, { pace = 'quick', delay = 250, onDone } = {}) => {
    if (!el) return { skip() {} };
    typing.get(el)?.cancel();
    const letters = [...el.querySelectorAll('.mw-wordmark__l')], caret = el.querySelector('.mw-wordmark__caret');
    const per = pace === 'ritual' ? 170 : 90;
    el.dataset.pace = pace;
    if (still()) { el.dataset.state = 'done'; onDone?.(); return { skip() {} }; }
    el.dataset.state = 'typing';
    const anims = letters.map((letter, index) => letter.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: delay + index * per, fill: 'backwards', easing: 'steps(1, end)' }));
    const typedAt = delay + letters.length * per + 40, blinks = pace === 'ritual' ? 3 : 2, period = pace === 'ritual' ? 1000 : 700, total = typedAt + blinks * period;
    const frames = [{ opacity: 0, offset: 0, easing: 'steps(1, end)' }, { opacity: 1, offset: typedAt / total, easing: 'steps(1, end)' }];
    for (let blink = 0; blink < blinks; blink += 1) {
      frames.push({ opacity: 0, offset: (typedAt + blink * period + period / 2) / total, easing: 'steps(1, end)' });
      frames.push({ opacity: 1, offset: (typedAt + (blink + 1) * period) / total, easing: 'steps(1, end)' });
    }
    frames.push({ opacity: pace === 'ritual' ? 1 : 0, offset: 1 });
    const group = [...anims, caret?.animate(frames, { duration: total, fill: 'both' })].filter(Boolean);
    const finish = Promise.all(group.map((animation) => animation.finished.catch(() => {}))).then(() => { el.dataset.state = 'done'; onDone?.(); });
    const handle = { cancel() { group.forEach((animation) => animation.cancel()); }, skip() { group.forEach((animation) => { try { animation.finish(); } catch { /* already over */ } }); }, finish };
    typing.set(el, handle);
    return handle;
  };
  /** Show the wordmark typed, without playing. */
  const settleWordmark = (el) => {
    if (!el) return;
    typing.get(el)?.cancel();
    el.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    el.dataset.state = 'done';
  };

  /* ───────── Caption ───────── */
  class Caption {
    constructor(button) {
      this.button = button;
      this.phrases = JSON.parse(button.dataset.phrases || '[]');
      this.rows = [...button.querySelectorAll('.mw-caption__row')];
      this.tails = [...button.querySelectorAll('.mw-caption__tail')];
      this.index = 0; this.anims = []; this.previousX = null; this.alive = true;
      this.flags = { paused: false, hover: false, focus: false, inView: true, active: true };
      this.onVisibility = () => this.sync();
      document.addEventListener('visibilitychange', this.onVisibility);
      this.observer = new IntersectionObserver(([entry]) => { this.flags.inView = entry.isIntersecting; this.sync(); });
      this.observer.observe(button);
      button.addEventListener('click', () => this.toggle());
      button.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') { this.flags.hover = true; this.sync(); } });
      button.addEventListener('pointerleave', () => { this.flags.hover = false; this.sync(); });
      button.addEventListener('focus', () => { this.flags.focus = button.matches(':focus-visible'); this.sync(); });
      button.addEventListener('blur', () => { this.flags.focus = false; this.sync(); });
      this.reserve();
      document.fonts?.ready.then(() => { if (this.alive) this.reserve(); });
    }
    get playing() {
      const flags = this.flags;
      return flags.active && !flags.paused && !flags.hover && !flags.focus && flags.inView && !document.hidden && !still() && !state.paused;
    }
    toggle() {
      this.flags.paused = !this.flags.paused;
      this.button.setAttribute('aria-pressed', String(this.flags.paused));
      this.button.setAttribute('aria-label', this.button.getAttribute(this.flags.paused ? 'data-label-play' : 'data-label-pause') || '');
      this.sync();
    }
    fill(phrase, visible) {
      this.tails.forEach((tail, row) => { tail.innerHTML = [...phrase[row]].map((char) => '<span class="mw-caption__l' + (visible ? ' is-on' : '') + '">' + char + '</span>').join(''); });
    }
    /** The longest pair sets the width, so a new pair never moves what is beside it. */
    reserve() {
      this.button.style.minWidth = '';
      let widest = 0;
      for (const phrase of this.phrases) { this.fill(phrase, false); widest = Math.max(widest, this.button.getBoundingClientRect().width); }
      this.button.style.minWidth = Math.ceil(widest) + 'px';
      this.build(true);
    }
    build(keep) {
      this.anims.forEach((animation) => animation.cancel());
      this.anims = [];
      if (!this.phrases.length) return;
      const phrase = this.phrases[this.index], resting = still();
      this.fill(phrase, resting);
      this.button.dataset.animated = String(!resting);
      if (resting) return;
      const letters = [...this.button.querySelectorAll('.mw-caption__l')];
      const typingStarts = 450, typingEnds = typingStarts + letters.length * 90, erasingStarts = typingEnds + 2300, duration = erasingStarts + letters.length * 45 + 200;
      const typed = letters.map((letter, index) => {
        const typedAt = typingStarts + (index + 1) * 90, erasedAt = erasingStarts + (letters.length - index) * 45;
        const animation = letter.animate([
          { opacity: 0, offset: 0, easing: 'steps(1, end)' }, { opacity: 1, offset: typedAt / duration, easing: 'steps(1, end)' },
          { opacity: 0, offset: erasedAt / duration }, { opacity: 0, offset: 1 },
        ], { duration, fill: 'both' });
        animation.pause();
        return animation;
      });
      const moves = this.rows.flatMap((row, index) => {
        if (keep || this.previousX == null) return [];
        const distance = this.previousX[index] - row.getBoundingClientRect().left;
        if (Math.abs(distance) < 0.5) return [];
        const animation = row.animate([{ transform: 'translateX(' + distance + 'px)' }, { transform: 'translateX(0)' }], { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
        animation.pause();
        return [animation];
      });
      this.anims = [...typed, ...moves];
      typed[0].onfinish = () => {
        this.previousX = this.rows.map((row) => row.getBoundingClientRect().left);
        this.index = (this.index + 1) % this.phrases.length;
        if (this.alive) this.build(false);
      };
      this.sync();
    }
    sync() {
      const playing = this.playing;
      this.anims.forEach((animation) => {
        if (playing && animation.playState === 'paused') animation.play();
        if (!playing && animation.playState === 'running') animation.pause();
      });
    }
    /** Rest while another screen is up; carry on when it is back. */
    setActive(on) { this.flags.active = on; this.sync(); }
    refresh() { this.build(true); }
    destroy() { this.alive = false; this.anims.forEach((animation) => animation.cancel()); this.observer.disconnect(); document.removeEventListener('visibilitychange', this.onVisibility); }
  }
  const mountCaption = (button) => (button ? new Caption(button) : null);

  /** Fly one element to another's place and size (the opening's wordmark settling into the title bar). */
  const flyTo = (from, to, { duration = 640 } = {}) => {
    if (!from || !to || still()) return Promise.resolve();
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), scale = b.height / a.height;
    from.style.transformOrigin = '0 0';
    return from.animate([{ transform: 'none' }, { transform: 'translate(' + (b.left - a.left) + 'px, ' + (b.top - a.top) + 'px) scale(' + scale + ')' }], { duration, easing: EASE, fill: 'forwards' }).finished.catch(() => {});
  };

  window.molisArrival = { EASE, still, arrive, cascade, typeWordmark, settleWordmark, mountCaption, flyTo, pause(flag) { state.paused = Boolean(flag); } };
})();
`;
