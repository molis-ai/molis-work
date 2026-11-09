// The clock a golden generation runs on, in its own process and in the ones it forks.
export const GENERATION_START = Date.parse("2026-01-15T09:00:00.000Z");

/** `Date` stands still at `clock`; a date someone gives it stays that date. */
export function freezeDate(clock) {
  const RealDate = Date;
  function FixedDate(...args) {
    if (!new.target) return new RealDate(clock).toString();
    return new RealDate(...(args.length ? args : [clock]));
  }
  FixedDate.prototype = RealDate.prototype;
  FixedDate.now = () => clock;
  FixedDate.parse = RealDate.parse;
  FixedDate.UTC = RealDate.UTC;
  globalThis.Date = FixedDate;
}
