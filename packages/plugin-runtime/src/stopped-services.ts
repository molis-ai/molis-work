import { currentPluginInvocation, pluginInvocationOpen, type PluginInstance } from "./action-scope.js";

/**
 * BL-411: what one activation's services do for code the plugin left running after the activation stopped. A timer or a
 * listener the plugin did not clear in `stop` runs outside any call; the services refuse it, as they refuse every call of a
 * stopped activation, and nothing caught that refusal: it reached the top of the Home's process and ended it.
 *
 * Once `stopped()` says the activation is over (its `stop` hook returned, or it never started), a call made from then on outside
 * every call still under way goes to the service as before and is refused as before, but the refusal throws nothing: a
 * synchronous method returns `undefined`, an asynchronous one a promise that never settles, and `noted` hears of the call. A call
 * that succeeds (a read no gate refuses) returns what it returns. While the activation runs, and while its `stop` hook runs, every
 * error reaches the plugin as it did. So does every error of a call made inside an action, scene or job whose handler still runs
 * (`pluginInvocationOpen`), whichever instance's it is: that call's caller hears it, and a call left waiting or a write that did
 * nothing reported as done would mislead it. A call made before the activation stopped keeps its own outcome even when it settles
 * after. Returned handles and the arguments a service hands a callback (a transaction, a writer, a job's control) are not
 * wrapped: what they refuse goes back into the service's own promise.
 */
export function inertAfterStop<T extends object>(services: T, stopped: () => boolean, noted: (call: StoppedServiceCall) => void): T {
  const made: object = inertMembers(services, "", { stopped, noted }, new WeakMap());
  return made as T;
}

/** One call a stopped activation's code made: the service and its method, never the arguments. */
export interface StoppedServiceCall {
  readonly service: string;
  readonly method: string;
}

/**
 * How often each activation's code called a service after it stopped (BL-411), per installation and generation. In memory
 * only: never in a library and never the installation's `last_error_code`, which keeps the error that matters.
 */
export class StoppedServiceCalls {
  readonly #calls = new Map<string, Map<string, number>>();

  /** Counts one call; true for the first call of this method by this instance, when the caller writes its one log line. */
  note(instance: PluginInstance, call: StoppedServiceCall): boolean {
    const key = instanceKey(instance), method = `${call.service}.${call.method}`;
    const methods = this.#calls.get(key) ?? new Map<string, number>();
    this.#calls.set(key, methods);
    const before = methods.get(method) ?? 0;
    methods.set(method, before + 1);
    return before === 0;
  }

  /** Every call counted for this installation and generation. */
  count(instance: PluginInstance): number {
    return [...this.#calls.get(instanceKey(instance))?.values() ?? []].reduce((total, calls) => total + calls, 0);
  }
}

interface Guard {
  stopped(): boolean;
  noted(call: StoppedServiceCall): void;
}

const instanceKey = (instance: PluginInstance) => `${instance.install_id}\u0000${instance.installation_generation}`;

/** A copy of `target` whose methods turn a late refusal into nothing; nested clients (`actions.directory`) are copied the same way. */
function inertMembers(target: object, path: string, guard: Guard, copies: WeakMap<object, object>): object {
  const copied = copies.get(target);
  if (copied) return copied;
  const made: Record<string, unknown> = {};
  copies.set(target, made);
  for (const [name, descriptor] of members(target)) {
    if (descriptor.get) { Object.defineProperty(made, name, { enumerable: true, get: () => Reflect.get(target, name) }); continue; }
    const value: unknown = descriptor.value, service = path === "" ? name : path;
    made[name] = typeof value === "function" ? inertMethod(value, target, { service, method: name }, guard)
      : isClient(value) ? inertMembers(value, path === "" ? name : `${path}.${name}`, guard, copies) : value;
  }
  return Object.freeze(made);
}

function inertMethod(method: Function, owner: object, call: StoppedServiceCall, guard: Guard) {
  return (...args: unknown[]): unknown => {
    if (!guard.stopped() || insideOpenCall()) return Reflect.apply(method, owner, args);
    let result: unknown;
    try { result = Reflect.apply(method, owner, args); }
    catch { guard.noted(call); return undefined; }
    if (!isThenable(result)) return result;
    return Promise.resolve(result).catch(() => { guard.noted(call); return new Promise<never>(() => undefined); });
  };
}

/** Whether the calling code runs for an action, scene or job whose handler has not yet settled. */
const insideOpenCall = () => {
  const scope = currentPluginInvocation();
  return !!scope && pluginInvocationOpen(scope);
};

/** Own and inherited members, the nearest first (a class's methods sit on its prototype), without `constructor`. */
function members(target: object): Map<string, PropertyDescriptor> {
  const found = new Map<string, PropertyDescriptor>();
  for (let level: object | null = target; level && level !== Object.prototype; level = Object.getPrototypeOf(level)) {
    for (const name of Object.getOwnPropertyNames(level)) {
      const descriptor = Object.getOwnPropertyDescriptor(level, name);
      if (name !== "constructor" && descriptor && !found.has(name)) found.set(name, descriptor);
    }
  }
  return found;
}

const isClient = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value) && !isThenable(value);

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === "object" || typeof value === "function") && value !== null && typeof Reflect.get(value, "then") === "function";
