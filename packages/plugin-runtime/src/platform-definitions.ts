import { types } from "node:util";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * The platform's view of a plugin definition: the same object for everything but its `manifest`, which is a deep-frozen copy the
 * platform made the first time it was given that definition. Whoever handed the definition over (a start list, an install, an
 * upgrade) may keep changing its own Manifest object; the Runtime, the supervisor and everything that reads a running instance's
 * Manifest through them read the platform's copy, which nobody can change. A changed caller object therefore has no effect on a
 * running instance by construction, instead of being found later by comparing serializations.
 *
 * The view is a Proxy over the original definition. Everything else is the original's: its own properties are read from it, its
 * methods run with `this` bound to it (as when they were called on it directly), and writes other than to `manifest` reach it.
 * `definitionOrigin` maps a view back to that original, so identities the Host keyed by its own definition objects still match.
 *
 * Only plain JSON data is copied (plain objects and arrays, enumerable string-keyed data properties, no function, symbol or bigint
 * values, no `toJSON`, no Proxy, no cycle); a definition whose Manifest is anything else, or whose `manifest` or methods cannot be
 * reported differently because they are frozen in place, is used as it is, and whoever compares its Manifest keeps comparing its
 * serialization.
 */
const snapshots = new WeakSet<object>();
const views = new WeakMap<PluginDefinition, { readonly manifest: PluginManifest; readonly declaration: string; readonly view: PluginDefinition }>();
const origins = new WeakMap<PluginDefinition, PluginDefinition>();

/**
 * The platform's view of `definition`, made when the platform is handed it (a start, an install, an upgrade): the same view again
 * while the original still holds the same, unchanged Manifest, and a fresh one when the caller handed it over again with another
 * declaration, as that new act would have read. Between those acts nothing the caller does to its objects reaches a view. Itself for
 * a view, or for a definition left as it is.
 */
export function platformDefinition<D extends PluginDefinition>(definition: D): D {
  if (origins.has(definition)) return definition;
  const known = views.get(definition);
  if (known && known.manifest === definition.manifest && JSON.stringify(definition.manifest) === known.declaration) return known.view as D;
  const snapshot = reportable(definition) ? snapshotOf(definition.manifest) : undefined;
  if (!snapshot) return definition;
  const bound = new Map<Function, Function>();
  const view = new Proxy(definition, {
    get(target, key) {
      if (key === "manifest") return snapshot;
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      let method = bound.get(value);
      if (!method) bound.set(value, method = value.bind(target));
      return method;
    },
    getOwnPropertyDescriptor(target, key) {
      const own = Reflect.getOwnPropertyDescriptor(target, key);
      return key === "manifest" && own ? { ...own, value: snapshot } : own;
    },
    set: (target, key, value) => key !== "manifest" && Reflect.set(target, key, value, target),
    defineProperty: (target, key, descriptor) => key !== "manifest" && Reflect.defineProperty(target, key, descriptor),
    deleteProperty: (target, key) => key !== "manifest" && Reflect.deleteProperty(target, key),
  });
  views.set(definition, { manifest: definition.manifest, declaration: JSON.stringify(snapshot), view });
  origins.set(view, definition);
  return view;
}

/** The definition object `definition` is the platform's view of; `definition` itself when it is not such a view. */
export function definitionOrigin<D extends PluginDefinition>(definition: D): D {
  return (origins.get(definition) as D | undefined) ?? definition;
}

/**
 * Whether `value` is a Manifest copy the platform deep-froze, so its JSON serialization cannot change any more. A `toJSON` added to
 * the shared prototypes would still change it, so that case answers false.
 */
export function isFrozenRegisteredManifest(value: object): boolean {
  return snapshots.has(value) && !("toJSON" in Object.prototype) && !("toJSON" in Array.prototype);
}

/** A Proxy must report a frozen-in-place property as it is, so a definition whose `manifest` or own methods are frozen is not viewed. */
function reportable(definition: PluginDefinition): boolean {
  if (types.isProxy(definition)) return false;
  for (const key of Reflect.ownKeys(definition)) {
    const own = Object.getOwnPropertyDescriptor(definition, key)!;
    if ((key === "manifest" || typeof own.value === "function") && !own.configurable && !own.writable) return false;
  }
  return true;
}

function snapshotOf(manifest: PluginManifest): PluginManifest | undefined {
  if (typeof manifest !== "object" || manifest === null || !plainData(manifest, new Set())) return undefined;
  const copy = structuredClone(manifest);
  deepFreeze(copy);
  snapshots.add(copy);
  return copy;
}

function plainData(value: object, path: Set<object>): boolean {
  if (path.has(value) || types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
  path.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length" && Array.isArray(value)) continue;
    const property = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key === "symbol" || key === "toJSON" || !property.enumerable || !("value" in property)) return false;
    const child: unknown = property.value;
    if (typeof child === "function" || typeof child === "symbol" || typeof child === "bigint") return false;
    if (typeof child === "object" && child !== null && !plainData(child, path)) return false;
  }
  path.delete(value);
  return true;
}

function deepFreeze(value: object): void {
  for (const child of Object.values(value)) if (typeof child === "object" && child !== null) deepFreeze(child);
  Object.freeze(value);
}
