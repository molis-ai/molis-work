import type { StateRingFamily } from "./state-ring-states.js";

interface RingSegment {
  points: number[][];
  alpha: number;
  z: number;
  tone: string;
}

/** Self-contained so the browser uses this exact geometry, serialized after compilation. */
export function stateRingGeometry(id: StateRingFamily, t: number, progress?: number): RingSegment[] {
  const tau = Math.PI * 2;
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const smooth = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const bump = (x: number, center: number, width: number) => Math.exp(-Math.pow((x - center) / width, 2));
  const completed = progress === undefined ? (id === "interrupted" ? 5 : 6) : progress <= 0 ? 0 : progress >= 1 ? 12 : Math.max(1, Math.min(11, Math.round(progress * 12)));
  const segments: RingSegment[] = [];
  for (let i = 0; i < 12; i++) {
    const theta = -Math.PI / 2 + i * tau / 12;
    const dist = ((t / 2.8 % 1) * 12 - i + 12) % 12;
    let alpha = .18, turn = 0, radius = 9.2, sx = 1, sy = 1;
    let tone = id === "done" ? "success" : id === "answer" || id === "verify" ? "attention" : id === "failed" ? "danger" : "neutral";
    if (id === "running") alpha = .1 + .9 * Math.exp(-Math.pow(dist / 2.76, 2));
    if (id === "idle") alpha = .22;
    if (id === "connected") alpha = .64;
    if (id === "done") alpha = .1 + .81 * smooth((t - i * .09) / .3);
    if (id === "waiting") {
      const c = t % 3.3, reply = bump(c, .34, .2) + .4 * bump(c, .81, .18);
      alpha = i === 0 || i === 6 ? .1 + .9 * (.24 + clamp(reply * (i === 6 ? .7 : 1)) * .6) : .1;
    }
    if (id === "answer") {
      const c = t % 4.2, knock = bump(c, .3, .15) + .7 * bump(c, .72, .16);
      alpha = i === 0 || i === 1 || i === 11 ? .33 + .55 * knock : .17;
    }
    if (id === "paused") {
      turn = .92 * (1 - Math.pow(1 - clamp(t / 1.55), 3));
      const held = i === 0 || i === 6 ? .76 - .25 * bump(t % 5.8, 3.8, .42) : .2;
      alpha = .56 + (held - .56) * smooth(t / 1.3);
    }
    if (id === "blocked") {
      const c = t % 4.2;
      turn = .78 * (smooth(c / .35) - smooth((c - .65) / .6));
      alpha = i >= 1 && i <= 3 ? .88 : .22;
      if (i === 3) alpha += .1 * bump(c, .62, .14);
    }
    if (id === "failed") {
      const c = t % 5.4, reset = smooth((c - 4.3) / 1.1);
      turn = -.68 * smooth(c / .3) + .17 * smooth((c - .32) / .24) + .51 * reset;
      alpha = .86 - .63 * smooth((c - .3) / .55) + .63 * reset;
    }
    if (id === "retrying") {
      const c = t % 4.6, strain = smooth(c / .8) - smooth((c - .85) / 1.3);
      turn = -.72 * strain + tau * smooth((c - .85) / 1.55);
      radius -= .75 * strain; sy -= .28 * strain; sx += .14 * strain;
      alpha = .14 + .72 * Math.exp(-Math.pow(dist / 4.08, 2));
    }
    if (id === "syncing") alpha = .38 + .5 * (.5 + .5 * Math.sin(theta - t * .8));
    if (id === "interrupted") {
      turn = .42 * smooth(t / .25) - .21 * smooth((t - .3) / .18);
      const c = t % 4.8, signal = bump(c, .32, .12) + .6 * bump(c, .65, .12);
      alpha = i < completed ? .68 : .48 + (i === completed ? .32 * signal : 0);
      tone = i < completed ? "neutral" : "interruption";
    }
    if (id === "partial") {
      alpha = i < completed ? .8 : .43 + .23 * (.5 + .5 * Math.sin(t * tau / 5));
      tone = i < completed ? "success" : "attention";
    }
    if (id === "verify") alpha = .57 + .18 * bump(t % 5.6, 1.4, .9);
    if (id === "stale") alpha = i >= 6 && i <= 9 ? .44 : .25;
    if (id === "unsaved") alpha = i === 11 || i === 0 || i === 1 ? .72 : .24;
    if (id === "unread") alpha = i === 0 ? .95 : .32;
    if (id === "read") alpha = .26;
    if (id === "archived") alpha = i >= 5 && i <= 7 ? .5 : .22;
    if (id === "trashed") alpha = .13;
    if (id === "disconnected") {
      const c = t % 4.6, head = 1 + 2 * smooth((c - .15) / .8), distance = Math.min(i, 12 - i);
      alpha = .14 + .48 * Math.exp(-Math.pow((distance - head) / .68, 2)) * (1 - smooth((c - 3.3) / 1));
    }
    let z = 0;
    const points: number[][] = [];
    for (let j = 0; j < 9; j++) {
      const a = theta + (j / 8 - .5) * Math.PI / 12 + turn;
      let x = radius * Math.cos(a) * sx, y = radius * Math.sin(a) * sy, depth = 0;
      if (id === "syncing") {
        const cycle = t / 5.2, whole = Math.floor(cycle);
        const phi = Math.PI * (whole + smooth((cycle - whole - .16) / .66)), twist = Math.sin(phi);
        const xx = x * (1 - .12 * twist * twist) + y * .13 * twist;
        const yy = y * Math.cos(phi) + 9.2 * .38 * Math.sin(2 * a) * twist;
        depth = y * twist;
        x = xx * Math.cos(-.24) - yy * Math.sin(-.24); y = xx * Math.sin(-.24) + yy * Math.cos(-.24);
      }
      if (id === "retrying") {
        const c = t % 4.6;
        x += .7 * Math.sin(a * 2) * (smooth(c / .8) - smooth((c - .85) / 1.3));
      }
      points.push([x, y, depth]); z += depth / 9;
    }
    segments.push({ points, alpha: clamp(tone === "neutral" ? .3 + .7 * alpha : .65 + .35 * alpha), z, tone });
  }
  return segments;
}

export function ringSegmentPath(points: number[][]): string {
  return points.map((point, index) => `${index ? "L" : "M"}${(point[0] + 12).toFixed(3)},${(point[1] + 12).toFixed(3)}`).join("");
}
