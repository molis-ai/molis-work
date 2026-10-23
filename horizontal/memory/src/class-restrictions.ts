import { MEMORY_FORMAL_KINDS, MEMORY_LIFECYCLES, type MemoryClassRestriction } from "@molis-ai/molis-work-contracts/services/memory";

/** Trusted caller and canonical classification only; no permission or default classification is inferred. */
export interface MemoryClassContext { consumer: string; current_scene: string }
export interface MemoryClassTarget {
  kind?: string;
  classification?: { scenes: readonly string[]; lifecycle: string } | null;
}

function matches(row: MemoryClassRestriction, context: MemoryClassContext, target: MemoryClassTarget): boolean {
  const selector = row.selector;
  return selector.consumer === context.consumer && selector.current_scene === context.current_scene
    && (selector.kind === undefined || selector.kind === target.kind)
    && (selector.lifecycle === undefined || selector.lifecycle === target.classification?.lifecycle)
    && (selector.scene === undefined || (selector.scene === context.current_scene || selector.scene === "common")
      && target.classification?.scenes.includes(selector.scene) === true);
}

/** Only the new read restriction; callers still intersect old authorization and any frozen Run restrictions. */
export function memoryClassReadAllowed(restrictions: readonly MemoryClassRestriction[], context: MemoryClassContext,
  target: MemoryClassTarget, mode: "explicit" | "task" | "resident"): boolean {
  return restrictions.every(row => !matches(row, context, target)
    || row.read === "inherit" || row.read === "explicit-only" && mode === "explicit");
}

/** Automatic formation is independent of read. This does not authorize human or plugin explicit saves. */
export function memoryClassFormationAllowed(restrictions: readonly MemoryClassRestriction[], context: MemoryClassContext,
  target: MemoryClassTarget): boolean {
  return restrictions.every(row => !matches(row, context, target) || row.form === "inherit");
}

/** Conservative existence check before an automatic read; unknown classification never becomes common. */
export function memoryClassReadPossible(restrictions: readonly MemoryClassRestriction[], context: MemoryClassContext,
  mode: "explicit" | "task" | "resident", filter: { kinds?: readonly string[]; scenes?: readonly string[]; lifecycles?: readonly string[] } = {}): boolean {
  const kinds = filter.kinds ?? MEMORY_FORMAL_KINDS;
  const scenes = [context.current_scene, "common"].filter(scene => !filter.scenes || filter.scenes.includes(scene));
  const lifecycles = filter.lifecycles ?? MEMORY_LIFECYCLES;
  const readable = (target: MemoryClassTarget) => memoryClassReadAllowed(restrictions, context, target, mode);
  if (!filter.scenes && !filter.lifecycles && (filter.kinds ? kinds.some(kind => readable({ kind })) : readable({}))) return true;
  return kinds.some(kind => scenes.some(scene => lifecycles.some(lifecycle => readable({ kind, classification: { scenes: [scene], lifecycle } }))));
}
