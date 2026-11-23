// Simulate a generation that outlives both the Host's periodic rounds and Memory's first Prologue queue wake.
// Install with `node --import` before the generator installs its clock.
const interval = globalThis.setInterval, timeout = globalThis.setTimeout;
globalThis.setInterval = (callback, period, ...rest) => interval(callback, period >= 10_000 ? 500 : period, ...rest);
globalThis.setTimeout = (callback, delay, ...rest) => {
  const memoryWake = delay === 60_000 && new Error().stack.includes("/@prologue/sdk/dist/orchestration/core/queue.js:");
  return timeout(callback, memoryWake ? 500 : delay, ...rest);
};
