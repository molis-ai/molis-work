/**
 * BL-411: outside every call, a stopped activation's service refuses and throws nothing; an asynchronous method returns a promise
 * that never settles. `within` tells what a promise came to within a moment, so a test can tell that apart from an answer or an error.
 */
export const PENDING = Symbol("pending");

/** What a promise came to within a moment: its value, its error, or still nothing (`PENDING`). */
export const within = (promise: Promise<unknown>) => Promise.race([promise.then(value => ({ value }), (error: unknown) => ({ error })),
  new Promise(resolve => { setTimeout(resolve, 50, PENDING); })]);
