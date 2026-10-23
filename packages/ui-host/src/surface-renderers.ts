import type { UiMountResult, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";

/** The one call these builders need; `UiHost` has it. */
export interface UiDeclaredMountHost {
  mountDeclared<TModel>(request: UiRenderRequest<TModel>): UiMountResult;
}

/**
 * What a surface built here receives: its own surface name as `kind`, the arguments the caller passed and the
 * primitives the shell supplies. A contribution's render reads `kind` to pick the function behind the surface.
 */
export interface UiSurfaceCallModel<TPrimitives = unknown> {
  readonly kind: string;
  readonly args: readonly unknown[];
  readonly primitives: TPrimitives;
}

type SurfaceMethod = (...args: never[]) => string;

/**
 * W5-06: turn one contribution's declared surfaces into a renderer with one method per surface. The plugin
 * publishes `surfaces` (method name → surface id); each method mounts its surface where the contribution declares
 * it, so the shell keeps no adapter and no surface→slot table of its own.
 */
export function createSurfaceRenderers<TRenderer extends Record<keyof TRenderer, SurfaceMethod>, TPrimitives>(
  host: UiDeclaredMountHost,
  contributionId: string,
  surfaces: { readonly [K in keyof TRenderer]: string },
): (primitives: TPrimitives) => TRenderer {
  return (primitives) => {
    const renderer = {} as Record<keyof TRenderer, SurfaceMethod>;
    for (const method in surfaces) {
      const surface = surfaces[method];
      renderer[method] = (...args: unknown[]) => mountSurface(host, contributionId, surface, args, primitives);
    }
    return renderer as TRenderer;
  };
}

/** The same for a contribution whose one surface is a single function. */
export function createSurfaceRenderer<TRender extends SurfaceMethod, TPrimitives>(
  host: UiDeclaredMountHost,
  contributionId: string,
  surface: string,
): (primitives: TPrimitives) => TRender {
  return (primitives) => {
    const render: SurfaceMethod = (...args: unknown[]) => mountSurface(host, contributionId, surface, args, primitives);
    return render as TRender;
  };
}

function mountSurface<TPrimitives>(host: UiDeclaredMountHost, contributionId: string, surface: string, args: readonly unknown[], primitives: TPrimitives): string {
  const model: UiSurfaceCallModel<TPrimitives> = { kind: surface, args, primitives };
  return host.mountDeclared({ contribution_id: contributionId, surface, model }).html;
}
