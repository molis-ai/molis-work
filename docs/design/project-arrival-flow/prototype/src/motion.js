// 动效：Molis Work 字标的打字机、AI 字幕的词组变换，以及进入时的到达动画。
// 节奏取自本机 molis-club 的 Edition C（app/edition-c/motion.tsx、edition.css）：
//   字标  250ms 起，每字 170ms；光标在打完后闪三下（1000ms 一周期，阶跃）。
//   字幕  A / I 常驻；450ms 后逐字打出（90ms 一字），停 2300ms，再逆序删除（45ms 一字）；换词时两列用 420ms 平移到新位置。
// 与 Club 不同的是：产品里不能挡住操作，所以老用户的字标用更快的节奏，动画永远只动 opacity / transform。
import { PHRASES } from './data.js';

export const EASE = 'cubic-bezier(.22, 1, .36, 1)';
export const SPRING = 'cubic-bezier(.2, 1.35, .4, 1)';

const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
export const motion = { paused: false, still: false };
export const isStill = () => reducedMQ.matches || motion.still;

/** 在元素上跑一段动画；静止模式下什么都不做。 */
export function arrive(el, keyframes, options) {
  if (!el || isStill()) return null;
  return el.animate(keyframes, { easing: EASE, fill: 'backwards', ...options });
}

/** 一组元素依次到达（列表首次出现，最多 12 行）。 */
export function cascade(els, { from = { opacity: 0, transform: 'translateY(7px)' }, step = 28, delay = 0, duration = 420, max = 12 } = {}) {
  [...els].slice(0, max).forEach((el, i) => arrive(el, [from, { opacity: 1, transform: 'none' }], { delay: delay + i * step, duration }));
}

/* ───────── 字标打字机 ───────── */
const wordmarks = new WeakMap();

/**
 * pace: 'ritual' 每字 170ms（新用户的完整开场）· 'quick' 每字 90ms（老用户，在标题栏里，不拦操作）。
 * 返回 { skip() }：立刻跳到打完的状态。
 */
export function typeWordmark(el, { pace = 'quick', delay = 250, onDone } = {}) {
  if (!el) return { skip() {} };
  wordmarks.get(el)?.cancel();
  const letters = [...el.querySelectorAll('.mw-wordmark__l')];
  const caret = el.querySelector('.mw-wordmark__caret');
  const per = pace === 'ritual' ? 170 : 90;
  el.dataset.pace = pace;
  if (isStill()) {
    el.dataset.state = 'done';
    onDone?.();
    return { skip() {} };
  }
  el.dataset.state = 'typing';
  const anims = letters.map((l, i) => l.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: delay + i * per, fill: 'backwards', easing: 'steps(1, end)' }));
  const typedAt = delay + letters.length * per + 40;
  // 光标：打完后闪三下（Club：1000ms 一周期、阶跃），随后收起。
  const blinks = pace === 'ritual' ? 3 : 2;
  const period = pace === 'ritual' ? 1000 : 700;
  const total = typedAt + blinks * period;
  const frames = [{ opacity: 0, offset: 0, easing: 'steps(1, end)' }, { opacity: 1, offset: typedAt / total, easing: 'steps(1, end)' }];
  for (let b = 0; b < blinks; b += 1) {
    frames.push({ opacity: 0, offset: (typedAt + b * period + period / 2) / total, easing: 'steps(1, end)' });
    frames.push({ opacity: 1, offset: (typedAt + (b + 1) * period) / total, easing: 'steps(1, end)' });
  }
  frames.push({ opacity: pace === 'ritual' ? 1 : 0, offset: 1 });
  const caretAnim = caret?.animate(frames, { duration: total, fill: 'both' });
  const group = [...anims, caretAnim].filter(Boolean);
  const finish = Promise.all(group.map((a) => a.finished.catch(() => {}))).then(() => { el.dataset.state = 'done'; onDone?.(); });
  const handle = { cancel() { group.forEach((a) => a.cancel()); }, skip() { group.forEach((a) => { try { a.finish(); } catch { /* 已结束 */ } }); }, finish };
  wordmarks.set(el, handle);
  return handle;
}

/** 不播放，直接落在打完的状态。 */
export function settleWordmark(el) {
  if (!el) return;
  wordmarks.get(el)?.cancel();
  el.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  el.dataset.state = 'done';
}

/* ───────── AI 字幕 ───────── */
export class Caption {
  constructor(btn, { onState } = {}) {
    this.btn = btn;
    this.rows = [...btn.querySelectorAll('.mw-caption__row')];
    this.tails = [...btn.querySelectorAll('.mw-caption__tail')];
    this.i = 0;
    this.anims = [];
    this.prevX = null;
    this.alive = true;
    this.flags = { paused: false, hover: false, focus: false, inView: true, active: true };
    this.onState = onState;
    this.onVis = () => this.sync();
    document.addEventListener('visibilitychange', this.onVis);
    this.io = new IntersectionObserver(([e]) => { this.flags.inView = e.isIntersecting; this.sync(); });
    this.io.observe(btn);
    btn.addEventListener('click', () => this.toggle());
    btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { this.flags.hover = true; this.sync(); } });
    btn.addEventListener('pointerleave', () => { this.flags.hover = false; this.sync(); });
    btn.addEventListener('focus', () => { this.flags.focus = btn.matches(':focus-visible'); this.sync(); });
    btn.addEventListener('blur', () => { this.flags.focus = false; this.sync(); });
    this.reserve();
    document.fonts?.ready.then(() => { if (this.alive) this.reserve(); });
  }

  get playing() {
    const f = this.flags;
    return f.active && !f.paused && !f.hover && !f.focus && f.inView && !document.hidden && !isStill() && !motion.paused;
  }

  toggle() {
    this.flags.paused = !this.flags.paused;
    this.btn.setAttribute('aria-pressed', String(this.flags.paused));
    this.btn.setAttribute('aria-label', this.flags.paused ? '播放标题动画' : '暂停标题动画');
    this.sync();
  }

  fill(phrase, visible) {
    this.tails.forEach((tail, r) => { tail.innerHTML = [...phrase[r]].map((ch) => `<span class="mw-caption__l${visible ? ' is-on' : ''}">${ch}</span>`).join(''); });
  }

  /** 按最长的一组词预留宽度，换词不会让周围的东西跳。 */
  reserve() {
    this.btn.style.minWidth = '';
    let max = 0;
    for (const ph of PHRASES) { this.fill(ph, false); max = Math.max(max, this.btn.getBoundingClientRect().width); }
    this.btn.style.minWidth = `${Math.ceil(max)}px`;
    this.build(true);
  }

  build(keep) {
    this.anims.forEach((a) => a.cancel());
    this.anims = [];
    const phrase = PHRASES[this.i];
    const still = isStill();
    this.fill(phrase, still);
    this.btn.dataset.animated = String(!still);
    if (still) return;
    const letters = [...this.btn.querySelectorAll('.mw-caption__l')];
    const typingStarts = 450;
    const typingEnds = typingStarts + letters.length * 90;
    const erasingStarts = typingEnds + 2300;
    const duration = erasingStarts + letters.length * 45 + 200;
    const typing = letters.map((l, index) => {
      const typedAt = typingStarts + (index + 1) * 90;
      const erasedAt = erasingStarts + (letters.length - index) * 45;
      const a = l.animate([
        { opacity: 0, offset: 0, easing: 'steps(1, end)' },
        { opacity: 1, offset: typedAt / duration, easing: 'steps(1, end)' },
        { opacity: 0, offset: erasedAt / duration },
        { opacity: 0, offset: 1 },
      ], { duration, fill: 'both' });
      a.pause();
      return a;
    });
    const moves = this.rows.flatMap((row, idx) => {
      if (keep || this.prevX == null) return [];
      const d = this.prevX[idx] - row.getBoundingClientRect().left;
      if (Math.abs(d) < 0.5) return [];
      const a = row.animate([{ transform: `translateX(${d}px)` }, { transform: 'translateX(0)' }], { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      a.pause();
      return [a];
    });
    this.anims = [...typing, ...moves];
    typing[0].onfinish = () => {
      this.prevX = this.rows.map((r) => r.getBoundingClientRect().left);
      this.i = (this.i + 1) % PHRASES.length;
      if (this.alive) this.build(false);
    };
    this.sync();
  }

  sync() {
    const p = this.playing;
    this.anims.forEach((a) => {
      if (p && a.playState === 'paused') a.play();
      if (!p && a.playState === 'running') a.pause();
    });
    this.onState?.(p);
  }

  /** 离开首页后暂停，回到首页再续。 */
  setActive(on) { this.flags.active = on; this.sync(); }
  refresh() { this.build(true); }
  destroy() {
    this.alive = false;
    this.anims.forEach((a) => a.cancel());
    this.io.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
  }
}
