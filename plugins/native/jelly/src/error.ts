export class JellyError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); this.name = "JellyError"; }
}
export function jellyAssert(condition: unknown, message: string, code = "jelly.invalid", status = 400): asserts condition {
  if (!condition) throw new JellyError(code, message, status);
}
