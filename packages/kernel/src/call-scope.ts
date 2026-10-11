import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * One operation's number (a page request, a tool call, an Assistant round, a command, a timer firing). Every call the
 * operation causes shares it, so a report can be followed hop by hop. The host alone assigns it: it names no one, grants
 * nothing, and is never read from a request, an argument or a plugin.
 */
interface CallScope {
  readonly id: string;
  /** Closed when the operation ends; a callback that fires later is not part of it and gets a number of its own. */
  open: boolean;
  /** A row about this operation was written to the call log, so a person who is shown the number can look it up. */
  recorded: boolean;
}

const scopes = new AsyncLocalStorage<CallScope>();
/** The refusal codes the running code is looking for as its answer. */
const expected = new AsyncLocalStorage<readonly string[]>();

export const newCallId = (): string => randomUUID();
/** What a person is shown and copies; looking one up takes six or more leading characters. */
export const shortCallId = (id: string): string => id.slice(0, 8);

const openScope = (): CallScope | undefined => {
  const scope = scopes.getStore();
  return scope?.open ? scope : undefined;
};

/** The number of the operation this code is running in; nothing once that operation has ended. */
export const currentCallId = (): string | undefined => openScope()?.id;

/** Say that the operation running here now has a row in the call log. */
export function markCallRecorded(): void {
  const scope = openScope();
  if (scope) scope.recorded = true;
}

/** The running operation's number, but only when it has a row in the call log; what is shown to a person is always findable. */
export const recordedCallId = (): string | undefined => {
  const scope = openScope();
  return scope?.recorded ? scope.id : undefined;
};

/**
 * Run calls whose refusal with one of these codes is the answer the caller is looking for, not a failure: a page that looks for an
 * optional area its project does not have is told "not enabled" and leaves the area out. Nobody asked for that call and nobody will
 * look for it, so the Host keeps no row about such a refusal. Any other refusal, and any refusal of a call made outside this scope,
 * is recorded as usual.
 */
export const expectingRefusal = <R>(codes: readonly string[], run: () => R): R => expected.run(codes, run);

/**
 * Run a handler. What a caller expected (`expectingRefusal`) was the answer to its own call, a refusal before the handler began; it does not
 * reach what the handler calls, or what the handler starts and leaves running, whose refusals are recorded as any other.
 */
export const insideHandler = <R>(run: () => R): R => expected.run([], run);

/** Whether the running code is looking for a refusal with this code (`expectingRefusal`). */
export const refusalExpected = (code: string | undefined): boolean => code !== undefined && (expected.getStore()?.includes(code) ?? false);

/** Run as part of the operation `id`: the open scope of the same number is shared, any other number opens a scope that closes with `run`. */
export async function withCallId<T>(id: string, run: () => Promise<T> | T): Promise<T> {
  if (openScope()?.id === id) return run();
  const scope: CallScope = { id, open: true, recorded: false };
  try { return await scopes.run(scope, run); }
  finally { scope.open = false; }
}

export function withCallIdSync<T>(id: string, run: () => T): T {
  if (openScope()?.id === id) return run();
  const scope: CallScope = { id, open: true, recorded: false };
  try { return scopes.run(scope, run); }
  finally { scope.open = false; }
}
