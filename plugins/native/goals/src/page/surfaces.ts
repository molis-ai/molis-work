import type { MountSurface } from "./ports.js";

/** What a surface receives: its own name as `kind`, the arguments the caller passed and the primitives the page supplies. */
export interface SurfaceCallModel<TPrimitives = unknown> {
  readonly kind: string;
  readonly args: readonly unknown[];
  readonly primitives: TPrimitives;
}

type SurfaceMethod = (...args: never[]) => string;

/**
 * One contribution's declared surfaces as a renderer with one method per surface: each method mounts its surface where the
 * contribution declares it. The one builder of this kind: the UiHost has none (T-116).
 */
export function surfaceRenderers<TRenderer extends Record<keyof TRenderer, SurfaceMethod>, TPrimitives>(
  mount: MountSurface, contributionId: string, surfaces: { readonly [K in keyof TRenderer]: string },
): (primitives: TPrimitives) => TRenderer {
  return (primitives) => {
    const renderer = {} as Record<keyof TRenderer, SurfaceMethod>;
    for (const method in surfaces) {
      const surface = surfaces[method];
      renderer[method] = (...args: unknown[]) => mountSurface(mount, contributionId, surface, args, primitives);
    }
    return renderer as TRenderer;
  };
}

/** The same for a contribution whose one surface is a single function. */
export function surfaceRenderer<TRender extends SurfaceMethod, TPrimitives>(
  mount: MountSurface, contributionId: string, surface: string,
): (primitives: TPrimitives) => TRender {
  return (primitives) => {
    const render: SurfaceMethod = (...args: unknown[]) => mountSurface(mount, contributionId, surface, args, primitives);
    return render as TRender;
  };
}

function mountSurface<TPrimitives>(mount: MountSurface, contributionId: string, surface: string, args: readonly unknown[], primitives: TPrimitives): string {
  const model: SurfaceCallModel<TPrimitives> = { kind: surface, args, primitives };
  return mount(contributionId, surface, model);
}
