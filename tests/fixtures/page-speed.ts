// How much slower this browser runs a page's own work than the development machine the frame budgets were measured on.
// A frame budget ("a frame's work: 50 ms") is a measurement on an Apple-silicon development Mac (T-281). CI's Linux runners run the same
// page work several times slower, so an absolute bound written for the Mac fails there on every run without anything being wrong (the
// first put-in of a 300,000-character block: 16–20 ms on the Mac, 57–119 ms on CI). The budget a test asserts is the Mac's budget times
// this factor: 1 on the Mac, so the bound there is unchanged, and the measured slowdown of this browser elsewhere.
//
// The workload is fixed page work of the same kind as what the budgets bound: building and joining strings, putting a text into the DOM
// and laying it out once. Its median over seven runs is compared with the reference median measured on the development Mac.

/** The median of the workload on the development Mac it was measured on (Apple M5, Chrome for Testing 153: 83–87 ms over five tests), in milliseconds. */
export const REFERENCE_WORKLOAD_MS = 85;
/** A factor past this means the machine is overloaded, not slow; the bound stops growing so a real regression still shows. */
const MAX_SLOWDOWN = 8;

const WORKLOAD = `(() => {
  const runs = [];
  for (let run = 0; run < 7; run += 1) {
    const start = performance.now();
    const parts = [];
    for (let index = 0; index < 60000; index += 1) parts.push('  const value' + index + ' = compute(' + index + ');');
    const text = parts.join('\\n');
    const pre = document.body.appendChild(document.createElement('pre'));
    pre.textContent = text; pre.getBoundingClientRect(); pre.remove();
    runs.push(performance.now() - start);
  }
  runs.sort((a, b) => a - b);
  return runs[3];
})()`;

/** This browser's slowdown against the development Mac: at least 1, at most {@link MAX_SLOWDOWN}. */
export async function pageSlowdown(evaluate: <T>(expression: string) => Promise<T>, diagnostic?: (message: string) => void): Promise<number> {
  const median = await evaluate<number>(WORKLOAD);
  const factor = Math.min(MAX_SLOWDOWN, Math.max(1, median / REFERENCE_WORKLOAD_MS));
  diagnostic?.(`page speed: workload median ${median.toFixed(1)} ms, reference ${REFERENCE_WORKLOAD_MS} ms, slowdown ${factor.toFixed(2)}`);
  return factor;
}
