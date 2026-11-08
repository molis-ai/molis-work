// A machine slow enough for a generation to outlive the Host's rounds, without the wait: every period of ten seconds or more comes due twice a second.
// Install with `node --import`, before anything arms a timer. On a generation whose clock does not hold them back, this changes the golden every time.
const real = globalThis.setInterval;
globalThis.setInterval = (callback, period, ...rest) => real(callback, period >= 10_000 ? 500 : period, ...rest);
